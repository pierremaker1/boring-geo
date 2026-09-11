# Architecture technique

Ce document décrit comment Boring Law fonctionne sous le capot : où vit la logique de jeu, ce que le
navigateur voit (et ne voit pas), comment les joueurs restent synchronisés et ce qui se passe à chaque
étape d'une partie. Tout ce qui est cité ici (fichiers, fonctions SQL, colonnes) existe dans le dépôt ;
les références pointent vers `src/` et `supabase/migrations/`.

Voir aussi : [règles du jeu](game-rules.md) (les règles telles qu'implémentées), [contenu
pédagogique](content.md) (banque de questions, modes, ajout d'un cours), [spec de design](design-spec.md)
(design system « Globe Pop! », composants UI) et le [README](../README.md) (mise en route).

## 1. Vue d'ensemble

```text
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Navigateur joueur A          │        │ Navigateurs joueurs B … J    │
│ React 19 + Vite (SPA)        │        │ (jusqu'à 10 par partie)      │
│ localStorage : session,      │        │ chacun sa session / token    │
│ pseudo, mute                 │        │                              │
└──────┬───────────────▲───────┘        └──────┬───────────────▲───────┘
       │ RPC (HTTPS,   │ Realtime (WebSocket)  │               │
       │ clé anon)     │ postgres_changes      │               │
       ▼               │                       ▼               │
┌────────────────────────────────────────────────────────────────────────┐
│ Supabase (projet cloud)                                                 │
│                                                                         │
│  ┌───────────────────────┐    ┌────────────────────────────────────┐   │
│  │ PostgREST             │    │ Realtime                           │   │
│  │ /rest/v1/rpc/<fn>     │    │ publication `supabase_realtime`    │   │
│  │ /rest/v1/modes (GET)  │    │ tables `games`, `players`          │   │
│  └───────────┬───────────┘    │ (replica identity full)            │   │
│              │                └─────────────────▲──────────────────┘   │
│              ▼                                  │ WAL                  │
│  ┌──────────────────────────────────────────────┴──────────────────┐   │
│  │ Postgres                                                        │   │
│  │  Fonctions plpgsql SECURITY DEFINER (toute la logique de jeu) : │   │
│  │   create_game · join_game · update_settings · start_game        │   │
│  │   get_state · submit_answer · pass_question                     │   │
│  │   end_game_if_expired · get_review                              │   │
│  │  + server_now : RPC utilitaire `sql stable`, pas security def.  │   │
│  │  Tables (RLS activée partout) :                                 │   │
│  │   questions · games · players · player_tokens · answers · modes │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘

Hébergement du front (fichiers statiques, aucun serveur applicatif) :
  • Vercel            — déploiement principal (`vercel.json` : rewrite SPA → index.html)
  • GitHub Pages      — miroir (`.github/workflows/pages.yml`, VITE_BASE=/boring-law/,
                        `npm run build:pages` copie index.html en 404.html pour le fallback SPA)
```

Il n'y a **aucun backend applicatif** : pas de Node, pas d'Edge Function. Le front (Vite + React) parle
directement à Supabase avec la clé anon (`src/lib/supabase.ts`), et tout ce qui touche au jeu passe
par des fonctions Postgres.

| Couche | Technologie | Où |
|---|---|---|
| Front | Vite 8, React 19, TypeScript, Tailwind v4, react-router-dom v7, `motion`, `canvas-confetti` | `src/` |
| Accès API | `@supabase/supabase-js` (`supabase.rpc(...)` et `supabase.from('modes')`) | `src/lib/api.ts`, `src/lib/supabase.ts` |
| Logique de jeu | plpgsql, fonctions `security definer` | `supabase/migrations/0002_functions.sql`, `0004_*.sql`, `0005_*.sql`, `0006_multiplayer.sql`, `0007_rank_by_score.sql` |
| Schéma | Postgres + RLS + publication Realtime | `supabase/migrations/0001_schema.sql` |
| Banque de questions | JSON → SQL de seed généré | `data/`, `scripts/`, `supabase/migrations/0003_seed_*.sql` |

## 2. Principe : toute la logique de jeu est côté serveur

Le navigateur ne décide jamais rien : il **demande** (répondre, passer, démarrer) et **affiche** l'état que
le serveur lui renvoie. Chaque règle du jeu est une fonction plpgsql déclarée `security definer set
search_path = public`, ce qui signifie :

- la fonction s'exécute avec les droits de son propriétaire (le rôle qui a joué la migration), pas ceux
  du rôle `anon` qui l'appelle ; elle peut donc lire `questions.correct_index` ou écrire dans `answers`
  alors que ces tables sont fermées au client ;
- le client ne peut agir **que** par l'interface de ces fonctions ; il n'a aucun accès en écriture direct.

Ce que le serveur calcule et que le client ne fait que refléter :

| Règle | Fonction | Détail |
|---|---|---|
| Tirage des questions (même set, même ordre pour tous) | `_pick_questions(p_mode, p_count)` | `order by random() limit p_count`, filtre par `modes.theme` / `modes.subtypes` |
| Code de partie à 5 lettres sans caractères ambigus | `_gen_code()` | alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ`, boucle jusqu'à unicité |
| File de questions par joueur | `players.queue int[]` | indices dans `games.question_ids` ; réponse = dépile la tête, passe = tête → fin de file |
| Score | `submit_answer` | `+1` si `q.correct_index = p_choice_index`, une ligne dans `answers` (`unique (player_id, question_id)`) |
| Horloge | `start_game` | `ends_at = now() + make_interval(secs => duration_seconds)` |
| Fin de partie et vainqueur | `_finalize_game` | statut `finished`, `winner_player_id` = meilleur score s'il est unique, sinon `null` |
| Classement | `get_state` (version `0007_rank_by_score.sql`) | `rank` = `rank() over (order by score desc)` (rang « compétition », ex æquo partagés : 1, 1, 3) ; **ordre** du tableau `players` : score desc, `answered_count` desc, `created_at` asc |

Les helpers internes (`_gen_code`, `_player_from_token`, `_pick_questions`, `_finalize_game`,
`_current_question`, `_player_json`) sont retirés de `public`, `anon` et `authenticated` par
`revoke execute` (fin de `0002_functions.sql`, `0005_courses_modes_review.sql`, `0006_multiplayer.sql`) :
seules les RPC « publiques » sont appelables depuis le navigateur.

Les migrations se superposent avec `create or replace function` : la version en vigueur d'une fonction
est celle de la **dernière** migration qui la définit (`get_state` : `0007` ; `submit_answer` : `0004` ;
`join_game`, `start_game` : `0006` ; `_pick_questions` : `0005`).

Côté front, le miroir de cette API est l'objet `api` de `src/lib/api.ts` : une méthode par RPC, et un
`ApiError` dont le `code` est le nom de l'exception SQL (`raise exception 'game_full'`), traduit en
message français par la table `ERRORS`.

## 3. Modèle de données

Tables créées dans `0001_schema.sql`, complétées par `0005_courses_modes_review.sql` (colonnes
pédagogiques, table `modes`) et `0006_multiplayer.sql` (`games.max_players`).

| Table | Rôle | Colonnes notables |
|---|---|---|
| `questions` | banque de questions | `theme`, `subtype`, `prompt`, `choices jsonb` (4 choix), `correct_index` (0–3), `image_url`, `explanation`, `difficulty`, `flag`, `disputed`, `source`, `external_id`, `qtype` |
| `modes` | modes proposés dans le salon, groupés par cours | `id` (ex. `echr:annales`), `course`, `theme`, `label`, `description`, `emoji`, `subtypes text[]` (`null` = tout le thème), `sort` |
| `games` | une partie | `code` (unique), `status` (`lobby` / `playing` / `finished`), `theme` (contient un id de `modes`), `question_count` (5–100), `duration_seconds` (30–600), `max_players` (1–10), `question_ids uuid[]`, `host_player_id`, `winner_player_id`, `started_at`, `ends_at`, `finished_at` |
| `players` | un joueur dans une partie | `game_id`, `nickname` (1–20 car.), `score`, `queue int[]`, `answered_count`, `finished_at` |
| `player_tokens` | secret par joueur | `player_id` (PK), `token uuid` (unique, `gen_random_uuid()`) |
| `answers` | une ligne par réponse donnée | `game_id`, `player_id`, `question_id`, `choice_index`, `is_correct`, `answered_at` ; `unique (player_id, question_id)` |

Les suppressions cascadent depuis `games` (`on delete cascade` sur `players`, `answers`) et depuis
`players` (`player_tokens`, `answers`).

## 4. Modèle de sécurité

### 4.1 Pas de comptes : un token secret par joueur

Il n'y a ni inscription ni Supabase Auth. L'identité d'un joueur est un **UUID aléatoire** stocké dans
`player_tokens.token`, généré par `create_game` / `join_game` et renvoyé **une seule fois** dans leur
résultat JSON (`{ game_id, code, player_id, token }`, typé `Session` dans `src/types.ts`).

Toutes les RPC qui agissent au nom d'un joueur prennent `p_token uuid` en premier paramètre et le
résolvent avec `_player_from_token(p_token)`, qui lève `invalid_token` si aucune ligne ne correspond.
L'autorisation en découle naturellement :

- le token identifie le joueur **et** sa partie (`players.game_id`) : impossible d'agir sur une autre
  partie ;
- `update_settings` et `start_game` vérifient `g.host_player_id <> pl.id` → `not_host` ;
- `join_game` et `update_settings` / `start_game` posent un `for update` sur la ligne `games`,
  `submit_answer` / `pass_question` sur la ligne `players` : deux appels concurrents sont sérialisés
  (pas de double réponse, pas de 11e joueur).

`player_tokens` a la RLS activée **sans aucune policy** : le rôle `anon` ne peut ni la lire ni l'écrire.
Le token ne transite que dans le résultat de `create_game` / `join_game`, puis dans les paramètres des
RPC ; `get_state` ne le renvoie jamais.

### 4.2 RLS : ce qui est lisible directement

| Table | Policy (`0001_schema.sql`, `0005_*.sql`) | Conséquence |
|---|---|---|
| `games`, `players` | `for select to anon, authenticated using (true)` | lecture publique, **nécessaire au Realtime** (`postgres_changes` respecte la RLS) |
| `modes` | `for select ... using (true)` | le client lit la liste des modes avec `supabase.from('modes').select('*')` (`api.listModes`) |
| `questions`, `answers`, `player_tokens` | RLS activée, aucune policy | fermées au client ; seules les fonctions `security definer` y accèdent |

Aucune table n'a de policy `insert` / `update` / `delete` : toute écriture passe par une RPC.

### 4.3 Ce que le client ne voit jamais avant la fin

- **`correct_index` de la question en cours** : `_current_question(pl, g)` construit un JSON réduit
  (`id`, `subtype`, `prompt`, `choices`, `image_url`). La bonne réponse n'est renvoyée par
  `submit_answer` **qu'après** l'insertion dans `answers` (`{ is_correct, correct_index }`), pour
  colorer les boutons en vert / rouge.
- **L'explication et les métadonnées pédagogiques** (`explanation`, `flag`, `disputed`, `source`,
  `difficulty`) : uniquement via `get_review`, qui lève `game_not_finished` tant que
  `games.status <> 'finished'`.
- **Les questions à venir** : le client ne connaît que la tête de sa file. `games.question_ids` est
  certes lisible (table `games` publique) mais ne contient que des UUID, et `questions` est fermée.
- **Le token des autres joueurs** : jamais exposé (cf. 4.1).

Le client ne peut pas non plus répondre « à côté » : `submit_answer` compare
`g.question_ids[head + 1]` à `p_question_id` et lève `stale_question` si ce n'est pas la question en
tête de file (rafraîchissement Realtime arrivé entre-temps, double clic, requête rejouée).

## 5. Flux d'une partie de bout en bout

Routes (`src/App.tsx`, `BrowserRouter basename={import.meta.env.BASE_URL}`) : `/` (Home),
`/lobby/:code`, `/game/:code`, `/results/:code`. Chaque page appelle `useSession()` puis
`useGame(session)` et **se redirige d'elle-même** selon `state.game.status` (un `useEffect` par page :
`playing` → `/game`, `finished` → `/results`, `lobby` → `/lobby`).

```text
 Home ──create_game──▶ Lobby ──start_game──▶ Game ──(fin)──▶ Results
  │                     ▲  │                   │                │
  └──join_game──────────┘  └─update_settings   └─submit_answer  └─get_review
                                                 pass_question
                            get_state (toutes les pages, à chaque événement Realtime + poll 5 s)
```

### 5.1 Création — `create_game(p_nickname, p_question_count, p_duration_seconds, p_theme)`

`Home.tsx` appelle `api.createGame(nick, 20, 120, DEFAULT_MODE)` (`DEFAULT_MODE = 'echr:full'`,
`src/types.ts`). Côté SQL : tirage immédiat des questions (`_pick_questions`, erreur
`no_questions_for_theme` si le mode est vide), insertion de la partie avec `_gen_code()`, insertion du
joueur, de son token, puis `host_player_id = pl.id`. Le `question_count` réel est
`array_length(qids, 1)` : un mode qui contient moins de questions que demandé plafonne la partie.
Le client sauvegarde la `Session` (`saveSession`) et navigue vers `/lobby/<code>`.

### 5.2 Rejoindre — `join_game(p_code, p_nickname)`

Le code est normalisé (`upper(trim(p_code))`). Erreurs possibles : `game_not_found`,
`game_already_started` (statut ≠ `lobby`), `game_full` (`count(*) >= g.max_players`, 10 par défaut).
Même retour que `create_game` ; le client fait la même chose.

### 5.3 Salon — `get_state` + `update_settings`

`Lobby.tsx` affiche `state.players` (tous les joueurs, moi compris) dans `PlayerGrid` et le compteur
`player_count / max_players`. Seul l'hôte voit les chips actives ; chaque changement appelle
`update_settings(p_token, p_question_count, p_duration_seconds, p_theme)` qui **retire les questions**
(nouveau `question_ids`) et ajuste `question_count`. Les arrivées sont détectées côté client en comparant
la liste d'ids précédente (`usePrevious`) : toast « a rejoint » + `sfx.join()`.

### 5.4 Démarrage — `start_game(p_token)`

Réservé à l'hôte, autorisé dès 1 joueur (solo) depuis `0006_multiplayer.sql`. Pour chaque joueur :
`queue = [0 .. question_count-1]`, `score = 0`, `answered_count = 0`, `finished_at = null`. Pour la
partie : `status = 'playing'`, `started_at = now()`, `ends_at = now() + duration`. Le changement de
statut est propagé par Realtime ; chaque `Lobby` se redirige vers `/game/<code>`.

### 5.5 Boucle question / réponse / passe

`get_state(p_token)` renvoie, entre autres, `question` (tête de ma file, sans réponse) et `me.remaining`
(`array_length(queue)`). `Game.tsx` affiche la question et ses 4 choix (`AnswerButton`), raccourcis
1–4 / Espace / P.

| Action | RPC | Effet serveur | Effet client |
|---|---|---|---|
| Répondre | `submit_answer(p_token, p_question_id, p_choice_index)` | vérifie `playing`, `now() < ends_at`, tête de file ; insère `answers` ; `queue = queue[2:]`, `score += 1` si juste, `answered_count += 1`, `finished_at = now()` si c'était la dernière ; renvoie `{ is_correct, correct_index }` | fige la question dans `feedback` pendant `FEEDBACK_MS = 650` (vert / rouge / « reveal »), déclenche son, série (`src/lib/streak.ts`, purement visuel) et `refresh()` |
| Passer | `pass_question(p_token)` | si `array_length(queue) > 1` : `queue = queue[2:] || queue[1]` (la question revient en fin de file) ; sinon rien | animation « slide-back » puis `refresh()` |

Erreurs traitées silencieusement par un simple `refresh()` (le serveur a raison) : `stale_question`,
`time_over`, `game_not_playing`. Le verrou `locked = busy || !!feedback || remaining <= 0` empêche les
doubles envois.

### 5.6 Fin de partie

Deux conditions, toutes deux évaluées côté serveur (détail en § 8) : `now() >= ends_at`, ou tous les
joueurs ont `finished_at` non nul (vérifié dans `submit_answer` via `bool_and(finished_at is not null)`).
Un joueur qui a fini avant les autres reste sur `Game.tsx` avec l'écran « Terminé ! » et le classement
en direct jusqu'au `status = 'finished'`, puis est redirigé vers `/results/<code>`.

### 5.7 Révision — `get_review(p_token)`

`Results.tsx` appelle `api.getReview` une fois `status === 'finished'`. La RPC renvoie **toutes** les
questions de la partie dans l'ordre de `question_ids` (`unnest ... with ordinality`), jointes à ma
réponse (`left join answers ... and a.player_id = pl.id`) : `correct_index`, `chosen_index` (null si
jamais répondu), `is_correct`, `explanation`, `flag`, `disputed`, `source`. Si elle répond
`game_not_finished` (course entre le poll et la clôture), le client retente au prochain état.
L'API ne distingue pas « passée » de « jamais atteinte » : les deux apparaissent « sans réponse ».

## 6. Synchronisation du timer

Le timer n'est jamais compté côté client : il est dérivé d'une **date de fin fixée par le serveur** et
d'une **correction d'horloge**.

1. `start_game` écrit `games.ends_at` avec l'horloge Postgres.
2. Chaque réponse de `get_state` contient `server_now` (`now()`), évalué dans la même transaction.
3. `useGame` (`src/hooks/useGame.ts`) calcule à chaque rafraîchissement
   `clockOffset = new Date(s.server_now).getTime() - Date.now()` (ms, signé).
4. `useTimer(endsAt, clockOffset)` (`src/hooks/useTimer.ts`) renvoie
   `max(0, (ends_at - (Date.now() + clockOffset)) / 1000)` ; un `setInterval` de 200 ms force un
   re-rendu 5 fois par seconde, la valeur étant recalculée à chaque rendu (jamais périmée).
5. Dans `Game.tsx`, quand `remaining` atteint 0 alors que `status === 'playing'`, un `useRef`
   (`expiredCalled`) garantit **un seul** appel `api.endGameIfExpired(game.id)` suivi de `refresh()`.

Le serveur reste juge : `submit_answer` et `pass_question` refusent toute action après `ends_at`
(`time_over`) même si une horloge client retarde. L'offset absorbe les horloges déréglées mais inclut
la latence réseau aller-retour (non compensée) : l'affichage peut différer de quelques centaines de ms
entre joueurs, sans effet sur le score.

La RPC `server_now()` existe (`0002_functions.sql`, simple `language sql stable` sans `security definer`
ni `revoke`, donc appelable par `anon`) mais n'est pas appelée par le client : `get_state` suffit.

## 7. Realtime et rafraîchissement de l'état

`useGame(session)` est le seul point d'entrée de l'état (`GameState`, `src/types.ts`) :

```ts
supabase.channel(`game:${session.game_id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'games',   filter: `id=eq.${session.game_id}` }, () => void refresh())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${session.game_id}` }, () => void refresh())
  .subscribe()
const poll = setInterval(() => void refresh(), 5000)
```

- Le **contenu** des événements est ignoré : ils ne servent que de signal pour rappeler `get_state`,
  seule source de vérité (et seule à connaître la question courante, invisible dans `players`).
- `refresh` dédoublonne les appels concurrents avec une ref `pending` : une seule requête `get_state`
  en vol à la fois.
- Le **poll de 5 s** est un filet de sécurité si un événement WebSocket se perd (onglet en arrière-plan,
  reconnexion) ; il garantit aussi la clôture paresseuse (§ 8) même sans activité.
- Prérequis côté base (`0001_schema.sql`) : `alter publication supabase_realtime add table games,
  players` et `replica identity full` ; la lecture publique de ces deux tables (§ 4.2) est ce qui
  autorise le rôle `anon` à recevoir les événements.
- Le canal est retiré (`supabase.removeChannel`) et le poll arrêté au démontage de la page.

Coût : chaque réponse d'un joueur modifie sa ligne `players`, donc **tous** les clients de la partie
rappellent `get_state` (N clients × chaque action). À 10 joueurs cela reste léger (une requête RPC par
événement, réponse de quelques Ko).

## 8. Fin de partie et clôture paresseuse

`_finalize_game(p_game_id)` est **idempotente** (`where id = p_game_id and status = 'playing'`) :
elle calcule `max(score)`, compte les joueurs à ce score, pose `winner_player_id` seulement si ce
compte vaut 1, et passe la partie en `finished` avec `finished_at = now()`.

Il n'y a **pas de tâche planifiée** (pas de `pg_cron`) : personne ne « ferme » les parties en arrière-
plan. La clôture est déclenchée par les appels des clients eux-mêmes :

| Déclencheur | Où | Condition |
|---|---|---|
| Dernier joueur à finir sa file | `submit_answer` | `array_length(pl.queue, 1) = 1` et `bool_and(finished_at is not null)` sur la partie |
| Lecture de l'état après l'échéance | `get_state` | `status = 'playing' and now() >= ends_at` → finalise puis relit `games` |
| Action après l'échéance | `submit_answer`, `pass_question` | finalise puis lève `time_over` |
| Timer client à zéro | `end_game_if_expired(p_game_id)` (appelé par `Game.tsx`) | même condition que `get_state` |
| Demande de révision après l'échéance | `get_review` | même condition, puis `game_not_finished` si toujours pas finie |

Conséquences pratiques : une partie dont tous les onglets sont fermés reste `playing` en base jusqu'à
ce que quelqu'un revienne (le poll de 5 s de n'importe quel joueur suffit) ; `end_game_if_expired`
prend un `game_id` et non un token, mais ne peut rien faire d'autre que constater une échéance déjà
passée.

En solo, `winner_player_id` vaut trivialement mon id : `Results.tsx` dérive un mode
`raceModeOf(players.length)` (`src/lib/race.ts`) et traite le solo à part (verdict sur la précision,
pas de « Victoire ! »).

## 9. Sessions, reprise et navigation

Une session = `{ game_id, code, player_id, token }`, écrite dans `localStorage` sous la clé
`boring-geo:session` (`src/lib/session.ts` : `saveSession`, `loadSession`, `clearSession`). Autres clés
locales : `boring-geo:nickname` (pseudo pré-rempli), `boring-geo:muted` (`src/lib/sound.ts`), et en
`sessionStorage` `boring-geo:streak:<code>` (série visuelle, `src/lib/streak.ts`).

- **Une seule session par origine** : la clé est unique. Pour tester à plusieurs sur une même machine,
  lancer un second serveur Vite sur un autre port (`.claude/launch.json` définit `dev` sur 5173 et
  `dev2` sur 5174) — origine différente = `localStorage` séparé.
- **Reprise** : `Home.tsx` affiche une carte « Tu as une partie en cours » avec « Reprendre » si
  `loadSession()` renvoie quelque chose. Recharger `/game/<code>` fonctionne : `get_state` redonne la
  question courante, le score et `ends_at` ; les jalons déjà passés ne sont pas rejoués (`milestones`
  initialisé depuis `answered_count` / `remaining`).
- **Garde d'URL** : `useSession()` (`src/hooks/useSession.ts`) compare le `:code` de l'URL à la session
  stockée ; s'ils diffèrent (ou sans session), redirection vers `/`.
- **Session périmée** : si `get_state` lève `invalid_token` (partie ou joueur supprimé en base),
  `useGame` appelle `clearSession()` puis `window.location.assign(import.meta.env.BASE_URL)` : retour à
  l'accueil au lieu de boucler en erreur.
- **Quitter** (Lobby) et **Nouvelle partie** (Results) ne font que `clearSession()` + navigation : la
  ligne `players` reste en base (voir § 12).

## 10. Build, hébergement et configuration

| Élément | Valeur |
|---|---|
| Variables d'environnement (build Vite) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.example` → `.env.local`, ignoré par git) |
| Base path | `vite.config.ts` : `base: process.env.VITE_BASE ?? '/'` ; le routeur lit `import.meta.env.BASE_URL`. Aucun chemin d'asset absolu dans le code. |
| Vercel | `vercel.json` : `rewrites [{ source: "/(.*)", destination: "/index.html" }]` (SPA) ; variables à définir dans le projet Vercel |
| GitHub Pages (miroir) | `.github/workflows/pages.yml` sur push `main` : `npm ci`, `npm run build:pages` avec `VITE_BASE: /boring-law/` et les deux secrets Supabase, puis `actions/deploy-pages`. `build:pages` copie `dist/index.html` en `dist/404.html` (fallback SPA de Pages). |
| Scripts npm | `dev`, `build` (`tsc -b && vite build`), `build:pages`, `preview`, `lint` (oxlint) |
| Types | `tsconfig.app.json` : `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly` |
| Base de données | migrations SQL numérotées dans `supabase/migrations/` ; pas de `supabase/config.toml` ni de CLI : elles sont appliquées à la main (SQL editor / MCP Supabase), dans l'ordre |

Pourquoi un miroir : le commentaire en tête de `pages.yml` l'explique — le réseau de l'université
bloque `*.vercel.app`. Les deux déploiements pointent sur le **même** projet Supabase : une partie créée
sur l'un se rejoint depuis l'autre.

## 11. Banque de questions et seed

- Sources : `data/questions/geo.json` (406), `data/questions/histoire.json` (252) au format simple
  `{ subtype, prompt, choices, answer, iso? }` ; `data/courses/echr-anglais-s7.json` (250) au format
  cours `{ meta, topics, modes, questions: [{ id, topic, type, difficulty, question, choices, answer,
  explanation, source, flag?, disputed? }] }`.
- `scripts/lib/load-questions.mjs` normalise les deux formats en lignes
  `[subtype, prompt, choices, correct, iso, explanation, difficulty, flag, disputed, source, external_id, qtype]`,
  refuse les doublons et les questions sans 4 choix, et **mélange les choix de façon déterministe**
  (LCG à graine fixe `42`) pour ne pas biaiser la position de la bonne réponse.
- `node scripts/gen-seed-sql.mjs <theme>` produit `supabase/migrations/0003_seed_<theme>.sql`
  (`delete from questions where theme = ...` puis `insert ... from jsonb_array_elements(...)`). Les
  drapeaux deviennent `https://flagcdn.com/w320/<iso>.png` (dépendance externe).
- `SEED_SECRET=... node scripts/seed-remote.mjs <theme>` pousse les mêmes lignes via une RPC
  **temporaire** `admin_seed_questions` qui n'est pas dans les migrations : on la crée juste avant, on la
  supprime juste après (voir le commentaire en tête du script).
- Les modes sont des lignes de la table `modes` (`0005_courses_modes_review.sql`, `on conflict (id) do
  update`) ; `games.theme` stocke un id de mode. `_pick_questions` accepte aussi, par rétro-compatibilité,
  un `theme` ou `theme:subtype` inconnu de la table.

## 12. Limites connues et pistes

| Limite | Détail | Piste |
|---|---|---|
| Pas de départ propre d'un joueur | Aucune RPC `leave_game` : « Quitter » efface la session locale, la ligne `players` reste. En cours de partie, les autres attendent ce joueur **jusqu'au timer** (la fin « tous finis » exige `finished_at` pour chacun). | RPC `leave_game(p_token)` qui supprime le joueur (cascade sur `player_tokens` / `answers`) et rappelle `_finalize_game` si les autres ont fini. |
| Pas de reconnexion depuis un autre appareil | Le token ne vit que dans le `localStorage` d'une origine ; l'effacer = perdre sa place (aucun moyen de la reprendre). | Lien de reprise contenant le token, ou QR code. |
| Pas de `pg_cron` / nettoyage | Les parties ne sont jamais supprimées ; celles abandonnées restent `playing` tant que personne n'appelle `get_state`. | `pg_cron` (extension Supabase) : `_finalize_game` sur les parties expirées et purge des parties de plus de N jours. |
| `games` et `players` lisibles par tous | Nécessaire au Realtime, mais n'importe qui avec la clé anon peut lister toutes les parties (codes, scores, `question_ids`). Les tokens et le contenu des questions restent fermés. | Realtime « broadcast » alimenté par un trigger, ou policies plus fines ; sans enjeu tant que les données restent des scores de quiz. |
| `end_game_if_expired` sans token | Prend un `game_id` ; inoffensif (ne fait rien avant `ends_at`) mais appelable par quiconque connaît l'id. | Passer par le token comme les autres RPC. |
| Fan-out du rafraîchissement | Chaque action déclenche N appels `get_state` ; pas de payload exploité. | Utiliser le payload `postgres_changes` pour les scores et ne rappeler `get_state` que pour sa propre file. |
| Précision du timer | L'offset inclut la latence réseau ; un `setInterval` de 200 ms (ralenti par les navigateurs en arrière-plan). | Compenser avec la moitié du RTT mesuré ; `requestAnimationFrame`. |
| `update_settings` retire les questions à chaque réglage | Un simple changement de durée régénère `question_ids`. | Ne retirer qu'au changement de mode ou de nombre. |
| Pas de limitation de débit | Tout est ouvert avec la clé anon ; seuls les quotas Supabase s'appliquent. | Rate limiting par token en SQL, ou captcha à la création. |
| Deux sources pour le rang | `get_state` renvoie `rank` (compétition, `0007`), mais vaut `null` sur `opponent` (`_player_json(opp, null)`) ; le front recalcule le même rang avec `rankOf` (`src/lib/ranking.ts`) depuis le tableau `players` et n'utilise pas le champ serveur. | Retirer `rank` de la réponse ou l'utiliser partout : une seule source. |
| Vestiges | `ERRORS.need_two_players` dans `src/lib/api.ts` n'est plus levé depuis `0006_multiplayer.sql` ; le commentaire de `vite.config.ts` cite `/boring-geo/` alors que le workflow utilise `/boring-law/`. | Nettoyage. |
| Images externes | `image_url` pointe sur `flagcdn.com` : les questions « drapeaux » dépendent d'un tiers. | Embarquer des SVG (attention au poids et à la règle « aucun binaire »). |
