# Déploiement et exploitation

Ce document décrit comment Boring Law est hébergé, comment on le met en production et comment on le surveille.
Il complète le [README](../README.md) (démarrage local), l'[architecture](architecture.md) (moteur de jeu) et la
[spec design](design-spec.md) (UI). Tout ce qui suit a été vérifié dans le code du dépôt et sur les services
(`gh`, `vercel`, Supabase) au moment de la rédaction.

## 1. Vue d'ensemble

Le projet est une SPA statique (Vite + React) qui parle à **un seul backend** Supabase. Le même bundle est
publié sur **deux hébergements**, qui pointent vers la même base : un joueur sur Vercel peut donc jouer avec un
joueur sur GitHub Pages, il suffit de partager le code de partie.

```text
                 push sur main
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
  Vercel (Git integration)     GitHub Actions (pages.yml)
  npm run build                npm run build:pages  (VITE_BASE=/boring-law/)
  https://boring-law.vercel.app     https://pierremaker1.github.io/boring-law/
        │                            │
        └────────────┬───────────────┘
                     ▼
        Supabase  kqgdlfrirkisxcdodcdj  (Postgres 17, RPC security definer, Realtime)
```

| Élément | Valeur |
|---|---|
| Dépôt | `https://github.com/pierremaker1/boring-law` (public, branche par défaut `main`) |
| Prod principale | `https://boring-law.vercel.app` |
| Miroir | `https://pierremaker1.github.io/boring-law/` |
| Backend | projet Supabase `kqgdlfrirkisxcdodcdj`, région `eu-west-3` (Paris), plan Free |
| Build | `npm run build` = `tsc -b && vite build` (`package.json`) |
| Node | 24.x sur Vercel, `node-version: 24` dans le workflow, v24 en local |

Il n'y a **aucun serveur applicatif** : toute la logique de jeu est dans les fonctions SQL de
`supabase/migrations/`, appelées par `src/lib/api.ts` via `supabase.rpc(...)`. Déployer le front ne change donc
jamais les règles du jeu ; déployer une migration, si.

## 2. Les deux hébergements

### 2.1 Vercel (production principale)

| Paramètre | Valeur (`vercel project inspect boring-law`) |
|---|---|
| Projet | `boring-law` (id `prj_iBEKLB8xecqJrYD6Ny2RUXDVfqp5`), équipe `pierremaker1s-projects` |
| Framework preset | Vite (build `npm run build`, sortie `dist/`) |
| Déclencheur | Git integration : chaque push sur `main` produit un déploiement **Production** |
| Alias de prod | `boring-law.vercel.app`, `boring-law-git-main-pierremaker1s-projects.vercel.app`, `boring-law-pierremaker1s-projects.vercel.app`, et l'ancien `boring-geo.vercel.app` (redirection 308 vers le nouveau) |
| Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — environnement **Production uniquement** |

Le routage SPA est assuré par `vercel.json` :

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Toute URL (`/lobby/ABCDE`, `/game/ABCDE`, `/results/ABCDE`) renvoie `index.html` en **200**, et
`react-router-dom` (`src/App.tsx`) fait le reste. Le dossier `.vercel/` (lien local vers le projet, créé par
`vercel link`) est ignoré par git.

Piège : les variables ne sont définies que pour Production. Un déploiement **Preview** (branche ou PR) serait
construit sans `VITE_SUPABASE_URL` et `createClient` (`src/lib/supabase.ts`) planterait au chargement. Si on
travaille par branches, ajouter les deux variables à l'environnement Preview (`vercel env add ... preview`).

### 2.2 GitHub Pages (miroir)

Configuré en mode *workflow* (`gh api repos/pierremaker1/boring-law/pages` → `"build_type": "workflow"`,
HTTPS forcé). Le workflow `.github/workflows/pages.yml` :

- se déclenche sur `push` vers `main` et manuellement (`workflow_dispatch`) ;
- job `build` : `actions/checkout@v4`, `actions/setup-node@v4` (Node 24, cache npm), `npm ci`,
  puis `npm run build:pages` avec `VITE_BASE=/boring-law/` et les deux secrets Supabase ;
  `actions/upload-pages-artifact@v3` publie `dist/` ;
- job `deploy` : `actions/deploy-pages@v4` sur l'environnement `github-pages` ;
- `concurrency: group: pages, cancel-in-progress: true` : deux pushes rapprochés n'empilent pas les déploiements.

Un run complet dure environ 35 s (`gh run list`).

Le script `build:pages` (`package.json`) est :

```json
"build:pages": "vite build && node -e \"require('fs').copyFileSync('dist/index.html','dist/404.html')\""
```

Deux différences avec Vercel, à connaître :

1. **Base path.** `vite.config.ts` lit `VITE_BASE` (`base: process.env.VITE_BASE ?? '/'`). Le bundle est donc
   servi sous `/boring-law/assets/...` et `BrowserRouter` reçoit `basename={import.meta.env.BASE_URL}`
   (`src/App.tsx`). C'est pour cela que la contrainte « aucun chemin d'asset absolu » existe : un `/icons.svg`
   en dur marcherait sur Vercel et casserait sur Pages.
2. **Fallback SPA en 404.** GitHub Pages ne sait pas réécrire ; on copie `index.html` en `404.html`. Une URL
   profonde (`/boring-law/lobby/ABCDE`) répond **HTTP 404 mais avec le HTML de l'app**, qui démarre et route
   normalement. C'est attendu : ne pas « corriger » ce 404.

### 2.3 Pourquoi deux hébergements

Le DNS du réseau universitaire bloque `*.vercel.app` (commit `13cfa63`, commentaire en tête de `pages.yml`).
Sur place, seul le lien GitHub Pages fonctionne ; partout ailleurs, Vercel est plus rapide (pas de sous-chemin,
rewrite propre). On partage donc le lien Pages aux étudiants sur le campus et le lien Vercel sinon.

### 2.4 Tableau comparatif

| | Vercel | GitHub Pages |
|---|---|---|
| URL | `https://boring-law.vercel.app` | `https://pierremaker1.github.io/boring-law/` |
| Commande de build | `npm run build` (**avec** `tsc -b`) | `npm run build:pages` (**sans** type-check) |
| `VITE_BASE` | `/` (défaut) | `/boring-law/` |
| Route profonde | 200 (rewrite) | 404 + `404.html` |
| Source des variables | env Vercel (Production) | secrets GitHub |
| Redéploiement manuel | `vercel --prod` | `gh workflow run pages.yml` |
| Rollback | `vercel rollback <url>` | `gh run rerun <id>` ou `git revert` |

Conséquence de la ligne « type-check » : une erreur TypeScript fait échouer Vercel mais **pas** Pages. Toujours
lancer `npx tsc --noEmit -p tsconfig.app.json` avant de pousser.

Les sessions (`localStorage`, clé `boring-geo:session` dans `src/lib/session.ts`) sont **par origine** : une
partie créée sur Vercel n'apparaît pas automatiquement sur Pages dans le même navigateur, mais on peut la
rejoindre avec son code depuis n'importe quel hébergement.

## 3. Variables d'environnement

Deux variables, lues dans `src/lib/supabase.ts` :

```ts
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

Vite n'expose au navigateur que les variables préfixées `VITE_`, et les **inline au build**. Changer une
valeur sur Vercel ou GitHub n'a donc d'effet qu'au prochain déploiement.

| Où | Fichier / commande | Remarques |
|---|---|---|
| Local | `.env.local` | ignoré par git (`*.local` et `.env.local` dans `.gitignore`) ; modèle : `.env.example` |
| Vercel | `vercel env ls` / `vercel env add VITE_SUPABASE_URL production` | déjà définies pour Production |
| GitHub | `gh secret list --repo pierremaker1/boring-law` / `gh secret set VITE_SUPABASE_URL --repo pierremaker1/boring-law` | secrets `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` |

`.env.example` :

```dotenv
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx
```

La clé est une clé **publishable** Supabase (préfixe `sb_publishable_`). Elle est publique par construction :
elle finit dans le bundle JS. La sécurité repose sur RLS (`0001_schema.sql` : seules `games`, `players` et
`modes` sont lisibles, rien n'est modifiable directement) et sur les RPC `security definer` qui exigent le
token secret du joueur (`player_tokens`). Ne jamais mettre la clé `service_role` dans une variable `VITE_*`.

`vercel env pull` réécrit `.env.local` avec les valeurs Vercel : pratique pour resynchroniser, mais il écrase le
fichier.

## 4. Supabase

### 4.1 Projet

| Paramètre | Valeur |
|---|---|
| Nom dans le dashboard | `boring-geo` (pas renommé, voir §7) |
| Ref / URL API | `kqgdlfrirkisxcdodcdj` → `https://kqgdlfrirkisxcdodcdj.supabase.co` |
| Dashboard | `https://supabase.com/dashboard/project/kqgdlfrirkisxcdodcdj` |
| Région | `eu-west-3` (Paris) |
| Postgres | 17.6 |
| Plan | Free |

Tables (`0001_schema.sql`, `0005_courses_modes_review.sql`) : `questions`, `games`, `players`,
`player_tokens`, `answers`, `modes`. Contenu vérifié en base : 250 questions `echr-anglais-s7`, 406 `geo`,
252 `histoire`, 10 lignes dans `modes`.

Il n'y a pas de `supabase/config.toml` : le projet n'est **pas lié à la CLI Supabase**. Les migrations sont
appliquées à la main (voir §4.4). Ne pas lancer `supabase db push` sans avoir d'abord réconcilié l'historique,
sinon la CLI tentera de rejouer tous les fichiers.

### 4.2 Realtime

Le front s'abonne aux changements Postgres (`src/hooks/useGame.ts`) :

```ts
supabase.channel(`game:${session.game_id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'games',   filter: `id=eq.${session.game_id}` }, ...)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${session.game_id}` }, ...)
```

Pour que cela fonctionne, `0001_schema.sql` fait trois choses, toutes vérifiées en base :

```sql
create policy "games readable"   on games   for select to anon, authenticated using (true);
create policy "players readable" on players for select to anon, authenticated using (true);
alter publication supabase_realtime add table games, players;
alter table games replica identity full;
alter table players replica identity full;
```

Vérification rapide (SQL Editor) :

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- attendu : games, players
```

Si Realtime tombe, le jeu continue : `useGame` garde un **poll de secours toutes les 5 s** (`setInterval(...,
5000)`). Symptôme d'un Realtime cassé : le salon met jusqu'à 5 s à afficher un nouveau joueur au lieu d'être
instantané.

### 4.3 Migrations : fichiers et historique distant

Les fichiers du dépôt sont la source de vérité :

| Fichier | Rôle |
|---|---|
| `0001_schema.sql` | tables, RLS, publication Realtime |
| `0002_functions.sql` | RPC de jeu (`create_game`, `join_game`, `start_game`, `get_state`, `submit_answer`, `pass_question`, `end_game_if_expired`) et helpers `_*` |
| `0003_seed_geo.sql`, `0003_seed_histoire.sql`, `0003_seed_echr-anglais-s7.sql` | banques de questions (générées, voir §4.5) |
| `0004_modes_and_end_rule.sql` | modes `theme:subtype`, fin de partie quand tous ont fini |
| `0005_courses_modes_review.sql` | colonnes pédagogiques, table `modes`, `get_review` |
| `0006_multiplayer.sql` | `games.max_players`, 1 à 10 joueurs, `get_state` avec `players[]` et `rank` |
| `0007_rank_by_score.sql` | `get_state` : rang « compétition » (1, 1, 3) sur le score seul, aligné sur `winner_player_id` |

Historique distant (`list_migrations`) : `schema`, `functions`, `fix_gen_code`, `modes_and_end_rule`,
`courses_modes_review`, `multiplayer`, `multiplayer_rank_cast`, `rank_by_score`, `rank_by_score_fix`. Trois
entrées (`fix_gen_code`, `multiplayer_rank_cast`, `rank_by_score_fix`) sont des correctifs appliqués à chaud
puis **repliés dans les fichiers** `0002`, `0006` et `0007` ; les seeds n'apparaissent pas dans l'historique
car ils ont été chargés hors `apply_migration` (SQL editor ou RPC temporaire `admin_seed_questions`, §4.5 :
aucune de ces deux voies n'alimente `schema_migrations`). La convention de nommage distant est le nom du
fichier sans préfixe numérique.

### 4.4 Appliquer une migration

1. Écrire un nouveau fichier `supabase/migrations/000N_<sujet>.sql`. Style du dépôt : `create or replace
   function`, `add column if not exists`, `create table if not exists`, et `revoke execute on function ...
   from public, anon, authenticated` pour tout helper `_*`. Changer la signature d'une fonction impose un
   `drop function` préalable (exemple : `_pick_questions` dans `0005`).
2. La migration doit rester **compatible avec le front déjà déployé** : les deux hébergements se mettent à
   jour après le push, pas avant. Ordre à respecter : base d'abord, front ensuite (et l'inverse pour
   retirer un champ).
3. Appliquer, au choix :
   - **SQL Editor** du dashboard : coller le fichier, exécuter ;
   - **MCP Supabase** depuis Claude Code : `apply_migration` avec `name` = nom du fichier sans préfixe,
     ce qui alimente l'historique distant comme les entrées existantes.
4. Vérifier avec une requête ciblée (par exemple `select prosrc from pg_proc where proname = 'get_state'`
   pour relire le corps déployé), puis rejouer une partie en local avant de pousser le front.

### 4.5 Seed des questions

Sources : `data/questions/<theme>.json` (format simple) ou `data/courses/<theme>.json` (format cours avec
`meta`, `topics`, `modes`, `questions`). `scripts/lib/load-questions.mjs` normalise les deux formats, vérifie
4 choix par question et l'absence de doublon, et mélange les choix avec un RNG déterministe (seed 42) pour
éviter tout biais de position.

**Voie 1 — fichier SQL (recommandée, idempotente par thème)** :

```bash
node scripts/gen-seed-sql.mjs echr-anglais-s7
# -> supabase/migrations/0003_seed_echr-anglais-s7.sql (~160 Ko)
```

Le fichier généré commence par `delete from questions where theme = '<theme>';` puis un `insert ... from
jsonb_array_elements(...)` : on peut le rejouer sans dupliquer. Le coller dans le SQL Editor (la taille passe).

**Voie 2 — `scripts/seed-remote.mjs`** : envoie les lignes normalisées à une RPC temporaire
`admin_seed_questions(p_secret, p_theme, p_rows)` avec la clé anon lue dans `.env.local`. La RPC **n'existe pas
en base entre deux seeds** (vérifié) : on la crée juste avant, on l'appelle, on la supprime. Modèle cohérent
avec les colonnes du seed SQL :

```sql
create or replace function admin_seed_questions(p_secret text, p_theme text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret <> '<secret choisi pour ce seed>' then raise exception 'forbidden'; end if;
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

```bash
# Git Bash
SEED_SECRET='<secret>' node scripts/seed-remote.mjs echr-anglais-s7
```

```powershell
# PowerShell
$env:SEED_SECRET = '<secret>'; node scripts/seed-remote.mjs echr-anglais-s7
```

Puis `drop function admin_seed_questions(text, text, jsonb);`.

Ajouter un **thème** = JSON + seed + ses lignes dans `modes` (`id, course, theme, label, description, emoji,
subtypes, sort`) ; ajouter un **mode** sur un thème existant = une ligne dans `modes` seulement, le front les
lit via `useModes()` (`src/hooks/useModes.ts`). Contrôle après seed :

```sql
select theme, count(*) from questions group by theme order by theme;
```

### 4.6 Pause automatique du plan Free

Un projet Free est **mis en pause après environ 7 jours sans activité**. Plusieurs projets de la même
organisation sont déjà en `INACTIVE`. Symptôme côté app : la page d'accueil ne charge pas les modes et la
création de partie échoue avec une erreur réseau, alors que les deux hébergements répondent normalement.
Remède : dashboard → *Restore project* (quelques minutes). À vérifier **avant** chaque séance de révision
(voir §10).

## 5. Mise en production

### 5.1 Avant de pousser

```bash
npm run lint                                  # oxlint
npx tsc --noEmit -p tsconfig.app.json         # même règles que le build Vercel (noUnusedLocals, ...)
npm run build                                 # tsc -b && vite build
# Git Bash — MSYS_NO_PATHCONV obligatoire, sinon MSYS transforme /boring-law/ en C:/Program Files/Git/boring-law/
MSYS_NO_PATHCONV=1 VITE_BASE=/boring-law/ npm run build:pages    # simule le miroir ; vérifier dist/404.html et les chemins /boring-law/assets/
```

```powershell
# PowerShell
$env:VITE_BASE = '/boring-law/'; npm run build:pages
```

(Piège détaillé dans [development.md §9](development.md#9-pièges-connus).)

Test à plusieurs en local : `.claude/launch.json` définit `dev` (port 5173) et `dev2` (port 5174) ; deux
origines = deux `localStorage` = deux joueurs sur la même machine.

Si le push contient une migration : l'appliquer **avant** (§4.4).

### 5.2 Pousser

```bash
git push origin main
```

Cela déclenche **deux déploiements indépendants** : Vercel (Git integration) et le workflow
« Deploy to GitHub Pages ». Aucun des deux ne dépend de l'autre ; l'un peut échouer sans bloquer l'autre.

### 5.3 Vérifier

```bash
gh run list --repo pierremaker1/boring-law --workflow pages.yml --limit 3
gh run watch --repo pierremaker1/boring-law          # suit le run en cours
vercel ls boring-law                                  # dernier déploiement Production « ● Ready »
vercel inspect boring-law.vercel.app                  # alias, commit, heure
```

Puis dans un navigateur : `https://boring-law.vercel.app` et `https://pierremaker1.github.io/boring-law/`,
créer une partie sur l'un, la rejoindre par son code depuis l'autre.

### 5.4 Redéployer sans nouveau commit

```bash
gh workflow run pages.yml --repo pierremaker1/boring-law   # workflow_dispatch
vercel --prod                                              # depuis le dossier lié (.vercel/project.json)
```

Utile après un changement de secret / variable, puisque les valeurs sont inlinées au build (§3).

## 6. Rollback

| Cible | Procédure |
|---|---|
| Vercel | `vercel ls boring-law` pour repérer le déploiement précédent, puis `vercel rollback <url-du-déploiement>` (ou *Instant Rollback* dans le dashboard). Le rollback réutilise le bundle tel quel, variables incluses. |
| GitHub Pages | `gh run list --workflow pages.yml` pour trouver le dernier run vert, puis `gh run rerun <run-id> --repo pierremaker1/boring-law` : le workflow rejoue le **même commit**. |
| Les deux d'un coup | `git revert <sha> && git push origin main` : un nouveau commit, deux déploiements. C'est la voie la plus propre, elle garde l'historique cohérent. |
| Supabase | Pas de rollback automatique. Écrire une migration corrective : les anciens corps de fonction sont dans `git log -p supabase/migrations/`, un `create or replace function` remet la version voulue. Les seeds se rejouent sans risque (delete + insert par thème). |

Ordre en cas d'incident front + base : revenir sur le front d'abord (immédiat), puis corriger la base.

## 7. Renommage boring-geo → boring-law

Fait par le commit `e7421be` et les actions manuelles associées :

| Élément | État |
|---|---|
| Dépôt GitHub | renommé ; `github.com/pierremaker1/boring-geo` redirige (301) vers `boring-law` |
| Projet Vercel | renommé `boring-law` ; `boring-geo.vercel.app` redirige (308) vers `boring-law.vercel.app` ; les anciens déploiements gardent l'étiquette `boring-geo` dans `vercel ls` |
| GitHub Pages | `VITE_BASE: /boring-law/` dans `pages.yml` ; l'ancienne URL `/boring-geo/` répond 404 (pas de redirection possible) |
| Code | `package.json` (`"name": "boring-law"`), `<title>` et `meta description` d'`index.html`, favicon, README, `.vercel/project.json` |

Reste à faire (ou volontairement conservé) :

| Élément | Décision |
|---|---|
| Dossier local `C:\Users\Pierre\Desktop\boring-geo` | à renommer : `Rename-Item C:\Users\Pierre\Desktop\boring-geo boring-law` (PowerShell), puis rouvrir le terminal / la session Claude Code. `.vercel/project.json` et `.claude/launch.json` sont relatifs au dossier, rien d'autre à changer. |
| Projet Supabase nommé `boring-geo` | cosmétique ; renommable dans *Settings → General* sans impact (le ref et l'URL ne changent pas). |
| Clés `localStorage` `boring-geo:*` (`src/lib/session.ts`, `src/lib/sound.ts`, `src/lib/streak.ts`) | **à garder** : les renommer déconnecterait les sessions en cours et remettrait le mute à zéro. |
| Commentaire `VITE_BASE=/boring-geo/` dans `vite.config.ts`, ligne « GitHub Pages (`VITE_BASE=/boring-geo/`) » de la checklist de `design-spec.md` | à corriger à l'occasion. |
| En-têtes « Boring Geo — schéma » de `0001` / `0002` | historiques ; ne pas réécrire des migrations déjà appliquées. |

## 8. Coûts

| Service | Plan | Coût |
|---|---|---|
| Vercel | Hobby (équipe personnelle `pierremaker1s-projects`) | 0 € |
| GitHub Pages | inclus (dépôt public) | 0 € |
| GitHub Actions | inclus (dépôt public, ~35 s par run) | 0 € |
| Supabase | Free | 0 € |
| Google Fonts (Fredoka, Nunito, `index.html`) et `flagcdn.com` (drapeaux) | CDN publics | 0 € |

Total : **0 €**. Les limites à garder en tête (ordres de grandeur des offres gratuites, à vérifier sur les
pages tarifaires) : Supabase Free ≈ 500 Mo de base, 200 connexions Realtime simultanées, pause après une
semaine d'inactivité (§4.6) ; Vercel Hobby ≈ 100 Go de bande passante par mois ; Pages ≈ 100 Go par mois et
10 builds par heure. Une séance de TD à 10 joueurs est très loin de tout cela : la base pèse moins d'un Mo
hors questions, et chaque partie génère quelques centaines de lignes dans `answers`.

## 9. Monitoring minimal

Il n'y a ni alerting ni outil externe ; le minimum utile :

- **Supabase → Logs** : *Postgres* (les `raise exception 'game_full'`, `'invalid_token'`, etc. y apparaissent
  comme erreurs), *API* (PostgREST : les appels `rpc/get_state`, `rpc/submit_answer`), *Realtime*
  (connexions WebSocket). Depuis Claude Code, le MCP Supabase expose `query_logs` et `get_advisors`
  (sécurité / performance).
- **Activité en base** (SQL Editor) :

  ```sql
  select status, count(*) from games group by status;
  select date_trunc('day', created_at) d, count(*) from games group by d order by d desc limit 7;
  ```

- **Vercel** : onglet *Deployments* (statut de build) ; `vercel logs boring-law.vercel.app` (peu de choses,
  le site est statique).
- **GitHub** : `gh run list --workflow pages.yml` ; un run rouge = miroir non mis à jour, mais l'ancien
  build reste servi.
- **Navigateur** (quand un joueur signale un souci) : onglet Réseau, filtre `rpc/` (erreurs 4xx = message
  fonctionnel de `ERRORS` dans `src/lib/api.ts`, 5xx ou échec réseau = projet en pause ou hors ligne) et
  `realtime/v1/websocket` (doit rester ouvert pendant la partie).

## 10. Checklist avant de partager le lien

- [ ] Le projet Supabase est **actif** (dashboard, ou une requête quelconque répond) — §4.6.
- [ ] `select theme, count(*) from questions group by theme` donne bien 250 / 406 / 252 ; `select count(*)
      from modes` donne 10.
- [ ] `git status` propre, `main` poussé ; dernier run Pages vert (`gh run list`) et dernier déploiement Vercel
      « Ready » (`vercel ls boring-law`).
- [ ] Les deux URLs chargent, sans erreur dans la console ; une URL profonde (`/lobby/ABCDE`) démarre l'app
      sur les deux.
- [ ] Partie de bout en bout entre les deux hébergements : créer, rejoindre par le code, voir le nouveau
      joueur apparaître **sans rafraîchir** (Realtime), démarrer, répondre, terminer, écran de révision.
- [ ] Solo : l'hôte peut lancer seul et l'écran de fin ne parle pas de victoire contre personne.
- [ ] Test sur mobile (375 px) sur au moins un des deux hébergements.
- [ ] Bon lien pour le bon public : **GitHub Pages** sur le réseau universitaire (Vercel y est bloqué), Vercel
      ailleurs. Les deux mènent aux mêmes parties.
- [ ] Si des questions ont été ajoutées : seed appliqué (§4.5) et lignes `modes` présentes, mode visible dans
      le salon.
