# Boring Law

Révise ton cours en solo ou jusqu'à 10, contre la montre. Zéro ennui garanti.

Boring Law est un jeu web d'apprentissage gamifié : une course de quiz contre la montre, en solo, en duel ou jusqu'à 10 joueurs, chacun sur son ordi, pour réviser un cours sans s'ennuyer. Les modes sont regroupés par cours (table `modes`) : « Anglais CEDH · S7 » (tout le programme, annales, procédure, article par article, théorie et principes, vocabulaire, pièges) et « Culture G » (géographie, drapeaux, histoire). En fin de partie, un écran de révision reprend toutes les questions avec la bonne réponse et son explication.

## Documentation

Ce fichier est le résumé pour un visiteur pressé. La documentation complète est dans [`docs/`](docs/README.md) ; commence par l'index [docs/README.md](docs/README.md), qui oriente selon ce que tu veux faire (jouer, développer, ajouter un cours, déployer).

| Document | Contenu |
|---|---|
| [docs/README.md](docs/README.md) | Index : le projet en dix lignes, par où commencer, conventions communes. |
| [docs/architecture.md](docs/architecture.md) | Vue d'ensemble front / Supabase, flux d'une partie, responsabilités client / serveur. |
| [docs/game-rules.md](docs/game-rules.md) | Les règles telles qu'elles sont codées en SQL : démarrage, file de questions, score, fin de partie, vainqueur, classement, solo / duel / groupe. |
| [docs/database.md](docs/database.md) | Schéma, RPC publiques, helpers, RLS, Realtime, migrations `0001` → `0007`, seed. |
| [docs/frontend.md](docs/frontend.md) | Routes, pages, hooks, composants, libs, stockage local. |
| [docs/content.md](docs/content.md) | Banques de questions (`data/questions/`, `data/courses/`), pipeline de seed, table `modes`, procédures d'ajout / correction. |
| [docs/deployment.md](docs/deployment.md) | Vercel + miroir GitHub Pages, variables d'environnement, application des migrations, exploitation. |
| [docs/development.md](docs/development.md) | Installation, scripts, test à plusieurs en local, tests SQL, conventions, pièges connus, FAQ. |
| [docs/design-spec.md](docs/design-spec.md) | La spec de design « Globe Pop! » : tokens, motion, sons, composants, page par page. |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Historique des évolutions, commit par commit, avec l'ordre des migrations en annexe. |

## Stack

- Front : Vite + React + TypeScript + Tailwind v4, déployé sur Vercel (miroir GitHub Pages, voir [docs/deployment.md](docs/deployment.md))
- Backend : Supabase (Postgres + RPC `security definer` + Realtime). Toute la logique de jeu est en SQL (`supabase/migrations`).

## Règles

- Un joueur crée une partie, les autres (jusqu'à 10 joueurs) rejoignent avec le code à 5 lettres ; l'hôte peut aussi lancer seul.
- X questions QCM (défaut 20), même set et même ordre pour tout le monde ; chacun avance à son rythme.
- Timer global (défaut 2 min). Bonne réponse = +1, mauvaise = 0 et on avance, « passer » remet la question en fin de file.
- La partie s'arrête à la fin du timer ou quand **tous** les joueurs ont répondu à toutes leurs questions (ceux qui finissent en premier attendent les autres). Le plus de points gagne ; en solo, on juge la précision.

Détail et cas limites : [docs/game-rules.md](docs/game-rules.md).

## Dev

```bash
npm install
cp .env.example .env.local   # puis renseigner l'URL et la clé anon Supabase
npm run dev
```

Pour tester à 2 en local, ouvrir un second serveur sur un autre port (`npm run dev -- --port 5174`) : origine différente = localStorage séparé. Pour 3 à 10 joueurs, migrations, tests SQL et pièges (Git Bash / MSYS…) : [docs/development.md](docs/development.md).

## Questions

Sources : `data/questions/<theme>.json` (format simple : 406 géo, 252 histoire) et `data/courses/<theme>.json` (format riche avec explication, difficulté, source : 250 questions `echr-anglais-s7`). `node scripts/gen-seed-sql.mjs <theme>` génère `supabase/migrations/0003_seed_<theme>.sql` (les 4 choix sont mélangés de façon déterministe).

Un **mode** est soit un thème entier (`geo`, `histoire`), soit un sous-ensemble de sous-types (`geo:drapeau`, `echr:annales`) : `_pick_questions` filtre sur `theme` et, si présent, sur `subtypes`. Les modes vivent dans la table `modes` (`supabase/migrations/0005_courses_modes_review.sql`, colonnes `id, course, theme, label, description, emoji, subtypes, sort`) et sont lus côté client par `useModes()` (`src/hooks/useModes.ts`). Ajouter un mode = une ligne dans `modes` ; ajouter un thème = nouveau JSON + seed (`scripts/seed-remote.mjs`, voir les commentaires) + ses lignes dans `modes`. Le mode proposé par défaut est `DEFAULT_MODE` (`src/types.ts`). Procédures complètes : [docs/content.md](docs/content.md).
