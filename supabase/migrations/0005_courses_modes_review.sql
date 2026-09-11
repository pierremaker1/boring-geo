-- Boring Law : questions de cours (explication, difficulté, écarts), modes pilotés par la base,
-- révision après la partie.

-- 1. Champs pédagogiques sur les questions
alter table questions
  add column if not exists explanation text,
  add column if not exists difficulty int check (difficulty between 1 and 3),
  add column if not exists flag text,
  add column if not exists disputed text,
  add column if not exists source text,
  add column if not exists external_id text,
  add column if not exists qtype text;
create index if not exists questions_theme_subtype_idx on questions (theme, subtype);

-- 2. Modes : un mode = un thème entier ou un sous-ensemble de sous-types, regroupé par cours
create table if not exists modes (
  id text primary key,
  course text not null,           -- groupe affiché dans le salon (ex. "Anglais CEDH · S7")
  theme text not null,            -- questions.theme
  label text not null,
  description text,
  emoji text,
  subtypes text[],                -- null = tout le thème
  sort int not null default 0
);
alter table modes enable row level security;
drop policy if exists "modes readable" on modes;
create policy "modes readable" on modes for select to anon, authenticated using (true);

insert into modes (id, course, theme, label, description, emoji, subtypes, sort) values
  ('echr:full',        'Anglais CEDH · S7', 'echr-anglais-s7', 'Tout le programme', '250 questions, tout le cours', '📚', null, 10),
  ('echr:annales',     'Anglais CEDH · S7', 'echr-anglais-s7', 'Annales', 'Les 20 questions réellement tombées, corrigées', '🎓', array['annales'], 11),
  ('echr:procedure',   'Anglais CEDH · S7', 'echr-anglais-s7', 'Procédure', 'Subsidiarité, recevabilité, délai, dépôt, mesures provisoires, satisfaction équitable, la Cour', '⚖️', array['subsidiarity','admissibility','time-limit','filing','interim-measures','just-satisfaction','enforcement','court'], 12),
  ('echr:articles',    'Anglais CEDH · S7', 'echr-anglais-s7', 'Article par article', 'Articles 1 à 16 et les protocoles', '📜', array['articles','protocols','protocol-1-1','article-2','article-3','article-4','article-5','article-6','article-7','article-8','article-9','article-10','article-11','article-12','article-13','article-14'], 13),
  ('echr:theorie',     'Anglais CEDH · S7', 'echr-anglais-s7', 'Théorie et principes', 'Fondamentaux, les deux systèmes européens, nature des droits, principes directeurs', '🧠', array['foundations','systems','convention','nature-of-rights','principles'], 14),
  ('echr:vocabulaire', 'Anglais CEDH · S7', 'echr-anglais-s7', 'Vocabulaire', 'Le glossaire du cours', '🔤', array['vocabulary'], 15),
  ('echr:pieges',      'Anglais CEDH · S7', 'echr-anglais-s7', 'Pièges', 'Distinctions croisées et appariements d''arrêts', '🪤', array['traps'], 16),
  ('geo',              'Culture G', 'geo', 'Géographie', 'Capitales, drapeaux, fleuves, montagnes…', '🌍', null, 50),
  ('geo:drapeau',      'Culture G', 'geo', 'Drapeaux', '100 % drapeaux, à reconnaître au premier coup d''œil', '🏁', array['drapeau'], 51),
  ('histoire',         'Culture G', 'histoire', 'Histoire', 'De l''Antiquité à nos jours', '🏛️', null, 52)
on conflict (id) do update set course = excluded.course, theme = excluded.theme, label = excluded.label,
  description = excluded.description, emoji = excluded.emoji, subtypes = excluded.subtypes, sort = excluded.sort;

-- games.theme contient désormais un id de mode ; on garde le nom de colonne pour ne rien casser.
-- Rétro-compatibilité : un id inconnu de la table modes est traité comme "theme" ou "theme:subtype".
drop function if exists _pick_questions(text, int);
create function _pick_questions(p_mode text, p_count int)
returns uuid[] language plpgsql as $$
declare
  m modes;
  v_theme text;
  v_subtypes text[];
begin
  select * into m from modes where id = p_mode;
  if m.id is not null then
    v_theme := m.theme;
    v_subtypes := m.subtypes;
  else
    v_theme := split_part(p_mode, ':', 1);
    v_subtypes := case when split_part(p_mode, ':', 2) = '' then null else array[split_part(p_mode, ':', 2)] end;
  end if;
  return (
    select coalesce(array_agg(id), '{}')
    from (
      select id from questions
      where theme = v_theme and (v_subtypes is null or subtype = any(v_subtypes))
      order by random() limit p_count
    ) q
  );
end $$;
revoke execute on function _pick_questions(text, int) from public, anon, authenticated;

-- 3. Révision : toutes les questions de la partie avec la réponse du joueur, seulement une fois la partie finie
create or replace function get_review(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id;
  if g.status = 'playing' and now() >= g.ends_at then
    perform _finalize_game(g.id);
    select * into g from games where id = g.id;
  end if;
  if g.status <> 'finished' then raise exception 'game_not_finished'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'position', i.ord,
      'id', q.id,
      'external_id', q.external_id,
      'subtype', q.subtype,
      'difficulty', q.difficulty,
      'prompt', q.prompt,
      'choices', q.choices,
      'image_url', q.image_url,
      'correct_index', q.correct_index,
      'chosen_index', a.choice_index,
      'is_correct', a.is_correct,
      'explanation', q.explanation,
      'flag', q.flag,
      'disputed', q.disputed,
      'source', q.source
    ) order by i.ord)
    from unnest(g.question_ids) with ordinality as i(qid, ord)
    join questions q on q.id = i.qid
    left join answers a on a.question_id = q.id and a.player_id = pl.id
  ), '[]'::json);
end $$;
