-- Boring Geo — logique de jeu (RPC security definer)

create or replace function server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- Génère un code de room de 5 lettres sans caractères ambigus
create or replace function _gen_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  new_code text;
begin
  loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from games where games.code = new_code);
  end loop;
  return new_code;
end $$;

create or replace function _player_from_token(p_token uuid)
returns players language plpgsql as $$
declare
  pl players;
begin
  select p.* into pl
  from players p join player_tokens t on t.player_id = p.id
  where t.token = p_token;
  if pl.id is null then
    raise exception 'invalid_token';
  end if;
  return pl;
end $$;

create or replace function _pick_questions(p_theme text, p_count int)
returns uuid[] language sql as $$
  select coalesce(array_agg(id), '{}')
  from (select id from questions where theme = p_theme order by random() limit p_count) q
$$;

create or replace function _finalize_game(p_game_id uuid)
returns void language plpgsql as $$
declare
  top_score int;
  top_count int;
  winner uuid;
begin
  select max(score) into top_score from players where game_id = p_game_id;
  select count(*) into top_count from players where game_id = p_game_id and score = top_score;
  if top_count = 1 then
    select id into winner from players where game_id = p_game_id and score = top_score;
  end if;
  update games
  set status = 'finished', finished_at = now(), winner_player_id = winner
  where id = p_game_id and status = 'playing';
end $$;

-- ---------- RPC publiques ----------

create or replace function create_game(
  p_nickname text,
  p_question_count int default 20,
  p_duration_seconds int default 120,
  p_theme text default 'geo'
)
returns json language plpgsql security definer set search_path = public as $$
declare
  g games;
  pl players;
  tok uuid;
  qids uuid[];
begin
  qids := _pick_questions(p_theme, p_question_count);
  if array_length(qids, 1) is null then
    raise exception 'no_questions_for_theme';
  end if;

  insert into games (code, theme, question_count, duration_seconds, question_ids)
  values (_gen_code(), p_theme, array_length(qids, 1), p_duration_seconds, qids)
  returning * into g;

  insert into players (game_id, nickname) values (g.id, trim(p_nickname)) returning * into pl;
  insert into player_tokens (player_id) values (pl.id) returning token into tok;
  update games set host_player_id = pl.id where id = g.id;

  return json_build_object('game_id', g.id, 'code', g.code, 'player_id', pl.id, 'token', tok);
end $$;

create or replace function join_game(p_code text, p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare
  g games;
  pl players;
  tok uuid;
  n int;
begin
  select * into g from games where code = upper(trim(p_code)) for update;
  if g.id is null then raise exception 'game_not_found'; end if;
  if g.status <> 'lobby' then raise exception 'game_already_started'; end if;
  select count(*) into n from players where game_id = g.id;
  if n >= 2 then raise exception 'game_full'; end if;

  insert into players (game_id, nickname) values (g.id, trim(p_nickname)) returning * into pl;
  insert into player_tokens (player_id) values (pl.id) returning token into tok;

  return json_build_object('game_id', g.id, 'code', g.code, 'player_id', pl.id, 'token', tok);
end $$;

create or replace function update_settings(
  p_token uuid,
  p_question_count int,
  p_duration_seconds int,
  p_theme text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  qids uuid[];
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id for update;
  if g.host_player_id <> pl.id then raise exception 'not_host'; end if;
  if g.status <> 'lobby' then raise exception 'game_already_started'; end if;
  qids := _pick_questions(p_theme, p_question_count);
  if array_length(qids, 1) is null then raise exception 'no_questions_for_theme'; end if;
  update games
  set theme = p_theme, question_count = array_length(qids, 1),
      duration_seconds = p_duration_seconds, question_ids = qids
  where id = g.id;
end $$;

create or replace function start_game(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  n int;
  initial_queue int[];
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id for update;
  if g.host_player_id <> pl.id then raise exception 'not_host'; end if;
  if g.status <> 'lobby' then raise exception 'game_already_started'; end if;
  select count(*) into n from players where game_id = g.id;
  if n < 2 then raise exception 'need_two_players'; end if;

  select array_agg(i) into initial_queue from generate_series(0, g.question_count - 1) i;

  update players set queue = initial_queue, score = 0, answered_count = 0, finished_at = null
  where game_id = g.id;

  update games
  set status = 'playing', started_at = now(), ends_at = now() + make_interval(secs => g.duration_seconds)
  where id = g.id;
end $$;

-- Question courante d'un joueur (sans la réponse)
create or replace function _current_question(pl players, g games)
returns json language plpgsql as $$
declare
  q questions;
  head int;
begin
  if g.status <> 'playing' or array_length(pl.queue, 1) is null then
    return null;
  end if;
  head := pl.queue[1];
  select * into q from questions where id = g.question_ids[head + 1];
  return json_build_object(
    'id', q.id, 'subtype', q.subtype, 'prompt', q.prompt,
    'choices', q.choices, 'image_url', q.image_url
  );
end $$;

create or replace function get_state(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  opp players;
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id;
  -- clôture paresseuse si le timer est dépassé
  if g.status = 'playing' and now() >= g.ends_at then
    perform _finalize_game(g.id);
    select * into g from games where id = g.id;
  end if;
  select * into opp from players where game_id = g.id and id <> pl.id limit 1;

  return json_build_object(
    'game', json_build_object(
      'id', g.id, 'code', g.code, 'status', g.status, 'theme', g.theme,
      'question_count', g.question_count, 'duration_seconds', g.duration_seconds,
      'host_player_id', g.host_player_id, 'winner_player_id', g.winner_player_id,
      'started_at', g.started_at, 'ends_at', g.ends_at, 'finished_at', g.finished_at
    ),
    'me', json_build_object(
      'id', pl.id, 'nickname', pl.nickname, 'score', pl.score,
      'answered_count', pl.answered_count, 'remaining', coalesce(array_length(pl.queue, 1), 0),
      'finished_at', pl.finished_at
    ),
    'opponent', case when opp.id is null then null else json_build_object(
      'id', opp.id, 'nickname', opp.nickname, 'score', opp.score,
      'answered_count', opp.answered_count, 'remaining', coalesce(array_length(opp.queue, 1), 0),
      'finished_at', opp.finished_at
    ) end,
    'question', _current_question(pl, g),
    'server_now', now()
  );
end $$;

create or replace function submit_answer(p_token uuid, p_question_id uuid, p_choice_index int)
returns json language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  q questions;
  head int;
  ok boolean;
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

  if array_length(pl.queue, 1) = 1 then
    perform _finalize_game(g.id);
  end if;

  return json_build_object('is_correct', ok, 'correct_index', q.correct_index);
end $$;

create or replace function pass_question(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
begin
  pl := _player_from_token(p_token);
  select * into pl from players where id = pl.id for update;
  select * into g from games where id = pl.game_id;
  if g.status <> 'playing' then raise exception 'game_not_playing'; end if;
  if now() >= g.ends_at then
    perform _finalize_game(g.id);
    raise exception 'time_over';
  end if;
  if coalesce(array_length(pl.queue, 1), 0) > 1 then
    update players set queue = pl.queue[2:] || pl.queue[1] where id = pl.id;
  end if;
end $$;

create or replace function end_game_if_expired(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
begin
  select * into g from games where id = p_game_id;
  if g.status = 'playing' and now() >= g.ends_at then
    perform _finalize_game(g.id);
  end if;
end $$;

-- Les helpers internes ne sont pas exposés
revoke execute on function _gen_code(), _player_from_token(uuid), _pick_questions(text, int),
  _finalize_game(uuid), _current_question(players, games) from public, anon, authenticated;
