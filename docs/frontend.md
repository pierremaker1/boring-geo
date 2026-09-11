# Frontend — Boring Law

Application Vite 8 + React 19 + TypeScript + Tailwind v4, en français, qui affiche une course de quiz de 1 à 10 joueurs
dont **toute la logique vit côté Supabase** (RPC `security definer`, voir [architecture](architecture.md)). Le front ne
calcule jamais un score : il appelle des RPC, affiche l'état renvoyé par `get_state` et l'habille avec le design system
« Globe Pop! » (spécification complète : [design-spec.md](design-spec.md)).

Point d'entrée : `index.html` → `src/main.tsx` (`createRoot` + `StrictMode`, import de `src/index.css`) → `src/App.tsx`.

Voir aussi : [architecture](architecture.md) (vue d'ensemble), [database](database.md) (schéma et RPC),
[game-rules](game-rules.md) (règles du jeu), [development](development.md) (installation, déploiement),
[content](content.md) (cours, modes et questions), [design-spec](design-spec.md) (design system exécutable).

| Commande | Rôle |
|---|---|
| `npm run dev` | Vite en local (`.claude/launch.json` définit `dev` sur 5173 et `dev2` sur 5174 pour tester à deux : origine différente = `localStorage` séparé) |
| `npm run build` | `tsc -b && vite build` |
| `npm run build:pages` | build + copie `dist/index.html` → `dist/404.html` (fallback SPA GitHub Pages) |
| `npm run lint` | oxlint (`.oxlintrc.json` : `react/rules-of-hooks` en erreur) |
| `npx tsc --noEmit -p tsconfig.app.json` | vérification stricte à faire passer avant tout commit |

## 1. Arborescence commentée de `src/`

```text
src/
├── main.tsx                 # createRoot + StrictMode, importe index.css
├── App.tsx                  # BrowserRouter (basename = BASE_URL) + 4 routes
├── index.css                # @import "tailwindcss" + tokens @theme + @layer components + reduced-motion
├── types.ts                 # GameInfo, PlayerInfo, Question, GameState, Session, Mode, ReviewItem, MAX_PLAYERS, DEFAULT_MODE
├── pages/                   # une page = une route
│   ├── Home.tsx             # pseudo, créer / rejoindre, reprise d'une partie en cours
│   ├── Lobby.tsx            # salon : code, joueurs, réglages (hôte), démarrage
│   ├── Game.tsx             # course : HUD, question, réponses, clavier, jalons
│   └── Results.tsx          # verdict, podium / bilan, révision, nouvelle partie
├── components/
│   ├── ui.tsx               # Page, Card, Button, Input, ErrorMsg, Chip, Keycap, Divider, Dots, Skeleton
│   ├── Hud.tsx              # HUD sticky du Game (moi | TimerRing | adversaire, barres, RaceStatus, overlay classement)
│   ├── PlayerBar.tsx        # ScoreBump, LeadTag, SegmentBar, PlayerBar
│   ├── PlayerCard.tsx       # carte joueur du Lobby (remplie / vide)
│   ├── PlayerGrid.tsx       # grille des joueurs du Lobby (arène ≤ 2, pastilles denses ≥ 3, case « Invite »)
│   ├── Leaderboard.tsx      # classement compact (groupe) + ROOMY_QUERY
│   ├── Podium.tsx           # Podium (3 marches) + RankList (suite du classement) — Results groupe
│   ├── RaceStatus.tsx       # chip de course (solo / duel / groupe)
│   ├── TimerRing.tsx        # anneau SVG + chiffres, tick sonore ≤ 10 s
│   ├── AnswerButton.tsx     # bouton réponse 3D avec Keycap, états idle/correct/wrong/reveal/dim
│   ├── FlagFrame.tsx        # cadre image à hauteur fixe (skeleton, erreur)
│   ├── StreakBadge.tsx      # flamme de série (paliers 2 / 5 / 10)
│   ├── Toast.tsx            # ToastHost (affiche le toast courant de lib/toast.ts)
│   ├── PopText.tsx          # usePopText + PopLayer (« +1 » flottants, portail body)
│   ├── Mascot.tsx           # ⚖️ dans une bulle 3D, humeurs
│   ├── Avatar.tsx           # cercle 3D + emoji déterministe du pseudo, couronne
│   ├── CodeTiles.tsx        # code de partie en 5 tuiles cliquables (copie)
│   ├── ModePicker.tsx       # sélecteur de mode groupé par cours (+ modeTitle, findMode)
│   ├── ReviewList.tsx       # révision post-partie (+ reviewStatus, isFlagged, ReviewFilter)
│   ├── ScoreCompare.tsx     # barre de duel bleu / violet (Results)
│   ├── Stars.tsx            # 3 étoiles de précision
│   ├── AnimatedNumber.tsx   # count-up (useCountUp) avec tick sonore
│   ├── MuteToggle.tsx       # 🔊 / 🔇 persistant
│   └── Blobs.tsx            # taches floues en fond (jamais sur Game, jamais en reduced motion)
├── hooks/
│   ├── useSession.ts        # session localStorage ↔ :code de l'URL, sinon retour à /
│   ├── useGame.ts           # get_state + Realtime + poll 5 s + clockOffset
│   ├── useTimer.ts          # secondes restantes (tick 200 ms) + formatTime
│   ├── useModes.ts          # table `modes`, cache module + groupByCourse
│   ├── useRaceEvents.ts     # annonces « En tête ! / Remontée ! / … » (duel et groupe)
│   ├── useOpponentPulse.ts  # marqueur ✓ / ✗ sur la barre adverse
│   ├── usePrevious.ts       # valeur du rendu précédent
│   ├── useCountUp.ts        # interpolation rAF easeOutCubic
│   ├── useMediaQuery.ts     # matchMedia réactif (requête libre)
│   ├── useMinWidth.ts       # matchMedia réactif (min-width)
│   └── useReducedMotion.ts  # ré-export de motion/react
└── lib/
    ├── supabase.ts          # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
    ├── api.ts               # wrappers RPC typés + ApiError (messages FR)
    ├── session.ts           # localStorage : session + pseudo
    ├── sound.ts             # sons Web Audio synthétisés, mute persistant, useMuted
    ├── toast.ts             # file de toasts module-level, showToast / useToast
    ├── confetti.ts          # celebrate('mini' | 'burst' | 'cannon')
    ├── streak.ts            # série client (sessionStorage par partie)
    ├── avatar.ts            # avatarFor(pseudo)
    ├── subtype.ts           # subtypeLabel : libellé FR des sous-types de question
    ├── race.ts              # RaceMode, raceModeOf, ordinalFr, rankLabel
    ├── ranking.ts           # rankOf, sharedRank, scoreless, precisionOf, ordinal
    └── spring.ts            # SPRING commun de motion/react
```

`public/` contient `favicon.svg` et `icons.svg`, non référencés par le code (le favicon est une data URI dans `index.html`).

## 2. Routing

`src/App.tsx` monte un `BrowserRouter` avec `basename={import.meta.env.BASE_URL}` : `/` sur Vercel, `/boring-law/` sur le
miroir GitHub Pages (`VITE_BASE` dans `vite.config.ts` et `.github/workflows/pages.yml`). Tout lien interne passe donc par
`navigate('/…')` ou des chemins relatifs, jamais par un chemin absolu écrit en dur.

| Route | Page | Garde |
|---|---|---|
| `/` | `Home` | — |
| `/lobby/:code` | `Lobby` | `useSession()` : session locale dont `code` = paramètre, sinon `navigate('/')` |
| `/game/:code` | `Game` | idem |
| `/results/:code` | `Results` | idem |
| `*` | `<Navigate to="/" replace />` | — |

Le rafraîchissement direct d'une URL profonde fonctionne grâce à `vercel.json` (`rewrites` → `/index.html`) et, sur
GitHub Pages, à la copie `404.html` faite par `build:pages`.

Les **transitions entre pages sont pilotées par `game.status`** (`'lobby' | 'playing' | 'finished'`), dans un
`useEffect` de chaque page, avec `replace: true` :

| Page | `status` observé → redirection |
|---|---|
| Lobby | `playing` → `/game/:code` ; `finished` → `/results/:code` |
| Game | `finished` → `/results/:code` ; `lobby` → `/lobby/:code` |
| Results | `playing` → `/game/:code` ; `lobby` → `/lobby/:code` |

## 3. Flux d'état

```text
localStorage « boring-geo:session »  ──useSession()──▶  Session { game_id, code, player_id, token }
                                                              │
                                                     useGame(session)
                                                              │  api.getState(token)  (RPC get_state)
                                                              ▼
                       GameState { game, me, opponent, players, question, server_now }
                              ▲               ▲                ▲
              Realtime games/players      poll 5 s        refresh() après chaque action
```

### 3.1 `useSession()` (`src/hooks/useSession.ts`)

Lit `loadSession()` et ne la garde que si `session.code === useParams().code` ; sinon `navigate('/', { replace: true })`
et renvoie `null`. Les pages font `if (!session) return null` avant tout rendu.

### 3.2 `useGame(session)` (`src/hooks/useGame.ts`)

Renvoie `{ state, setState, error, refresh, clockOffset }`.

- `refresh()` appelle `api.getState(session.token)` ; un seul appel en vol à la fois (`pending` ref : les appels
  concurrents reçoivent la même promesse). À chaque réponse : `clockOffset = server_now − Date.now()` (ms).
- **Realtime** : canal `game:<game_id>` abonné aux `postgres_changes` (`event: '*'`) sur `public.games`
  (`id=eq.<game_id>`) et `public.players` (`game_id=eq.<game_id>`) → `refresh()`.
- **Poll** de sécurité toutes les 5 s (`setInterval`), au cas où un événement Realtime se perd.
- `ApiError` `invalid_token` (partie supprimée) → `clearSession()` puis `window.location.assign(BASE_URL)`.

### 3.3 `GameState` (`src/types.ts`)

| Champ | Contenu |
|---|---|
| `game` | `GameInfo` : `id, code, status, theme, question_count, duration_seconds, max_players, player_count, host_player_id, winner_player_id, started_at, ends_at, finished_at` |
| `me` | `PlayerInfo` : `id, nickname, score, answered_count, remaining, finished_at, rank` |
| `players` | tous les joueurs (moi compris) triés par le serveur : score desc, `answered_count` desc, arrivée |
| `opponent` | le mieux classé des **autres** joueurs, `null` en solo (`rank` y vaut `null`) |
| `question` | question courante (`id, subtype, prompt, choices, image_url`) ou `null` |
| `server_now` | horloge serveur, base du `clockOffset` |

Le **mode de course** est dérivé côté client par `raceModeOf(playerCount)` (`src/lib/race.ts`) : `'solo'` (1),
`'duel'` (2), `'group'` (3 à 10). Game utilise `Math.max(1, game.player_count, players.length)` ; Results,
`players.length`. Les rangs affichés viennent toujours de `rankOf` (`src/lib/ranking.ts`, rang « compétition » sur le
seul score : 1, 1, 3…) : aucun composant ne lit le champ `rank` serveur, seul l'**ordre** du tableau `players` est utilisé.

### 3.4 `useTimer(endsAt, clockOffset)` (`src/hooks/useTimer.ts`)

Renvoie les secondes restantes (flottant, ≥ 0) calculées **à chaque rendu** à partir de `ends_at` et de `clockOffset` ;
un `setInterval` de 200 ms force le re-rendu. `formatTime(s)` → `m:ss`. Quand `remaining` atteint 0 en `playing`, Game
appelle une seule fois `api.endGameIfExpired(game.id)` (ref `expiredCalled`) puis `refresh()`.

### 3.5 `useModes()` (`src/hooks/useModes.ts`)

Charge la table `modes` via `api.listModes()` une seule fois par session (cache **module-level**), renvoie
`{ modes, loading, error, courses }` où `courses = groupByCourse(modes)` (`{ course, modes[] }[]`, ordre d'apparition).
Il n'y a pas de réessai intégré : Lobby remonte le composant `ModesScope` (changement de `key`) pour relancer le chargement.

## 4. Pages

### 4.1 Home (`src/pages/Home.tsx`)

Rôle : saisir le pseudo, créer une partie ou en rejoindre une par code, reprendre une partie en cours.

- Hooks : `useNavigate`, `useState` ; libs `loadNickname` / `saveNickname` / `loadSession` / `saveSession`, `avatarFor`.
- Créer : `api.createGame(nick, 20, 120, DEFAULT_MODE)` (20 questions, 120 s, `DEFAULT_MODE = 'echr:full'`) puis
  `saveSession` et `navigate('/lobby/<code>')`. Entrée dans le champ pseudo soumet le formulaire de création.
- Rejoindre : `api.joinGame(code, nick)`, bouton actif seulement si pseudo non vide et code de 5 caractères
  (`joinDisabled`), halo `animate-pulse-glow pulse-glow-blue` quand prêt.
- États : `busy` (bouton `loading`), `error` (`ErrorMsg`), **partie en cours** (`loadSession()` non nul → carte jaune
  « Tu as une partie en cours » avec « Reprendre → »).
- Responsive : mode « compact » sous 700 px de haut (héros en ligne, mascotte 64, stickers et pas-à-pas masqués) pour
  tenir sans scroll en 375 × 667 ; pas-à-pas en 3 étapes uniquement ≥ 640 px et > 700 px de haut ; rappel des raccourcis
  clavier en `hint-only` (pointeur fin seulement).

### 4.2 Lobby (`src/pages/Lobby.tsx`)

Rôle : partager le code, voir arriver les joueurs, régler la partie (hôte), la lancer.

- Hooks : `useSession`, `useGame`, `useModes` (dans `ModesScope`, remonté par `key` pour « Réessayer »),
  `usePrevious(rosterIds)`.
- Actions (toutes via `act()` : `busy` + `actionError` + `refresh()` après) : `api.updateSettings(token, count, duration,
  theme)` sur chaque chip (`COUNTS = [10, 20, 30, 50]`, `DURATIONS = [60, 120, 180, 300]`, `ModePicker`),
  `api.startGame(token)`. `copyCode` (`navigator.clipboard`) → `sfx.copy()`, `celebrate('mini')` depuis les tuiles,
  sinon message « Copie impossible ». `leave` → `clearSession()` + `/`.
- `wantedCount` : choix local de l'hôte, renvoyé tel quel au serveur (qui plafonne `question_count` au nombre réel de
  questions du mode) ; chip « N (max) » quand la valeur serveur n'est pas dans la grille, message « Ce mode ne contient que
  N questions… » quand plafonné.
- Arrivées : comparaison des ids de `state.players` entre deux rendus → un toast « 🎉 {pseudo} a rejoint ! » par nouveau
  venu (clé `join:<id>`) et un seul `sfx.join()`. Jamais au premier chargement.

| Cas | Affichage |
|---|---|
| Chargement (`!state`) | carte code + `Loading` (deux `Skeleton` 176 px + un de 160 px + « Chargement… ») |
| 1 joueur (hôte) | `PlayerGrid` en arène (ma carte + case « Invite tes potes »), bouton **« Jouer en solo 🏃 »**, hint « Partage le code : jusqu'à 10 joueurs. Tu peux aussi partir seul. » |
| 2 joueurs | arène avec badge **VS**, bouton **« Lancer la course 🏁 »** en `animate-pulse-glow`, compteur `2/10` vert |
| 3 à 10 joueurs | titre « 🏁 Course à N », pastilles denses (`PlayerGrid`), **action placée avant les réglages** ; « Salon complet (10/10)… » quand plein |
| Invité (non hôte) | chips désactivées, badge « définis par l'hôte 👑 », carte jaune « L'hôte lance la partie dans un instant… (N joueurs) » |
| Erreur | `ErrorMsg` avec `actionError ?? error` |

### 4.3 Game (`src/pages/Game.tsx`)

Rôle : répondre vite. Le score reste serveur ; le client ne gère que le retour visuel et sonore.

- Hooks : `useSession`, `useGame`, `useTimer`, `useMediaQuery(ROOMY_QUERY)`, `useOpponentPulse(state.opponent)`,
  `useRaceEvents(me, opponent, players, playing, mode)`, `usePopText`, `useId` (overlay classement).
- Réponse (`answer`) : `api.submitAnswer(token, question.id, choice)` → `feedback` gelé **650 ms** (`FEEDBACK_MS`)
  pendant lequel `answerState()` colore les 4 boutons (`correct` / `wrong` / `reveal` / `dim`), puis `refresh()`. Série
  client (`streakRef`, `saveStreak`) : `sfx.correct(streak)`, `+1` flottant (`spawn`), `celebrate('mini')` dès 3,
  toasts aux paliers 3 / 5 / 10, `sfx.wrong` + `streakLost` + toast « Série perdue (×N) » sinon.
- `ApiError` `stale_question` / `time_over` / `game_not_playing` → `refresh()` silencieux ; autre erreur → `ErrorMsg`.
- Passer (`pass`) : `api.passQuestion(token)` si `remaining > 1`, animation `slide-back` de la carte sortante
  (`exitId` capturé avant l'appel), `sfx.pass()`.
- Clavier : `1`–`4` (`e.key`, `Digit1-4` ou `Numpad1-4` : compatible AZERTY), Espace ou `P` pour passer (pas Espace
  quand un élément interactif a le focus), `e.repeat` ignoré. `locked = busy || feedback || remaining <= 0`.
- Timer dramatique : toasts « ⏱ Plus que 30 s ! » (+ `sfx.warn`), « ⏰ 10 secondes ! », « ⏰ Temps écoulé ! »
  (+ `sfx.timeUp`, vibration 200 ms), une fois chacun (refs). Classe `urgent` sur la `Page` sous 10 s (halo).
- Jalons : « 🚀 GO ! » (`sfx.go`), « ⚡ Mi-parcours ! », « 🏁 Dernière question ! », `sfx.finished` +
  `celebrate('burst')` quand `remaining === 0`. Une reprise en cours de partie ne rejoue pas les jalons dépassés.
- `clearToasts()` au démontage.

| Cas | Affichage |
|---|---|
| Chargement (`!state`) | `Page` sans blobs ni toasts, `Mascot think`, 3 `Skeleton` |
| Solo | HUD à 2 colonnes (ma carte + anneau), chip `RaceStatus` « 3/10 · 100 % », aucun son adverse |
| Duel | HUD « moi \| timer \| adversaire », barres segmentées face à face, marqueur ✓/✗ (`useOpponentPulse`), chip « Tu mènes +N » / « −N derrière » / « Égalité », toasts `useRaceEvents` |
| Groupe | à droite du HUD le mieux classé des autres avec sa médaille, chip = mon rang compétition (« 🥈 2e ex æquo sur 7 ») ; `Leaderboard` **inline repliable** sous le HUD si `ROOMY_QUERY` (≥ 640 × 760), sinon **overlay** ouvert depuis la chip (fermé au clic hors HUD, à Échap, ou à la question suivante) |
| Adversaire absent en duel/groupe | colonne « 💤 Adversaire déconnecté », chip repliée sur l'avancement solo |
| Temps écoulé (`timeUp`) | carte question à `opacity-50`, réponses verrouillées, en attente du `finished` |
| `meDone` (« Terminé ! ») | carte avec `Mascot party` ; solo : « Résultats dans un instant… » ; duel : `PlayerBar` de l'adversaire (lg) + « {pseudo} : n/total… » ; groupe : `Leaderboard` déplié (5 lignes max : top 4 + « … » + ma ligne si je suis au-delà) + « k/N joueurs ont fini… » |
| Pas de question (`!shown`) | `Skeleton` 256 px + « Chargement de la question… » |

Structure de la page : `Page width="lg" decorated={false} toastHost={false} muteToggle={false}` ; le `Hud` sticky loge
l'**EventStrip** (44 px fixes : `StreakBadge` à gauche, `MuteToggle` à droite, `ToastHost mode="inline"` centré) ; puis
`ErrorMsg`, éventuel `Leaderboard`, carte question (`Question N` + `subtypeLabel`, prompt à 3 lignes réservées,
`FlagFrame` si `image_url`, 4 `AnswerButton`, hint clavier + « Passer ⏭ »), `PopLayer`.

### 4.4 Results (`src/pages/Results.tsx`)

Rôle : verdict, classement, statistiques, révision, nouvelle partie.

- Hooks : `useSession`, `useGame`, `useModes` (libellé du mode), `useReducedMotion`.
- `summarize(state)` dérive un `Summary` (`mode, players, verdict, title, emoji, myRank, myPos, sharedRank, precision`)
  de `players` et `game.winner_player_id` (meilleur score unique, `null` si partagé) :

| Mode | Verdict | Titre | Célébration (`celebrateVerdict`) |
|---|---|---|---|
| solo | `soloParty` (précision ≥ 80 %) / `soloHappy` (≥ 50 %) / `soloThink` | « Terminé ! » | cannon + `win` / `finished` / `finished` |
| duel | `win` / `tie` / `lose` | « Victoire ! » / « Égalité ! » / « Pas cette fois… » | cannon + `win` / burst + `tie` / `lose` |
| groupe | `win` (🏆) / `tie` (1er ex æquo) / `podium` (🥈 🥉) / `keep` | « Victoire ! » / « Égalité en tête ! » / « Sur le podium ! » ou « 2e ex æquo ! » / « Ne lâche rien ! » | idem duel ; `podium` → `finished` ; `keep` → `lose` |

- Chronologie après l'état `finished` : 0 ms titre + mascotte + confettis/son ; 200 ms count-up des scores
  (`AnimatedNumber`, 900 ms, tick) ; 400 ms étoiles en cascade ; 900 ms barre de duel. Tout est immédiat en
  reduced motion (`counting = ready`).
- Révision : `api.getReview(token)` une seule fois (`reviewReq` ref) ; `game_not_finished` → on garde le squelette et on
  retente au prochain `state` ; autre erreur → `ErrorMsg` + « Réessayer ». Filtre initial `'wrong'` s'il y a des fautes,
  sinon `'all'` ; chips `Tout / Fautes / Sans réponse / ⚠️ À surveiller` ; compteurs ✅ ❌ ⏭️ ⚠️.
- « Nouvelle partie 🔁 » (`clearSession()` + `/`) en raccourci compact sous le classement et en CTA `xl` en bas ;
  ancre `#revision` « 📖 Revoir mes fautes (n) ↓ ».

| Cas | Affichage |
|---|---|
| Chargement (`!state` ou `status !== 'finished'`) | `Mascot think` + `Skeleton` |
| Solo | une ligne « Mon bilan » (score 48 px, précision, `SegmentBar`, badges ✔ Terminé / PARFAIT ! / 🔥 Meilleure série), tagline « x/N bonnes réponses · précision p % », sans chip « Toi » |
| Duel | deux lignes classées (🏆 ou 🤝, couronne sur l'`Avatar` du gagnant), `ScoreCompare` (masquée sous 600 px de haut : `hide-short`), tagline « À 1 point ! » / « Revanche ? » en cas de défaite |
| Groupe | `Podium` (3 premiers, cascade 3 → 2 → 1) + `RankList` ; mes étoiles et badges sous le podium si j'y suis, sinon sous **ma** ligne (`meExtra`) ; tagline « 4e sur 7 · ex æquo » |

## 5. Composants partagés

### 5.1 `src/components/ui.tsx`

| Export | Props | Notes |
|---|---|---|
| `Page` | `children`, `width?: 'sm' \| 'md' \| 'lg'` (max-w-md / 2xl / 3xl), `decorated?` (Blobs, défaut `true`), `toastHost?` (défaut `true`, `ToastHost mode="fixed"`), `muteToggle?` (défaut `true`, `MuteToggle fixed` + `pb-24`), `className?` | conteneur `min-h-dvh`, entrée en spring `motion.div` (désactivée en reduced motion) |
| `Card` | `tone?: 'white' \| 'blue' \| 'purple' \| 'yellow' \| 'green' \| 'red'`, `padding?: 'sm' \| 'md' \| 'lg'`, `pop?` (`animate-pop-in`), `className?` | `rounded-card border-2 shadow-3d` |
| `Button` | `ButtonHTMLAttributes` + `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'blue' \| 'danger'`, `size?: 'md' \| 'lg' \| 'xl'` (48 / 56 / 64 px, `xl` pleine largeur), `loading?`, `icon?`, `silent?` | `btn-3d` sauf `ghost` ; joue `sfx.tap()` au clic sauf `silent` ; `loading` → `aria-busy` + ⏳ ; `onMouseDown` fait `preventDefault` (pas de focus souris) ; `type="button"` par défaut |
| `Input` | `InputHTMLAttributes` + `invalid?`, `leading?: ReactNode` | 56 px, `aria-invalid`, bordure rouge si `invalid` |
| `ErrorMsg` | `children` | `role="alert"`, `animate-shake`, texte ink sur `red-soft` ; rien si vide |
| `Chip` | `active`, `disabled`, `busy?`, `onClick`, `children` | `aria-pressed`, `btn-3d`, bleu quand active ; `busy` ignore le clic sans griser |
| `Keycap` | `label`, `color: 'red' \| 'blue' \| 'yellow' \| 'green' \| 'neutral'`, `size?: 'sm' \| 'md'`, `pressed?` | touche 1-4 (36 px) ou hint (24 px), `aria-hidden` |
| `Divider` | `children?` | `role="separator"`, pointillés |
| `Dots` | — | « … » animés (`animate-dots`) |
| `Skeleton` | `className?` | bloc `bg-line` + shimmer, `aria-hidden` |

### 5.2 Autres composants

| Fichier · export | Props | Rôle |
|---|---|---|
| `Hud.tsx` · `Hud` | `me`, `opponent: PlayerInfo \| null`, `players`, `mode: RaceMode`, `playerCount`, `total`, `remaining`, `duration`, `marker: OpponentMarker`, `children?` (EventStrip), `board?`, `boardOpen?`, `onToggleBoard?`, `onCloseBoard?`, `boardId?` | HUD sticky (`.hud`), grille 2 ou 3 colonnes, `ScoreCell` (score + `LeadTag` réservé ≥ 640 px), `TimerRing` 72 / 84 / 96 px selon écran, `SegmentBar` face à face, `RaceStatus`, overlay classement |
| `PlayerBar.tsx` · `ScoreBump` | `value`, `tone: 'me' \| 'opp' \| 'ink'`, `className?` | chiffre qui « bump » et se colore 350 ms à chaque changement |
| `PlayerBar.tsx` · `LeadTag` | `visible`, `reserve?`, `className?` | tag « EN TÊTE » gold ; `reserve` garde la place invisible |
| `PlayerBar.tsx` · `SegmentBar` | `done`, `total`, `tone: 'me' \| 'opp' \| 'green'`, `direction?: 'ltr' \| 'rtl'`, `height?: 10 \| 14`, `marker?: 'hit' \| 'miss' \| null` | `role="progressbar"` ; segmentée si ≤ 30 segments d'au moins 6 px (largeur mesurée par `ResizeObserver`), sinon continue avec shimmer ; verte quand complète |
| `PlayerBar.tsx` · `PlayerBar` | `player`, `total`, `isMe`, `size?: 'md' \| 'lg'`, `direction?`, `marker?`, `leading?` | carte joueur (Avatar, pseudo, « Toi », « ✔ Terminé », score, barre) |
| `PlayerCard.tsx` · `PlayerCard` | `player: PlayerInfo \| null`, `tone: 'me' \| 'opp'`, `isHost`, `isMe`, `size?: 'md' \| 'sm'` | carte du Lobby ; `null` = case vide « En attente d'un adversaire… » avec mascotte endormie |
| `PlayerGrid.tsx` · `PlayerGrid` | `players`, `meId`, `hostId`, `maxPlayers`, `copied?`, `onInvite?` | moi d'abord ; ≤ 2 : cartes `md` + badge VS + `InviteCard` ; ≥ 3 : `PlayerPill` 44 px sur 2-3 colonnes + `InvitePill` |
| `Leaderboard.tsx` · `Leaderboard`, `ROOMY_QUERY` | `players`, `meId`, `opponentId?`, `total`, `collapsible?`, `onClose?`, `className?` | 5 lignes max (top 4 + « … » + moi si je suis au-delà), médaille dès 1 point, `MiniBar`, ✔ finis, `motion.li layout` ; replié par défaut hors `ROOMY_QUERY` avec aperçu (scores + avatars) |
| `Podium.tsx` · `Podium`, `RankList`, `PODIUM_SIZE`, `PODIUM_STEP_MS` | `players`, `meId`, `winnerId`, `total`, `counting`, `countMs`, `reduced` (+ `delayMs?`, `meExtra?` pour `RankList`) | marches 🥇 🥈 🥉 (DOM en ordre de classement, affichage 2 · 1 · 3), « +n ex æquo ↓ », liste des suivants |
| `RaceStatus.tsx` · `RaceStatus` | `mode`, `me`, `opp`, `rank?`, `playerCount`, `tied?`, `idle?`, `done?`, `total?`, `precision?`, `onToggle?`, `expanded?`, `panelId?` | chip `role="status"` (ou bouton `aria-expanded` si `onToggle`) ; pop à chaque changement de texte |
| `TimerRing.tsx` · `TimerRing` | `remaining`, `total`, `size?: 72 \| 84 \| 96` | `role="timer"`, phases calm / warn (≤ 30 s, orange) / danger (≤ 10 s, rouge, chiffres `red-dark`), `sfx.tick` chaque seconde ≤ 10 s, `memo` limitant le re-rendu à ≤ 2×/s |
| `AnswerButton.tsx` · `AnswerButton`, `AnswerState` | `index: 0-3`, `label`, `state: 'idle' \| 'correct' \| 'wrong' \| 'reveal' \| 'dim'`, `disabled`, `pressed?`, `onClick`, `ref?` | 64 px (72 px ≥ 640 px, 56 px sous 700 px de haut), `aria-label="Réponse n : …"`, `memo` |
| `FlagFrame.tsx` · `FlagFrame` | `src`, `alt?` (défaut « Drapeau »), `compactOnShort?` (défaut `true`) | hauteur fixe 140 / 200 px (88 px sur écran court), skeleton, fallback « image indisponible », `checker-bg` |
| `StreakBadge.tsx` · `StreakBadge` | `streak` | rien sous 2 (💨 400 ms si on vient de la perdre), paliers 2 / 5 (« En feu ! ») / 10 (« Légende ! »), `AnimatePresence` |
| `Toast.tsx` · `ToastHost` | `mode: 'fixed' \| 'inline'` | rend le toast courant de `lib/toast.ts`, `aria-live="polite"`, pop-in / fade-out 300 ms ; `fixed` = haut sur desktop, bas (au-dessus du mute) sur mobile |
| `PopText.tsx` · `usePopText`, `PopLayer`, `PopItem` | `spawn(text, el, tone: 'green' \| 'orange' \| 'red')` ; `PopLayer({ items })` | « +1 » qui monte 700 ms depuis le centre d'un élément, portail `document.body` |
| `Mascot.tsx` · `Mascot` | `mood: 'idle' \| 'party' \| 'sleep' \| 'sad' \| 'think'`, `size?: 64 \| 96` | ⚖️ + emoji d'humeur, `animate-float` (ou `bob` endormie) |
| `Avatar.tsx` · `Avatar` | `name`, `tone: 'me' \| 'opp' \| 'neutral'`, `size?: 28 \| 40 \| 56 \| 72 \| 96`, `crown?` | emoji `avatarFor(name)`, « ? » si vide, 👑 en `animate-crown-drop` |
| `CodeTiles.tsx` · `CodeTiles` | `code`, `onCopy`, `copied` | 5 tuiles 3D (48 px sous 400 px, 56 px au-delà), vertes quand `copied` |
| `ModePicker.tsx` · `ModePicker`, `modeTitle`, `findMode`, `CourseGroup` | `courses`, `loading`, `error`, `activeId`, `disabled`, `busy`, `onSelect(mode)`, `onRetry?` | groupes par cours, chips, description du mode actif, squelette, erreur + « Réessayer », id brut si mode inconnu |
| `ReviewList.tsx` · `ReviewList`, `reviewStatus`, `isFlagged`, `ReviewFilter`, `ReviewStatus` | `items: ReviewItem[]`, `filter: 'all' \| 'wrong' \| 'unseen' \| 'flagged'` | cartes repliables (statut ✅ ❌ ⏭️, chips sous-type / ⚠️ / 🤔, difficulté ⭐), choix marqués, notes « Pourquoi » / « Attention » / « Discutable », source ; ouvertes d'emblée : fautes + sans réponse (tout si ≤ 10) ; « Tout déplier / replier » |
| `ScoreCompare.tsx` · `ScoreCompare` | `me`, `opp`, `meName`, `oppName`, `delayMs?` | barre bleu / violet proportionnelle, écart « +N / −N / = » |
| `Stars.tsx` · `Stars` | `score`, `total`, `delay?`, `label?` | 3 étoiles (≥ 40 / 65 / 85 %) en cascade avec `sfx.star`, `role="img"` |
| `AnimatedNumber.tsx` · `AnimatedNumber` | `value`, `durationMs?` (800), `tick?`, `className?` | count-up via `useCountUp`, `sfx.countUp` à chaque entier si `tick` |
| `MuteToggle.tsx` · `MuteToggle` | `fixed?`, `className?` | bouton rond 44 px `aria-pressed`, `useMuted()` |
| `Blobs.tsx` · `Blobs` | — | 3 taches floues `animate-float`, `null` en reduced motion |

## 6. Hooks (`src/hooks/`)

| Hook | Signature | Rôle |
|---|---|---|
| `useSession` | `() => Session \| null` | §3.1 |
| `useGame` | `(session) => { state, setState, error, refresh, clockOffset }` | §3.2 |
| `useTimer` | `(endsAt: string \| null, clockOffset: number) => number` ; `formatTime(s)` | §3.4 |
| `useModes` | `() => { modes, loading, error, courses }` ; `groupByCourse(modes)` | §3.5 |
| `useRaceEvents` | `(me, opp, players, active, mode = 'duel') => void` | duel : au changement de signe de `me.score − opp.score` → « 🏁 En tête ! » (`leadTaken`), « 🚀 Remontée ! » si retard max ≥ 3 (`comeback`), « 😬 Il passe devant ! » (`leadLost`), « 🤝 Égalité ». Groupe : sur mon rang compétition (`rankOf`) → « En tête ! », « Égalité en tête », « On te passe devant ! », « Remontée ! » (≥ 2 places). Rien au premier rendu, rien hors `active`, rien en solo |
| `useOpponentPulse` | `(opp) => { marker: 'hit' \| 'miss' \| null }` | compare deux observations **du même joueur** (`answered_count` ↑ : `hit` si `score` ↑, sinon `miss`), marqueur 600 ms, `sfx.oppHit` (throttlé 1 s) sur `hit` |
| `usePrevious` | `<T>(value: T) => T \| undefined` | valeur du rendu précédent |
| `useCountUp` | `(target, ms = 800) => number` | rAF + easeOutCubic, repart de la valeur affichée si `target` change, instantané en reduced motion |
| `useMediaQuery` | `(query: string) => boolean` | `useSyncExternalStore` sur `matchMedia`, `false` sans `window` |
| `useMinWidth` | `(px: number) => boolean` | idem pour `(min-width: px)` |
| `useReducedMotion` | ré-export de `motion/react` | `true` si `prefers-reduced-motion: reduce` |

## 7. Libs (`src/lib/`)

### 7.1 `api.ts` — wrappers RPC et `ApiError`

Chaque wrapper appelle `supabase.rpc(fn, args)` et lève `ApiError` (`.code` = message SQL brut, `.message` = libellé
français de la map `ERRORS`, ou le code si inconnu).

| Wrapper | RPC | Retour |
|---|---|---|
| `createGame(nickname, questionCount, durationSeconds, theme)` | `create_game` | `Session` |
| `joinGame(code, nickname)` | `join_game` | `Session` |
| `updateSettings(token, questionCount, durationSeconds, theme)` | `update_settings` | `void` |
| `startGame(token)` | `start_game` | `void` |
| `getState(token)` | `get_state` | `GameState` |
| `submitAnswer(token, questionId, choiceIndex)` | `submit_answer` | `AnswerResult { is_correct, correct_index }` |
| `passQuestion(token)` | `pass_question` | `void` |
| `endGameIfExpired(gameId)` | `end_game_if_expired` | `void` |
| `getReview(token)` | `get_review` | `ReviewItem[]` |
| `listModes()` | `from('modes').select('*').order('sort')` (lecture directe, pas une RPC) | `Mode[]` |

Codes traduits : `game_not_found`, `game_already_started`, `game_full`, `not_host`, `need_two_players`, `invalid_token`,
`time_over`, `game_not_playing`, `stale_question`, `no_questions_for_theme`, `game_not_finished`.

### 7.2 Stockage navigateur

| Clé | Store | Écrit par | Contenu |
|---|---|---|---|
| `boring-geo:session` | `localStorage` | `session.ts` (`saveSession` / `loadSession` / `clearSession`) | `Session` JSON |
| `boring-geo:nickname` | `localStorage` | `session.ts` (`saveNickname` / `loadNickname`) | pseudo |
| `boring-geo:muted` | `localStorage` | `sound.ts` | `'1'` / `'0'` |
| `boring-geo:streak:<code>` | `sessionStorage` | `streak.ts` (`loadStreak` / `saveStreak`) | `{ streak, best }` (purement visuel) |

Tous les accès sont en `try/catch` (mode privé, stockage bloqué).

### 7.3 `sound.ts` — sons synthétisés

Web Audio uniquement, aucun asset. `AudioContext` créé au premier `pointerdown` / `keydown` (`unlock()` au chargement du
module), repris sur `visibilitychange`. Chaîne : oscillateurs / bruit → `master` (gain 0,5) → compresseur → sortie.
Garde-fous : rien si `muted`, 40 ms minimum entre deux lectures d'un même nom, `oppHit` throttlé à 1000 ms et `countUp`
à 60 ms, `tick` jamais joué dans les 80 ms suivant `correct` / `wrong`. Tout est enveloppé dans `safe()` : un son ne
plante jamais l'UI.

```ts
export type SfxName =
  | 'tap' | 'correct' | 'wrong' | 'streakLost' | 'pass' | 'tick' | 'warn' | 'timeUp' | 'go' | 'join'
  | 'copy' | 'toast' | 'star' | 'win' | 'lose' | 'tie' | 'finished' | 'leadTaken' | 'leadLost' | 'comeback'
  | 'oppHit' | 'countUp'
```

`sfx.<nom>()` pour chacun (`correct(streak)` transpose l'arpège selon la série, `tick(secondsLeft)` monte en fréquence
de 10 s à 1 s et double le coup ≤ 3 s), plus `sfx.vibrate(pattern)` (no-op si muted ou reduced motion). API mute :
`isMuted()`, `setMuted(v)`, `toggleMuted()`, `subscribe(cb)`, `useMuted(): [muted, toggle]`. Recettes de synthèse et
événements déclencheurs : [design-spec.md §3](design-spec.md#3-sons--srclibsoundts).

### 7.4 `toast.ts` — file de toasts

Store module-level (aucun Provider) exposé par `showToast(input)` et `useToast()` (`useSyncExternalStore`).

```ts
showToast({ text, tone?: 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple', ms?, key?, priority?: 0 | 1 | 2 })
```

Règles : un seul toast visible, durée par défaut 1800 ms et **900 ms minimum**, 3 en attente maximum, dédoublonnage par
`key` (courant + file), `priority: 2` remplace immédiatement le courant, 0 / 1 attendent. `sfx.toast()` à l'affichage
sauf ton `red`. `clearToasts()` vide tout (Game au démontage).

### 7.5 Autres libs

| Fichier | Exports | Notes |
|---|---|---|
| `confetti.ts` | `celebrate(kind: 'mini' \| 'burst' \| 'cannon', origin?: HTMLElement \| { x, y })` | canvas unique créé à la volée (`canvas-confetti`, `useWorker`), no-op en reduced motion ; `mini` 24 particules, `burst` 80, `cannon` deux canons tirés 3 fois (0 / 700 / 1400 ms) |
| `streak.ts` | `StreakState`, `loadStreak(code)`, `saveStreak(code, s)` | `best` toujours ≥ `streak` |
| `avatar.ts` | `AVATARS` (16 animaux), `avatarFor(name)` | hash djb2 du pseudo normalisé : même pseudo = même animal partout |
| `subtype.ts` | `subtypeLabel(subtype)` | libellés FR en majuscules (géo, histoire, CEDH : `'article-6' → 'ART. 6 · PROCÈS ÉQUITABLE'`), repli `toUpperCase()` |
| `race.ts` | `RaceMode`, `raceModeOf(n)`, `ordinalFr(n)` (« 1er », « 2e »), `rankLabel(rank)` (🥇 🥈 🥉 puis ordinal) | partagé par Game / Hud / RaceStatus / useRaceEvents / Results |
| `ranking.ts` | `rankOf(p, players)`, `sharedRank(p, players)`, `scoreless(players)`, `precisionOf(p)`, `ordinal` | **seule** source du rang affiché (rang compétition sur le score) ; `precisionOf` = `round(score / answered_count × 100)` ou `null` |
| `spring.ts` | `SPRING = { type: 'spring', stiffness: 500, damping: 28, mass: 0.8 }` | transition commune `motion/react` |
| `supabase.ts` | `supabase` | client anon (`.env.local`, voir `.env.example`) |

## 8. Design system en bref

Référence : [design-spec.md](design-spec.md) (§1 identité et tokens, §1.4 mécanisme 3D, §2 motion, §2.5 reduced
motion, §3 sons, §4 composants, §5 gamification, §6 pages). Tout vit dans `src/index.css` sous `@theme` : **il n'y a pas
de `tailwind.config`**.

### 8.1 Tokens principaux

| Famille | Tokens (`@theme`) → utilitaires |
|---|---|
| Fonds | `--color-canvas` #EEF5FF (body, pois `--color-canvas-dots`), `--color-card` #FFFFFF, `--color-line` #E3E8F4, `--color-line-strong` #B9C3DD |
| Texte | `--color-ink` #1F2440, `--color-ink-soft` #5D6480, `--color-navy` #235390 |
| Sémantiques | `green / blue / purple / red / yellow / orange`, chacun avec `-dark` (ombre 3D) et `-soft` (fond pastel) ; `--color-gold` #FFD43B |
| Polices | `--font-display` Fredoka (titres, keycaps), `--font-body` Nunito (tout le reste), chargées par `<link>` Google Fonts dans `index.html` |
| Échelle | `text-hero` (clamp 2.75–4 rem), `text-title` 2 rem, `text-question` (clamp), `text-choice` / `-lg` / `-sm`, `text-score` 1.75 rem, `text-score-xl` 3 rem, `text-timer`, `text-timer-urgent`, `text-label` 0.8125 rem |
| Rayons | `rounded-card` 24 px, `rounded-btn` 16 px, `rounded-key` 10 px, `rounded-chip` 9999 px |
| Ombres | `shadow-3d` (0 6px 0 line), `shadow-pop` (portée douce), `shadow-focus` (halo blue-soft 4 px) |

### 8.2 Classes composants (`@layer components`)

- **`.btn-3d`** : ombre portée en `box-shadow` (jamais `border-bottom`, donc aucun reflow) pilotée par
  `--sh` (4 px, 6 px sur `Button xl`), `--shc` (couleur, ex. `[--shc:var(--color-green-dark)]`) et `--sh-now` ;
  `:active` ou `.is-pressed` → `translateY(var(--sh))` et ombre 0 ; survol +2 px uniquement en `(hover: hover) and
  (pointer: fine)` ; `:disabled` sans ombre.
- `.focus-ring` (outline `blue-dark` + `shadow-focus` en `:focus-visible`), `.hint-only` (visible seulement au pointeur
  fin), `.animate-dots`, `.pulse-glow-blue`, `.shimmer-bg` / `.shimmer-overlay`, `.urgent` (halo rouge sous 10 s),
  `.checker-bg` (damier derrière les drapeaux), `.strike-red` (rature de « Boring »), `.text-balance`, `.hide-short`
  (masqué sous 600 px de haut).

### 8.3 Animations

Utilitaires `animate-*` déclarés dans `@theme` : `pop-in` (260 ms, overshoot), `shake`, `float`, `bob`, `flicker`,
`score-bump`, `float-up`, `tick`, `urgent-halo`, `ring-blink`, `pulse-glow`, `question-in`, `slide-back`, `crown-drop`,
`fade-out`, `shimmer` ; `dots` hors `@theme` (pseudo-élément). Boucles en `transform` / `opacity` uniquement.
`motion/react` (`motion`, `AnimatePresence`, `useReducedMotion`, `SPRING`) est réservé aux fondations (`Page`,
`StreakBadge`, `Leaderboard`, hooks) : **les pages n'importent jamais `motion`**, elles utilisent les classes `animate-*`
et les composants partagés.

### 8.4 `prefers-reduced-motion`

- CSS global : toutes les animations et transitions à 0,01 ms et une seule itération ; `.animate-ring-blink` et
  `.animate-slide-back` neutralisés ; `.urgent` remplacé par une bordure rouge statique 3 px sur `.hud`.
- JS (`useReducedMotion()` ou `matchMedia` direct) : `Page` sans spring, `Blobs` non rendus, `celebrate()` no-op,
  `useCountUp` instantané, `sfx.vibrate` no-op, cascades de Results / Podium / Stars à 0 ms.
- Les changements de couleur (vert / rouge des réponses, orange / rouge du timer) restent : c'est l'information.

### 8.5 Règle de contraste

Texte posé sur `green`, `blue`, `yellow` (et `gold`, `purple`) : **toujours `text-ink`**. Sur `red` : blanc uniquement
en ≥ 18 px gras et doublé d'une icône ✗ (`AnswerButton` état `wrong`, pastille ✗ de `ReviewList`). Sur les fonds
**`-soft`** : `text-ink` (ou `text-ink-soft` pour une ligne secondaire), jamais une couleur `-dark`. Exception documentée :
`text-navy` sur `bg-blue-soft` pour la chip « Question N » du Game. Question et réponses restent ink sur blanc, sans
overlay ni animation d'idle autour (lisibilité sous pression, spec §0).

## 9. Conventions

- **Langue** : interface, libellés, toasts, `aria-label` et commentaires en français ; les questions du cours d'anglais
  juridique restent en anglais et ne sont jamais traduites ni tronquées (`break-words`, jamais `truncate` sur un prompt).
- **Fichiers moteur à ne pas modifier** : `src/lib/api.ts`, `src/lib/session.ts`, `src/lib/supabase.ts`,
  `src/hooks/useGame.ts`, `src/hooks/useSession.ts`, `src/hooks/useTimer.ts`, `src/App.tsx`, `src/main.tsx`,
  `src/types.ts`. Les types purement UI vivent dans les composants ou dans `src/lib` (`AnswerState`, `ReviewFilter`,
  `RaceMode`, `OpponentMarker`…).
- **TypeScript strict** : `tsconfig.app.json` active `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
  (`import type`), `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`. `npx tsc --noEmit -p tsconfig.app.json` doit passer.
- **Tailwind** : pas de classes construites dynamiquement (`bg-${x}`) — des maps complètes (`CARD_TONE`, `BTN_VARIANT`,
  `STATE_LOOK`…) et des variantes écrites en toutes lettres (`[@media(max-height:700px)]:…`, `min-[480px]:…`).
- **Responsive** : 375 px → desktop ; points utilisés : `min-[380px]` (pseudos du HUD), `min-[400px]`, `min-[480px]`,
  `sm` (640 px), écran court `(max-height: 700px)` (Home compact, HUD 104 px, réponses 56 px), `ROOMY_QUERY`
  (`(min-width: 640px) and (min-height: 760px)`) pour le classement inline. Aucun scroll horizontal (`overflow-x-clip`
  sur `Page`).
- **Stabilité de layout** : hauteurs réservées (EventStrip 44 px, prompt 3 lignes, `FlagFrame`, slot ✔ du Leaderboard,
  `LeadTag reserve`), toasts / RaceStatus / PopText hors du flux de la carte question.
- **Accessibilité** : `role="timer"` + `aria-live` en danger, `role="status"` sur les chips d'état, `role="alert"` sur
  les erreurs, `aria-pressed` (Chip, MuteToggle), `aria-expanded` / `aria-controls` (classement, révision),
  `aria-label` sur chaque réponse (« Réponse n : … »), annonce `sr-only` « Bonne / Mauvaise réponse », `aria-hidden` sur
  tous les emoji décoratifs, cibles ≥ 44 px, `focus-ring` visible au clavier seulement, `onMouseDown preventDefault` pour
  ne pas laisser le focus souris capturer Espace (raccourci « passer »).
- **Sons** : jamais nécessaires pour jouer (chaque son a un équivalent visuel), aucun son avant le premier geste, mute
  persistant, un seul son adverse discret (`oppHit`) hors `join`.
- **Assets** : aucun fichier binaire, aucun chemin absolu `/xxx` (emoji, SVG inline, sons synthétisés, fonts par
  `<link>`) ; `import.meta.env.BASE_URL` pour toute navigation hors routeur.
- **Lint** : `npm run lint` (oxlint) sans erreur ; `react/only-export-components` en avertissement (constantes exportées
  tolérées, ex. `ROOMY_QUERY`, `PODIUM_SIZE`).
