-- Boring Geo — schéma

create extension if not exists pgcrypto;

create table questions (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  subtype text not null,
  prompt text not null,
  choices jsonb not null,
  correct_index int not null check (correct_index between 0 and 3),
  image_url text,
  created_at timestamptz not null default now()
);
create index questions_theme_idx on questions (theme);

create table games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  theme text not null default 'geo',
  question_count int not null default 20 check (question_count between 5 and 100),
  duration_seconds int not null default 120 check (duration_seconds between 30 and 600),
  question_ids uuid[] not null default '{}',
  host_player_id uuid,
  winner_player_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  score int not null default 0,
  queue int[] not null default '{}',
  answered_count int not null default 0,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index players_game_idx on players (game_id);

-- token secret, jamais exposé au client autrement que par create/join
create table player_tokens (
  player_id uuid primary key references players (id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);

create table answers (
  id bigint generated always as identity primary key,
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  question_id uuid not null references questions (id),
  choice_index int not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (player_id, question_id)
);

-- RLS : lecture publique de games/players (nécessaire au Realtime), tout le reste fermé
alter table questions enable row level security;
alter table games enable row level security;
alter table players enable row level security;
alter table player_tokens enable row level security;
alter table answers enable row level security;

create policy "games readable" on games for select to anon, authenticated using (true);
create policy "players readable" on players for select to anon, authenticated using (true);

-- Realtime
alter publication supabase_realtime add table games, players;
alter table games replica identity full;
alter table players replica identity full;
