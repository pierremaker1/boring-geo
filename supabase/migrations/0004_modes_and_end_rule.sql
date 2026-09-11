-- Modes de jeu (theme ou theme:subtype, ex. "geo:drapeau") + fin de partie seulement
-- quand TOUS les joueurs ont fini (ou que le temps est écoulé)

-- "geo" = tout le thème ; "geo:drapeau" = seulement ce sous-type
create or replace function _pick_questions(p_theme text, p_count int)
returns uuid[] language sql as $$
  select coalesce(array_agg(id), '{}')
  from (
    select id from questions
    where theme = split_part(p_theme, ':', 1)
      and (split_part(p_theme, ':', 2) = '' or subtype = split_part(p_theme, ':', 2))
    order by random() limit p_count
  ) q
$$;

create or replace function submit_answer(p_token uuid, p_question_id uuid, p_choice_index int)
returns json language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  q questions;
  head int;
  ok boolean;
  everyone_done boolean;
begin
  pl := _player_from_token(p_token);
  select * into pl from players where id = pl.id for update;
  select * into g from games where id = pl.game_id;

  if g.status <> 'playing' then raise exception 'game_not_playing'; end if;
  if now() >= g.ends_at then
    perform _finalize_game(g.id);
    raise exception 'time_over';
  end if;
  if array_length(pl.queue, 1) is null then raise exception 'no_question_left'; end if;

  head := pl.queue[1];
  if g.question_ids[head + 1] <> p_question_id then raise exception 'stale_question'; end if;

  select * into q from questions where id = p_question_id;
  ok := (q.correct_index = p_choice_index);

  insert into answers (game_id, player_id, question_id, choice_index, is_correct)
  values (g.id, pl.id, q.id, p_choice_index, ok);

  update players
  set queue = pl.queue[2:],
      score = score + (case when ok then 1 else 0 end),
      answered_count = answered_count + 1,
      finished_at = case when array_length(pl.queue, 1) = 1 then now() else null end
  where id = pl.id;

  -- la partie ne se termine que lorsque tout le monde a fini (ou au timer)
  if array_length(pl.queue, 1) = 1 then
    select bool_and(finished_at is not null) into everyone_done
    from players where game_id = g.id;
    if everyone_done then
      perform _finalize_game(g.id);
    end if;
  end if;

  return json_build_object('is_correct', ok, 'correct_index', q.correct_index);
end $$;
