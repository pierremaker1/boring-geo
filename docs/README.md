# Documentation de Boring Law

> Index de la documentation. Commence ici, puis suis les liens selon ce que tu veux faire.

## Le projet en dix lignes

**Boring Law** est un jeu web d'**apprentissage gamifié** : une course de quiz contre la montre pour réviser un cours sans s'ennuyer. Une partie se joue de **1 à 10 joueurs** (solo, duel ou groupe), chacun sur son propre appareil, avec un code de salon à 5 lettres.

Les questions sont des QCM à 4 choix, regroupées par **cours** puis par **mode** (par exemple le cours « Anglais CEDH · S7 » propose les modes *Tout le programme*, *Annales*, *Procédure*, *Article par article*, *Théorie et principes*, *Vocabulaire*, *Pièges* ; le cours « Culture G » propose *Géographie*, *Drapeaux*, *Histoire*). Tous les joueurs reçoivent le même jeu de questions dans le même ordre et avancent chacun à leur rythme ; bonne réponse = +1, mauvaise = 0, « passer » renvoie la question en fin de file.

La partie s'arrête quand le **timer** global tombe à zéro ou quand **tous** les joueurs ont fini. Le meilleur score gagne (égalité possible) ; en solo, on juge la précision. En fin de partie, un écran de **révision** reprend chaque question avec la bonne réponse, l'explication, la source et, le cas échéant, un **flag** signalant un écart entre le cours et le droit positif.

Côté technique : un front **Vite 8 + React 19 + TypeScript + Tailwind v4** (design system « Globe Pop! »), et un backend **Supabase** où toute la logique de jeu vit dans des fonctions Postgres `security definer` (`supabase/migrations/`). L'interface est en français ; les questions du cours d'anglais juridique restent en anglais.

## Les documents

| Document | Ce que tu y trouves | Lis-le si… |
|---|---|---|
| [architecture.md](architecture.md) | Vue d'ensemble : front, Supabase (Postgres RPC + Realtime), flux d'une partie de la création à la révision, découpage des responsabilités client / serveur. | tu découvres le projet et veux comprendre « qui fait quoi » avant de toucher au code. |
| [game-rules.md](game-rules.md) | Les règles du jeu telles qu'elles sont codées en SQL : création et rejoint, démarrage, file de questions, score, passe, fin de partie, vainqueur, classement, modes solo / duel / groupe. | tu dois raisonner sur un cas limite (ex æquo, timer, joueur qui finit en premier) ou modifier une règle. |
| [database.md](database.md) | Le schéma (`questions`, `games`, `players`, `player_tokens`, `answers`, `modes`), les RPC publiques (`create_game`, `join_game`, `update_settings`, `start_game`, `get_state`, `submit_answer`, `pass_question`, `end_game_if_expired`, `get_review`), les helpers internes, la RLS, le Realtime et l'historique des migrations `0001` → `0007`. | tu touches au backend, écris une migration ou veux savoir ce que renvoie exactement `get_state`. |
| [frontend.md](frontend.md) | Le client React : routes (`/`, `/lobby/:code`, `/game/:code`, `/results/:code`), pages, hooks (`useGame`, `useSession`, `useTimer`, `useModes`, `useRaceEvents`, `useOpponentPulse`…), composants partagés, libs (`api.ts`, `session.ts`, `sound.ts`, `toast.ts`, `confetti.ts`, `ranking.ts`, `race.ts`), stockage local. | tu développes une page ou un composant, ou tu cherches d'où vient un comportement à l'écran. |
| [content.md](content.md) | Les banques de questions : formats `data/questions/<theme>.json` (culture G) et `data/courses/<theme>.json` (format riche : explication, difficulté, source, flag, disputed), le pipeline `scripts/lib/load-questions.mjs` → `scripts/gen-seed-sql.mjs` / `scripts/seed-remote.mjs`, la table `modes` et les libellés de sous-types (`src/lib/subtype.ts`). | tu veux ajouter un cours, un mode ou corriger une question. |
| [deployment.md](deployment.md) | Les deux cibles de prod : Vercel (`vercel.json`, base `/`) et le miroir GitHub Pages (`.github/workflows/pages.yml`, `VITE_BASE=/boring-law/`, `npm run build:pages`), les variables d'environnement et l'application des migrations sur le projet Supabase. | tu mets en ligne, ou « ça marche en local mais pas en prod ». |
| [development.md](development.md) | Installation, `.env.local`, scripts npm, test à plusieurs en local (deux serveurs Vite sur des ports différents), lint (`oxlint`), vérification TypeScript, conventions de code et de commit. | tu ouvres le dépôt pour la première fois. |
| [design-spec.md](design-spec.md) | La spec de design exécutable « Globe Pop! » (v1.1) : règles d'or, tokens `@theme`, motion, sons synthétisés, composants partagés, gamification client, page par page. C'est la référence pour tout ce qui se voit ou s'entend. | tu touches à l'UI, aux animations, aux sons ou aux couleurs. |
| [CHANGELOG.md](CHANGELOG.md) | L'historique des évolutions notables : quiz géo à 2 joueurs → modes Drapeaux / Histoire → refonte « Globe Pop! » → renommage Boring Law + cours + révision → 1 à 10 joueurs. | tu veux savoir pourquoi quelque chose existe, ou ce qui a changé récemment. |

Le [README.md](../README.md) à la racine du dépôt donne le résumé pour un visiteur pressé ; ce dossier `docs/` va dans le détail.

## Par où commencer

### Je veux jouer

1. Ouvre l'application déployée (voir [deployment.md](deployment.md) pour les URL ; depuis le réseau universitaire, utilise le miroir GitHub Pages, les sous-domaines `*.vercel.app` n'y sont pas résolus).
2. Entre un pseudo (1 à 20 caractères), clique **Créer une partie**. Tu arrives dans le **salon** avec un code à 5 lettres.
3. Choisis le cours et le mode, le nombre de questions (10 / 20 / 30 / 50) et la durée (1 / 2 / 3 / 5 min). Seul l'hôte règle la partie.
4. Partage le code (jusqu'à 10 joueurs) ou lance seul avec **Jouer en solo**.
5. En jeu : touches **1** à **4** pour répondre, **Espace** ou **P** pour passer. Le HUD montre ton score, le timer et le joueur le mieux classé parmi les autres.
6. À la fin, lis l'écran **Revoir les questions** : filtre *Fautes*, *Sans réponse*, *⚠️ À surveiller*.

Les règles complètes sont dans [game-rules.md](game-rules.md).

### Je veux ajouter un cours (ou un mode)

Lis [content.md](content.md) en entier, puis :

1. Écris la banque de questions dans `data/courses/<theme>.json` (format riche recommandé) ou `data/questions/<theme>.json` (format simple). Chaque question a exactement 4 choix et un index `answer` entre 0 et 3 ; les doublons de prompt sont rejetés par `scripts/lib/load-questions.mjs`.
2. Génère le seed SQL et/ou pousse directement en base :

   ```bash
   node scripts/gen-seed-sql.mjs <theme>          # écrit supabase/migrations/0003_seed_<theme>.sql
   SEED_SECRET=... node scripts/seed-remote.mjs <theme>   # via la RPC temporaire admin_seed_questions
   ```

   Les 4 choix sont mélangés de façon déterministe (graine fixe), le seed est donc reproductible.
3. Déclare les modes dans la table `modes` (colonnes `id, course, theme, label, description, emoji, subtypes, sort`) : `subtypes = null` pour tout le thème, sinon un tableau de sous-types. Voir les `insert` de `supabase/migrations/0005_courses_modes_review.sql` pour le modèle.
4. Ajoute les libellés français des nouveaux sous-types dans `src/lib/subtype.ts` (sinon le sous-type s'affiche brut, en majuscules).
5. Facultatif : change le mode proposé par défaut, `DEFAULT_MODE` dans `src/types.ts`.

Le client lit les modes via `useModes()` (`src/hooks/useModes.ts`) et les groupe par cours : aucun code front à modifier pour un nouveau mode.

### Je veux développer

1. [development.md](development.md) : installation, `.env.local`, scripts, test à deux en local.

   ```bash
   npm install
   cp .env.example .env.local     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   npm run dev                    # http://localhost:5173
   npm run dev -- --port 5174     # second joueur (origine différente = localStorage séparé)
   ```

2. [architecture.md](architecture.md) puis [frontend.md](frontend.md) pour t'orienter dans `src/`.
3. [design-spec.md](design-spec.md) avant toute modification visible : elle liste les fichiers qu'on ne modifie pas (`src/lib/api.ts`, `src/lib/session.ts`, `src/lib/supabase.ts`, `src/hooks/useGame.ts`, `src/hooks/useSession.ts`, `src/hooks/useTimer.ts`, `src/App.tsx`, `src/main.tsx`, `src/types.ts`) et les contraintes de contraste, de motion et de responsive (375 px → desktop).
4. Avant de livrer :

   ```bash
   npx tsc --noEmit -p tsconfig.app.json   # noUnusedLocals / noUnusedParameters actifs
   npm run lint                            # oxlint
   npm run build                           # tsc -b && vite build
   ```

Pour toucher au moteur de jeu (SQL), passe par [database.md](database.md) et [game-rules.md](game-rules.md) : le score, le classement et la fin de partie sont calculés par le serveur, jamais par le client.

### Je veux déployer

[deployment.md](deployment.md) couvre les deux cibles :

| Cible | Déclencheur | Base path | Fichiers concernés |
|---|---|---|---|
| Vercel | push sur `main` (projet connecté au dépôt GitHub) | `/` | `vercel.json` (rewrite SPA vers `/index.html`) |
| GitHub Pages (miroir) | push sur `main` ou `workflow_dispatch` | `/boring-law/` | `.github/workflows/pages.yml`, script `build:pages` (copie `dist/index.html` en `dist/404.html`) |

Les deux lisent `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (variables Vercel / secrets GitHub). Les migrations Supabase (`supabase/migrations/`) s'appliquent à part, sur le projet Supabase.

## Carte du dépôt

```text
boring-geo/                     (nom du dossier local historique ; le produit s'appelle Boring Law)
├── data/
│   ├── courses/                banques « riches » (echr-anglais-s7.json + .md de présentation)
│   └── questions/              banques simples (geo.json, histoire.json)
├── docs/                       cette documentation
├── scripts/
│   ├── gen-seed-sql.mjs        JSON → supabase/migrations/0003_seed_<theme>.sql
│   ├── seed-remote.mjs         JSON → base distante (RPC temporaire admin_seed_questions)
│   └── lib/load-questions.mjs  chargement + normalisation + mélange déterministe des choix
├── src/
│   ├── App.tsx                 routes (BrowserRouter, basename = import.meta.env.BASE_URL)
│   ├── types.ts                GameState, PlayerInfo, Mode, ReviewItem, MAX_PLAYERS, DEFAULT_MODE
│   ├── index.css               tokens @theme Tailwind v4 (pas de tailwind.config)
│   ├── pages/                  Home, Lobby, Game, Results
│   ├── components/             ui.tsx (Page, Card, Button, Chip…), Hud, Leaderboard, Podium, ReviewList…
│   ├── hooks/                  useGame, useSession, useTimer, useModes, useRaceEvents…
│   └── lib/                    api, session, supabase, sound, toast, confetti, ranking, race, subtype…
├── supabase/migrations/        0001_schema → 0007_rank_by_score (+ seeds 0003_seed_*)
├── .github/workflows/pages.yml miroir GitHub Pages
├── vercel.json                 rewrite SPA
└── vite.config.ts              base = process.env.VITE_BASE ?? '/'
```

## Glossaire

Les termes ci-dessous sont ceux du code et de la base ; quand un mot d'interface diffère, il est indiqué.

| Terme | Définition | Où le voir |
|---|---|---|
| **Partie** (*game*) | Une course de quiz : un code, un mode, un nombre de questions, une durée, un statut `lobby` → `playing` → `finished`, un hôte, un éventuel vainqueur. Une ligne de la table `games`. | `games`, `GameInfo` (`src/types.ts`) |
| **Code** | Identifiant public de la partie : 5 lettres tirées d'un alphabet sans caractères ambigus (`ABCDEFGHJKLMNPQRSTUVWXYZ`). C'est ce que les joueurs saisissent pour rejoindre. | `_gen_code()` (`0002_functions.sql`), `CodeTiles` |
| **Salon** (*lobby*) | L'écran d'attente avant le départ : code, liste des joueurs, réglages. L'hôte y choisit cours, mode, questions, durée et lance la course. | `src/pages/Lobby.tsx`, route `/lobby/:code` |
| **Hôte** | Le joueur qui a créé la partie (`games.host_player_id`). Seul lui peut appeler `update_settings` et `start_game` ; il peut démarrer seul. | `create_game`, erreur `not_host` |
| **Joueur** (*player*) | Un participant à une partie : pseudo (1 à 20 caractères), score, file de questions, nombre de réponses, date de fin. Une ligne de la table `players`. | `players`, `PlayerInfo` |
| **Token** | Secret UUID remis au joueur à la création ou au rejoint (`player_tokens.token`), jamais lisible autrement. Chaque RPC de jeu prend `p_token` et retrouve le joueur via `_player_from_token`. | `player_tokens`, `Session.token` |
| **Session** | Le quadruplet `{ game_id, code, player_id, token }` conservé dans `localStorage` sous la clé `boring-geo:session`. Elle permet de reprendre une partie après rechargement ; `invalid_token` la purge et renvoie à l'accueil. | `src/lib/session.ts`, `useSession()` |
| **Thème** (*theme*) | Une banque de questions : la valeur de `questions.theme` (`echr-anglais-s7`, `geo`, `histoire`). Un thème correspond à un fichier JSON dans `data/`. | `questions.theme`, `scripts/gen-seed-sql.mjs` |
| **Sous-type** (*subtype*) | La catégorie fine d'une question dans son thème (`capitale`, `drapeau`, `article-6`, `annales`…). Dans les banques de cours, c'est le champ `topic`. Affiché en français par `subtypeLabel()`. | `questions.subtype`, `src/lib/subtype.ts` |
| **Cours** (*course*) | Le groupe affiché dans le sélecteur de modes (« Anglais CEDH · S7 », « Culture G »). Ce n'est pas une table : c'est la colonne `modes.course`, qui sert à regrouper. | `modes.course`, `groupByCourse()` |
| **Mode** | Ce que l'hôte choisit : un thème entier (`geo`) ou un sous-ensemble de sous-types d'un thème (`echr:procedure`, `geo:drapeau`). Une ligne de la table `modes` ; son `id` est stocké dans `games.theme` (nom de colonne conservé pour compatibilité). `_pick_questions` tire les questions selon le mode. | `modes`, `Mode` (`src/types.ts`), `ModePicker` |
| **Mode de course** (*race mode*) | Côté client uniquement : `solo` (1 joueur), `duel` (2), `group` (3 à 10), dérivé du nombre de joueurs. Il change le HUD, les annonces et l'écran de résultats. | `raceModeOf()` (`src/lib/race.ts`) |
| **File** (*queue*) | Pour chaque joueur, le tableau des positions de questions restantes (`players.queue`). Répondre dépile la tête ; passer la renvoie en fin de file (si plus d'une question reste). | `start_game`, `submit_answer`, `pass_question` |
| **Question courante** | La question en tête de file du joueur, renvoyée par `get_state` sans la bonne réponse. Répondre à une autre question lève `stale_question`. | `_current_question`, `GameState.question` |
| **Score** | Nombre de bonnes réponses (+1 par bonne réponse, 0 sinon). Calculé et stocké par le serveur (`players.score`) ; le client ne fait que l'afficher. | `submit_answer` |
| **Précision** | Bonnes réponses / questions répondues, en pourcentage ; `null` tant qu'on n'a pas répondu. C'est le critère du verdict solo. | `precisionOf()` (`src/lib/ranking.ts`) |
| **Timer** | Durée globale de la partie (`games.duration_seconds`, 30 à 600 s, 120 par défaut). `ends_at` est fixé au départ ; le client corrige son horloge avec `server_now`. | `useTimer()`, `end_game_if_expired` |
| **Fin de partie** | Passage à `finished` par `_finalize_game` : au timer (clôture paresseuse dans `get_state`, ou explicite via `end_game_if_expired`) ou quand tous les joueurs ont vidé leur file. | `0004_modes_and_end_rule.sql` |
| **Vainqueur** | `games.winner_player_id` = le joueur au meilleur score s'il est unique, `null` en cas d'ex æquo. En solo il vaut trivialement le joueur : l'UI traite le solo à part. | `_finalize_game`, `summarize()` (`Results.tsx`) |
| **Rang** | Rang « compétition » sur le seul score (1, 1, 3…). Le serveur renvoie `rank` dans `get_state` et ordonne `players` par score desc, réponses desc, arrivée ; le client recalcule le même rang avec `rankOf()`. | `0007_rank_by_score.sql`, `src/lib/ranking.ts` |
| **Adversaire** (*opponent*) | Dans `get_state`, le mieux classé des *autres* joueurs (`null` en solo). Conservé pour l'affichage du duel et le marqueur ✓/✗ en groupe. | `GameState.opponent`, `useOpponentPulse()` |
| **Série** (*streak*) | Suite de bonnes réponses consécutives, purement visuelle (flamme, sons, toasts à 3 / 5 / 10). Persistée en `sessionStorage` (`boring-geo:streak:<code>`), jamais envoyée au serveur. | `src/lib/streak.ts`, `StreakBadge` |
| **Révision** (*review*) | L'écran de fin qui reprend toutes les questions de la partie avec la réponse du joueur, la bonne réponse, l'explication et la source. Servi par `get_review`, uniquement une fois la partie `finished`. | `get_review`, `ReviewItem`, `ReviewList` |
| **Explication** | Texte pédagogique attaché à une question (`questions.explanation`), affiché en révision sous « 💡 Pourquoi ». Présent dans les banques de cours, absent des banques simples. | `data/courses/*.json` |
| **Flag** | Avertissement attaché à une question (`questions.flag`) : le cours et le droit positif divergent ; la bonne réponse reste celle du cours. Affiché en révision (« ⚠️ Attention : le cours ≠ le droit positif ») et filtrable via *À surveiller*. | `isFlagged()` (`ReviewList.tsx`) |
| **Disputed** | Variante du flag (`questions.disputed`) : le corrigé est discutable et à confirmer en cours. Même filtre *À surveiller*. | `ReviewList.tsx` |
| **Difficulté** | Entier 1 à 3 sur les questions de cours (`questions.difficulty`), affiché en étoiles dans la révision. | `0005_courses_modes_review.sql` |
| **Seed** | Le chargement d'une banque de questions en base : soit un fichier SQL `0003_seed_<theme>.sql`, soit un envoi direct par `scripts/seed-remote.mjs`. Un seed remplace toutes les questions du thème. | `scripts/` |
| **RPC** | Les fonctions Postgres `security definer` appelées par le client via `supabase.rpc()`. Les helpers préfixés `_` ne sont pas exposés (`revoke execute`). Les erreurs SQL (`game_full`, `time_over`…) sont traduites par `ApiError` dans `src/lib/api.ts`. | `supabase/migrations/0002_functions.sql` et suivantes |
| **Realtime** | L'abonnement Supabase aux changements des tables `games` et `players` de la partie (canal `game:<game_id>`) qui déclenche un `get_state`, complété par un poll toutes les 5 s. | `useGame()` (`src/hooks/useGame.ts`) |
| **Globe Pop!** | Le nom du design system : cartoon-arcade clair, boutons 3D (`.btn-3d`), keycaps colorées, mascotte ⚖️, sons synthétisés, confettis. | [design-spec.md](design-spec.md) |
| **Base path** | Le préfixe d'URL de l'application : `/` sur Vercel, `/boring-law/` sur GitHub Pages (`VITE_BASE`). D'où l'interdiction des chemins d'assets absolus et le `basename` du routeur. | `vite.config.ts`, `src/App.tsx` |

## Conventions de cette documentation

- Français, sauf les identifiants de code (noms de fichiers, fonctions, colonnes) cités tels quels.
- Chaque affirmation renvoie au fichier qui la porte ; en cas de doute, le code et les migrations font foi.
- Les liens entre documents sont relatifs (`[database.md](database.md)`).
- Un changement de comportement se documente au même endroit que le code (spec de design pour l'UI, `database.md` / `game-rules.md` pour le moteur) et se résume dans [CHANGELOG.md](CHANGELOG.md).
