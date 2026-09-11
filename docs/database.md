# Base de données

Toute la logique de jeu de Boring Law vit dans Postgres (Supabase) : le front n'écrit jamais directement dans une table, il appelle des fonctions RPC `security definer` et s'abonne aux changements via Realtime. Ce document décrit le schéma, les règles de sécurité, chaque fonction, les migrations et le seed des questions. Pour la vue d'ensemble front/back, voir [architecture](architecture.md) ; pour les règles vues du joueur, [game-rules](game-rules.md) ; pour la banque de questions et les cours, [content](content.md) ; pour l'installation et les tests SQL à la main, [development](development.md) ; pour le client, [frontend](frontend.md).

Sources de vérité : `supabase/migrations/*.sql` (schéma et fonctions), `src/lib/api.ts` (appels RPC côté client), `src/types.ts` (forme des JSON renvoyés), `scripts/` et `data/` (seed).

## Vue d'ensemble

```
questions ──< answers >── players ──< player_tokens
                 │            │
                 └──── games ─┘        modes (catalogue, lecture seule)
```

- Une **partie** (`games`) porte un code à 5 lettres, un mode, un timer, et la liste ordonnée des questions tirées (`question_ids`).
- Chaque **joueur** (`players`) avance dans sa propre file d'indices (`queue`) sur ce même tableau de questions ; son **jeton** secret (`player_tokens`) est la seule preuve d'identité.
- Chaque réponse est journalisée dans **`answers`** (sert au score et à l'écran de révision).
- **`modes`** est un catalogue statique (un mode = un thème entier ou un sous-ensemble de sous-types), lu par le front pour le sélecteur.
- Le client ne lit en direct que `games`, `players` (Realtime) et `modes` ; tout le reste passe par les RPC.

## Schéma

Extension : `pgcrypto` (pour `gen_random_uuid()`), créée dans `0001_schema.sql`.

### `questions`

Banque de questions QCM, toutes avec exactement 4 choix.

| Colonne | Type | Rôle / contraintes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `theme` | `text` not null | Banque d'origine : `geo`, `histoire`, `echr-anglais-s7` |
| `subtype` | `text` not null | Sous-thème (`capitale`, `drapeau`, `antiquite`, `article-6`, `traps`…) ; les modes filtrent dessus |
| `prompt` | `text` not null | Énoncé |
| `choices` | `jsonb` not null | Tableau JSON de 4 chaînes (ordre déjà mélangé au seed) |
| `correct_index` | `int` not null | Index du bon choix, `check (correct_index between 0 and 3)` |
| `image_url` | `text` | Drapeau (`https://flagcdn.com/w320/<iso>.png`) ou null |
| `created_at` | `timestamptz` not null | `default now()` |
| `explanation` | `text` | Explication affichée en révision (0005) |
| `difficulty` | `int` | `check (difficulty between 1 and 3)`, null pour la culture G (0005) |
| `flag` | `text` | Écart entre le cours et le droit positif actuel (0005) |
| `disputed` | `text` | Corrigé discutable (0005) |
| `source` | `text` | Référence dans le cours (0005) |
| `external_id` | `text` | Identifiant stable du JSON source, ex. `fnd-001` (0005) |
| `qtype` | `text` | Type pédagogique (`concept`, …) (0005) |

Index : `questions_theme_idx (theme)`, `questions_theme_subtype_idx (theme, subtype)`.
RLS activée **sans aucune policy** : la table est invisible pour `anon`, seules les fonctions `security definer` la lisent.

### `games`

| Colonne | Type | Rôle / contraintes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `code` | `text` not null unique | Code de salon à 5 lettres, généré par `_gen_code()` |
| `status` | `text` not null | `'lobby'` (défaut) → `'playing'` → `'finished'` (`check`) |
| `theme` | `text` not null | **Id de mode** (`echr:full`, `geo:drapeau`…), nom de colonne conservé pour compatibilité ; défaut `'geo'` |
| `question_count` | `int` not null | Nombre de questions réellement tirées, `check (between 5 and 100)`, défaut 20 |
| `duration_seconds` | `int` not null | Durée du timer, `check (between 30 and 600)`, défaut 120 |
| `question_ids` | `uuid[]` not null | Les questions de la partie, dans l'ordre commun à tous les joueurs (pas de FK sur un tableau) |
| `max_players` | `int` not null | `check (between 1 and 10)`, défaut 10 (0006) |
| `host_player_id` | `uuid` | Le créateur ; seul autorisé à modifier les réglages et à démarrer |
| `winner_player_id` | `uuid` | Renseigné à la clôture si le meilleur score est unique, sinon null (ex æquo) |
| `started_at` | `timestamptz` | Posé par `start_game` |
| `ends_at` | `timestamptz` | `started_at + duration_seconds` ; référence unique du timer |
| `finished_at` | `timestamptz` | Posé par `_finalize_game` |
| `created_at` | `timestamptz` not null | `default now()` |

Lecture publique (policy `games readable`), publiée en Realtime, `replica identity full`.

### `players`

| Colonne | Type | Rôle / contraintes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `game_id` | `uuid` not null | FK `games(id) on delete cascade` |
| `nickname` | `text` not null | `check (char_length(nickname) between 1 and 20)`, trimé par les RPC |
| `score` | `int` not null | +1 par bonne réponse, défaut 0 |
| `queue` | `int[]` not null | File des **indices** (0-based) restants dans `games.question_ids` ; la tête est la question courante |
| `answered_count` | `int` not null | Nombre de réponses données (bonnes ou mauvaises) |
| `finished_at` | `timestamptz` | Posé quand la file est vide (joueur a tout répondu) |
| `created_at` | `timestamptz` not null | Ordre d'arrivée, utilisé comme dernier critère de tri |

Index : `players_game_idx (game_id)`. Lecture publique (policy `players readable`), Realtime, `replica identity full`.

### `player_tokens`

| Colonne | Type | Rôle / contraintes |
|---|---|---|
| `player_id` | `uuid` PK | FK `players(id) on delete cascade` |
| `token` | `uuid` not null unique | `default gen_random_uuid()` ; secret, renvoyé une seule fois par `create_game` / `join_game` |

RLS sans policy : jamais lisible par le client. Côté front, le jeton est stocké dans `localStorage` sous la clé `boring-geo:session` (`src/lib/session.ts`).

### `answers`

| Colonne | Type | Rôle / contraintes |
|---|---|---|
| `id` | `bigint` PK | `generated always as identity` |
| `game_id` | `uuid` not null | FK `games(id) on delete cascade` |
| `player_id` | `uuid` not null | FK `players(id) on delete cascade` |
| `question_id` | `uuid` not null | FK `questions(id)` **sans cascade** (voir [Attention au re-seed](#attention-au-re-seed-dune-banque)) |
| `choice_index` | `int` not null | Choix du joueur |
| `is_correct` | `boolean` not null | Calculé côté serveur |
| `answered_at` | `timestamptz` not null | `default now()` |

Contrainte `unique (player_id, question_id)` : une seule réponse par joueur et par question. RLS sans policy.

### `modes`

Catalogue des modes proposés dans le salon (0005). Un mode = un thème entier (`subtypes` null) ou une liste de sous-types.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `text` PK | Ce que le client envoie dans `p_theme` (`echr:full`, `geo`, `geo:drapeau`, `histoire`…) |
| `course` | `text` not null | Groupe affiché (`Anglais CEDH · S7`, `Culture G`) |
| `theme` | `text` not null | Valeur de `questions.theme` |
| `label` | `text` not null | Nom court |
| `description` | `text` | Sous-titre |
| `emoji` | `text` | Icône |
| `subtypes` | `text[]` | Filtre sur `questions.subtype` ; null = tout le thème |
| `sort` | `int` not null | Ordre d'affichage, défaut 0 |

Lecture publique (policy `modes readable`) : le client fait `supabase.from('modes').select('*').order('sort')` (`api.listModes`, mis en cache par `useModes()`). Dix modes sont insérés par la migration 0005 (`on conflict (id) do update`, donc rejouable).

## Sécurité : RLS, rôles et `security definer`

- RLS est activée sur les six tables. Seules trois policies existent, toutes `for select to anon, authenticated using (true)` : `games readable`, `players readable`, `modes readable`. Aucune policy `insert`/`update`/`delete` : le client ne peut rien écrire.
- `questions`, `player_tokens` et `answers` n'ont **aucune** policy : invisibles via PostgREST. Les réponses correctes ne fuient donc jamais avant la révision.
- Les RPC publiques sont `security definer set search_path = public` : elles s'exécutent avec les droits du propriétaire (bypass RLS) et le `search_path` figé évite tout détournement.
- Les helpers internes (`_gen_code`, `_player_from_token`, `_pick_questions`, `_finalize_game`, `_current_question`, `_player_json`) ne sont pas `security definer` et font l'objet d'un `revoke execute … from public, anon, authenticated` : impossible de les appeler via `/rest/v1/rpc/`.
- L'identité d'un joueur repose uniquement sur son jeton (`p_token`). Pas d'auth Supabase : tout passe par la clé `anon`.

## Realtime

`0001_schema.sql` :

```sql
alter publication supabase_realtime add table games, players;
alter table games replica identity full;
alter table players replica identity full;
```

- `replica identity full` : les événements UPDATE/DELETE transportent la ligne complète, ce qui permet de filtrer côté client sur une colonne non-clé (`players.game_id`).
- Realtime `postgres_changes` respecte la RLS : c'est la raison d'être des policies de lecture publique sur `games` et `players`.
- Le client (`src/hooks/useGame.ts`) ouvre un canal `game:<game_id>` avec deux abonnements (`games` filtré sur `id=eq.<game_id>`, `players` filtré sur `game_id=eq.<game_id>`), ignore le contenu de l'événement et rappelle simplement `get_state`. Un poll de 5 s sert de filet de sécurité.

## Fonctions

### Conventions

- Toute RPC qui agit pour un joueur reçoit `p_token uuid` et commence par `_player_from_token`, qui lève `invalid_token` si le jeton est inconnu (partie supprimée, `localStorage` d'une autre base…). Le client répond à `invalid_token` en effaçant la session et en revenant à l'accueil.
- Les erreurs métier sont des `raise exception 'code'` ; PostgREST renvoie le code dans `error.message`, que `src/lib/api.ts` transforme en `ApiError` (`code` + libellé français depuis le dictionnaire `ERRORS`).
- Les réponses sont construites avec `json_build_object` ; les timestamps sortent en ISO 8601 avec fuseau.
- Clôture **paresseuse** : personne ne planifie la fin du timer côté serveur. `get_state`, `get_review`, `submit_answer`, `pass_question` et `end_game_if_expired` vérifient `now() >= ends_at` et appellent `_finalize_game` au besoin.

### Fonctions publiques (RPC)

Toutes appelées via `supabase.rpc('<nom>', { p_… })` dans `src/lib/api.ts`.

#### `server_now() returns timestamptz`

`language sql stable`, pas `security definer`. Renvoie `now()`. Non utilisée par le client actuel (qui lit `server_now` dans la réponse de `get_state` pour calibrer son horloge) ; utile comme ping.

#### `create_game(p_nickname text, p_question_count int = 20, p_duration_seconds int = 120, p_theme text = 'geo') returns json`

1. `_pick_questions(p_theme, p_question_count)` ; si le tableau est vide → `no_questions_for_theme`.
2. Insère la partie avec `code = _gen_code()`, `theme = p_theme` (id de mode), `question_count = nombre réellement tiré` (peut être inférieur à la demande si la banque est plus petite), `question_ids`.
3. Insère le joueur (pseudo trimé), son jeton, puis pose `host_player_id`.

Retour :

```json
{ "game_id": "…", "code": "KPQZT", "player_id": "…", "token": "…" }
```

C'est le type `Session` de `src/types.ts`, persisté tel quel dans `localStorage`. Erreurs non nommées possibles : violation de `check` (`question_count` hors 5–100, `duration_seconds` hors 30–600, pseudo vide ou > 20 caractères).

#### `join_game(p_code text, p_nickname text) returns json`

Verrouille la partie (`for update`) trouvée par `upper(trim(p_code))`. Erreurs : `game_not_found`, `game_already_started` (statut ≠ `lobby`), `game_full` (nombre de joueurs ≥ `max_players`). Insère joueur + jeton, renvoie la même forme `Session` que `create_game`.

#### `update_settings(p_token uuid, p_question_count int, p_duration_seconds int, p_theme text) returns void`

Réservée à l'hôte, en salon uniquement. Erreurs : `invalid_token`, `not_host`, `game_already_started`, `no_questions_for_theme`. **Retire un nouveau jeu de questions** à chaque appel et met à jour `theme`, `question_count` (nombre tiré), `duration_seconds`, `question_ids`. La mise à jour de `games` déclenche un événement Realtime chez tous les joueurs du salon.

#### `start_game(p_token uuid) returns void`

Réservée à l'hôte, en salon. Erreurs : `invalid_token`, `not_host`, `game_already_started`. Depuis 0006 il n'y a plus de minimum de joueurs (solo autorisé ; l'ancien code `need_two_players` n'existe plus côté SQL, il reste seulement dans le dictionnaire `ERRORS` du client).

- Remet tous les joueurs à zéro : `queue = [0 … question_count-1]`, `score = 0`, `answered_count = 0`, `finished_at = null`.
- Passe la partie en `playing`, `started_at = now()`, `ends_at = now() + duration_seconds`.

#### `get_state(p_token uuid) returns json`

L'appel central, fait à chaque événement Realtime et toutes les 5 s. Clôt la partie si le timer est dépassé, puis renvoie :

- `game` : colonnes de la partie + `player_count` (calculé).
- `me` : moi, avec `rank`. Depuis 0007 le rang est un rang « compétition » qui ne dépend **que du score** (`rank() over (order by score desc)` → ex æquo partagés : 1, 1, 3), cohérent avec `winner_player_id` qui est null dès que le meilleur score est partagé.
- `opponent` : le mieux classé des **autres** joueurs (`score desc, answered_count desc, created_at asc`), `rank` à null ; null en solo. Conservé pour l'affichage duel.
- `players` : **tous** les joueurs, moi compris, chacun avec son `rank`. L'**ordre** du tableau est déterministe et plus fin que le rang : `score desc, answered_count desc, created_at asc` (à score égal, le plus avancé devant, puis l'ordre d'arrivée).
- `question` : la question courante **sans** `correct_index` (`_current_question`), null hors `playing` ou file vide.
- `server_now` : horloge serveur, utilisée par `useGame` pour calculer `clockOffset`.

Exemple (partie à 3 en cours) :

```json
{
  "game": {
    "id": "6f1c0c3e-…", "code": "KPQZT", "status": "playing", "theme": "echr:full",
    "question_count": 20, "duration_seconds": 120, "max_players": 10, "player_count": 3,
    "host_player_id": "a1…", "winner_player_id": null,
    "started_at": "2026-09-11T14:02:10.512+00:00",
    "ends_at": "2026-09-11T14:04:10.512+00:00",
    "finished_at": null
  },
  "me": { "id": "b2…", "nickname": "Pierre", "score": 4, "answered_count": 5, "remaining": 15, "finished_at": null, "rank": 2 },
  "opponent": { "id": "a1…", "nickname": "Léa", "score": 6, "answered_count": 6, "remaining": 14, "finished_at": null, "rank": null },
  "players": [
    { "id": "a1…", "nickname": "Léa",    "score": 6, "answered_count": 6, "remaining": 14, "finished_at": null, "rank": 1 },
    { "id": "b2…", "nickname": "Pierre", "score": 4, "answered_count": 5, "remaining": 15, "finished_at": null, "rank": 2 },
    { "id": "c3…", "nickname": "Sam",    "score": 4, "answered_count": 4, "remaining": 16, "finished_at": null, "rank": 2 }
  ],
  "question": {
    "id": "9d…", "subtype": "article-6",
    "prompt": "Which of the following is NOT one of the minimum rights of the defence under article 6(3)?",
    "choices": ["…", "…", "…", "…"], "image_url": null
  },
  "server_now": "2026-09-11T14:02:58.104+00:00"
}
```

Pierre et Sam ont le même score : même rang 2, mais Pierre est listé avant (plus avancé). `remaining` = `coalesce(array_length(queue, 1), 0)`. Types correspondants : `GameState`, `GameInfo`, `PlayerInfo`, `Question` dans `src/types.ts`.

#### `submit_answer(p_token uuid, p_question_id uuid, p_choice_index int) returns json`

Verrouille la ligne du joueur (`for update`). Vérifications dans l'ordre : `game_not_playing` (statut ≠ `playing`), `time_over` (timer dépassé ; finalise la partie avant de lever), `no_question_left` (file vide), `stale_question` (`p_question_id` ≠ la tête de file : le client affiche une question périmée, il doit rafraîchir).

Puis : insère dans `answers`, dépile la tête (`queue = queue[2:]`), incrémente `score` si correct et `answered_count`, pose `finished_at` si c'était la dernière question. Si c'était la dernière et que **tous** les joueurs ont `finished_at` non null → `_finalize_game` (règle introduite en 0004 : on attend les autres).

Retour :

```json
{ "is_correct": false, "correct_index": 3 }
```

Le client (`src/pages/Game.tsx`) traite `stale_question`, `time_over` et `game_not_playing` par un simple `refresh()`.

#### `pass_question(p_token uuid) returns void`

Mêmes gardes `game_not_playing` / `time_over`. Si la file contient plus d'une question, déplace la tête en fin de file (`queue[2:] || queue[1]`) ; sinon ne fait rien (pas d'erreur). Ne journalise rien dans `answers`.

#### `end_game_if_expired(p_game_id uuid) returns void`

Sans jeton : finalise la partie si `status = 'playing'` et `now() >= ends_at`, sinon no-op. Appelée par le client quand son timer local atteint 0, pour que la clôture (et l'événement Realtime qui en découle) n'attende pas le prochain `get_state`.

#### `get_review(p_token uuid) returns json`

Écran de révision (0005). Finalise si le timer est dépassé, puis lève `game_not_finished` tant que le statut n'est pas `finished` (le client réessaie au prochain état). Renvoie un tableau ordonné de **toutes** les questions de la partie (`unnest(question_ids) with ordinality`), jointes à la réponse éventuelle du joueur, **avec** `correct_index` et `explanation` :

```json
[
  {
    "position": 1, "id": "9d…", "external_id": "fnd-001", "subtype": "foundations", "difficulty": 1,
    "prompt": "Human rights are best defined as:",
    "choices": ["…", "…", "…", "…"], "image_url": null,
    "correct_index": 3, "chosen_index": 3, "is_correct": true,
    "explanation": "Rights are inherent: they belong to everyone by virtue of being human…",
    "flag": null, "disputed": null, "source": "CM Anglais, Section 1 ; Plan I.A"
  },
  {
    "position": 2, "id": "…", "external_id": "fnd-002", "subtype": "foundations", "difficulty": 1,
    "prompt": "…", "choices": ["…", "…", "…", "…"], "image_url": null,
    "correct_index": 1, "chosen_index": null, "is_correct": null,
    "explanation": "…", "flag": null, "disputed": null, "source": "…"
  }
]
```

`chosen_index` / `is_correct` sont null pour une question non répondue (timer écoulé ou passée). Type `ReviewItem` dans `src/types.ts`. `[]` si aucune question (`coalesce`).

### Fonctions internes

| Fonction | Signature | Rôle |
|---|---|---|
| `_gen_code` | `() returns text` | Boucle jusqu'à trouver un code de 5 lettres absent de `games` ; alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (sans I ni O, 24⁵ ≈ 8 M de codes) |
| `_player_from_token` | `(p_token uuid) returns players` | Jointure `players` × `player_tokens` ; lève `invalid_token` |
| `_pick_questions` | `(p_mode text, p_count int) returns uuid[]` | Résout le mode : ligne de `modes` si `p_mode` en est un id, sinon rétro-compatibilité `theme` ou `theme:subtype`. Filtre `theme = …` et, si `subtypes` non null, `subtype = any(subtypes)` ; `order by random() limit p_count` ; `'{}'` si rien |
| `_finalize_game` | `(p_game_id uuid) returns void` | `winner_player_id` = joueur au score max s'il est seul, null sinon ; `status = 'finished'`, `finished_at = now()`. Idempotente : `where status = 'playing'` |
| `_current_question` | `(pl players, g games) returns json` | Null hors `playing` ou file vide ; sinon `questions[question_ids[queue[1] + 1]]` (indices 0-based dans la file, tableaux Postgres 1-based) réduite à `id, subtype, prompt, choices, image_url` |
| `_player_json` | `(p players, p_rank int) returns json` | Sérialise un joueur (`id, nickname, score, answered_count, remaining, finished_at, rank`) ; `immutable` |

### Erreurs

| Code | Levée par | Sens | Réaction du client (`api.ts` / pages) |
|---|---|---|---|
| `invalid_token` | toute RPC à jeton | Jeton inconnu (partie supprimée, autre base) | `useGame` efface la session et renvoie à l'accueil |
| `game_not_found` | `join_game` | Code inexistant | « Aucune partie avec ce code. » |
| `game_already_started` | `join_game`, `update_settings`, `start_game` | Partie plus en salon | « Cette partie a déjà commencé. » |
| `game_full` | `join_game` | `max_players` atteint | « Cette partie est déjà complète. » |
| `not_host` | `update_settings`, `start_game` | Le jeton n'est pas celui de l'hôte | « Seul l'hôte peut faire ça. » |
| `no_questions_for_theme` | `create_game`, `update_settings` | Mode inconnu ou banque vide | « Pas de questions pour ce mode. » |
| `game_not_playing` | `submit_answer`, `pass_question` | Partie en salon ou finie | `refresh()` silencieux |
| `time_over` | `submit_answer`, `pass_question` | Timer dépassé (partie finalisée dans la foulée) | `refresh()` silencieux |
| `no_question_left` | `submit_answer` | File vide | Message brut |
| `stale_question` | `submit_answer` | La question envoyée n'est plus la tête de file | `refresh()` silencieux |
| `game_not_finished` | `get_review` | Révision demandée trop tôt | Nouvel essai au prochain état |

Les violations de `check`/`unique` (pseudo trop long, réglages hors bornes, double réponse) remontent avec le message Postgres brut.

## Cycle de vie d'une partie

1. `create_game` → `games.status = 'lobby'`, hôte + jeton.
2. `join_game` (0 à 9 fois) ; `update_settings` par l'hôte à volonté. Chaque écriture → Realtime → `get_state` chez tous.
3. `start_game` → `playing`, files identiques pour tous, `ends_at` fixé.
4. Boucle `get_state` / `submit_answer` / `pass_question` ; chaque écriture dans `players` notifie les autres.
5. Fin : timer (`time_over`, `end_game_if_expired`, ou clôture paresseuse dans `get_state`) **ou** tous les joueurs ont `finished_at`. `_finalize_game` pose `finished`, `finished_at`, `winner_player_id`.
6. `get_review` disponible ; les lignes restent en base jusqu'à un nettoyage manuel (voir [Requêtes utiles](#requêtes-sql-utiles)).

## Migrations

### Liste (`supabase/migrations/`)

| Fichier | Apporte |
|---|---|
| `0001_schema.sql` | Extension `pgcrypto` ; tables `questions`, `games`, `players`, `player_tokens`, `answers` ; index ; RLS + policies de lecture sur `games`/`players` ; publication Realtime + `replica identity full` |
| `0002_functions.sql` | Toutes les fonctions de jeu de la V1 (`server_now`, helpers `_gen_code`, `_player_from_token`, `_pick_questions`, `_finalize_game`, `_current_question`, RPC `create_game`, `join_game`, `update_settings`, `start_game`, `get_state`, `submit_answer`, `pass_question`, `end_game_if_expired`) et le `revoke` des helpers. Version d'origine : duel strict (2 joueurs, `need_two_players`), fin dès qu'un joueur a tout répondu |
| `0003_seed_geo.sql` | 406 questions `geo` (générées, voir [Seed](#seed-des-questions)) |
| `0003_seed_histoire.sql` | 252 questions `histoire` |
| `0003_seed_echr-anglais-s7.sql` | 250 questions `echr-anglais-s7` (avec explication, difficulté, source…) |
| `0004_modes_and_end_rule.sql` | `_pick_questions` comprend `theme:subtype` ; `submit_answer` ne finalise que quand **tous** les joueurs ont fini |
| `0005_courses_modes_review.sql` | Colonnes pédagogiques sur `questions` (`explanation`, `difficulty`, `flag`, `disputed`, `source`, `external_id`, `qtype`) + index `(theme, subtype)` ; table `modes` + policy + 10 modes ; `_pick_questions` piloté par `modes` (drop/create, re-`revoke`) ; RPC `get_review` |
| `0006_multiplayer.sql` | `games.max_players` ; `join_game` jusqu'à `max_players` ; `start_game` sans minimum (solo) ; `_player_json` ; `get_state` renvoie `players` classés, `me.rank`, `max_players`, `player_count`. Dans cette version le rang suit l'ordre complet `score desc, answered_count desc, created_at asc` |
| `0007_rank_by_score.sql` | `get_state` seulement : le rang devient un rang « compétition » sur le score seul (1, 1, 3), aligné sur `winner_player_id` ; l'ordre du tableau `players` garde le tri fin (score, avancement, arrivée) |

Les fichiers 0003 sont des seeds de données (pas de DDL) ; ils sont préfixés `0003` parce qu'ils se rejouent indépendamment des autres. Les autres migrations utilisent `create or replace` / `if not exists` et peuvent être rejouées, sauf `0001` (`create table` sans `if not exists`). Quand une fonction est redéfinie plusieurs fois (`_pick_questions` en 0002/0004/0005, `submit_answer` en 0002/0004, `get_state` en 0002/0006/0007), c'est la **dernière migration** qui fait foi.

### Appliquer une migration

Il n'y a **pas** de CLI Supabase ni de `supabase/config.toml` dans le projet : les migrations sont appliquées à la main sur le projet distant, dans l'ordre des fichiers.

- **MCP Supabase** (depuis Claude Code) : `apply_migration` avec `project_id`, un `name` en snake_case (ex. `multiplayer`) et le contenu du fichier en `query`. La migration est enregistrée dans `supabase_migrations.schema_migrations` et `list_migrations` la fait apparaître.
- **SQL editor** du dashboard Supabase : coller le fichier et exécuter. Rien n'est enregistré dans l'historique des migrations.

Les seeds 0003 ont été chargés hors `apply_migration` (SQL editor ou RPC temporaire `admin_seed_questions` via `scripts/seed-remote.mjs`, voir [Seed](#seed-des-questions)) : aucune de ces deux voies n'alimente `schema_migrations`, d'où leur absence de `list_migrations`.

Pour un correctif de fonction, appliquer un `create or replace function …` puis **reporter la correction dans le fichier de migration concerné** du dépôt, afin que `supabase/migrations/` reste la référence. Après un `drop function` / `create function` (changement de signature), ne pas oublier de refaire le `revoke execute … from public, anon, authenticated` pour un helper interne (exemple dans 0005).

### État constaté sur le projet Supabase

`list_migrations` (projet `kqgdlfrirkisxcdodcdj`, 11 septembre 2026) : `schema`, `functions`, `fix_gen_code`, `modes_and_end_rule`, `courses_modes_review`, `multiplayer`, `multiplayer_rank_cast`, `rank_by_score`, `rank_by_score_fix`. Les entrées `*_fix` / `*_cast` sont des correctifs appliqués à chaud et reportés ensuite dans le fichier concerné (`0002_functions.sql`, `0006_multiplayer.sql` pour le cast `rk::int`, `0007_rank_by_score.sql`) : les définitions en base correspondent aux fichiers du dépôt (`get_state` en base utilise bien `rank() over (order by score desc)`). Les seeds n'apparaissent pas dans cet historique (chargés hors `apply_migration`, voir [Appliquer une migration](#appliquer-une-migration)). Questions en base : 250 `echr-anglais-s7`, 406 `geo`, 252 `histoire`.

## Seed des questions

### Sources et normalisation

Deux formats de banque, lus par `scripts/lib/load-questions.mjs` (`loadQuestions(theme)`) :

- `data/questions/<theme>.json` — tableau simple `{ subtype, prompt, choices[4], answer, iso? }` (`geo.json`, `histoire.json`) ;
- `data/courses/<theme>.json` — `{ meta, topics, modes, questions: [{ id, topic, type, difficulty, question, choices[4], answer, explanation, source, flag?, disputed? }] }` (`echr-anglais-s7.json`, accompagné du cours en `echr-anglais-s7.md`).

`loadQuestions` cherche d'abord `data/courses/`, puis `data/questions/`. Il valide (4 choix, `answer` dans 0–3, pas de doublon `prompt + iso`), **mélange les 4 choix** avec un générateur déterministe (LCG, graine 42 : le seed est reproductible) et produit des lignes normalisées :

```
[subtype, prompt, choices, correct_index, iso, explanation, difficulty, flag, disputed, source, external_id, qtype]
```

`iso` devient `image_url = 'https://flagcdn.com/w320/<iso>.png'` côté SQL.

### Voie 1 : fichier SQL versionné

```bash
node scripts/gen-seed-sql.mjs echr-anglais-s7
# 250 questions -> supabase/migrations/0003_seed_echr-anglais-s7.sql
```

Le fichier généré fait `delete from questions where theme = '<theme>'` puis un `insert … select … from jsonb_array_elements('<payload>'::jsonb)`. À exécuter dans le SQL editor (ou via `apply_migration`). Avantage : la banque est versionnée dans le dépôt ; inconvénient : fichiers volumineux (160 Ko pour le cours d'anglais).

### Voie 2 : RPC temporaire `admin_seed_questions` + `scripts/seed-remote.mjs`

`scripts/seed-remote.mjs` lit `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), charge la banque avec le même `loadQuestions`, et appelle `sb.rpc('admin_seed_questions', { p_secret, p_theme, p_rows })` avec la clé anon :

```bash
SEED_SECRET=un-secret-long node scripts/seed-remote.mjs geo
# 406 questions insérées (geo, source data/questions/geo.json)
```

La RPC **n'est pas versionnée** (ni dans le dépôt, ni présente en base en temps normal) : on la crée juste avant, on la supprime juste après, pour ne jamais laisser une porte d'écriture ouverte avec la clé anon. Définition compatible avec le script et le format de lignes (même `insert` que `gen-seed-sql.mjs`) :

```sql
create or replace function admin_seed_questions(p_secret text, p_theme text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_secret is distinct from 'un-secret-long' then raise exception 'forbidden'; end if;
  delete from questions where theme = p_theme;
  insert into questions (theme, subtype, prompt, choices, correct_index, image_url,
                         explanation, difficulty, flag, disputed, source, external_id, qtype)
  select p_theme, x->>0, x->>1, x->2, (x->>3)::int,
         case when x->>4 is null then null else 'https://flagcdn.com/w320/' || (x->>4) || '.png' end,
         x->>5, (x->>6)::int, x->>7, x->>8, x->>9, x->>10, x->>11
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
```

Puis, une fois le script passé :

```sql
drop function admin_seed_questions(text, text, jsonb);
```

La procédure pas à pas (y compris la variante PowerShell de `SEED_SECRET`) est détaillée dans [content](content.md) et [development](development.md).

### Ajouter un thème ou un mode

- **Nouveau mode sur un thème existant** : une ligne dans `modes` (`id`, `course`, `theme`, `label`, `description`, `emoji`, `subtypes`, `sort`). Rien à déployer côté front : `useModes()` lit la table au chargement.
- **Nouveau thème** : un JSON dans `data/questions/` ou `data/courses/`, un seed (voie 1 ou 2), puis ses lignes dans `modes`. Le mode par défaut du formulaire de création est `DEFAULT_MODE` dans `src/types.ts` (`echr:full`).
- Vérifier ensuite que chaque mode a au moins 5 questions (`games.question_count` a un `check ≥ 5` : un mode plus petit fait échouer `create_game` sur la contrainte, pas sur `no_questions_for_theme`).

### Attention au re-seed d'une banque

`answers.question_id` référence `questions(id)` **sans `on delete cascade`** : le `delete from questions where theme = …` d'un seed échoue (`violates foreign key constraint`) dès qu'une réponse existe sur ce thème. De plus, `games.question_ids` est un `uuid[]` sans FK : les anciennes parties pointeraient vers des ids disparus (leur révision perdrait des lignes). Avant de re-seeder un thème, supprimer les parties concernées (la cascade nettoie `players`, `player_tokens`, `answers`) :

```sql
-- parties jouées sur un mode du thème 'geo' (l'id de mode est stocké dans games.theme)
delete from games
where theme in (select id from modes where theme = 'geo')
   or theme = 'geo' or theme like 'geo:%';
```

## Requêtes SQL utiles

À lancer dans le SQL editor ou via `execute_sql` (MCP).

Parties par mode et statut :

```sql
select theme as mode, status, count(*) as n
from games
group by theme, status
order by theme, status;
```

Questions disponibles par mode (détecte un mode trop petit ou un `subtypes` mal orthographié) :

```sql
select m.id, m.label, count(q.id) as questions
from modes m
left join questions q
  on q.theme = m.theme and (m.subtypes is null or q.subtype = any(m.subtypes))
group by m.id, m.label, m.sort
order by m.sort;

-- sous-types déclarés dans modes mais absents de questions
select m.id, s as subtype_manquant
from modes m, unnest(m.subtypes) as s
where not exists (select 1 from questions q where q.theme = m.theme and q.subtype = s);
```

Répartition des questions par thème et sous-type :

```sql
select theme, subtype, count(*) as n
from questions
group by theme, subtype
order by theme, subtype;
```

Vérifier une partie par son code (joueurs, scores, avancement, réponses) :

```sql
select g.code, g.status, g.theme, g.question_count, g.started_at, g.ends_at, g.finished_at,
       p.nickname, p.score, p.answered_count,
       coalesce(array_length(p.queue, 1), 0) as remaining, p.finished_at as player_finished,
       (p.id = g.host_player_id) as is_host, (p.id = g.winner_player_id) as is_winner,
       (select count(*) from answers a where a.player_id = p.id) as answers
from games g join players p on p.game_id = g.id
where g.code = 'KPQZT'
order by p.score desc, p.answered_count desc, p.created_at;
```

Parties `playing` dont le timer est dépassé mais non clôturées (aucun client ne les a rafraîchies) :

```sql
select id, code, ends_at from games where status = 'playing' and ends_at < now();
-- clôture manuelle
select end_game_if_expired(id) from games where status = 'playing' and ends_at < now();
```

Nettoyer les vieilles parties (la cascade supprime `players`, `player_tokens` et `answers` ; un client qui reviendrait avec un jeton orphelin reçoit `invalid_token` et repart de l'accueil) :

```sql
-- salons jamais lancés depuis plus d'un jour
delete from games where status = 'lobby' and created_at < now() - interval '1 day';
-- parties de plus de 7 jours
delete from games where created_at < now() - interval '7 days';
```

Questions les plus ratées d'un thème (utile pour relire un corrigé) :

```sql
select q.external_id, q.subtype, left(q.prompt, 70) as prompt,
       count(*) as reponses, round(100.0 * avg(a.is_correct::int)) as pct_ok
from answers a join questions q on q.id = a.question_id
where q.theme = 'echr-anglais-s7'
group by q.id, q.external_id, q.subtype, q.prompt
having count(*) >= 3
order by pct_ok asc, reponses desc
limit 20;
```

Contrôle des règles de sécurité (doit renvoyer exactement trois policies `SELECT` et deux tables publiées) :

```sql
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
