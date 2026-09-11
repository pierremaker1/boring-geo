# Boring Law

Révise ton cours à deux, contre la montre. Zéro ennui garanti.

Boring Law est un jeu web d'apprentissage gamifié : une course de quiz à 2 joueurs, chacun sur son ordi, pour réviser un cours sans s'ennuyer. Les modes sont regroupés par cours (table `modes`) : « Anglais CEDH · S7 » (tout le programme, annales, procédure, article par article, théorie et principes, vocabulaire, pièges) et « Culture G » (géographie, drapeaux, histoire). En fin de partie, un écran de révision reprend toutes les questions avec la bonne réponse et son explication.

## Stack

- Front : Vite + React + TypeScript + Tailwind v4, déployé sur Vercel
- Backend : Supabase (Postgres + RPC `security definer` + Realtime). Toute la logique de jeu est en SQL (`supabase/migrations`).

## Règles

- Un joueur crée une partie, l'autre rejoint avec le code à 5 lettres.
- X questions QCM (défaut 20), même set et même ordre pour les deux ; chacun avance à son rythme.
- Timer global (défaut 2 min). Bonne réponse = +1, mauvaise = 0 et on avance, « passer » remet la question en fin de file.
- La partie s'arrête à la fin du timer ou quand **les deux** joueurs ont répondu à toutes leurs questions (celui qui finit en premier attend l'autre). Le plus de points gagne.

## Dev

```bash
npm install
cp .env.example .env.local   # puis renseigner l'URL et la clé anon Supabase
npm run dev
```

Pour tester à 2 en local, ouvrir un second serveur sur un autre port (`npm run dev -- --port 5174`) : origine différente = localStorage séparé.

## Questions

Source : `data/questions/<theme>.json` (406 géo, 252 histoire). `node scripts/gen-seed-sql.mjs <theme>` génère `supabase/migrations/0003_seed_<theme>.sql` (les 4 choix sont mélangés de façon déterministe).

Un **mode** est soit un thème entier (`geo`, `histoire`), soit un sous-ensemble de sous-types (`geo:drapeau`) : `_pick_questions` filtre sur `theme` et, si présent, sur `subtypes`. Les modes vivent dans la table `modes` (`supabase/migrations/0005_courses_modes_review.sql`, colonnes `id, course, theme, label, description, emoji, subtypes, sort`) et sont lus côté client par `useModes()` (`src/hooks/useModes.ts`). Ajouter un mode = une ligne dans `modes` ; ajouter un thème = nouveau JSON + seed (`scripts/seed-remote.mjs`, voir les commentaires) + ses lignes dans `modes`. Le mode proposé par défaut est `DEFAULT_MODE` (`src/types.ts`).
