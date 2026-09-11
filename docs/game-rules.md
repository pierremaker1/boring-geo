# Règles du jeu — Boring Law

Boring Law est une course de quiz contre la montre pour réviser un cours : une série de QCM (4 propositions, une seule bonne), un timer global, de 1 à 10 joueurs chacun sur son écran. Ce document décrit les règles **telles qu'elles sont implémentées** : chaque règle renvoie au code qui la fait respecter (SQL dans `supabase/migrations/`, front dans `src/`). Il s'adresse autant au joueur qui veut comprendre pourquoi il a perdu qu'au développeur qui découvre le projet.

Voir aussi : [architecture](architecture.md) (schéma, RPC, Realtime), [contenu pédagogique](content.md) (banques de questions, seeds, ajout d'un cours ou d'un mode), [design-spec](design-spec.md) (design system « Globe Pop! », §5 gamification, §6 pages), et le [README](../README.md).

> **Principe n° 1 : le score est calculé par le serveur.** Toute la logique de jeu vit dans des fonctions Postgres `security definer` (`supabase/migrations/0002_functions.sql`, amendées par `0004`, `0005`, `0006`, `0007`). Le client (`src/lib/api.ts`) ne fait qu'appeler ces RPC et afficher `get_state`. Les effets visuels (série, annonces, confettis) sont purement cosmétiques.

---

## 1. Formats : solo, duel, groupe

Le format n'est pas un réglage : il découle du **nombre de joueurs présents au lancement**. Côté front, `raceModeOf(playerCount)` (`src/lib/race.ts`) le dérive de `game.player_count` :

| Format | Joueurs | Ce qui change à l'écran | Verdict final |
|---|---|---|---|
| **Solo** | 1 | HUD à deux colonnes (moi + timer), chip « 3/10 · 100 % » (avancement · précision), aucune annonce de course | Bilan de précision (§8) |
| **Duel** | 2 | HUD « moi \| timer \| adversaire », barres face à face, chip « Tu mènes +N » / « −N derrière » / « Égalité », marqueurs ✓/✗ | Victoire / Égalité / Défaite |
| **Groupe** | 3 à 10 | À droite du HUD : le mieux classé des autres avec sa médaille ; chip = mon rang (« 🥈 2e ex æquo sur 7 ») ; classement en direct (5 lignes max) | Podium des 3 premiers + liste |

- Plafond : `MAX_PLAYERS = 10` (`src/types.ts`) côté client, colonne `games.max_players` (défaut 10, `check between 1 and 10`) côté serveur (`0006_multiplayer.sql`).
- Le solo est autorisé depuis `0006` : `start_game` n'exige plus deux joueurs. Le bouton du salon devient « Jouer en solo 🏃 » quand l'hôte est seul (`src/pages/Lobby.tsx`).
- En groupe, `get_state` renvoie toujours un champ `opponent` = le mieux classé des **autres** joueurs : c'est lui qu'affiche la colonne de droite du HUD (`src/components/Hud.tsx`), et son identité peut changer au fil de la course.

---

## 2. Créer ou rejoindre une partie

### 2.1 Pseudo et session

- Pseudo obligatoire, 1 à 20 caractères après `trim` (contrainte `players.nickname`, `0001_schema.sql`). Il est mémorisé dans `localStorage` sous la clé `boring-geo:nickname` (`src/lib/session.ts`).
- Créer ou rejoindre renvoie une `Session` `{ game_id, code, player_id, token }` stockée sous `boring-geo:session`. Le `token` (uuid de la table `player_tokens`) est le **seul secret** du joueur : toutes les RPC de jeu le prennent en premier argument, et il n'est jamais renvoyé ailleurs que par `create_game` / `join_game`.
- Une session en cours est proposée sur l'accueil (« Tu as une partie en cours : ABCDE → Reprendre »). Si le serveur répond `invalid_token` (partie supprimée), `useGame` efface la session et renvoie à l'accueil (`src/hooks/useGame.ts`).
- Pour tester à plusieurs sur une même machine : une origine différente = un `localStorage` différent (`npm run dev -- --port 5174`, cf. README).

### 2.2 Créer

`api.createGame(nick, 20, 120, DEFAULT_MODE)` (`src/pages/Home.tsx`) → RPC `create_game(p_nickname, p_question_count, p_duration_seconds, p_theme)` :

1. tire les questions du mode (`_pick_questions`, §3.3) — erreur `no_questions_for_theme` si le mode est vide ;
2. insère la partie avec un **code de 5 lettres** généré par `_gen_code()` : alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (sans I ni O, ambigus), unicité vérifiée en boucle ;
3. crée le joueur, son token, et le désigne `host_player_id`.

Le mode par défaut est `DEFAULT_MODE = 'echr:full'` (`src/types.ts`), 20 questions, 2 minutes.

### 2.3 Rejoindre

`api.joinGame(code, nick)` → RPC `join_game(p_code, p_nickname)` : le code est normalisé `upper(trim(...))`, puis :

| Vérification | Erreur levée | Message affiché (`ERRORS`, `src/lib/api.ts`) |
|---|---|---|
| Aucune partie avec ce code | `game_not_found` | « Aucune partie avec ce code. » |
| `status <> 'lobby'` | `game_already_started` | « Cette partie a déjà commencé. » |
| `count(players) >= max_players` | `game_full` | « Cette partie est déjà complète. » |

Le bouton « Rejoindre » n'est actif qu'avec un pseudo et 5 caractères saisis (`joinDisabled`, `Home.tsx`).

### 2.4 Salon et « Quitter »

- Routes (`src/App.tsx`) : `/` → `/lobby/:code` → `/game/:code` → `/results/:code`. Chaque page redirige selon `game.status` (`lobby` / `playing` / `finished`), donc un rechargement ramène toujours au bon écran.
- L'arrivée d'un joueur déclenche un toast « 🎉 Pseudo a rejoint ! » + `sfx.join()` chez les autres (comparaison de la liste d'ids d'un rendu à l'autre, `Lobby.tsx`).
- **« Quitter » n'a pas d'équivalent serveur** : `leave()` efface la session locale et renvoie à l'accueil, mais la ligne `players` reste dans la partie. Il n'existe pas de RPC `leave_game` ; un joueur parti apparaît donc toujours dans le salon et sera lancé avec les autres (il finira avec 0 réponse).

---

## 3. Réglages du salon

Seul l'hôte modifie les réglages (RPC `update_settings(p_token, p_question_count, p_duration_seconds, p_theme)` → `not_host` sinon, `game_already_started` hors salon). Les invités voient les chips désactivées avec la mention « définis par l'hôte 👑 ».

### 3.1 Cours et mode

Le sélecteur `ModePicker` (`src/components/ModePicker.tsx`) liste la table `modes` groupée par `course` (hook `useModes`, `src/hooks/useModes.ts`, lecture publique, cache module). L'identifiant du mode est stocké dans `games.theme` (nom de colonne historique). Liste complète en §12.

### 3.2 Nombre de questions

Chips `COUNTS = [10, 20, 30, 50]` (`Lobby.tsx`). Le serveur tire `limit p_count` questions **au hasard** dans le mode et enregistre `question_count = array_length(qids, 1)` : si le mode contient moins de questions que demandé, **la partie est plafonnée au contenu du mode** (ex. « Annales » = 20 questions même si l'hôte choisit 50). L'hôte voit alors le texte « Ce mode ne contient que N questions : la partie s'arrêtera là. » ; un invité (ou l'hôte après rechargement) voit une chip active « 43 (max) », puisque la valeur serveur n'est pas dans la grille. Le choix de l'hôte est conservé localement (`wantedCount`) pour être renvoyé tel quel si l'on change ensuite pour un mode plus fourni.

### 3.3 Durée

Chips `DURATIONS = [60, 120, 180, 300]` secondes, affichées « 1 min / 2 min / 3 min / 5 min ».

### 3.4 Contraintes serveur

| Colonne (`games`) | Contrainte (`0001_schema.sql`) | Valeurs proposées par l'UI |
|---|---|---|
| `question_count` | `between 5 and 100` | 10 / 20 / 30 / 50 (plafonné au mode) |
| `duration_seconds` | `between 30 and 600` | 60 / 120 / 180 / 300 |
| `max_players` | `between 1 and 10` (`0006`) | non réglable, 10 |

> Pour un dev qui ajoute un mode : un mode de **moins de 5 questions** ferait échouer l'insertion (`question_count` plafonné à 3 viole le `check`). Tous les modes livrés en ont ≥ 20.

### 3.5 Tirage des questions

`_pick_questions(p_mode, p_count)` (`0005_courses_modes_review.sql`) lit la ligne `modes` correspondante : filtre `questions.theme = modes.theme` et, si `modes.subtypes` n'est pas null, `subtype = any(subtypes)`, puis `order by random() limit p_count`. Un id absent de la table est interprété en secours comme `theme` ou `theme:subtype` (rétro-compatibilité). **Chaque appel à `create_game` ou `update_settings` retire une nouvelle série** ; elle est figée dans `games.question_ids` au lancement.

---

## 4. Déroulement d'une manche

### 4.1 Lancement

`start_game(p_token)` (`0006`) — hôte uniquement, salon uniquement :

```sql
-- file initiale identique pour tous : les indices 0 … question_count-1, dans l'ordre
select array_agg(i) into initial_queue from generate_series(0, g.question_count - 1) i;
update players set queue = initial_queue, score = 0, answered_count = 0, finished_at = null where game_id = g.id;
update games set status = 'playing', started_at = now(), ends_at = now() + make_interval(secs => g.duration_seconds) where id = g.id;
```

Tous les clients reçoivent le changement de `games.status` par Realtime (canal `game:<id>`, tables `games` et `players`, + poll de secours toutes les 5 s dans `useGame`) et basculent sur `/game/:code`.

### 4.2 Même série, chacun à son rythme

- **Même série pour tous** : `games.question_ids` est un tableau unique ; la file de chaque joueur (`players.queue int[]`) contient des **indices** dans ce tableau. Au départ tout le monde a la même file `[0, 1, …, n-1]`, donc les mêmes questions dans le même ordre.
- **Chacun à son rythme** : aucune synchronisation entre joueurs. Un joueur rapide peut finir pendant que les autres sont à la moitié.
- La question courante est la tête de file : `_current_question` renvoie `question_ids[queue[1] + 1]` **sans** `correct_index`. Les tables `questions` et `answers` n'ont aucune policy RLS de lecture : la bonne réponse n'est jamais téléchargeable avant d'avoir répondu.

### 4.3 Répondre

Clic sur une des 4 réponses (ou touche 1-4, §10) → `submit_answer(p_token, p_question_id, p_choice_index)` (`0004`) :

| Étape | Règle | Erreur |
|---|---|---|
| Partie en cours | `status = 'playing'` | `game_not_playing` |
| Timer | si `now() >= ends_at` → clôture (`_finalize_game`) puis refus | `time_over` |
| File non vide | | `no_question_left` |
| Bonne question | `p_question_id` doit être la tête de file (anti double-envoi, anti rejeu) | `stale_question` |
| **Réponse unique** | `insert into answers` (contrainte `unique (player_id, question_id)`) | — |
| Score | `score + 1` si `correct_index = p_choice_index`, sinon `+ 0` | — |
| Avancement | `queue = queue[2:]`, `answered_count + 1` ; si c'était la dernière → `finished_at = now()` | — |

Retour : `{ is_correct, correct_index }`. Le client fige la carte **650 ms** (`FEEDBACK_MS`, `src/pages/Game.tsx`) : bouton choisi en vert (`correct`) ou rouge (`wrong`) avec la bonne réponse révélée (`reveal`), les autres estompés (`dim`). **Une mauvaise réponse ne fait pas perdre de point** et la question ne revient pas : on avance.

Les erreurs `stale_question`, `time_over` et `game_not_playing` sont silencieuses côté client (simple `refresh()`), les autres s'affichent.

### 4.4 Passer

Bouton « Passer ⏭ » (ou Espace / P) → `pass_question(p_token)` :

```sql
if coalesce(array_length(pl.queue, 1), 0) > 1 then
  update players set queue = pl.queue[2:] || pl.queue[1] where id = pl.id;   -- tête → fin de file
end if;
```

- **Passer = remettre la question en fin de file.** Elle reviendra après toutes les autres. Aucun point, `answered_count` inchangé, la série (§9.1) n'est ni cassée ni alimentée.
- **La dernière question n'est pas passable** : avec une seule question restante le serveur ne fait rien, et le bouton est désactivé (`disabled={locked || state.me.remaining <= 1}`).
- On peut passer une même question plusieurs fois ; elle ne compte comme « sans réponse » que si le timer tombe avant qu'on y réponde.

### 4.5 Avoir fini avant les autres

Quand `me.remaining === 0`, l'écran « Terminé ! » remplace la carte question (`Game.tsx`) :

- solo : « Résultats dans un instant… » (la partie se clôt immédiatement, §6) ;
- duel : la barre de l'adversaire et « Pseudo : 12/20… » ;
- groupe : le classement (`Leaderboard` déplié, mais **5 lignes max** : top 4 + « … » + ma ligne si je suis au-delà, §7) et « 4/7 joueurs ont fini… ».

---

## 5. Score

- **+1 par bonne réponse, 0 sinon.** Pas de malus, pas de bonus de vitesse, pas de multiplicateur : `score = score + (case when ok then 1 else 0 end)`.
- Le score vit dans `players.score`, incrémenté uniquement par `submit_answer`. Le client l'affiche depuis `get_state` (`ScoreBump`, `src/components/PlayerBar.tsx`) ; il ne le recalcule jamais. L'écran de résultats le rappelle : « Le score est calculé par le serveur. ».
- **Précision** = `score / answered_count` arrondie en % (`precisionOf`, `src/lib/ranking.ts`), `null` (affiché « — ») tant qu'on n'a rien répondu. C'est une statistique d'affichage : elle ne sert ni au classement ni à la victoire, sauf pour colorer le verdict solo (§8).

---

## 6. Fin de partie

La partie se termine dès que **l'une** des deux conditions est remplie :

| Condition | Où c'est vérifié |
|---|---|
| **Timer à zéro** (`now() >= ends_at`) | clôture « paresseuse » dans `get_state`, `submit_answer`, `pass_question`, `get_review`, et explicitement par `end_game_if_expired(p_game_id)` que le client appelle quand son timer local atteint 0 (`Game.tsx`) |
| **Tous les joueurs ont fini** (`bool_and(finished_at is not null)`) | dans `submit_answer`, juste après la dernière réponse d'un joueur (`0004`) |

`_finalize_game` (`0002`) passe `status = 'finished'`, pose `finished_at` et calcule le vainqueur :

```sql
select max(score) into top_score from players where game_id = p_game_id;
select count(*) into top_count from players where game_id = p_game_id and score = top_score;
if top_count = 1 then select id into winner from players where game_id = p_game_id and score = top_score; end if;
-- winner_player_id = meilleur score s'il est unique, NULL si le meilleur score est partagé
```

Remarques :

- Ceux qui finissent en premier **attendent** les autres ou le timer (§4.5). Un joueur lent n'est jamais coupé par un joueur rapide.
- Le timer fait foi côté serveur : le client corrige son horloge avec `server_now` (`clockOffset` dans `useGame`, `useTimer`) et la carte question passe en `opacity-50` à 0 s, mais c'est le serveur qui refuse (`time_over`) une réponse tardive.
- En solo, `winner_player_id` vaut trivialement mon id : l'UI ne s'en sert pas (§8).

---

## 7. Classement et ex æquo

`get_state` (existe depuis `0002_functions.sql` ; champ `players` — avec `rank`, `max_players`, `player_count` — introduit par `0006_multiplayer.sql`, version courante dans `0007_rank_by_score.sql`) renvoie `players` = **tous** les joueurs, moi compris, dans l'**ordre d'affichage** suivant :

1. `score` décroissant ;
2. puis `answered_count` décroissant (avancement) ;
3. puis `created_at` croissant (ordre d'arrivée dans le salon).

Le **rang** (`rank`, 1 = premier) est calculé par `rank() over (order by score desc)` : **il ne dépend que du score**, les ex æquo partagent le rang et la suite saute (1, 1, 3…). L'avancement et l'arrivée ne servent qu'à ordonner les lignes, jamais à départager le rang ni la victoire.

> Historique : `0006` départageait le rang par avancement puis arrivée (rang toujours unique), ce qui contredisait `winner_player_id` (null dès que le meilleur score est partagé). `0007` remplace `get_state` pour aligner le rang sur le score seul ; l'ordre du tableau ne change pas.

Côté front, `src/lib/ranking.ts` est la seule source de vérité du rang affiché : `rankOf(p, players)` (1 + nombre de joueurs strictement meilleurs) et `sharedRank(p, players)` (au moins un autre joueur au même score). Le champ `rank` du serveur n'est pas lu : le rang est recalculé depuis le tableau `players` reçu, pour ne dépendre que de lui. Tous les composants (`Hud`, `RaceStatus`, `Leaderboard`, `Podium`, `Results`, `useRaceEvents`) les utilisent, ce qui garantit la cohérence avec `winner_player_id` : dès que le meilleur score est partagé, il n'y a pas de vainqueur.

Détails d'affichage :

- Médaille 🥇🥈🥉 seulement à partir d'1 point (sinon « – ») : au coup d'envoi, tout le monde serait premier. La chip de groupe affiche « Égalité » neutre tant que personne n'a marqué (`scoreless`).
- Le podium (`src/components/Podium.tsx`) ne porte que les **3 premières positions** de l'ordre serveur : avec des scores 5-3-3-3, deux « 2e ex æquo » sont sur les marches et le troisième est en liste, marqué « 2e · ex æquo » (la marche indique « +1 ex æquo ↓ »).
- Le classement en direct (`src/components/Leaderboard.tsx`) montre au plus 5 lignes : si je suis au-delà, top 4 + « … » + ma ligne.

---

## 8. Verdicts par format

Le verdict est dérivé de l'état serveur dans `summarize()` (`src/pages/Results.tsx`) à partir de `players`, `winner_player_id` et de ma précision.

| Format | Situation | Titre | Effets |
|---|---|---|---|
| Solo | précision ≥ 80 % | « Terminé ! » (vert, mascotte en fête) | confettis canon + `sfx.win` |
| Solo | 50 % ≤ précision < 80 % | « Terminé ! » (jaune) | `sfx.finished` |
| Solo | précision < 50 % ou aucune réponse | « Terminé ! » (bleu, mascotte pensive) | `sfx.finished` |
| Duel | `winner_player_id === me.id` | « Victoire ! » | confettis canon + `sfx.win`, couronne, 🏆 |
| Duel | `winner_player_id === null` | « Égalité ! » | confettis + `sfx.tie`, 🤝 |
| Duel | sinon | « Pas cette fois… » + « À 1 point ! » ou « Revanche ? » | `sfx.lose` |
| Groupe | `winner_player_id === me.id` | « Victoire ! 🏆 » | confettis canon + `sfx.win` |
| Groupe | pas de vainqueur et mon rang = 1 | « Égalité en tête ! » | confettis + `sfx.tie` |
| Groupe | rang 2 ou 3, sur une marche | « Sur le podium ! 🥈/🥉 » | `sfx.finished` |
| Groupe | rang 2 ou 3, hors des marches (ex æquo débordant) | « 2e ex æquo ! » | `sfx.finished` |
| Groupe | rang ≥ 4 | « Ne lâche rien ! » | `sfx.lose` |

En solo, l'accroche donne « 12/20 bonnes réponses · précision 80 % » ; en groupe, « 3e sur 7 · ex æquo ». Le solo n'affiche jamais « Victoire ! » : il n'y a personne à battre. Badges communs : « ✔ Terminé » (a répondu à tout), « PARFAIT ! » (`score === question_count`), « 🔥 Meilleure série : ×N » (§9.1, si ≥ 2).

---

## 9. Mécaniques visuelles (elles ne changent **pas** le score)

Tout ce qui suit est du feedback client (spec [§5](design-spec.md)). Aucun de ces éléments n'est envoyé au serveur ni pris en compte dans le score, le classement ou la victoire.

### 9.1 Série (streak)

- Compteur local de bonnes réponses consécutives (`src/lib/streak.ts`, `sessionStorage` clé `boring-geo:streak:<code>`) : bonne réponse → +1, mauvaise → 0, **passer → inchangé**.
- Paliers : flamme 🔥 dès ×2, « En feu ! » à ×5, « Légende ! » à ×10 (`src/components/StreakBadge.tsx`) ; toasts « 🔥 Série de 3 ! », « ⚡ Série de 5, imparable ! », « 👑 Série de 10, légende ! » ; texte flottant « +1 » (puis « +1 🔥 » dès ×3, « +1 ⚡ » dès ×5) et mini-confettis dès ×3.
- Perte : « Série perdue (×N) » si N ≥ 3, son `streakLost` dès ×2. **Le score reste +1 par bonne réponse, quel que soit le palier.**

### 9.2 Annonces de course (`src/hooks/useRaceEvents.ts`)

Toasts éphémères, jamais en solo, jamais au premier rendu :

| Format | Déclencheur | Toast |
|---|---|---|
| Duel | je passe devant (signe de `me.score − opp.score` qui devient > 0) | « 🏁 En tête ! » — ou « 🚀 Remontée ! » si j'ai eu ≥ 3 points de retard |
| Duel | il passe devant | « 😬 Il passe devant ! » |
| Duel | retour à égalité | « 🤝 Égalité » |
| Groupe | je perds la 1re place | « 😬 On te passe devant ! » |
| Groupe | j'arrive 1er seul | « 🏁 En tête ! » (« 🚀 Remontée ! » si je gagne ≥ 2 places) |
| Groupe | je rejoins / suis rejoint en tête | « 🤝 Égalité en tête » |
| Groupe | je gagne ≥ 2 places sans être 1er | « 🚀 Remontée ! » |

Le rang utilisé est le rang compétition (§7), pas l'ordre serveur : un simple changement d'avancement à score égal ne déclenche rien.

### 9.3 Marqueurs de pression adverse (`src/hooks/useOpponentPulse.ts`)

Quand l'adversaire affiché (duel : l'autre ; groupe : le leader des autres) répond, une pastille apparaît 600 ms à l'extrémité de sa barre : **✓ vert** s'il a marqué, **✗ gris** s'il a répondu sans marquer. Son discret `oppHit` seulement pour le ✓. En groupe, un changement d'identité du « meilleur des autres » ne déclenche rien.

### 9.4 Chip d'état (`src/components/RaceStatus.tsx`)

État permanent sous le timer : solo « 7/20 · 86 % » ; duel « Tu mènes +2 » (vert) / « −1 derrière » (rouge) / « Égalité » (jaune) ; groupe « 🥇 1er » (vert), « 🥈 2e ex æquo sur 7 » (jaune : podium ou moitié haute), « 5e sur 7 » (neutre), rouge pour le dernier tiers. Sur petit écran, la chip de groupe ouvre le classement en overlay.

### 9.5 Timer dramatique et jalons (`Game.tsx`)

- 30 s : « ⏱ Plus que 30 s ! » + `sfx.warn` ; 10 s : « ⏰ 10 secondes ! », halo rouge (`urgent`), anneau rouge ; 0 s : « ⏰ Temps écoulé ! », vibration, carte estompée.
- Jalons une seule fois par partie : « 🚀 GO ! » au départ, « ⚡ Mi-parcours ! » à `ceil(total / 2)` réponses, « 🏁 Dernière question ! » à 1 restante, confettis + `sfx.finished` quand j'ai tout répondu. Un rechargement en cours de partie ne rejoue pas les jalons déjà passés.

### 9.6 Résultats

Compte à rebours des scores (count-up), étoiles de précision, barre `ScoreCompare` en duel, podium en cascade en groupe, couronne sur l'avatar du vainqueur, confettis selon le verdict (§8). Tout est instantané et sans confettis en `prefers-reduced-motion`.

---

## 10. Raccourcis clavier

Gérés par un écouteur `keydown` global dans `Game.tsx` (auto-répétition `e.repeat` ignorée) :

| Touche | Action | Détail |
|---|---|---|
| `1` `2` `3` `4` | répondre (réponse 1 à 4, couleurs rouge / bleu / jaune / vert) | `e.key` `'1'`…`'4'` |
| Rangée de chiffres **AZERTY** (`&` `é` `"` `'` sans Maj) | répondre | `e.code` `Digit1`…`Digit4` : le code physique ne dépend pas de la disposition |
| Pavé numérique `1`-`4` | répondre | `e.code` `Numpad1`…`Numpad4` |
| `Espace` ou `P` | passer | Espace est ignoré si le focus est sur un bouton/lien/champ (l'activation native prime, pas de double action) |
| `Échap` | fermer le classement en overlay (groupe, petit écran) | `Hud.tsx` |

Les raccourcis sont inactifs pendant le feedback de 650 ms, pendant un appel en cours et à temps écoulé (`locked`). Le rappel des touches (`Keycap`) n'est affiché que sur les appareils à pointeur fin (classe `hint-only`).

---

## 11. Révision après la partie

Une fois `status = 'finished'`, l'écran de résultats charge `get_review(p_token)` (`0005`) : **toutes** les questions de la partie dans l'ordre joué (`unnest(question_ids) with ordinality`), jointes à mes réponses (`left join answers … and a.player_id = pl.id`). Avant la fin, la RPC lève `game_not_finished` et le client réessaie au prochain état.

Chaque `ReviewItem` (`src/types.ts`) porte : `prompt`, `choices`, `correct_index`, `chosen_index` (null = sans réponse), `is_correct`, `subtype`, `difficulty` (1-3), `explanation`, `flag`, `disputed`, `source`, `external_id`.

| Statut (`reviewStatus`, `src/components/ReviewList.tsx`) | Condition | Carte |
|---|---|---|
| ✅ bonne réponse | `is_correct` | bordure verte |
| ❌ faute | `chosen_index` non null et `!is_correct` | bordure rouge |
| ⏭️ sans réponse | `chosen_index === null` : **passée jusqu'au bout ou jamais atteinte** (l'API ne distingue pas) | bordure grise |

Filtres : Tout / Fautes / Sans réponse / ⚠️ À surveiller (`flag` ou `disputed` non null). Le filtre « Fautes » est sélectionné d'office s'il y en a. Les fautes et sans-réponse sont dépliées d'emblée (tout, si la partie fait ≤ 10 questions).

Notes affichées dans la carte dépliée, **dans cet ordre** :

1. **⚠️ « Attention : le cours ≠ le droit positif »** (`flag`) — la question suit la version du cours (référence de vérité pour l'examen) alors que le droit positif a évolué ; seconde ligne « Pour l'examen, retiens la version du cours. ». Le cours CEDH en compte 22 ; la règle est énoncée dans `meta.warning` de `data/courses/echr-anglais-s7.json` : répondre le cours à l'examen, mais lire le flag.
2. **💡 « Pourquoi »** (`explanation`) — absente en Culture G (le format simple `data/questions/*.json` n'a pas d'explication).
3. **🤔 « Corrigé discutable »** (`disputed`) — le corrigé officiel des annales est contestable ; la note explique pourquoi. Une seule question concernée.

Puis la source (« CM Anglais, Section 1 ; Plan I.A »). Les chips ⚠️ et 🤔 restent visibles carte repliée.

---

## 12. Modes disponibles (table `modes`)

Seed dans `0005_courses_modes_review.sql` (`insert … on conflict (id) do update`). Colonnes : `id, course, theme, label, description, emoji, subtypes, sort`. `subtypes = null` = tout le thème. Le nombre de questions est celui des banques `data/` au moment du seed (`scripts/gen-seed-sql.mjs`, `scripts/seed-remote.mjs`).

| `id` | Cours | `theme` | Libellé | `subtypes` | Questions |
|---|---|---|---|---|---|
| `echr:full` | Anglais CEDH · S7 | `echr-anglais-s7` | 📚 Tout le programme | null | 250 |
| `echr:annales` | Anglais CEDH · S7 | `echr-anglais-s7` | 🎓 Annales | `annales` | 20 |
| `echr:procedure` | Anglais CEDH · S7 | `echr-anglais-s7` | ⚖️ Procédure | `subsidiarity, admissibility, time-limit, filing, interim-measures, just-satisfaction, enforcement, court` | 53 |
| `echr:articles` | Anglais CEDH · S7 | `echr-anglais-s7` | 📜 Article par article | `articles, protocols, protocol-1-1, article-2 … article-14` | 84 |
| `echr:theorie` | Anglais CEDH · S7 | `echr-anglais-s7` | 🧠 Théorie et principes | `foundations, systems, convention, nature-of-rights, principles` | 43 |
| `echr:vocabulaire` | Anglais CEDH · S7 | `echr-anglais-s7` | 🔤 Vocabulaire | `vocabulary` | 20 |
| `echr:pieges` | Anglais CEDH · S7 | `echr-anglais-s7` | 🪤 Pièges | `traps` | 30 |
| `geo` | Culture G | `geo` | 🌍 Géographie | null | 406 |
| `geo:drapeau` | Culture G | `geo` | 🏁 Drapeaux | `drapeau` | 150 |
| `histoire` | Culture G | `histoire` | 🏛️ Histoire | null | 252 |

Les questions du cours d'anglais juridique sont en anglais (format d'examen), l'interface reste en français. Les libellés de sous-type affichés sur la carte question (« ART. 6 · PROCÈS ÉQUITABLE », « DRAPEAU »…) viennent de `subtypeLabel` (`src/lib/subtype.ts`). Ajouter un mode = une ligne dans `modes` ; ajouter un thème = nouveau JSON + seed + ses lignes : voir [contenu pédagogique](content.md).

---

## 13. Codes d'erreur des RPC

Levés par `raise exception '<code>'` côté SQL, traduits par `ERRORS` dans `src/lib/api.ts` (un code inconnu est affiché brut).

| Code | Levé par | Message |
|---|---|---|
| `game_not_found` | `join_game` | Aucune partie avec ce code. |
| `game_already_started` | `join_game`, `update_settings`, `start_game` | Cette partie a déjà commencé. |
| `game_full` | `join_game` | Cette partie est déjà complète. |
| `not_host` | `update_settings`, `start_game` | Seul l'hôte peut faire ça. |
| `invalid_token` | `_player_from_token` (toutes les RPC à token) | Session invalide. → retour à l'accueil |
| `time_over` | `submit_answer`, `pass_question` | Temps écoulé ! (silencieux en jeu) |
| `game_not_playing` | `submit_answer`, `pass_question` | La partie n'est pas en cours. (silencieux en jeu) |
| `stale_question` | `submit_answer` | Question déjà traitée. (silencieux en jeu) |
| `no_question_left` | `submit_answer` | *(non traduit)* |
| `no_questions_for_theme` | `create_game`, `update_settings` | Pas de questions pour ce mode. |
| `game_not_finished` | `get_review` | La partie n'est pas terminée. (réessai automatique) |
| `need_two_players` | plus levé depuis `0006` (solo autorisé) ; entrée conservée dans `ERRORS` | Il faut 2 joueurs pour démarrer. |

---

## Annexe — où lire quoi

| Sujet | Fichier |
|---|---|
| Schéma (`questions`, `games`, `players`, `player_tokens`, `answers`), RLS, Realtime | `supabase/migrations/0001_schema.sql` |
| RPC de base, `_gen_code`, `_finalize_game`, `pass_question`, `end_game_if_expired` | `supabase/migrations/0002_functions.sql` |
| Fin quand tous ont fini, `submit_answer` actuel | `supabase/migrations/0004_modes_and_end_rule.sql` |
| Table `modes`, `_pick_questions` par mode, `get_review`, champs pédagogiques | `supabase/migrations/0005_courses_modes_review.sql` |
| 1 à 10 joueurs (`max_players`), `join_game` jusqu'à 10, `start_game` solo, `_player_json` | `supabase/migrations/0006_multiplayer.sql` |
| `get_state` courant : `players` ordonnés + rang compétition sur le seul score | `supabase/migrations/0007_rank_by_score.sql` |
| Client RPC et messages d'erreur | `src/lib/api.ts` |
| Types (`GameState`, `PlayerInfo`, `ReviewItem`, `MAX_PLAYERS`, `DEFAULT_MODE`) | `src/types.ts` |
| Format de course, rang, précision | `src/lib/race.ts`, `src/lib/ranking.ts` |
| Salon, jeu, résultats | `src/pages/Lobby.tsx`, `src/pages/Game.tsx`, `src/pages/Results.tsx` |
| Série, annonces, marqueurs | `src/lib/streak.ts`, `src/hooks/useRaceEvents.ts`, `src/hooks/useOpponentPulse.ts` |
| Révision | `src/components/ReviewList.tsx` |
