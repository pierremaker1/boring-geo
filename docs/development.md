# Guide développeur

Ce document explique comment installer, lancer, tester et livrer Boring Law. Pour comprendre *comment* le jeu
fonctionne, lire [architecture](architecture.md) (vue d'ensemble), [database](database.md) (tables, RPC,
Realtime), [frontend](frontend.md) (pages, hooks, composants) et [game-rules](game-rules.md) (règles) ; la banque de
questions est décrite dans [content](content.md), le design system « Globe Pop! » (tokens, composants, motion, sons)
dans la [spec de design](design-spec.md). Le [README](../README.md) résume l'essentiel.

Le projet ne contient **aucun test automatisé** : la vérification passe par le build TypeScript, le lint, le test
manuel à plusieurs navigateurs et des scénarios SQL joués directement en base (voir §7).

## 1. Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| Node.js | **24** (celle du CI, `.github/workflows/pages.yml` ; `@types/node` ^24) | Vite 8, scripts `.mjs` avec `await` top-level |
| npm | 11 (livré avec Node 24) | `npm ci` en CI, `package-lock.json` versionné |
| Un projet Supabase | — | Postgres + RPC + Realtime ; il n'y a pas de stack locale (`supabase/` ne contient que `migrations/`, pas de `config.toml`) |
| Git Bash ou PowerShell | — | Le projet est développé sous Windows 11, voir les pièges en §9 |

Vérifier : `node --version` → `v24.x`, `npm --version` → `11.x`.

## 2. Installation et configuration

```bash
git clone https://github.com/pierremaker1/boring-law.git
cd boring-law
npm install
cp .env.example .env.local
```

`.env.local` (ignoré par git via `*.local` et `.env.local` dans `.gitignore`) contient les deux seules variables
lues par le client (`src/lib/supabase.ts`) :

```dotenv
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx
```

Ce sont l'URL du projet et la clé **publique** (anon / publishable). Toute la sécurité repose sur les RPC
`security definer` et le RLS (`supabase/migrations/0001_schema.sql`) : la clé anon ne permet que de lire `games`,
`players` et `modes`, et d'appeler les fonctions publiques. Le jeton secret d'un joueur (`player_tokens.token`) n'est
renvoyé que par `create_game` / `join_game`.

Une troisième variable, **`VITE_BASE`**, n'est lue qu'au build (`vite.config.ts` : `base: process.env.VITE_BASE ?? '/'`).
Elle vaut `/boring-law/` pour le miroir GitHub Pages et `/` (défaut) pour Vercel. Elle ne va pas dans `.env.local`.

### Préparer la base

Les migrations s'appliquent à la main, dans l'éditeur SQL du dashboard Supabase (ou via le MCP Supabase), dans
cet ordre :

| Fichier | Contenu |
|---|---|
| `0001_schema.sql` | tables `questions`, `games`, `players`, `player_tokens`, `answers`, RLS, publication Realtime |
| `0002_functions.sql` | RPC de base : `create_game`, `join_game`, `update_settings`, `start_game`, `get_state`, `submit_answer`, `pass_question`, `end_game_if_expired`, helpers `_gen_code`, `_player_from_token`, `_pick_questions`, `_finalize_game`, `_current_question` |
| `0004_modes_and_end_rule.sql` | modes `theme:subtype`, fin de partie quand **tous** ont fini |
| `0005_courses_modes_review.sql` | colonnes pédagogiques (`explanation`, `difficulty`, `flag`, `disputed`, `source`, `external_id`, `qtype`), table `modes`, `_pick_questions(p_mode, p_count)`, RPC `get_review` |
| `0003_seed_geo.sql`, `0003_seed_histoire.sql`, `0003_seed_echr-anglais-s7.sql` | banques de questions (générées, voir §4) |
| `0006_multiplayer.sql` | `games.max_players`, `join_game` jusqu'à 10, `start_game` en solo, `get_state` avec `players[]` classés et `rank` |
| `0007_rank_by_score.sql` | `get_state` : rang « compétition » (1, 1, 3) sur le score seul, cohérent avec `winner_player_id` |

Attention à la numérotation : les fichiers `0003_seed_*` sont **regénérés** par `scripts/gen-seed-sql.mjs` et
insèrent dans les colonnes créées par `0005` (`explanation`, `difficulty`, …). Ils doivent donc passer **après**
`0005`, malgré leur numéro.

## 3. Scripts npm

| Commande | Ce qu'elle fait | Quand |
|---|---|---|
| `npm run dev` | `vite` : serveur de dev sur http://localhost:5173, HMR | tout le temps |
| `npm run build` | `tsc -b && vite build` : **vérification TypeScript complète** (tsconfig.app + tsconfig.node) puis bundle dans `dist/` | avant chaque commit |
| `npm run build:pages` | `vite build` puis copie `dist/index.html` → `dist/404.html` (fallback SPA de GitHub Pages). **Ne lance pas `tsc`** | CI GitHub Pages |
| `npm run lint` | `oxlint` avec `.oxlintrc.json` (plugins react, typescript, oxc ; `react/rules-of-hooks` en erreur, `react/only-export-components` en avertissement) | avant chaque commit |
| `npm run preview` | `vite preview` : sert `dist/` sur http://localhost:4173 | vérifier un build de prod |

Vérification TypeScript rapide sans bundler (ce que le build fait en premier) :

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Passer des options à Vite après `--` : `npm run dev -- --port 5174 --strictPort`, `npm run dev -- --host` (pour
tester depuis un téléphone sur le même Wi-Fi).

## 4. Scripts Node : la banque de questions

Les questions vivent dans deux formats de JSON (décrits dans [content](content.md)), chargés et normalisés par
`scripts/lib/load-questions.mjs` :

| Source | Format | Exemple |
|---|---|---|
| `data/questions/<theme>.json` | tableau simple `{ subtype, prompt, choices[4], answer, iso? }` | `geo.json` (406), `histoire.json` (252) |
| `data/courses/<theme>.json` | `{ meta, topics, modes, questions: [{ id, topic, type, difficulty, question, choices, answer, explanation, source, flag?, disputed? }] }` | `echr-anglais-s7.json` (250) |

`loadQuestions(theme)` cherche d'abord `data/courses/`, puis `data/questions/`. Il valide (4 choix, `answer` dans
0..3, pas de doublon `prompt + iso`) et **mélange les 4 choix avec un RNG déterministe** (graine 42) : deux
générations donnent le même SQL. Une ligne normalisée est le tableau
`[subtype, prompt, choices, correct, iso, explanation, difficulty, flag, disputed, source, external_id, qtype]`.

### `scripts/gen-seed-sql.mjs` — générer une migration de seed

```bash
node scripts/gen-seed-sql.mjs geo        # -> supabase/migrations/0003_seed_geo.sql
node scripts/gen-seed-sql.mjs echr-anglais-s7
```

Le fichier produit fait `delete from questions where theme = '<theme>'` puis un `insert … select` depuis
`jsonb_array_elements(...)`. Les apostrophes sont doublées (`''`), l'`image_url` des drapeaux est construite à
partir de l'`iso` (`https://flagcdn.com/w320/<iso>.png`). À lancer **depuis la racine** du dépôt (chemins relatifs).

### `scripts/seed-remote.mjs` — pousser une banque en base sans coller 160 Ko de SQL

```bash
# Git Bash
SEED_SECRET=un-secret node scripts/seed-remote.mjs echr-anglais-s7
# PowerShell
$env:SEED_SECRET='un-secret'; node scripts/seed-remote.mjs echr-anglais-s7
```

Le script lit `.env.local` lui-même, puis appelle la RPC `admin_seed_questions(p_secret, p_theme, p_rows)` avec
la clé anon et affiche `<n> questions insérées`. **Cette RPC n'est pas dans les migrations** : on la crée juste
avant dans l'éditeur SQL et on la supprime juste après (elle expose une écriture à quiconque connaît le secret).
Définition compatible avec le script et avec `gen-seed-sql.mjs` :

```sql
create or replace function admin_seed_questions(p_secret text, p_theme text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret is distinct from 'un-secret' then raise exception 'forbidden'; end if;
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

-- une fois le seed passé :
drop function admin_seed_questions(text, text, jsonb);
```

Piège : `answers.question_id` référence `questions(id)` **sans `on delete cascade`**. Re-seeder un thème déjà joué
échoue sur la contrainte tant que des réponses existent. En dev, les parties sont jetables :
`delete from games;` (cascade sur `players`, `player_tokens`, `answers`) avant de relancer le seed.

### Ajouter un mode ou un thème

Un mode est une ligne de la table `modes` (`id, course, theme, label, description, emoji, subtypes, sort`) ; le client
les lit avec `useModes()` (`src/hooks/useModes.ts`, cache module-level, groupés par `course`). `subtypes = null`
= tout le thème. Ajouter un thème = nouveau JSON dans `data/`, seed, puis ses lignes dans `modes`. Le mode proposé à
la création est `DEFAULT_MODE` (`src/types.ts`, `'echr:full'`). Les libellés français des sous-types du HUD sont
dans `src/lib/subtype.ts`.

## 5. Lancer et parcourir l'app

```bash
npm run dev
```

Routes (`src/App.tsx`, `BrowserRouter` avec `basename={import.meta.env.BASE_URL}`) :

| Route | Page | Garde |
|---|---|---|
| `/` | `src/pages/Home.tsx` | — |
| `/lobby/:code` | `src/pages/Lobby.tsx` | `useSession()` : session locale dont le `code` = celui de l'URL, sinon retour à `/` |
| `/game/:code` | `src/pages/Game.tsx` | idem |
| `/results/:code` | `src/pages/Results.tsx` | idem |
| `*` | redirection `/` | — |

Chaque page suit `game.status` (`lobby` / `playing` / `finished`) via un `useEffect` et redirige vers la bonne
route : on peut recharger n'importe quelle page, l'état vient toujours de `get_state`.

## 6. Tester à plusieurs en local

La session d'un joueur (`{ game_id, code, player_id, token }`) est stockée dans `localStorage` sous la clé
`boring-geo:session` (`src/lib/session.ts`). `localStorage` est partagé par **tous les onglets d'une même
origine** : deux onglets sur `localhost:5173` sont le *même* joueur. Il faut donc une origine (ou un profil de
navigateur) par joueur.

### Deux joueurs : deux serveurs Vite

```bash
npm run dev -- --port 5173 --strictPort   # joueur 1 : http://localhost:5173
npm run dev -- --port 5174 --strictPort   # joueur 2 : http://localhost:5174
```

`.claude/launch.json` déclare exactement ces deux configurations, `dev` (5173) et `dev2` (5174), pour l'outil de
prévisualisation de Claude Code (`preview_start` avec `name: "dev"` / `"dev2"`). `--strictPort` évite que Vite
glisse silencieusement sur un autre port.

Autres origines gratuites : une **fenêtre de navigation privée** (localStorage vide et jeté à la fermeture), un
autre navigateur, ou `http://127.0.0.1:5173` (origine différente de `localhost:5173`).

### Trois à dix joueurs : remplir le salon en SQL

Pour tester la grille du salon, le classement et le podium sans ouvrir dix navigateurs, on ajoute des joueurs
fictifs directement en base (le salon se met à jour par Realtime) :

```sql
do $$
declare i int;
begin
  for i in 1..8 loop
    perform join_game('ABCDE', 'Bot ' || i);   -- code affiché dans le salon
  end loop;
end $$;
```

Les jetons de ces joueurs se retrouvent avec la requête « jetons d'une partie » du §7, ce qui permet ensuite de
les faire répondre (voir le scénario complet). Pour retirer un joueur : `delete from players where id = '…'`
(cascade sur `player_tokens` et `answers`) ; `join_game` refuse au-delà de `games.max_players` (10) avec
`game_full`.

### Ce qu'il faut vérifier en jouant

- `npm run build` et `npm run lint` passent ;
- 375 × 667 (DevTools, iPhone SE) : Home sans scroll, Game sans scroll, HUD lisible ;
- `prefers-reduced-motion` (DevTools → Rendering → Emulate CSS media) : pas de confettis, pas d'animations
  d'idle, feedback vert/rouge intact ;
- raccourcis clavier 1-4 / Espace / P, y compris sur AZERTY (le code physique `Digit1…4` est accepté) ;
- rechargement de la page en plein jeu : on retrouve la même question (file d'attente côté serveur).

Voir la checklist complète dans la [spec de design §7.3](design-spec.md).

## 7. Tester la logique SQL directement

Toute la logique de jeu est en PL/pgSQL (détail des tables et fonctions dans [database](database.md)). Dans
l'éditeur SQL (connecté en `postgres`), on peut appeler les RPC avec les mêmes arguments que `src/lib/api.ts` et
vérifier les invariants sans passer par l'UI. Signatures :

| RPC | Arguments | Retour |
|---|---|---|
| `create_game` | `p_nickname text, p_question_count int = 20, p_duration_seconds int = 120, p_theme text = 'geo'` | `json { game_id, code, player_id, token }` |
| `join_game` | `p_code text, p_nickname text` | idem |
| `update_settings` | `p_token uuid, p_question_count int, p_duration_seconds int, p_theme text` | `void` |
| `start_game` | `p_token uuid` (hôte) | `void` |
| `get_state` | `p_token uuid` | `json { game, me, opponent, players, question, server_now }` |
| `submit_answer` | `p_token uuid, p_question_id uuid, p_choice_index int` | `json { is_correct, correct_index }` |
| `pass_question` | `p_token uuid` | `void` |
| `end_game_if_expired` | `p_game_id uuid` | `void` |
| `get_review` | `p_token uuid` | `json` : tableau JSON de questions, `[]` si vide (partie finie seulement) |

`p_theme` accepte un id de la table `modes` (`'echr:annales'`, `'geo:drapeau'`) ou, à défaut, `theme` /
`theme:subtype`.

### Scénario complet dans un bloc `DO`

Crée une partie de 5 questions, fait entrer deux invités, démarre, fait répondre tout le monde (choix 0) et
affiche l'état final. La partie se termine d'elle-même quand le dernier joueur a vidé sa file.

```sql
do $$
declare
  host json; g json; st json; res json;
  toks uuid[]; tok uuid; i int;
begin
  host := create_game('test-hote', 5, 60, 'geo');
  toks := array[(host->>'token')::uuid];
  for i in 1..2 loop
    g := join_game(host->>'code', 'test-invite-' || i);
    toks := toks || (g->>'token')::uuid;
  end loop;

  perform start_game(toks[1]);                       -- toks[1] = l'hôte

  foreach tok in array toks loop
    loop
      st := get_state(tok);
      exit when json_typeof(st->'question') = 'null';  -- plus de question dans ma file
      res := submit_answer(tok, ((st->'question')->>'id')::uuid, 0);
    end loop;
  end loop;

  st := get_state(toks[1]);
  raise notice 'code=%  status=%  winner=%', host->>'code',
    st->'game'->>'status', st->'game'->>'winner_player_id';
  raise notice 'players=%', st->'players';
end $$;
```

Points d'attention :

- `get_state` renvoie `question: null` en JSON (pas SQL `NULL`) quand la file est vide → tester avec
  `json_typeof(...) = 'null'`.
- **`now()` est figé pendant toute la transaction** : dans un bloc `DO`, `ends_at` (posé par `start_game`) n'est
  jamais dépassé. Pour tester l'expiration, forcer `ends_at` dans le passé (ci-dessous).
- Les `raise notice` s'affichent dans l'onglet messages/résultats de l'éditeur ; un `DO` ne renvoie pas de lignes.

### Retrouver les jetons d'une partie existante

Utile pour piloter en SQL une partie ouverte dans le navigateur, ou les bots du §6 :

```sql
select p.nickname, p.id as player_id, t.token, g.host_player_id = p.id as is_host
from players p
join player_tokens t on t.player_id = p.id
join games g on g.id = p.game_id
where g.code = 'ABCDE'
order by p.created_at;
```

### Erreurs attendues

Chaque règle métier est un `raise exception '<code>'` ; le client les traduit dans `ERRORS` (`src/lib/api.ts`).
On vérifie qu'elles se déclenchent avec un sous-bloc `exception` :

```sql
do $$
declare guest json;
begin
  guest := join_game('ABCDE', 'test-intrus');          -- partie encore en salon
  begin
    perform start_game((guest->>'token')::uuid);       -- pas l'hôte
  exception when others then raise notice 'attendu : %', sqlerrm;   -- not_host
  end;
  begin
    perform submit_answer((guest->>'token')::uuid, gen_random_uuid(), 0);
  exception when others then raise notice 'attendu : %', sqlerrm;   -- game_not_playing (salon)
  end;
end $$;
```

Une fois la partie démarrée, le même `submit_answer` avec un id qui n'est pas la tête de file lève
`stale_question`, et un onzième `join_game` lève `game_full` (avant démarrage) ou `game_already_started` (après).

Codes possibles : `game_not_found`, `game_already_started`, `game_full`, `not_host`, `invalid_token`, `time_over`,
`game_not_playing`, `stale_question`, `no_question_left`, `no_questions_for_theme`, `game_not_finished`.

### Expiration du timer

```sql
update games set ends_at = now() - interval '1 second' where code = 'ABCDE';
select end_game_if_expired(id) from games where code = 'ABCDE';      -- ou n'importe quel get_state / get_review
select status, finished_at, winner_player_id from games where code = 'ABCDE';
```

Après cela, `submit_answer` et `pass_question` lèvent `time_over`.

### Invariants à vérifier après un scénario

```sql
-- 1. score = bonnes réponses, answered_count = réponses enregistrées
select p.nickname, p.score, p.answered_count,
       (select count(*) from answers a where a.player_id = p.id and a.is_correct) as good,
       (select count(*) from answers a where a.player_id = p.id) as total
from players p join games g on g.id = p.game_id where g.code = 'ABCDE';

-- 2. file (partie démarrée) : restant + répondu = question_count, indices uniques et dans [0, question_count - 1],
--    finished_at posé exactement quand la file est vide
select p.nickname, cardinality(p.queue) as remaining, p.answered_count, g.question_count,
       cardinality(p.queue) + p.answered_count = g.question_count           as ok_total,
       (select count(distinct x) from unnest(p.queue) x) = cardinality(p.queue) as ok_unique,
       coalesce((select bool_and(x between 0 and g.question_count - 1) from unnest(p.queue) x), true) as ok_range,
       (p.finished_at is not null) = (cardinality(p.queue) = 0)              as ok_finished
from players p join games g on g.id = p.game_id where g.code = 'ABCDE';

-- 3. vainqueur : meilleur score unique -> winner_player_id, ex aequo -> null
select g.status, g.winner_player_id,
       (select count(*) from players p where p.game_id = g.id
          and p.score = (select max(score) from players where game_id = g.id)) as n_top
from games g where g.code = 'ABCDE';

-- 4. même set et même ordre pour tous : question_count = taille du tableau, pas de doublon
select code, question_count = cardinality(question_ids) as ok_count,
       cardinality(question_ids) = (select count(distinct q) from unnest(question_ids) q) as ok_distinct
from games where code = 'ABCDE';

-- 5. classement renvoyé par get_state : rank() sur le score seul (1, 1, 3), ordre score / avancement / arrivée
select nickname, score, answered_count, rank() over (order by score desc) as rank
from players where game_id = (select id from games where code = 'ABCDE')
order by score desc, answered_count desc, created_at;
```

### Nettoyer

```sql
delete from games g
where exists (select 1 from players p where p.game_id = g.id and p.nickname like 'test-%');
```

La suppression cascade sur `players`, `player_tokens` et `answers`. Un navigateur qui avait une session sur cette
partie reçoit `invalid_token` au prochain `get_state` et revient à l'accueil (§11).

## 8. Conventions de code

- **TypeScript strict, sans exception.** `tsconfig.app.json` active `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax` (les types s'importent avec `import type { … }` ou `import { type X }`),
  `erasableSyntaxOnly` (pas d'`enum`, de `namespace`, ni de propriétés de paramètres dans les constructeurs),
  `noFallthroughCasesInSwitch`. `npm run build` échoue sur le moindre import inutilisé.
- **Interface en français**, accents et typographie françaises (`’`, `«  »`, espaces insécables `&nbsp;` avant `:`
  et `!` quand ça compte). Les questions du cours d'anglais restent en anglais : elles viennent de la base.
- **Un fichier par composant** dans `src/components/`, nommé comme le composant (`PlayerGrid.tsx` exporte
  `PlayerGrid`). Les briques génériques (`Page`, `Card`, `Button`, `Input`, `ErrorMsg`, `Chip`, `Keycap`,
  `Divider`, `Dots`, `Skeleton`) vivent dans `src/components/ui.tsx`. Les hooks dans `src/hooks/`, la logique
  sans React dans `src/lib/`.
- **Fichiers « moteur » à ne pas modifier** sans raison de fond : `src/lib/api.ts`, `src/lib/session.ts`,
  `src/lib/supabase.ts`, `src/hooks/useGame.ts`, `src/hooks/useSession.ts`, `src/hooks/useTimer.ts`,
  `src/App.tsx`, `src/main.tsx`, `src/types.ts`. Le score et l'état de la partie sont **toujours** calculés par le
  serveur ; le client n'ajoute que du visuel (série, toasts, sons).
- **Tailwind v4** : les tokens sont des variables `@theme` dans `src/index.css` (`--color-ink`, `--color-blue-soft`,
  `--text-question`, `--radius-card`, `--animate-*`…), il n'y a **pas** de `tailwind.config`. Pas de classe
  construite dynamiquement (`bg-${tone}`) : le scanner ne la verrait pas ; écrire des maps complètes ou des
  variantes en toutes lettres.
- **Contraste** : sur les fonds `*-soft`, uniquement `text-ink` (ou `text-ink-soft` pour une ligne secondaire).
  Texte `ink` sur vert/bleu/jaune, blanc uniquement sur rouge en ≥ 18 px gras.
- **Motion** : `motion/react` seulement dans les fondations (`Page` dans `ui.tsx`, `StreakBadge`, `Leaderboard`,
  hooks `useCountUp` / `useReducedMotion` ; `Toast` et `RaceStatus` n'en importent pas) ; les pages utilisent
  les classes `animate-*`. `prefers-reduced-motion` est géré globalement en CSS
  (`src/index.css`, bloc `@media (prefers-reduced-motion: reduce)`) et en JS (`src/lib/confetti.ts`,
  `src/lib/sound.ts`, `useReducedMotion` de `src/hooks/useReducedMotion.ts`).
- **Assets** : aucun fichier binaire, aucun chemin absolu `/xxx` (le site est servi sous `/boring-law/` sur
  GitHub Pages). Emoji, SVG inline, sons synthétisés (Web Audio), Google Fonts par `<link>` dans `index.html`.
- **Commentaires** en français, courts, qui expliquent le *pourquoi* (voir les en-têtes de `useGame.ts`,
  `toast.ts`, `ranking.ts`).

## 9. Pièges connus

| Piège | Symptôme | Parade |
|---|---|---|
| **Heredocs bash et apostrophes françaises** (Windows / Git Bash) | `cat <<EOF` tronque ou casse le fichier dès qu'il contient `’` ou `'` ; encodage douteux | Écrire les fichiers avec l'éditeur ou les outils Write/Edit, jamais par heredoc. En PowerShell, `Set-Content` écrit en ANSI par défaut : ajouter `-Encoding utf8` |
| **MSYS convertit les chemins** | `VITE_BASE=/boring-law/ npm run build` produit `base: C:/Program Files/Git/boring-law/` | `MSYS_NO_PATHCONV=1 VITE_BASE=/boring-law/ npm run build:pages` (Git Bash) ou `$env:VITE_BASE='/boring-law/'; npm run build:pages` (PowerShell) |
| **DNS `*.vercel.app` bloqué** sur le réseau de l'université | Le site Vercel ne répond pas en salle de cours | C'est la raison d'être du miroir GitHub Pages (`.github/workflows/pages.yml`) ; tester les deux URL |
| **`React.StrictMode`** (`src/main.tsx`) | En dev, chaque effet est monté, démonté, remonté : deux abonnements Realtime dans les logs, `refresh()` appelé deux fois, un son ou un toast qui semble doublé | Normal en dev uniquement. Toujours écrire les effets avec nettoyage ; `useGame` dédoublonne les appels en vol (`pending` ref), les toasts par `key` |
| **`localStorage` partagé entre onglets** | Deux onglets = un seul joueur ; ouvrir une deuxième partie écrase la session (`saveSession`) | Un port / un profil / une fenêtre privée par joueur (§6) |
| **`build:pages` ne type-check pas** | Le CI Pages passe alors que `npm run build` échoue en local (ou l'inverse) | Lancer `npm run build` avant de pousser |
| **`vite preview` et le base path** | Après un build Pages, `npm run preview` sert à la racine et les assets 404 | Lancer `preview` avec le même `VITE_BASE`, puis ouvrir http://localhost:4173/boring-law/ |
| **Re-seed d'un thème déjà joué** | `delete from questions` refusé (FK `answers.question_id`) | `delete from games;` d'abord (§4) |
| **`now()` figé dans une transaction** | Le timer « n'expire jamais » dans un bloc `DO` | Forcer `ends_at` dans le passé (§7) |
| **Variables d'env absentes au build** | Le build réussit mais la page plante au chargement (`supabaseUrl is required`) | `.env.local` en local ; secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` dans GitHub et Vercel |

## 10. Workflow git et déploiement

- Branche unique `main`, dépôt `origin` = `https://github.com/pierremaker1/boring-law.git`.
- Avant de committer : `npm run build` puis `npm run lint`. Aucun test à lancer.
- Messages de commit en français : un sujet d'une ligne qui dit ce que ça change pour le joueur ou le développeur
  (« Backend 1 à 10 joueurs (solo autorisé), get_state renvoie le classement complet »), et un corps en puces
  `- …` quand il y a plusieurs volets.
- `dist/`, `node_modules/`, `.env.local`, `*.local`, `.vercel/` sont ignorés (`.gitignore`). Les migrations SQL et les
  seeds générés **sont** versionnés : regénérer le seed fait partie du commit qui touche `data/`.
- **Pousser sur `main` déploie**, deux fois :
  1. **Vercel** — le dossier est lié au projet `boring-law` (`.vercel/project.json`) ; `vercel.json` réécrit toutes
     les URL vers `index.html` (SPA). Les variables `VITE_SUPABASE_*` sont renseignées dans le dashboard Vercel,
     `VITE_BASE` absente (base `/`).
  2. **GitHub Pages** — `.github/workflows/pages.yml` (`on: push` sur `main` + `workflow_dispatch`) : Node 24,
     `npm ci`, `npm run build:pages` avec `VITE_BASE: /boring-law/` et les deux secrets du dépôt, puis
     `upload-pages-artifact` / `deploy-pages`. Le `404.html` copié par `build:pages` sert de fallback SPA. Pages doit
     être configuré sur la source « GitHub Actions ».
- Une migration SQL n'est **pas** déployée par le push : l'appliquer à la main dans Supabase avant (ou en même
  temps que) le front qui en dépend. Les RPC sont `create or replace` : une migration se rejoue sans casser les
  parties en cours, sauf si elle change la forme de `get_state` attendue par `src/types.ts`.

## 11. FAQ dépannage

**« Aucune partie avec ce code. »** — `join_game` a levé `game_not_found`. Le code est normalisé
(`upper(trim(p_code))`), donc la casse n'est pas en cause : faute de frappe (l'alphabet exclut `I`, `O` et les
chiffres, voir `_gen_code`), ou partie supprimée. Si la partie existe mais a commencé : `game_already_started` ;
si elle est pleine (`max_players`, 10) : `game_full`.

**J'arrive sur `/lobby/ABCDE` et je suis renvoyé à l'accueil.** — `useSession()` ne trouve pas de session locale
dont le `code` est `ABCDE` : l'URL ne suffit pas, il faut être passé par « Créer » ou « Rejoindre » dans *ce*
navigateur (clé `boring-geo:session`). Un autre onglet de la même origine a peut-être écrasé la session en créant
une autre partie.

**« Session invalide. » / retour brutal à l'accueil.** — `get_state` a levé `invalid_token` : la partie (ou le joueur)
a été supprimée en base, donc `player_tokens` aussi (cascade). `useGame` appelle alors `clearSession()` et
`window.location.assign(import.meta.env.BASE_URL)`. Recréer une partie.

**La carte « Tu as une partie en cours » traîne sur l'accueil.** — `loadSession()` non vide. « Reprendre » y
retourne ; créer ou rejoindre une partie remplace la session ; « Quitter » (salon) ou « Nouvelle partie » (résultats)
appellent `clearSession()`.

**Le timer semble décalé entre deux joueurs, ou faux après une mise en veille.** — `useTimer` calcule le restant
depuis `game.ends_at` (posé par le serveur au `start_game`) et `clockOffset = server_now − Date.now()`, remis à jour
à chaque `get_state` (`useGame`). Un écart persistant entre deux machines ne peut venir que de la latence réseau
(quelques centaines de ms). Si le timer affiche 0 sans écran de fin : `Game` appelle une seule fois
`end_game_if_expired` (`expiredCalled` ref) puis `refresh()` ; sinon le prochain `get_state` (poll ≤ 5 s) clôture
paresseusement (`_finalize_game`). Vérifier `ends_at` en base :
`select code, status, ends_at, now() from games where code = 'ABCDE'`.

**Rien ne bouge chez l'adversaire (Realtime muet).** — `useGame` s'abonne au canal `game:<game_id>` sur
`postgres_changes` de `games` (`id=eq.`) et `players` (`game_id=eq.`), **et** poll toutes les 5 s. Si l'UI ne se met
à jour que par à-coups de 5 s, le Realtime ne passe pas : vérifier dans Supabase que `games` et `players` sont bien
dans la publication `supabase_realtime` (fait par `0001_schema.sql`, avec `replica identity full`), que les policies
`games readable` / `players readable` existent (sans `select` pour `anon`, aucun événement n'est délivré), et que le
réseau laisse passer les WebSockets (proxy d'université). Le jeu reste jouable en mode poll.

**« Pas de questions pour ce mode. »** — `no_questions_for_theme` : la table `questions` ne contient rien pour
le `theme` (et les `subtypes`) du mode. Rejouer le seed correspondant (§4) ; vérifier avec
`select theme, subtype, count(*) from questions group by 1, 2 order by 1, 2`.

**`npm run build` échoue.**
- `TS6133 '…' is declared but its value is never read` → import ou variable inutilisé (`noUnusedLocals`).
- `TS1484 '…' is a type and must be imported using a type-only import` → `import type` (`verbatimModuleSyntax`).
- `TS1294` sur un `enum` ou une propriété de paramètre → `erasableSyntaxOnly` : remplacer par des unions de
  littéraux / des objets `as const`.
- Une classe Tailwind absente du rendu sans erreur de build → classe construite dynamiquement, voir §8.
- Le CI Pages échoue sur `npm ci` → `package-lock.json` désynchronisé de `package.json` : relancer
  `npm install` en local et committer le lock.

**Le site Pages charge mais les assets sont en 404.** — Un chemin absolu (`/icons.svg`, `/src/…`) a été ajouté.
Sous `VITE_BASE=/boring-law/`, tout doit passer par des imports Vite ou des chemins relatifs ; `App.tsx` utilise
déjà `basename={import.meta.env.BASE_URL}` pour le routeur.
