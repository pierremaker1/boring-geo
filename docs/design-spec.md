# Globe Pop! — Spec de design exécutable (Boring Geo)

Version 1.0 · Lead design · À suivre à la lettre par 5 développeurs en parallèle.
Concept retenu par le jury : **Globe Pop!** (cartoon-arcade clair, boutons 3D, keycaps colorées), enrichi des greffes
validées (arpège de série transposé, tick du timer qui monte, toasts d'événements, barres de progression segmentées face à
face, marqueur ✓/✗ adverse, hauteurs réservées, accessibilité, sound.ts robuste, subtype FR, précision + barre de duel).

## 0. Règles d'or (non négociables)

1. **Aucune logique de jeu ne change.** Mêmes appels `api.*`, mêmes hooks (`useGame`, `useSession`, `useTimer`), même
   navigation (`useEffect` sur `game.status`), mêmes raccourcis (1-4, Espace/P, garde `e.repeat`), même verrou `locked`,
   même `FEEDBACK_MS = 650`, même `expiredCalled` (ref) pour `endGameIfExpired`, même gestion `ApiError`
   (`stale_question` / `time_over` / `game_not_playing` → `refresh()` silencieux). Le score est calculé par le serveur.
2. **Fichiers interdits de modification** : `src/lib/api.ts`, `src/lib/session.ts`, `src/lib/supabase.ts`,
   `src/hooks/useGame.ts`, `src/hooks/useSession.ts`, `src/hooks/useTimer.ts`, `src/App.tsx`, `src/main.tsx`,
   `src/types.ts` (on n'y ajoute rien : les types UI vivent dans les composants).
3. **Lisibilité sous pression** : la question et les 4 réponses sont toujours en `--color-ink` sur blanc (≈ 13:1), sans
   animation d'idle autour, sans overlay dessus. Cibles ≥ 48 px, réponses ≥ 64 px (72 px desktop). Zéro saut de layout au
   moment du clic (hauteurs réservées, voir §2.4).
4. **Contraste des fonds colorés** : le texte posé sur `--color-green`, `--color-blue`, `--color-yellow` est **toujours
   `--color-ink`** (≥ 6:1). Le texte posé sur `--color-red` est blanc, uniquement en ≥ 18 px / 800 (large text, 3.3:1) et
   toujours doublé d'une icône ✗. Jamais de texte blanc sur vert ou bleu.
5. **Animations** : transform / opacity uniquement en boucle ; `prefers-reduced-motion` respecté partout (CSS + JS).
6. **Sons** : jamais nécessaires pour jouer (chaque son a un équivalent visuel), mute persistant, aucun son pour les
   actions de l'adversaire sauf `join` et le `oppHit` discret (volume ×0,5).
7. **Build** : `npm run build` (tsc -b + vite build) doit passer. `noUnusedLocals` / `noUnusedParameters` actifs : tout
   ce qui est importé est utilisé. Pas de classes Tailwind construites dynamiquement (`bg-${x}`) : des maps complètes.
8. **Assets** : aucun fichier binaire ajouté, aucun chemin absolu `/xxx` (Vercel + GitHub Pages `VITE_BASE`). Emoji,
   SVG inline, sons synthétisés, Google Fonts par `<link>`.
9. **`motion/react` uniquement dans les fondations** (Page, ToastHost, StreakBadge, RaceStatus, hooks). Les pages
   n'importent jamais `motion` : elles utilisent les classes `animate-*` et les composants partagés.
10. Interface en **français**, sans emoji dans le code des composants sauf ceux listés ici (avatars, mascotte, toasts).

---

## 1. Identité

**Nom** : Globe Pop!  **Ambiance** : cour de récré Duolingo × plateau Kahoot. Fond bleu ciel pâle à pois, cartes
blanches épaisses à grands arrondis, boutons 3D qui s'enfoncent avec un « pop », keycaps colorées 1-4, deux avatars-emoji
(moi bleu, adversaire violet) qui se tirent la bourre sur des barres segmentées face à face, flamme de série, timer-anneau
qui vire à l'orange puis au rouge en faisant tic-tac, confettis aux bons moments.

### 1.1 Tokens `@theme` (src/index.css)

```css
@import "tailwindcss";

@theme {
  /* Fonds */
  --color-canvas: #EEF5FF;        /* fond de page (body) */
  --color-canvas-dots: #C9D4EA;   /* motif de points du fond */
  --color-card: #FFFFFF;          /* cartes, boutons réponse, chips inactives, tuiles */
  --color-line: #E3E8F4;          /* bordure 2px des éléments blancs, séparateurs, piste vide */
  --color-line-strong: #B9C3DD;   /* ombre 3D des éléments blancs, texte désactivé, placeholder */
  /* Texte */
  --color-ink: #1F2440;           /* texte principal (question, réponses, titres, chiffres) */
  --color-ink-soft: #5D6480;      /* texte secondaire, labels, hints */
  --color-navy: #235390;          /* text-shadow 3D des titres Fredoka, piste de l'anneau timer */
  /* Sémantiques */
  --color-green: #58CC02;         /* CTA primaire, bonne réponse, chip « Tu mènes », titre Victoire */
  --color-green-dark: #46A302;    /* ombre 3D vert, text-shadow Victoire */
  --color-green-soft: #D7F8C1;    /* fonds soft succès */
  --color-blue: #1CB0F6;          /* joueur MOI (p1), chips actives, anneau timer calme, keycap 2, bouton Rejoindre */
  --color-blue-dark: #1899D6;     /* ombre 3D bleu, focus ring */
  --color-blue-soft: #DDF4FF;     /* fond carte code, fond PlayerBar moi, chip Question N */
  --color-purple: #CE82FF;        /* ADVERSAIRE (p2) */
  --color-purple-dark: #A560E8;   /* ombre 3D violet */
  --color-purple-soft: #F1E3FF;   /* fond PlayerBar adversaire */
  --color-red: #FF4B4B;           /* mauvaise réponse, timer < 10 s, halo urgent, keycap 1 */
  --color-red-dark: #D63A3A;      /* ombre 3D rouge, texte des erreurs */
  --color-red-soft: #FFE1E1;      /* fond ErrorMsg, chip « derrière » */
  --color-yellow: #FFC800;        /* badge VS, titre Égalité, keycap 3, étoiles */
  --color-yellow-dark: #E5A800;   /* ombre 3D jaune */
  --color-yellow-soft: #FFF4C2;   /* bannière partie en cours, carte attente invité, toasts jalons */
  --color-orange: #FF9600;        /* anneau timer 10-30 s, flamme de série, « +1 🔥 » */
  --color-orange-dark: #E07F00;   /* ombre 3D flamme, contour keycap active */
  --color-gold: #FFD43B;          /* couronne et bordure du gagnant, trophée */
  /* Alias sémantiques demandés (mêmes valeurs, utilisables indifféremment) */
  --color-bg: #EEF5FF;
  --color-surface: #FFFFFF;
  --color-primary: #58CC02;
  --color-p1: #1CB0F6;
  --color-p2: #CE82FF;
  --color-success: #58CC02;
  --color-danger: #FF4B4B;
  --color-warning: #FF9600;

  /* Polices */
  --font-display: "Fredoka", "Nunito", system-ui, sans-serif;
  --font-body: "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  /* Échelle typographique (utilitaires text-*) */
  --text-hero: clamp(2.75rem, 6vw, 4rem);      --text-hero--line-height: 1.05;
  --text-title: 2rem;                          --text-title--line-height: 1.1;
  --text-question: clamp(1.5rem, 1rem + 2.5vw, 2.125rem); --text-question--line-height: 1.2;
  --text-choice: 1.25rem;                      --text-choice--line-height: 1.25;   /* 20 px */
  --text-choice-lg: 1.375rem;                  --text-choice-lg--line-height: 1.25; /* 22 px desktop */
  --text-choice-sm: 1.125rem;                  --text-choice-sm--line-height: 1.25; /* 18 px si libellé > 40 car. */
  --text-score: 1.75rem;                       --text-score--line-height: 1;      /* 28 px HUD */
  --text-score-xl: 3rem;                       --text-score-xl--line-height: 1;   /* 48 px Results */
  --text-timer: 2.5rem;                        --text-timer--line-height: 1;      /* 40 px */
  --text-timer-urgent: 3rem;                   --text-timer-urgent--line-height: 1;
  --text-label: 0.8125rem;                     --text-label--line-height: 1.2;    /* 13 px uppercase */

  /* Rayons */
  --radius-card: 24px;   /* cartes, carte question, PlayerBar */
  --radius-btn: 16px;    /* boutons, inputs, boutons réponse */
  --radius-key: 10px;    /* keycaps */
  --radius-chip: 9999px;

  /* Ombres */
  --shadow-3d: 0 6px 0 0 var(--color-line);
  --shadow-pop: 0 12px 32px -8px rgba(31, 36, 64, 0.18);
  --shadow-focus: 0 0 0 4px var(--color-blue-soft);

  /* Animations (utilitaires animate-*) : keyframes en §2.2 */
  --animate-pop-in: pop-in 260ms cubic-bezier(.34, 1.56, .64, 1) both;
  --animate-shake: shake 420ms ease-in-out both;
  --animate-float: float 3s ease-in-out infinite;
  --animate-bob: bob 1.8s ease-in-out infinite;
  --animate-flicker: flicker 500ms ease-in-out infinite;
  --animate-score-bump: score-bump 350ms cubic-bezier(.34, 1.56, .64, 1) both;
  --animate-float-up: float-up 700ms ease-out both;
  --animate-tick: tick 200ms ease-out both;
  --animate-urgent-halo: urgent-halo 1s ease-in-out infinite alternate;
  --animate-ring-blink: ring-blink 500ms steps(2) infinite;
  --animate-pulse-glow: pulse-glow 2s ease-out infinite;
  --animate-dots: dots 1.2s steps(4) infinite;
  --animate-question-in: question-in 180ms ease-out both;
  --animate-slide-back: slide-back 220ms ease-in both;
  --animate-crown-drop: crown-drop 500ms cubic-bezier(.34, 1.56, .64, 1) both;
  --animate-fade-out: fade-out 300ms ease-in both;
  --animate-shimmer: shimmer 1.4s linear infinite;
}
```

Autres règles globales dans `index.css` (hors `@theme`) :

```css
:root { color-scheme: light; }
body {
  background-color: var(--color-canvas);
  background-image: radial-gradient(var(--color-canvas-dots) 1.5px, transparent 1.5px);
  background-size: 24px 24px;
  color: var(--color-ink);
  font-family: var(--font-body);
  font-weight: 700;
  -webkit-font-smoothing: antialiased;
}
@media (max-height: 600px) { .hide-short { display: none; } }
```

### 1.2 Fonts (index.html)

Ajouter dans `<head>` (une seule fois, avant le `<script>`) :

```html
<meta name="theme-color" content="#EEF5FF" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet" />
```

Titre : `<title>Boring Geo — Globe Pop!</title>`. Ne pas ajouter de favicon en chemin absolu.

### 1.3 Rôles typographiques

| Usage | Police | Taille / graisse |
|---|---|---|
| Titre héros (« Boring Geo », « Victoire ! ») | Fredoka 700 `font-display` | `text-hero`, `text-shadow: 0 4px 0 <couleur-dark>` |
| Titre de page (« Salon », « Terminé ! ») | Fredoka 700 | `text-title` (32 px) |
| Code de partie (tuiles), chiffres des keycaps, « VS » | Fredoka 700 | 40 px / 18 px / 22 px |
| Pseudos (Lobby / Results) | Fredoka 600 | 20 px, `truncate` |
| **Chiffres vivants (timer, scores)** | **Nunito 900 `tabular-nums`** | timer 40 → 48 px urgent (`min-width: 5ch`), score HUD 28 px, score Results 48 px |
| Question (prompt) | Nunito 900 | `text-question` (24 → 34 px), `text-wrap: balance`, jamais < 24 px |
| Réponses | Nunito 800 | 20 px mobile / 22 px ≥ 640 px ; 18 px si `label.length > 40` ; `break-words`, jamais d'ellipse |
| CTA | Nunito 900 | xl 20 px / lg 18 px / md 16 px, casse normale, `letter-spacing: .01em` |
| Labels / chips méta | Nunito 800 | 13 px `uppercase tracking-[.08em] text-ink-soft` |
| Pseudos HUD | Nunito 800 | 15 px `truncate` |
| Corps / hints | Nunito 700 | 16 px / 14 px `text-ink-soft` |

Fredoka n'est jamais utilisée pour un nombre qui change en direct (pas de chiffres tabulaires garantis).

### 1.4 Mécanisme 3D (classes dans `@layer components`, index.css)

```css
@layer components {
  .btn-3d { --sh: 4px; --shc: var(--color-line-strong);
    box-shadow: 0 var(--sh) 0 0 var(--shc); transition: transform 80ms ease-out, box-shadow 80ms ease-out; }
  .btn-3d:active:not(:disabled) { transform: translateY(var(--sh)); box-shadow: 0 0 0 0 var(--shc); }
  .btn-3d:disabled { box-shadow: none; }
  .btn-3d.is-pressed { transform: translateY(var(--sh)); box-shadow: 0 0 0 0 var(--shc); }
  @media (hover: hover) and (pointer: fine) {
    .btn-3d:not(:disabled):not(.is-pressed):hover { transform: translateY(-2px);
      box-shadow: 0 calc(var(--sh) + 2px) 0 0 var(--shc); }
  }
  .focus-ring:focus-visible { outline: 2px solid var(--color-blue-dark); outline-offset: 2px; box-shadow: var(--shadow-focus); }
  .hint-only { display: none; }
  @media (hover: hover) and (pointer: fine) { .hint-only { display: inline-flex; } }
}
```

L'ombre 3D est un `box-shadow` (jamais `border-bottom`) : aucun reflow quand le bouton s'enfonce. Chaque variante définit
`--sh` (4 px md, 6 px xl) et `--shc` (couleur `-dark`). Un bouton désactivé est « à plat » : l'état non cliquable se lit.

---

## 2. Motion

### 2.1 Principes

- **Physique cartoon** : repos (ombre 3D) → hover pointer-fine (`translateY(-2px)`) → pressed (`translateY(var(--sh))`, 80 ms).
- **Ce qui se lit ne bouge pas** : la carte question entre une fois (`animate-question-in`, 180 ms, keyée sur `question.id`)
  puis reste immobile. Aucune animation d'idle dans la zone question. Rien ne recouvre jamais les 4 réponses.
- **Le verrou `locked` (650 ms) est la seule pause** ; toute animation de feedback tient dans 650 ms (shake 420 ms, flash
  200 ms) ; le `+1` flottant (700 ms) vit dans un portail indépendant et peut survivre à la question suivante.
- Springs `motion/react` (uniquement fondations) : `{ type: 'spring', stiffness: 500, damping: 28, mass: 0.8 }`.
- Easing CSS : entrées `cubic-bezier(.34, 1.56, .64, 1)` (overshoot), sorties `ease-in`, tout ≤ 300 ms hors célébrations.

### 2.2 Keyframes à définir dans index.css (dans `@theme`, à côté des `--animate-*`)

| Nom | Description | Usage |
|---|---|---|
| `pop-in` | `scale(.6)→1.08→1`, opacity 0→1 | cartes joueur, badges, chips actives, toasts, tuiles |
| `shake` | `translateX` 0,-8,8,-6,6,-3,3,0 | bouton mauvaise réponse, ErrorMsg |
| `float` | `translateY` 0→-8px→0 | mascotte, blobs |
| `bob` | `translateY(-3px)` + `rotate(±3deg)` | avatar « ? » en attente |
| `flicker` | `scale` 1→1.12→.96→1.06, `rotate` -4°→4° | flamme StreakBadge |
| `score-bump` | `scale` 1→1.4→1 | chiffre de score à chaque changement |
| `float-up` | `translateY` 0→-56px, opacity 1→0, `scale` .8→1.3 | PopText « +1 » |
| `tick` | `scale` 1.12→1 | chiffres du timer chaque seconde < 10 s |
| `urgent-halo` | `box-shadow: inset 0 0 60px rgba(255,75,75,0)` → `rgba(255,75,75,.35)` | wrapper Game (< 10 s) |
| `ring-blink` | opacity 1→.5 | anneau timer ≤ 3 s |
| `pulse-glow` | `box-shadow: 0 0 0 0 rgba(88,204,2,.6)` → `0 0 0 14px rgba(88,204,2,0)` | bouton Démarrer prêt, Rejoindre prêt (bleu : `rgba(28,176,246,…)` via classe `pulse-glow-blue`) |
| `dots` | `content` / opacity en 4 pas sur `::after` (`.`, `..`, `...`) | « En attente… » |
| `question-in` | `translateX(24px)`→0, opacity 0→1 | carte question (key = question.id) |
| `slide-back` | `scale` 1→.92, `translateY` 0→24px, opacity 1→0 | carte question quand on Passe |
| `crown-drop` | `translateY(-40px) rotate(-20deg)` → 0 | couronne du gagnant |
| `fade-out` | opacity 1→0 | disparition des toasts, 💨 |
| `shimmer` | `background-position` -200%→200% (dégradé line → line-strong → line) | skeletons, image drapeau en chargement |

Les blobs (`Blobs`) utilisent `float` avec `animation-duration` 8 / 10 / 12 s et des délais différents.

### 2.3 Transitions de page

`Page` enveloppe son contenu dans `motion.div` : `initial={{ opacity: 0, y: 16, scale: .98 }}` →
`animate={{ opacity: 1, y: 0, scale: 1 }}` (spring §2.1). Pas d'`exit`, pas d'`AnimatePresence` autour des routes,
`App.tsx` intact. Avec reduced motion : `initial={false}`.

### 2.4 Stabilité de layout (règle du design system)

- `EventStrip` (Game) : hauteur fixe **44 px** toujours présente entre le HUD et la carte question ; contient StreakBadge
  (gauche) et le toast courant (centre). Vide = toujours 44 px.
- Prompt : `min-height: calc(3 * 1.2em)` (3 lignes réservées).
- `FlagFrame` : hauteur fixe **140 px** mobile / **200 px** ≥ 640 px dès que `image_url` existe (avant même le chargement).
- Réponses : `min-height` 64 / 72 px, `break-words`, jamais `truncate`.
- RaceStatus, toasts, PopText : positionnés en absolu / fixed, jamais dans le flux de la carte question.

### 2.5 prefers-reduced-motion

CSS global (index.css, hors `@theme`) :

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```

JS : `useReducedMotion()` (src/hooks/useReducedMotion.ts, ré-export de `motion/react`) → `Page` sans spring,
`celebrate()` no-op, `useCountUp` instantané, `sfx.vibrate` no-op, Blobs non rendus, halo urgent remplacé par une bordure
rouge statique 3 px sur le HUD. Les changements de couleur (vert/rouge, orange/rouge du timer) restent : c'est l'information.

---

## 3. Sons — `src/lib/sound.ts`

100 % Web Audio synthétisé, aucun asset. Singleton lazy : `getCtx()` crée l'`AudioContext` au premier geste (listener
global `pointerdown` + `keydown`, `{ once: true }`, installé par `unlock()` appelé au module load côté navigateur) ;
`ctx.resume()` si `suspended`, aussi sur `visibilitychange`. Chaîne : sons → `master` GainNode (0.5) →
`DynamicsCompressorNode` (threshold -18, ratio 4) → destination. Buffer de bruit blanc 0,5 s généré une fois.

État mute : `localStorage` clé **`boring-geo:muted`** (`'1'` / `'0'`, défaut `'0'`). Toute fonction de lecture retourne
immédiatement si muted ou si le contexte n'existe pas encore (pas de son avant le premier geste : toléré).
Anti-spam : 40 ms minimum entre deux lectures d'un même nom. Priorité : `tick` n'est pas joué si `correct`/`wrong` a
été joué dans les 80 ms précédents.

```ts
export type SfxName = 'tap' | 'correct' | 'wrong' | 'streakLost' | 'pass' | 'tick' | 'warn' | 'timeUp' | 'go' | 'join'
  | 'copy' | 'toast' | 'star' | 'win' | 'lose' | 'tie' | 'finished' | 'leadTaken' | 'leadLost' | 'comeback'
  | 'oppHit' | 'countUp'
export const sfx: {
  tap(): void; correct(streak: number): void; wrong(): void; streakLost(): void; pass(): void
  tick(secondsLeft: number): void; warn(): void; timeUp(): void; go(): void; join(): void; copy(): void
  toast(): void; star(): void; win(): void; lose(): void; tie(): void; finished(): void
  leadTaken(): void; leadLost(): void; comeback(): void; oppHit(): void; countUp(): void
  vibrate(pattern: number | number[]): void   // navigator.vibrate guardé, no-op si muted ou reduced motion
}
export function isMuted(): boolean
export function setMuted(v: boolean): void       // persiste, met master.gain à 0 en 30 ms si true
export function toggleMuted(): boolean
export function subscribe(cb: () => void): () => void
export function useMuted(): [muted: boolean, toggle: () => void]   // useSyncExternalStore
```

Enveloppes : `gain.setValueAtTime(0)` → `linearRampToValueAtTime(peak, t + attack)` →
`exponentialRampToValueAtTime(0.0001, t + dur)`. Toutes les planifications passent par `ctx.currentTime`.

| Fonction | Événement | Synthèse |
|---|---|---|
| `tap` | clic sur tout Button / Chip / MuteToggle | triangle 620 Hz, 45 ms, attack 2 ms, gain .18 |
| `correct(streak)` | bonne réponse | sines C5 523.25 → E5 659.25 (90 ms chacune, detune +4), + G5 783.99 si streak ≥ 3, + C6 1046.5 si streak ≥ 5 (60 ms/note) ; **toutes les fréquences × 2^(min(streak − 1, 12) / 12)** : le joueur entend sa série monter ; gain .25 ; à streak ≥ 5, sparkle = 3 sines aléatoires 2-4 kHz 40 ms gain .06 |
| `wrong` | mauvaise réponse | sawtooth 220 → 110 Hz glissando 220 ms, lowpass 900 Hz, gain .22 (« bwomp ») |
| `streakLost` | erreur alors que streak ≥ 2 (après `wrong`, +120 ms) | bruit blanc bandpass 400 Hz Q 1, 150 ms, gain .15 (« pfff ») |
| `pass` | Passer réussi | bruit bandpass balayé 2000 → 500 Hz, 140 ms, gain .15 (whoosh) |
| `tick(s)` | chaque seconde entière ≤ 10 s | sine `1200 + (10 − s) × 60` Hz (1200 Hz à 10 s → 1740 Hz à 1 s), 25 ms, decay expo, gain .2 ; si s ≤ 3 : joué deux fois (second à +500 ms planifié dans le contexte), gain ×1.5 |
| `warn` | passage ≤ 30 s | sine 1000 Hz 60 ms ×2, espacées de 90 ms, gain .15 |
| `timeUp` | remaining atteint 0 | sawtooth 150 Hz 600 ms avec vibrato LFO 6 Hz ±8 Hz, lowpass 600 Hz, gain .3 |
| `go` | montage de Game en `playing` | triangle G4 392 → B4 494 → D5 587 (80 ms/note) puis G5 784 tenue 200 ms, gain .22 |
| `join` | arrivée de l'adversaire (Lobby) | « ta-da » : E5 659 90 ms, G5 784 90 ms, C6 1047 220 ms, triangle, gain .22 |
| `copy` | code copié | sine 880 Hz ×2 (35 ms, gap 60 ms), gain .15 |
| `toast` | jalons neutres | sine 1200 Hz 40 ms, gain .1 |
| `star` | chaque étoile (Results) | sine 1568 Hz 70 ms, pitch bend +200 cents, gain .15 |
| `win` | Results victoire | fanfare C5 E5 G5 C6 E6 G6 (70 ms/note, square + triangle) + accord C6+E6+G6 400 ms + shimmer bruit bandpass 4 kHz 300 ms, gain .3 |
| `lose` | Results défaite | A4 440, F4 349, D4 294 sines 160 ms/note, gain .18 (doux) |
| `tie` | Results égalité | C5 523 ×2 (120 ms) puis accord C5+E5 300 ms, gain .18 |
| `finished` | `meDone` devient vrai | triangle 523, 659, 784, 1047 × 90 ms, gain .2 (« niveau terminé ») |
| `leadTaken` | je passe en tête | stab sawtooth accord A3 220 + A4 440 + E5 659, 260 ms, lowpass balayé 200 → 3500 Hz, gain .3 |
| `leadLost` | il passe devant | accord mineur A3 220 + C4 262 + E4 330 sawtooth, lowpass 700 Hz, 350 ms + thud sine 55 Hz 120 ms, gain .22 |
| `comeback` | remontée (retard ≥ 3 puis ≥ 0) | riser bruit bandpass 200 → 8000 Hz 450 ms puis stab `leadTaken` transposé D4 294 + F#4 370 + A4 440 |
| `oppHit` | l'adversaire marque | thud sine 80 Hz 90 ms + tick bruit 8 ms, gain .09 (= ×0,5), throttle 1000 ms |
| `countUp` | décompte des scores Results | sine 900 Hz 15 ms, gain .06, throttle 60 ms |

`vibrate` : 15 ms correct, `[30, 40, 30]` faux, `[20, 20, 20]` palier de série, 200 ms au timeUp. Mute coupe aussi vibrate.

---

## 4. Composants partagés

Tous dans `src/components/`. Les props sont des contrats : ne pas les étendre sans mettre à jour cette spec.
Convention : chaque composant accepte `className?: string` fusionnée en dernier.

### 4.1 `src/components/ui.tsx`

```ts
export function Page(p: { children: ReactNode; width?: 'sm' | 'md' | 'lg'; decorated?: boolean; toastHost?: boolean; className?: string })
```
`min-h-dvh flex flex-col items-center px-4 pt-6 pb-20` (le `pb-20` garantit que le MuteToggle fixe ne recouvre jamais un
CTA en bas de page), conteneur `w-full` `max-w-md` (sm, défaut) / `max-w-2xl` (md) / `max-w-3xl` (lg).
`decorated` (défaut `true`) rend `<Blobs/>` (jamais sur Game). Rend toujours `<MuteToggle fixed/>` (bottom-right, z-50) et,
si `toastHost !== false`, `<ToastHost mode="fixed"/>`. Contenu dans le `motion.div` §2.3.

```ts
export function Card(p: { children: ReactNode; tone?: 'white' | 'blue' | 'purple' | 'yellow' | 'green' | 'red'; padding?: 'sm' | 'md' | 'lg'; pop?: boolean; className?: string })
```
`rounded-card border-2 shadow-3d`. Tones : white = `bg-card border-line` ; blue = `bg-blue-soft border-blue/40` ;
purple = `bg-purple-soft border-purple/40` ; yellow = `bg-yellow-soft border-yellow` ; green = `bg-green-soft border-green` ;
red = `bg-red-soft border-red/40`. Padding sm `p-4`, md `p-6` (défaut), lg `p-8`. `pop` → `animate-pop-in`.

```ts
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'blue' | 'danger'; size?: 'md' | 'lg' | 'xl'
  loading?: boolean; icon?: ReactNode; silent?: boolean }
export function Button(p: ButtonProps)
```
Base : `btn-3d focus-ring inline-flex items-center justify-center gap-2 rounded-btn font-body font-black select-none
disabled:cursor-not-allowed`. Tailles : md `h-12 px-5 text-base`, lg `h-14 px-6 text-lg`, xl `h-16 px-7 text-xl w-full`.
Variantes (`--sh` = 4 px, 6 px pour xl) :
primary `bg-green text-ink [--shc:var(--color-green-dark)]` ; blue `bg-blue text-ink [--shc:var(--color-blue-dark)]` ;
secondary `bg-card text-ink border-2 border-line [--shc:var(--color-line-strong)]` ;
ghost `bg-transparent text-ink-soft hover:bg-card shadow-none` (pas de 3D) ;
danger `bg-card text-red-dark border-2 border-red/40 [--shc:var(--color-red-soft)]`.
Disabled : `bg-line text-line-strong` sans ombre. `loading` → icône 🌍 en `animate-spin` + `aria-busy`.
`onClick` joue `sfx.tap()` (sauf `silent`) puis délègue. `onMouseDown={(e) => e.preventDefault()}` pour ne pas garder le
focus (Espace ne doit pas réactiver un bouton cliqué). `type` par défaut `button`.

```ts
export function Input(p: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode })
```
Wrapper `relative flex items-center gap-3` ; input `h-14 w-full rounded-btn border-2 border-line bg-card px-4 font-body
font-extrabold text-xl text-ink placeholder:text-line-strong outline-none transition
focus:border-blue focus:shadow-focus` ; `invalid` → `border-red`. `className` de l'appelant fusionnée sur l'input.

```ts
export function ErrorMsg(p: { children: ReactNode })
```
`null` si `!children`. Sinon `<p role="alert" key={String(children)} className="animate-shake flex items-center gap-2
rounded-btn bg-red-soft px-4 py-3 text-[15px] font-extrabold text-red-dark">⚠️ {children}</p>`.

```ts
export function Chip(p: { active: boolean; disabled: boolean; onClick: () => void; children: ReactNode })
```
`btn-3d focus-ring min-h-11 rounded-chip px-4 font-black text-[15px]`. Inactif `bg-card text-ink border-2 border-line`.
Actif `bg-blue text-ink border-2 border-blue [--shc:var(--color-blue-dark)]` + `key={String(active)}` → `animate-pop-in`
quand il devient actif (la mise à jour Realtime côté invité « pope » aussi). Disabled : `pointer-events-none`, opacité .55
sauf la chip active (opacité 1). Joue `sfx.tap()`.

```ts
export function Keycap(p: { label: string; color: 'red' | 'blue' | 'yellow' | 'green' | 'neutral'; size?: 'sm' | 'md'; pressed?: boolean })
```
Carré `rounded-key font-display font-bold` ; md `h-9 w-9 text-lg`, sm `h-6 min-w-6 px-1 text-xs`. Couleurs :
red `bg-red text-white`, blue `bg-blue text-ink`, yellow `bg-yellow text-ink`, green `bg-green text-ink`,
neutral `bg-card text-ink-soft border-2 border-line`. Ombre `0 3px 0 0 <dark>` ; `pressed` → classe `is-pressed`
(enfoncé). `aria-hidden`.

```ts
export function Divider(p: { children?: ReactNode })          // « ou » : deux lignes pointillées line + texte ink-soft
export function Dots()                                          // <span class="animate-dots" aria-hidden /> trois points
export function Skeleton(p: { className?: string })            // bloc rounded-btn bg-line animate-shimmer
```

### 4.2 Fichiers additionnels

**`Avatar.tsx`**
```ts
export function Avatar(p: { name: string; tone: 'me' | 'opp' | 'neutral'; size?: 28 | 40 | 56 | 72 | 96; crown?: boolean })
```
Cercle 3D (`bg-blue-soft` + ombre `0 4px 0 blue-dark` pour me, `purple-soft`/`purple-dark` pour opp, `card`/`line-strong`
neutral) contenant l'emoji `avatarFor(name)` à 60 % de la taille. `crown` → 👑 absolu au-dessus, `animate-crown-drop`.
`name === ''` → « ? » en `text-line-strong`. `aria-hidden`.

**`src/lib/avatar.ts`** : `avatarFor(name: string): string` — hash djb2 (`h = 5381; h = (h * 33) ^ code`) du pseudo
trim + lowercase, index modulo 16 dans `['🦊','🐸','🐼','🦁','🐙','🦄','🐯','🐨','🦉','🐧','🐰','🐻','🐵','🐲','🦖','🐳']`.
Même pseudo = même animal sur tous les écrans et pour les deux joueurs.

**`Mascot.tsx`**
```ts
export function Mascot(p: { mood: 'idle' | 'party' | 'sleep' | 'sad' | 'think'; size?: 64 | 96 })
```
Bulle blanche ronde 3D (`bg-card`, ombre `0 6px 0 line`) avec 🌍 ; emoji d'humeur superposé bas-droite (party 🥳,
sleep 😴, sad 😅, think 🤔, idle aucun). `animate-float` (`animate-bob` en sleep). `aria-hidden`.

**`MuteToggle.tsx`**
```ts
export function MuteToggle(p: { fixed?: boolean; className?: string })
```
Bouton rond 44 px `btn-3d bg-card border-2 border-line`, 🔊 / 🔇, `aria-pressed={muted}`,
`aria-label="Couper le son"` / `"Activer le son"`, `onMouseDown` preventDefault, `blur()` après clic. Utilise `useMuted()`.
`fixed` → `fixed bottom-4 right-4 z-50`. Au passage muted → non muted, joue `sfx.tap()` pour confirmer.

**`TimerRing.tsx`**
```ts
export const TimerRing: React.MemoExoticComponent<(p: { remaining: number; total: number; size?: 72 | 84 | 96 }) => JSX.Element>
```
Anneau SVG (stroke 8, piste `navy` à 15 %, `stroke-linecap: round`, `stroke-dashoffset` = ratio `remaining / total`,
transition 200 ms linear) autour de `formatTime(remaining)` en Nunito 900 `tabular-nums` `min-w-[5ch]` centré.
Phases : `calm` (> 30 s) bleu, 40 px ; `warn` (≤ 30 s) orange ; `danger` (≤ 10 s) rouge, 48 px, chiffres `animate-tick`
avec `key={secs}` ; ≤ 3 s anneau `animate-ring-blink`. `useEffect` sur `secs = Math.ceil(remaining)` : si `danger && secs > 0`
→ `sfx.tick(secs)`. `role="timer"`, `aria-live={danger ? 'polite' : 'off'}`.
**`React.memo` avec comparateur** : égalité de `Math.ceil(remaining)`, de `Math.round(remaining / total * 200)` (pas de
0,5 %), de `total` et `size` → re-rendu ≤ 2×/s malgré le tick 5×/s de `useTimer`.

**`PlayerBar.tsx`** (refonte, même API de base + options)
```ts
export function PlayerBar(p: { player: PlayerInfo; total: number; isMe: boolean; size?: 'md' | 'lg'; direction?: 'ltr' | 'rtl'; marker?: 'hit' | 'miss' | null; leading?: boolean })
export function SegmentBar(p: { done: number; total: number; tone: 'me' | 'opp' | 'green'; direction?: 'ltr' | 'rtl'; height?: 10 | 14; marker?: 'hit' | 'miss' | null })
export function ScoreBump(p: { value: number; tone: 'me' | 'opp' | 'ink'; className?: string })
```
- `PlayerBar` : Card tone blue (moi) / purple (adversaire), `rounded-card p-3` ; ligne 1 `Avatar 40` + pseudo Nunito 800
  15 px `truncate` + chip « Toi » (`bg-blue text-ink text-[11px]`) ; `ScoreBump` 28 px ; ligne 2 `SegmentBar` ;
  `finished_at` → badge « ✔ Terminé » `bg-green-soft text-green-dark`. `leading` → soulignement 3 px `gold` sous le score
  + tag « LEAD » 10 px gold. `size='lg'` : avatar 56, score 40 px. `direction='rtl'` : contenu en miroir (avatar à droite,
  texte aligné à droite, barre qui se remplit de droite à gauche).
- `SegmentBar` : `total ≤ 30` → `total` segments `flex-1 gap-[2px] rounded-[3px]` (piste `bg-line`), allumés = `done`
  en `bg-blue` / `bg-purple` / `bg-green`, le dernier allumé `animate-pop-in` (`key={done}`) ; `total > 30` → barre
  continue avec `transition: width 300ms` et reflet strié `animate-shimmer`. `done === total` → tout en vert.
  `marker` → pastille 16 px à l'extrémité active (✓ `bg-green` / ✗ `bg-line-strong`), `animate-pop-in`, retirée par le
  parent après 600 ms. `role="progressbar"` avec `aria-valuenow/max`.
- `ScoreBump` : `<span key={value} className="animate-score-bump inline-block font-body font-black tabular-nums">`,
  couleur du bump green (me) / purple (opp).

**`RaceStatus.tsx`**
```ts
export function RaceStatus(p: { me: number; opp: number; hasOpponent: boolean })
```
Chip `rounded-chip px-3 py-1 text-[13px] font-black` : `diff > 0` → « Tu mènes +N » `bg-green-soft text-green-dark` ;
`diff < 0` → « −N derrière » `bg-red-soft text-red-dark` ; `0` → « Égalité » `bg-yellow-soft text-yellow-dark` ;
`!hasOpponent` → « Solo » `bg-line text-ink-soft`. `key={texte}` → `animate-pop-in`.

**`StreakBadge.tsx`**
```ts
export function StreakBadge(p: { streak: number })
```
`AnimatePresence` : `streak < 2` → rien (mais un 💨 `animate-fade-out` 400 ms si la valeur précédente était ≥ 2).
Paliers : 2-4 → 🔥 28 px `text-orange` + « ×N » ; 5-9 → 36 px + halo (`shadow-[0_0_0_6px_rgba(255,150,0,.25)]`) +
« En feu ! » ; 10+ → 44 px + fond dégradé orange → rouge + « Légende ! ». Flamme `animate-flicker` (désactivée en
reduced motion). Entrée `animate-pop-in` à chaque palier. `aria-label="Série de N bonnes réponses"`.

**`AnswerButton.tsx`**
```ts
export const AnswerButton: React.MemoExoticComponent<(p: { index: 0 | 1 | 2 | 3; label: string
  state: 'idle' | 'correct' | 'wrong' | 'reveal' | 'dim'; disabled: boolean; pressed?: boolean
  onClick: () => void; ref?: Ref<HTMLButtonElement> }) => JSX.Element>
```
`btn-3d focus-ring flex w-full min-h-16 sm:min-h-[72px] items-center gap-3 rounded-[20px] px-4 py-3 text-left
bg-card border-2 border-line text-ink font-extrabold` ; texte `text-choice sm:text-choice-lg` ou `text-choice-sm` si
`label.length > 40`, `break-words`. `Keycap` colorée par index (0 red, 1 blue, 2 yellow, 3 green) à gauche, `pressed`
transmis. États : correct → `bg-green border-green-dark text-ink` + ✓ 28 px (`ml-auto`) + `scale-[1.03]` ;
wrong → `bg-red border-red-dark text-white animate-shake` + ✗ 28 px ; reveal → `bg-green-soft border-green-dark`
(la bonne réponse quand on s'est trompé) ; dim → `opacity-40 grayscale`. Disabled : `cursor-default` **sans** opacité
tant que state = idle (lisible pendant `busy`). `aria-label={`Réponse ${index + 1} : ${label}`}`. `onMouseDown`
preventDefault + `e.currentTarget.blur()` après `onClick` (Espace ne doit jamais réactiver le bouton). Aucun listener
clavier. `React.memo` par défaut (props primitives).

**`FlagFrame.tsx`**
```ts
export function FlagFrame(p: { src: string; alt?: string })
```
Boîte `h-[140px] sm:h-[200px] w-full rounded-btn border-2 border-line bg-card overflow-hidden flex items-center
justify-center`, damier discret (`repeating-conic-gradient` line/card 12 px) ; `<img>` `object-contain max-h-full`
`draggable={false}` opacity 0 → 1 (200 ms) au `onLoad` ; `Skeleton` tant que non chargée ; `onError` → 🏳️ + « image
indisponible » 13 px ink-soft. `alt` défaut « Drapeau ».

**`PopText.tsx`**
```ts
export type PopItem = { id: number; text: string; x: number; y: number; tone: 'green' | 'orange' | 'red' }
export function PopLayer(p: { items: PopItem[] })
export function usePopText(): { items: PopItem[]; spawn: (text: string, el: HTMLElement, tone: PopItem['tone']) => void }
```
`spawn` lit `el.getBoundingClientRect()` (centre), ajoute un item, le retire après 700 ms. `PopLayer` = portail `body`,
`fixed inset-0 pointer-events-none z-40`, chaque item `absolute animate-float-up font-display font-bold` 28 px (orange 36 px).

**`Toast.tsx` + `src/lib/toast.ts`**
```ts
// lib/toast.ts — store module-level (useSyncExternalStore), aucun Provider
export type ToastTone = 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple'
export function showToast(t: { text: string; tone?: ToastTone; ms?: number; key?: string; priority?: 0 | 1 | 2 }): void
export function useToast(): { current: { id: number; text: string; tone: ToastTone } | null }
// components/Toast.tsx
export function ToastHost(p: { mode: 'fixed' | 'inline' })
```
File : 1 toast visible, durée `ms` (défaut 1800), **900 ms minimum d'affichage**, max 3 en attente, dédoublonnage par
`key` (un toast de même clé déjà affiché ou en file est ignoré), `priority` 2 remplace immédiatement le courant,
`priority` 0/1 attend. Joue `sfx.toast()` à l'affichage sauf si `tone === 'red'`. `ToastHost` : pill `rounded-chip
px-4 py-2 font-black text-[15px] shadow-pop animate-pop-in` puis `animate-fade-out` ; fonds `-soft` + texte `-dark`
(blue : `bg-blue-soft text-navy`, purple : `bg-purple-soft text-purple-dark`). `mode='fixed'` → `fixed top-4
left-1/2 -translate-x-1/2 z-40 pointer-events-none` ; `mode='inline'` → `h-full flex items-center justify-center`
(dans l'EventStrip). `aria-live="polite"`.

**`CodeTiles.tsx`**
```ts
export function CodeTiles(p: { code: string; onCopy: () => void; copied: boolean })
```
`<button title="Copier" aria-label="Copier le code">` contenant 5 tuiles `h-[68px] w-14 rounded-btn bg-card border-2
border-blue/30 font-display font-bold text-[40px] text-ink` avec ombre `0 5px 0 blue-dark`, `animate-pop-in` avec
`animation-delay: index × 60ms`. `copied` → tuiles `bg-green-soft border-green` 1,5 s. `onClick` → `onCopy` + `sfx.copy()`.

**`PlayerCard.tsx`** (Lobby)
```ts
export function PlayerCard(p: { player: PlayerInfo | null; tone: 'me' | 'opp'; isHost: boolean; isMe: boolean })
```
Rempli : `Card tone blue|purple pop` ; `Avatar 72` ; pseudo Fredoka 600 20 px `truncate` ; badges « 👑 Hôte »
(`bg-yellow-soft text-yellow-dark`) et « Toi » (`bg-blue text-ink`). Vide (`player === null`) : `Card white` bordure
`border-dashed border-line-strong`, `Avatar name="" tone neutral 72 animate-bob`, « En attente d'un adversaire » + `<Dots/>`,
`Mascot sleep 64` en coin.

**`Stars.tsx`**
```ts
export function Stars(p: { score: number; total: number; delay?: number })
```
n = `ratio ≥ .85 ? 3 : ratio ≥ .65 ? 2 : ratio ≥ .4 ? 1 : 0` (ratio = score / total). 3 ⭐ (grises `grayscale opacity-30`
si non gagnées), chacune `animate-pop-in` avec délai `delay + i × 150 ms` et `sfx.star()` via `setTimeout` ; label
« Précision » 12 px ink-soft. `aria-label="N étoiles sur 3"`.

**`AnimatedNumber.tsx`**
```ts
export function AnimatedNumber(p: { value: number; durationMs?: number; tick?: boolean; className?: string })
```
Affiche `useCountUp(value, durationMs ?? 800)` en Nunito 900 `tabular-nums` ; `tick` → `sfx.countUp()` à chaque
changement d'entier. Instantané en reduced motion.

**`ScoreCompare.tsx`** (Results)
```ts
export function ScoreCompare(p: { me: number; opp: number; meName: string; oppName: string; delayMs?: number })
```
Barre unique `h-4 rounded-chip bg-line` : portion bleue depuis la gauche = `me / (me + opp)`, violette depuis la droite,
50/50 si 0-0 ; largeurs animées `transition: width 800ms` déclenchée après `delayMs` ; valeurs aux extrémités, écart
« +N » au centre. Purement illustratif.

**`Blobs.tsx`** : 3 `div` `absolute rounded-full blur-[40px] opacity-70 pointer-events-none -z-10` (blue-soft 420 px
haut-gauche, yellow-soft 360 px bas-droite, green-soft 320 px milieu-droite), `animate-float` 8 / 10 / 12 s, `aria-hidden`,
non rendus en reduced motion.

### 4.3 Hooks et libs partagés

- `src/hooks/usePrevious.ts` : `usePrevious<T>(value: T): T | undefined`.
- `src/hooks/useCountUp.ts` : `useCountUp(target: number, ms = 800): number` (rAF, easeOutCubic, saute à `target` en
  reduced motion, repart de la valeur courante si `target` change).
- `src/hooks/useReducedMotion.ts` : `export { useReducedMotion } from 'motion/react'`.
- `src/lib/confetti.ts` :
  ```ts
  export function celebrate(kind: 'mini' | 'burst' | 'cannon', origin?: HTMLElement | { x: number; y: number }): void
  ```
  Canvas unique créé à la volée (`fixed inset-0 pointer-events-none z-40`, `confetti.create(canvas, { resize: true,
  useWorker: true })`). mini = 24 particules, spread 55, startVelocity 25, ticks 90, couleurs `[green, yellow, blue]` ;
  burst = 80 particules centre, spread 90, couleurs `[green, blue, yellow, purple, gold]` ; cannon = deux tirs
  (origin x 0 et 1, angles 60 / 120, spread 70, 80 particules) répétés 3 fois à 0 / 700 / 1400 ms. No-op si
  `matchMedia('(prefers-reduced-motion: reduce)').matches` ; `disableForReducedMotion: true` en plus.
- `src/lib/streak.ts` : clé `sessionStorage` **`boring-geo:streak:<code>`** = `{ streak: number; best: number }`.
  `loadStreak(code): { streak: number; best: number }` (défaut `{0, 0}`), `saveStreak(code, s): void`, try/catch partout.
- `src/lib/subtype.ts` : `subtypeLabel(subtype: string): string` — map `capitale → CAPITALE`, `continent → CONTINENT`,
  `drapeau → DRAPEAU`, `fleuve → FLEUVE`, `frontiere → FRONTIÈRE`, `montagne → MONTAGNE`, `ocean → OCÉAN`,
  `superficie → SUPERFICIE`, sinon `subtype.toUpperCase()`.
- `src/lib/records.ts` (**V2, optionnel**) : `localStorage` `boring-geo:records` = `{ games, wins, bestScore, bestStreak }` ;
  `loadRecords()`, `applyResult(gameId, { won, score, bestStreak }): { newRecord: boolean }` idempotent par `gameId`
  (`sessionStorage boring-geo:records:applied:<gameId>`).

---

## 5. Gamification client (le score serveur reste l'unique vérité)

### 5.1 Série (streak) — état local de Game

- `streakRef = useRef(loadStreak(code).streak)` + `[streakUi, setStreakUi]` miroir pour le rendu, `bestRef`.
  (Un ref pour ne pas ajouter de dépendance au `useCallback` `answer` existant.)
- Dans `answer()`, **juste après `setFeedback(...)`** : `const ok = res.is_correct` ;
  `const prev = streakRef.current` ; `const next = ok ? prev + 1 : 0` ; `streakRef.current = next` ; `setStreakUi(next)` ;
  `bestRef.current = Math.max(bestRef.current, next)` ; `saveStreak(code, { streak: next, best: bestRef.current })`.
- Passer **ne casse pas** la série (usage tactique) et ne l'alimente pas.
- Effets : `ok` → `sfx.correct(next)`, `sfx.vibrate(15)`, `spawn(next ≥ 5 ? '+1 ⚡' : next ≥ 3 ? '+1 🔥' : '+1',
  buttonRefs[correct], next ≥ 3 ? 'orange' : 'green')`, `celebrate('mini', bouton)` si `next ≥ 3` ;
  `!ok` → `sfx.wrong()`, `sfx.vibrate([30, 40, 30])`, si `prev ≥ 2` → `sfx.streakLost()` + toast
  `{ text: 'Série perdue (×${prev})', tone: 'red', ms: 800, key: 'lost' }` si `prev ≥ 3`.
- Toasts de palier (key `streak3|5|10`, tone orange) : ×3 « 🔥 Série de 3 ! », ×5 « ⚡ Série de 5, imparable ! »,
  ×10 « 👑 Série de 10, légende ! » + `sfx.vibrate([20, 20, 20])`.
- `StreakBadge streak={streakUi}` dans l'EventStrip. Aucun multiplicateur affiché : le score reste +1.

### 5.2 Score vivant

`ScoreBump` keyé sur `player.score` : bump vert (moi) / violet (adversaire). Mon score monte via `refresh()` après la
réponse ; le `+1` flottant est déjà parti du bouton. Pas de son sur l'incrément serveur (déjà `correct`).

### 5.3 Pression adverse — `useOpponentPulse` (hook local à Game, `src/hooks/useOpponentPulse.ts`)

`useOpponentPulse(opp: PlayerInfo | null): { marker: 'hit' | 'miss' | null }` : `usePrevious` sur `answered_count` et
`score` ; jamais au premier rendu ni si `opp` était `null`. `answered_count` monte ET `score` monte → `marker = 'hit'`
+ `sfx.oppHit()` ; `answered_count` monte sans score → `'miss'`. `marker` remis à `null` après 600 ms. Le bump violet
du score fait le reste. Aucun autre son adverse.

### 5.4 Course et annonces — `useRaceEvents` (hook local à Game, `src/hooks/useRaceEvents.ts`)

`useRaceEvents(me: PlayerInfo, opp: PlayerInfo | null, active: boolean)` (`active = game.status === 'playing'`) :
- `diff = me.score − opp.score`, `sign = Math.sign(diff)`, `prevSign = usePrevious(sign)` ; `maxDeficitRef` (retard
  max observé, ≥ 0). Rien au premier rendu (`prevSign === undefined`), rien si `!opp || !active`.
- `prevSign ≤ 0 → sign > 0` : si `maxDeficitRef.current ≥ 3` → toast « 🚀 Remontée ! » (yellow, priority 1, key
  `comeback`) + `sfx.comeback()`, puis `maxDeficitRef = 0` ; sinon toast « 🏁 En tête ! » (green, key `lead`) + `sfx.leadTaken()`.
- `prevSign ≥ 0 → sign < 0` : toast « 😬 Il passe devant ! » (purple, key `lead`) + `sfx.leadLost()`.
- `sign === 0` depuis ≠ 0 : toast « 🤝 Égalité » (yellow, key `lead`, ms 1200) sans son dédié (`sfx.toast`).
- `diff < 0` → `maxDeficitRef = max(maxDeficitRef, −diff)`.
- Le store toast assure 900 ms mini entre deux et le dédoublonnage ; la chip `RaceStatus` reste l'état permanent.

### 5.5 Feedback réponse (dans les 650 ms)

État des 4 boutons dérivé de `feedback` **exactement** comme aujourd'hui :
`!feedback → 'idle'` ; `i === correctIndex → (chosen === correctIndex ? 'correct' : 'reveal')` ; `i === chosen → 'wrong'`
; sinon `'dim'`. Zone `aria-live="polite"` `sr-only` qui affiche « Bonne réponse » / « Mauvaise réponse » pendant le feedback.

### 5.6 Timer dramatique

`TimerRing` (§4.2) + dans Game : `secs = Math.ceil(remaining)` ; refs `warned30`, `warned10`, `timeUpDone` ;
`useEffect` sur `[secs, game?.status]` (jamais dans le rendu) :
- `secs ≤ 30 && !warned30` → toast « ⏱ Plus que 30 s ! » (orange, key `t30`) + `sfx.warn()`.
- `secs ≤ 10 && !warned10` → toast « ⏰ 10 secondes ! » (red, key `t10`, priority 2). Classe `urgent` sur le wrapper
  → `animate-urgent-halo` (bordure rouge statique en reduced motion).
- `remaining <= 0 && game.status === 'playing' && !timeUpDone` → `sfx.timeUp()`, `sfx.vibrate(200)`, toast
  « ⏰ Temps écoulé ! » (red, priority 2, ms 3000), carte question `opacity-50` (`locked` est déjà vrai). L'appel
  `endGameIfExpired` reste dans le `useEffect` existant, inchangé.

### 5.7 Jalons

- « 🚀 GO ! » (blue, ms 600, key `go`) + `sfx.go()` la première fois que `game.status === 'playing'` est observé (ref).
- « ⚡ Mi-parcours ! » (yellow, key `half`) quand `me.answered_count === Math.ceil(total / 2)` (une fois, ref).
- « 🏁 Dernière question ! » (yellow, key `last`) quand `me.remaining === 1` (une fois, ref).
- `meDone` devient vrai → `sfx.finished()` + `celebrate('burst')` une fois (ref).

### 5.8 Célébration finale (Results)

Une seule fois quand `state` arrive (ref) : `iWon` → `celebrate('cannon')` + `sfx.win()` ; `tie` → `celebrate('burst')`
+ `sfx.tie()` ; sinon `sfx.lose()` sans confetti. Couronne `crown` sur l'avatar du gagnant, étoiles, count-up, précision,
barre de duel, badge « PARFAIT ! » si `score === question_count`, « Meilleure série ×N » depuis `loadStreak(code).best`.

---

## 6. Pages

### 6.1 Home (`src/pages/Home.tsx`) — logique inchangée (`run`, `create`, `join`, `existing`, `nick`)

`<Page width="sm">` (blobs on).
1. **Héros** (`mt-6 text-center`) : `Mascot mood="idle" size={96}` ; `h1` Fredoka `text-hero` : « Boring » en ink avec
   une rature (`::after` 4 px `bg-red rotate-[-6deg]`) + « Geo » `text-blue` `text-shadow: 0 4px 0 blue-dark`, `h1`
   incliné `-rotate-2` ; tagline Nunito 700 18 px ink-soft « Course de géo à deux, contre la montre. Zéro ennui garanti. »
2. **Card white pop** (`space-y-5`) :
   - label « Ton pseudo » `text-label uppercase` ; `Input leading={<Avatar name={nick} tone="me" size={56} key={avatarFor(nick)} />}`
     (l'avatar `pop-in` à chaque changement d'emoji), `placeholder="ex. Pierre"`, `maxLength={20}`, `autoFocus`, `value/onChange` inchangés.
   - `<ErrorMsg>{error}</ErrorMsg>`.
   - `Button variant="primary" size="xl" loading={busy} disabled={busy || !nick} onClick={create}` → « Créer une partie 🚀 ».
   - `<Divider>ou</Divider>`.
   - `<form onSubmit={join}>` (inchangé) : `Input` code `className="font-display text-[32px] tracking-[.6em] text-center uppercase"`
     `maxLength={5}` `placeholder="ABCDE"` `autoComplete="off"` `inputMode="text"`, sous lequel 5 tirets (`h-1 rounded`
     `bg-line-strong`, bleus pour `i < code.length`) ; `Button type="submit" variant="blue" size="lg"
     disabled={busy || !nick || code.length < 5}` → « Rejoindre », classe `animate-pulse-glow pulse-glow-blue` quand activable.
     Sous 480 px : colonne, bouton `w-full`.
3. **Partie en cours** (si `existing`) : `Card tone="yellow" padding="sm"` : ⏳ + « Tu as une partie en cours : » + code en
   Fredoka + `Button variant="ghost"` « Reprendre → » (`navigate(`/lobby/${existing.code}`)` inchangé).
4. **Pied** : hint `hint-only` `Keycap size="sm"` × 4 (couleurs 1-4) + `Keycap neutral "␣"` « Passer », 13 px ink-soft.
5. **V2** : tuiles records (🏆 victoires / 🎯 meilleur score / 🔥 meilleure série) si `loadRecords().games > 0`.

Sons : `tap` sur les boutons (automatique). États : `busy` → bouton loading ; `error` → ErrorMsg shake.

### 6.2 Lobby (`src/pages/Lobby.tsx`) — logique inchangée (`act`, `setSettings`, `copyCode`, `leave`, `players`, `isHost`)

`<Page width="md">`.
1. **En-tête** `flex justify-between mb-5` : « Salon » Fredoka `text-title` + chip `bg-blue-soft text-navy text-label`
   avec le label du thème (`THEMES.find(t => t.id === game.theme)?.label`) ; `Button variant="danger" size="md"` « Quitter » → `leave`.
2. **Carte code** `Card tone="blue" pop` centrée : label « Code de la partie » ; `CodeTiles code={game?.code ?? session.code}
   onCopy={copyCode} copied={copied}` ; sous-texte 14 px ink-soft « Clique pour copier · partage-le à ton adversaire »,
   remplacé par « ✓ Copié ! » `text-green-dark` quand `copied` ; quand `copied` passe à `true` → `celebrate('mini', tuiles)`.
3. **Arène VS** `relative grid grid-cols-2 gap-4` (1 colonne sous 380 px) : `PlayerCard player={state.me} tone="me"
   isHost={me.id === host} isMe` ; `PlayerCard player={state.opponent} tone="opp" isHost={…} isMe={false}` ; badge « VS »
   absolu centré (`h-14 w-14 rounded-full bg-yellow text-navy font-display font-bold text-[22px] -rotate-6`, ombre
   `0 4px 0 yellow-dark`). `usePrevious(state?.opponent)` : `null → objet` → toast « 🎉 {nick} a rejoint ! » (green, key
   `join`) + `sfx.join()`. L'ordre `[me, opponent]` du code est conservé.
4. **Réglages** (`if (game)`) `Card white` : titre « Réglages » Nunito 900 18 px + chip `bg-yellow-soft text-yellow-dark`
   « définis par l'hôte 👑 » si `!isHost`. Trois `Setting` (label `text-label uppercase w-24`, `flex-wrap gap-2`) :
   Thème → `THEMES`, Questions → `COUNTS`, Durée → `DURATIONS` (`d / 60` min). `Chip` partagé (§4.1) avec **les mêmes
   `onClick` → `setSettings(...)`** et `disabled={!isHost || busy}`. Les `Setting`/`Chip` locaux sont supprimés (Setting
   reste une fonction locale de 6 lignes ; Chip vient de `ui.tsx`).
5. `<ErrorMsg>{actionError ?? error}</ErrorMsg>`.
6. **Action** : hôte → `Button variant="primary" size="xl" disabled={busy || players.length < 2} onClick={() => act(() =>
   api.startGame(session.token))}` ; libellé « En attente de l'adversaire… » (+ `<Dots/>`) si `< 2`, sinon « Démarrer la
   course 🏁 » + `animate-pulse-glow`. Invité → `Card tone="yellow"` centrée : `Mascot mood="sleep" size={64}`,
   « L'hôte lance la partie dans un instant » + `<Dots/>`.

Navigation `useEffect` sur `game.status` inchangée. Chargement (`!state`) : Skeleton de la carte code + « Chargement… ».

### 6.3 Game (`src/pages/Game.tsx`) — logique inchangée (voir §0.1)

`<Page width="lg" decorated={false} toastHost={false} className={urgent ? 'urgent' : ''}>`. Ajouts d'état autorisés :
`pressedKey`, `streakRef/streakUi/bestRef`, refs de jalons, `buttonRefs`, `usePopText`, `useOpponentPulse`, `useRaceEvents`.

**Composant `Hud` (`src/components/Hud.tsx`, propriété Game)** :
```ts
export function Hud(p: { me: PlayerInfo; opponent: PlayerInfo | null; total: number; remaining: number; duration: number; marker: 'hit' | 'miss' | null })
```
`sticky top-0 z-20 bg-canvas/95 rounded-b-card pb-3` (pas de `backdrop-filter` sous 640 px), grille
`grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] gap-x-3 gap-y-2 items-center` :
- Ligne A : gauche `Avatar 28|40` + pseudo 15 px `truncate` + chip « Toi » + `ScoreBump` 28 px (soulignement gold + « LEAD »
  si `me.score > opp.score`) ; centre `TimerRing remaining total={duration} size={72}` (84 ≥ 640 px) `row-span-2` ;
  droite = miroir (score, pseudo, avatar alignés à droite ; « LEAD » si l'adversaire mène).
- Ligne B : gauche `SegmentBar done={me.answered_count} total tone="me"` ; droite `SegmentBar … tone="opp"
  direction="rtl" marker={marker}` — les deux barres **se font face** et convergent vers le timer.
- `RaceStatus` absolu, `left-1/2 -translate-x-1/2 -bottom-3`, `hasOpponent={!!opponent}`.
- `opponent === null` → colonne droite : carte `border-dashed` « 💤 Adversaire déconnecté ».
Hauteur totale ≤ 112 px mobile. Sous 380 px le pseudo est masqué (avatar + score seulement).

**Zones (dans l'ordre)** :
1. `<Hud …/>`.
2. **EventStrip** `h-11 relative flex items-center` : `StreakBadge streak={streakUi}` à gauche (absolu), `<ToastHost mode="inline"/>` centré.
3. `<ErrorMsg>{actionError ?? error}</ErrorMsg>` (hors flux réservé : c'est un cas rare).
4. **Carte question** (`if (!meDone && shown)`) : `<Card padding="md" className="animate-question-in shadow-pop
   sm:p-8" key={shown.id}>` ; classe `animate-slide-back` à la place si `lastActionRef.current === 'pass'` (posé dans
   `pass()` après succès, remis à `null` au changement de `shown.id`) :
   - méta `flex gap-2` : chip `bg-blue-soft text-navy text-label` « Question {state.me.answered_count + 1} » + chip
     `border-2 border-line text-ink-soft text-label` `{subtypeLabel(shown.subtype)}` ;
   - `h2` `text-question font-black min-h-[3.6em] mt-3` `{shown.prompt}` (`text-wrap: balance`) ;
   - `shown.image_url && <FlagFrame src={shown.image_url} />` (`mt-4`) ;
   - grille `mt-6 grid gap-3 sm:grid-cols-2` : 4 `AnswerButton index={i} label={c} state={…§5.5} disabled={locked}
     pressed={pressedKey === i} onClick={() => void answer(i)} ref={(el) => { buttonRefs.current[i] = el }}` ;
   - pied `mt-5 flex items-center justify-between` : hint `hint-only` keycaps « 1 2 3 4 · ␣ Passer » (la keycap
     `pressedKey` enfoncée) ; `Button variant="secondary" size="lg" onClick={() => void pass()} disabled={locked ||
     state.me.remaining <= 1}` « Passer ⏭ ». Sous 640 px le bouton Passer est `w-full` sous le hint.
   - `<p className="sr-only" aria-live="polite">{feedback ? (feedback.chosen === feedback.correctIndex ? 'Bonne réponse' : 'Mauvaise réponse') : ''}</p>`.
5. **État `meDone`** (même condition qu'aujourd'hui) : `Card white padding="lg" text-center` : `Mascot mood="party"`,
   « Terminé ! » Fredoka `text-title`, « Tu as répondu à toutes les questions. Résultats dès que {opp.nickname} a fini ou
   que le temps est écoulé… » (ou « …dès que le temps est écoulé. » si `!opponent`), puis
   `PlayerBar player={opponent} total isMe={false} size="lg" marker={marker}` + « {nick} : {answered}/{total} » + `<Dots/>`.
6. **Chargement** : `!state || !game` → `Page` avec `Mascot think` + 3 `Skeleton` + « Chargement… » ink-soft ;
   `!shown` (question null, non terminé) → Skeleton de carte + « Chargement de la question… ».
7. `<PopLayer items={items} />` (portail).

**Clavier** : dans le `onKey` existant, ajouter uniquement `if (i >= 0) { setPressedKey(i); window.setTimeout(() =>
setPressedKey(null), 120) }` avant `void answer(i)`. Pas de second listener.
**Sons/effets dans `answer()`** : §5.1, après `setFeedback` ; rien dans la branche `ApiError` silencieuse.
**`pass()`** : après `await api.passQuestion(...)` → `lastActionRef.current = 'pass'` + `sfx.pass()`.
**Responsive** : 375 × 667 sans drapeau → HUD + strip + question 2 lignes + 4 réponses visibles sans scroll ; avec
drapeau, seul le pied peut nécessiter ≤ 160 px de scroll (Espace reste utilisable).

### 6.4 Results (`src/pages/Results.tsx`) — logique inchangée (`iWon`, `tie`, `ranked`, `newGame`, redirections)

`<Page width="sm">`.
1. **Héros** (`mt-8 text-center`) : `Mascot mood={tie ? 'idle' : iWon ? 'party' : 'sad'} size={96}` ; titre Fredoka
   `text-hero animate-pop-in` : « Victoire ! » `text-green` (`text-shadow 0 4px 0 green-dark`) / « Égalité ! »
   `text-yellow` (yellow-dark) / « Pas cette fois… » `text-blue` (blue-dark) ; sous-titre ink-soft
   « {question_count} questions · {duration_seconds / 60} min · {label du thème} » ; défaite : ligne « À 1 point ! » si
   `|me.score − opp.score| === 1`, sinon « Revanche ? ». Célébration + son une fois (§5.8).
2. **Podium** `Card white padding="sm" className="space-y-3 mt-6"` : pour chaque `p` de `ranked` (ordre conservé, index i) :
   ligne `rounded-btn p-3 flex items-center gap-3` — gagnant (`p.id === winnerId`) : `bg-green-soft border-2 border-gold`,
   ombre `0 6px 0 yellow-dark`, `scale-[1.02]`, 🏆 ; perdant : `bg-card border-2 border-line` ; égalité : les deux
   `bg-yellow-soft border-yellow` + 🤝. Contenu : rang Fredoka 24 px `text-line-strong` ; `Avatar 56 tone={p.id === me.id
   ? 'me' : 'opp'} crown={p.id === winnerId}` ; pseudo Nunito 900 18 px + chip « Toi » ; méta 13 px ink-soft
   « {answered_count}/{question_count} répondues{finished_at && ' · a tout terminé'} » ; ligne « Précision {pct} % »
   (`score / answered_count`, « — » si 0 répondue) ; `SegmentBar done={answered_count} total tone height={10}` ;
   `Stars score total delay={400 + i * 300}` ; badges : « ✔ Terminé » (finished_at, `bg-green-soft`), « PARFAIT ! »
   (`score === question_count`, `bg-yellow text-ink font-display -rotate-3 animate-pop-in`) ; pour ma ligne, si
   `loadStreak(code).best ≥ 2` : « 🔥 Meilleure série : ×{best} » `bg-orange/15 text-orange-dark`. À droite :
   `AnimatedNumber value={p.score} tick className="text-score-xl"` en `text-blue` (moi) / `text-purple` (lui),
   les lignes montent en cascade (`animate-pop-in`, délai `i × 120 ms`).
3. **Duel** (`if (opp)`) : `ScoreCompare me={me.score} opp={opp.score} meName oppName delayMs={900}` dans une
   `Card padding="sm" className="mt-4 hide-short"` ; la classe `hide-short` (fondations, index.css) la masque sous 600 px
   de hauteur d'écran pour que le bouton « Nouvelle partie » reste visible sans scroll.
4. **Actions** `mt-6 space-y-3` : `Button variant="primary" size="xl" onClick={newGame}` « Nouvelle partie 🔁 » ; note
   12 px ink-soft centrée « Même adversaire ? Crée une partie et renvoie-lui le code. » puis « Le score est calculé par le
   serveur. » `text-line-strong`. **V2** : `navigator.share` → `Button variant="ghost"` « Partager le score ».
5. Chargement : `Mascot think` + Skeleton + « Chargement… ». Reduced motion : titre sans pop, count-up instantané, pas de
   confettis, étoiles sans cascade.

---

## 7. Dépendances, fichiers, propriété

### 7.1 npm

```bash
npm install motion canvas-confetti
npm install -D @types/canvas-confetti
```
Imports autorisés : `import { motion, AnimatePresence, useReducedMotion } from 'motion/react'` ;
`import confetti from 'canvas-confetti'`. Rien d'autre.

### 7.2 Répartition (5 développeurs en parallèle)

| Owner | Fichiers (créer ✚ / modifier ✎) |
|---|---|
| **Dev F — Fondations** | ✎ `index.html`, ✎ `src/index.css`, ✎ `src/components/ui.tsx`, ✎ `src/components/PlayerBar.tsx`, ✚ `src/lib/sound.ts`, ✚ `src/lib/confetti.ts`, ✚ `src/lib/avatar.ts`, ✚ `src/lib/subtype.ts`, ✚ `src/lib/streak.ts`, ✚ `src/lib/toast.ts`, ✚ `src/components/{Avatar,Mascot,MuteToggle,TimerRing,RaceStatus,StreakBadge,AnswerButton,FlagFrame,PopText,Toast,CodeTiles,PlayerCard,Stars,AnimatedNumber,ScoreCompare,Blobs}.tsx`, ✚ `src/hooks/{usePrevious,useCountUp,useReducedMotion}.ts`, `package.json` (deps) |
| **Dev H — Home** | ✎ `src/pages/Home.tsx` |
| **Dev L — Lobby** | ✎ `src/pages/Lobby.tsx` |
| **Dev G — Game** | ✎ `src/pages/Game.tsx`, ✚ `src/components/Hud.tsx`, ✚ `src/hooks/useOpponentPulse.ts`, ✚ `src/hooks/useRaceEvents.ts` |
| **Dev R — Results** | ✎ `src/pages/Results.tsx`, ✚ `src/lib/records.ts` (V2 uniquement) |

Règles de collaboration :
1. **Dev F livre d'abord des stubs typés** (toutes les signatures ci-dessus, rendu minimal) dans l'heure, puis remplit.
   Les pages codent contre les signatures de cette spec, pas contre l'implémentation.
2. Une page ne crée jamais de composant partagé et ne modifie jamais `ui.tsx` / `index.css` / `sound.ts`. Besoin d'un
   token ou d'une keyframe manquante → demande à Dev F (ou classe locale inline en attendant).
3. Un fichier = un owner. Les hooks spécifiques (`useOpponentPulse`, `useRaceEvents`, `Hud`) appartiennent à Game.
4. Chaque owner exécute `npm run build` avant de pousser ; l'intégration se fait dans l'ordre F → H/L/R → G.
5. Textes existants conservés tels quels lorsqu'ils sont cités entre guillemets dans cette spec ; les nouveaux libellés
   sont ceux de la spec (pas de variantes).

### 7.3 Checklist d'acceptation

- [ ] `npm run build` passe ; `npm run lint` sans erreur ; aucun import inutilisé.
- [ ] Question + réponses toujours ink sur blanc, réponses ≥ 64 px, zéro saut de layout entre deux questions (mesurer
      avec un prompt de 3 lignes puis 1 ligne, avec et sans drapeau).
- [ ] 1-4 / Espace / P fonctionnent, `e.repeat` ignoré, Espace après un clic souris sur Passer ne déclenche pas deux fois.
- [ ] Timer : tick uniquement ≤ 10 s, une fois par seconde (deux ≤ 3 s), jamais empilé sur correct/wrong ; halo urgent.
- [ ] Mute persistant après rechargement ; aucun son avant le premier geste ; vibrate coupé par mute.
- [ ] `prefers-reduced-motion` : pas de confettis, pas de blobs, count-up instantané, couleurs de feedback intactes.
- [ ] Mobile 375 × 667 : Home sans scroll, Game sans drapeau sans scroll, HUD ≤ 112 px, Results bouton visible.
- [ ] GitHub Pages (`VITE_BASE=/boring-geo/`) : aucun asset cassé (aucun chemin absolu ajouté).
- [ ] Lecteur d'écran : « Bonne réponse / Mauvaise réponse » annoncés, `aria-label` des réponses, `aria-pressed` du mute.
