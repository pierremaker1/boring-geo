-- De 1 à 10 joueurs par partie (solo autorisé), get_state renvoie tous les joueurs classés.

alter table games add column if not exists max_players int not null default 10
  check (max_players between 1 and 10);

-- Rejoindre : jusqu'à max_players
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
  if n >= g.max_players then raise exception 'game_full'; end if;

  insert into players (game_id, nickname) values (g.id, trim(p_nickname)) returning * into pl;
  insert into player_tokens (player_id) values (pl.id) returning token into tok;

  return json_build_object('game_id', g.id, 'code', g.code, 'player_id', pl.id, 'token', tok);
end $$;

-- Démarrer : l'hôte peut lancer seul (solo) ou avec n'importe quel nombre de joueurs
create or replace function start_game(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  initial_queue int[];
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id for update;
  if g.host_player_id <> pl.id then raise exception 'not_host'; end if;
  if g.status <> 'lobby' then raise exception 'game_already_started'; end if;

  select array_agg(i) into initial_queue from generate_series(0, g.question_count - 1) i;

  update players set queue = initial_queue, score = 0, answered_count = 0, finished_at = null
  where game_id = g.id;

  update games
  set status = 'playing', started_at = now(), ends_at = now() + make_interval(secs => g.duration_seconds)
  where id = g.id;
end $$;

-- Classement : score desc, puis nombre de réponses (plus avancé devant), puis ordre d'arrivée
create or replace function _player_json(p players, p_rank int)
returns json language sql immutable as $$
  select json_build_object(
    'id', p.id, 'nickname', p.nickname, 'score', p.score,
    'answered_count', p.answered_count, 'remaining', coalesce(array_length(p.queue, 1), 0),
    'finished_at', p.finished_at, 'rank', p_rank
  )
$$;

create or replace function get_state(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  pl players;
  g games;
  opp players;
  ranked json;
  my_rank int;
  n_players int;
begin
  pl := _player_from_token(p_token);
  select * into g from games where id = pl.game_id;
  -- clôture paresseuse si le timer est dépassé
  if g.status = 'playing' and now() >= g.ends_at then
    perform _finalize_game(g.id);
    select * into g from games where id = g.id;
  end if;

  -- tous les joueurs classés (moi compris)
  select json_agg(_player_json(r.p, r.rk::int) order by r.rk), count(*)
  into ranked, n_players
  from (
    select p, rank() over (order by score desc, answered_count desc, created_at asc) as rk
    from players p where game_id = g.id
  ) r;
  select rk::int into my_rank from (
    select id, rank() over (order by score desc, answered_count desc, created_at asc) as rk
    from players where game_id = g.id
  ) x where id = pl.id;

  -- "adversaire" = le mieux classé des autres (rétro-compatibilité duel)
  select * into opp from players
  where game_id = g.id and id <> pl.id
  order by score desc, answered_count desc, created_at asc limit 1;

  return json_build_object(
    'game', json_build_object(
      'id', g.id, 'code', g.code, 'status', g.status, 'theme', g.theme,
      'question_count', g.question_count, 'duration_seconds', g.duration_seconds,
      'max_players', g.max_players, 'player_count', n_players,
      'host_player_id', g.host_player_id, 'winner_player_id', g.winner_player_id,
      'started_at', g.started_at, 'ends_at', g.ends_at, 'finished_at', g.finished_at
    ),
    'me', _player_json(pl, my_rank),
    'opponent', case when opp.id is null then null else _player_json(opp, null) end,
    'players', coalesce(ranked, '[]'::json),
    'question', _current_question(pl, g),
    'server_now', now()
  );
end $$;

revoke execute on function _player_json(players, int) from public, anon, authenticated;
