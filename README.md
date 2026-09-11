# Boring Geo

Course de culture générale à 2 joueurs, contre la montre. Modes : Géographie, Drapeaux (100 % drapeaux), Histoire.

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

Un **mode** est soit un thème entier (`geo`, `histoire`), soit un sous-type (`geo:drapeau`) : `_pick_questions` filtre sur `theme` et, si présent, sur `subtype`. Ajouter un mode = entrée dans `THEMES` (`src/types.ts`) ; ajouter un thème = nouveau JSON + seed (`scripts/seed-remote.mjs`, voir les commentaires) + entrée dans `THEMES`.
