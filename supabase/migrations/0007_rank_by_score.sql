-- Rang « compétition » : le rang ne dépend que du score (ex æquo partagés : 1, 1, 3), cohérent avec
-- winner_player_id (null dès que le meilleur score est partagé). L'ORDRE du tableau players reste
-- déterministe : score desc, avancement desc, ordre d'arrivée.

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
  select json_agg(_player_json(r.p, r.rk::int) order by (r.p).score desc, (r.p).answered_count desc, (r.p).created_at asc),
         count(*)
  into ranked, n_players
  from (
    select p, rank() over (order by score desc) as rk
    from players p where game_id = g.id
  ) r;
  select rk::int into my_rank from (
    select id, rank() over (order by score desc) as rk
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

