# Contenu pédagogique

Comment les questions sont organisées, stockées, mélangées et affichées, et comment on ajoute un cours, un mode ou une correction. Pour le moteur de jeu (RPC, Realtime, fin de partie), voir [architecture](architecture.md) ; pour l'UI, voir [design-spec](design-spec.md) ; pour l'installation, le [README](../README.md).

Tout ce qui suit est vérifié dans le code au 2026-09-11 : `scripts/lib/load-questions.mjs`, `scripts/gen-seed-sql.mjs`, `scripts/seed-remote.mjs`, `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0004_modes_and_end_rule.sql`, `0005_courses_modes_review.sql`, `src/lib/subtype.ts`, `src/hooks/useModes.ts`, `src/components/ReviewList.tsx`.

## 1. Inventaire actuel

| Thème (`questions.theme`) | Fichier source | Format | Questions | Sous-types | Modes en base |
|---|---|---|---:|---:|---|
| `geo` | `data/questions/geo.json` | simple | 406 | 8 (`capitale` 131, `drapeau` 150, `superficie` 40, `continent` 20, `fleuve` 20, `montagne` 15, `ocean` 15, `frontiere` 15) | `geo`, `geo:drapeau` |
| `histoire` | `data/questions/histoire.json` | simple | 252 | 11 (`antiquite`, `moyen-age`, `renaissance`, `xvii-xviii`, `revolution`, `empire-xix`, `ww1`, `entre-deux-guerres`, `ww2`, `guerre-froide`, `contemporain`) | `histoire` |
| `echr-anglais-s7` | `data/courses/echr-anglais-s7.json` (+ `.md`) | riche | 250 | 32 topics (voir §2.3) | `echr:full`, `echr:annales`, `echr:procedure`, `echr:articles`, `echr:theorie`, `echr:vocabulaire`, `echr:pieges` |

Soit 908 questions. Les trois seeds SQL correspondants sont versionnés dans `supabase/migrations/0003_seed_<theme>.sql` (générés, ne pas éditer à la main).

Pour recompter :

```bash
node --input-type=module -e "
import { loadQuestions } from './scripts/lib/load-questions.mjs'
for (const t of ['geo', 'histoire', 'echr-anglais-s7']) console.log(t, loadQuestions(t).rows.length)
"
```

## 2. Organisation : thème → sous-type → mode

### 2.1 Les trois niveaux

| Niveau | Où | Rôle |
|---|---|---|
| **Thème** | `questions.theme` (text) | Une banque entière = un fichier JSON = un seed. C'est aussi le nom du fichier (`data/…/<theme>.json`). |
| **Sous-type** | `questions.subtype` (text) | Catégorie fine à l'intérieur du thème (`capitale`, `article-3`, `annales`…). Dans le format riche, c'est le `topic` de la question. Affiché en chip pendant la partie et dans la révision via `subtypeLabel()` (`src/lib/subtype.ts`). |
| **Mode** | table `modes` | Ce que le joueur choisit dans le salon : soit un thème entier (`subtypes` = `null`), soit un sous-ensemble de sous-types (`subtypes` = `text[]`). Les modes sont regroupés par `course` à l'affichage. |

Une question appartient à exactement un thème et un sous-type ; un mode est une vue (filtre) sur un thème. Rien n'empêche deux modes de se recouvrir (`echr:full` contient `echr:annales`).

### 2.2 Table `modes` (`0005_courses_modes_review.sql`)

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `text` PK | Identifiant stocké dans `games.theme` (le nom de colonne est historique). Convention : `<préfixe>:<mode>` (`echr:annales`) ou le thème nu (`geo`, `histoire`). |
| `course` | `text` | Libellé du groupe affiché dans le salon (`Anglais CEDH · S7`, `Culture G`). Le regroupement est fait côté client par `groupByCourse()` sur l'égalité stricte de cette chaîne. |
| `theme` | `text` | Le `questions.theme` filtré. |
| `label` | `text` | Nom du mode (`Annales`, `Drapeaux`). |
| `description` | `text` | Une ligne affichée sous le groupe quand le mode est actif (et en `title` au survol). |
| `emoji` | `text` | Préfixe du chip (`modeTitle()` dans `src/components/ModePicker.tsx`). |
| `subtypes` | `text[]` | `null` = tout le thème ; sinon liste de `questions.subtype` acceptés. |
| `sort` | `int` | Ordre d'affichage global (`api.listModes()` fait `.order('sort')`). Convention actuelle : 10-16 pour le cours CEDH, 50-52 pour Culture G. |

RLS : lecture publique (`modes readable` pour `anon` et `authenticated`), aucune écriture par l'API : on insère en SQL.

### 2.3 Modes actuellement en base

| `id` | `course` | `theme` | `label` | `emoji` | `subtypes` | `sort` |
|---|---|---|---|---|---|---:|
| `echr:full` | Anglais CEDH · S7 | `echr-anglais-s7` | Tout le programme | 📚 | `null` | 10 |
| `echr:annales` | Anglais CEDH · S7 | `echr-anglais-s7` | Annales | 🎓 | `{annales}` | 11 |
| `echr:procedure` | Anglais CEDH · S7 | `echr-anglais-s7` | Procédure | ⚖️ | `{subsidiarity, admissibility, time-limit, filing, interim-measures, just-satisfaction, enforcement, court}` | 12 |
| `echr:articles` | Anglais CEDH · S7 | `echr-anglais-s7` | Article par article | 📜 | `{articles, protocols, protocol-1-1, article-2 … article-14}` | 13 |
| `echr:theorie` | Anglais CEDH · S7 | `echr-anglais-s7` | Théorie et principes | 🧠 | `{foundations, systems, convention, nature-of-rights, principles}` | 14 |
| `echr:vocabulaire` | Anglais CEDH · S7 | `echr-anglais-s7` | Vocabulaire | 🔤 | `{vocabulary}` | 15 |
| `echr:pieges` | Anglais CEDH · S7 | `echr-anglais-s7` | Pièges | 🪤 | `{traps}` | 16 |
| `geo` | Culture G | `geo` | Géographie | 🌍 | `null` | 50 |
| `geo:drapeau` | Culture G | `geo` | Drapeaux | 🏁 | `{drapeau}` | 51 |
| `histoire` | Culture G | `histoire` | Histoire | 🏛️ | `null` | 52 |

Le mode proposé à la création d'une partie est `DEFAULT_MODE = 'echr:full'` (`src/types.ts`).

### 2.4 Comment un mode devient une liste de questions

`create_game` et `update_settings` appellent `_pick_questions(p_mode, p_count)` (version de `0005`) :

1. Si `p_mode` est un `modes.id` connu → `theme = modes.theme`, `subtypes = modes.subtypes`.
2. Sinon, rétro-compatibilité : `p_mode` est lu comme `theme` ou `theme:subtype` (`geo:drapeau` marche même sans ligne dans `modes`).
3. `select id from questions where theme = v_theme and (v_subtypes is null or subtype = any(v_subtypes)) order by random() limit p_count`.

Conséquences :

- Si le mode contient moins de questions que demandé, `question_count` est ramené au nombre réel (le salon affiche « Ce mode ne contient que N questions »). Le tirage est aléatoire mais **identique pour tous les joueurs** (stocké dans `games.question_ids`).
- Zéro question → exception `no_questions_for_theme` (« Pas de questions pour ce mode. » dans `src/lib/api.ts`). Un mode dont les `subtypes` ne correspondent à aucun `questions.subtype` est donc visible mais injouable : vérifier l'orthographe exacte.

### 2.5 Côté client

- `useModes()` (`src/hooks/useModes.ts`) lit la table une fois par session (cache module) via `api.listModes()`, et fournit `courses = groupByCourse(modes)`.
- `ModePicker` (`src/components/ModePicker.tsx`) affiche un groupe par `course` avec ses chips ; un `games.theme` absent de la table est affiché par son id brut, sans planter.
- Aucun libellé de mode n'est codé en dur dans le front : ajouter une ligne dans `modes` suffit pour qu'elle apparaisse.

## 3. Les deux formats de banque

Le chargeur `loadQuestions(theme)` (`scripts/lib/load-questions.mjs`) cherche d'abord `data/courses/<theme>.json`, puis `data/questions/<theme>.json`. Il accepte un tableau nu (format simple) ou un objet avec une clé `questions` (format riche), et normalise chaque question en une **ligne de 12 éléments** :

```
[subtype, prompt, choices, correct, iso, explanation, difficulty, flag, disputed, source, external_id, qtype]
```

C'est cette ligne que consomment `gen-seed-sql.mjs` et `seed-remote.mjs`.

### 3.1 Format simple : `data/questions/<theme>.json`

Tableau JSON d'objets :

| Champ | Type | Obligatoire | Devient |
|---|---|---|---|
| `subtype` | string | oui | `questions.subtype` |
| `prompt` | string | oui | `questions.prompt` |
| `choices` | string[4] | oui (exactement 4) | `questions.choices` (jsonb), **réordonnés** (§5) |
| `answer` | 0..3 | oui | `questions.correct_index`, recalculé après mélange |
| `iso` | string | non | `questions.image_url = 'https://flagcdn.com/w320/' || iso || '.png'` |

Exemple complet (extraits réels de `geo.json`) :

```json
[
  {
    "subtype": "capitale",
    "prompt": "Quelle est la capitale de l'Australie ?",
    "choices": ["Sydney", "Canberra", "Melbourne", "Perth"],
    "answer": 1
  },
  {
    "subtype": "drapeau",
    "prompt": "À quel pays appartient ce drapeau ?",
    "choices": ["Italie", "Irlande", "Mexique", "Hongrie"],
    "answer": 1,
    "iso": "ie"
  }
]
```

Notes :

- `iso` est un code pays à deux lettres minuscules (norme flagcdn). L'image est servie par un CDN externe, ce n'est pas un asset du dépôt ; le composant `FlagFrame` gère le chargement et l'erreur.
- Les 150 questions `drapeau` ont **le même prompt** ; la détection de doublons du chargeur utilise `prompt + iso`, c'est ce qui les distingue.
- Pas d'explication possible dans ce format : la révision affiche la bonne réponse sans note « Pourquoi ».

### 3.2 Format riche : `data/courses/<theme>.json`

Objet à quatre clés : `meta`, `topics`, `modes`, `questions`. **Seul `questions` est lu par le chargeur** ; les trois autres documentent la banque et servent de base pour écrire les lignes de `modes` et les libellés de `subtype.ts`.

```json
{
  "meta": {
    "id": "echr-anglais-s7",
    "title": "Anglais juridique - Convention et Cour europeennes des droits de l'homme",
    "course": "M1 Droit des affaires, IDAI, Universite de Montpellier, S7",
    "lecturer": "…",
    "exam_format": "QCM portant sur le fond du cours, en anglais, 4 propositions, une seule correcte",
    "language": "en",
    "built": "2026-09-11",
    "count": 250,
    "sources": ["S7/Anglais/CM Anglais.pdf (prise de notes du CM, 16 p.)", "…"],
    "warning": "Reference de verite = le cours. …"
  },
  "topics": [
    { "id": "article-3", "label": "Art. 3 - Torture", "description": "Severity test, Ireland v UK, Z v UK", "count": 6 }
  ],
  "modes": [
    { "id": "annales", "label": "Annales", "topics": ["annales"], "count": 20 },
    { "id": "procedure", "label": "Procedure", "topics": ["subsidiarity", "admissibility", "time-limit", "filing", "interim-measures", "just-satisfaction", "enforcement", "court"], "count": 53 }
  ],
  "questions": [
    {
      "id": "fnd-009",
      "topic": "systems",
      "type": "figure",
      "difficulty": 2,
      "question": "How many Member States does the Council of Europe currently have, according to the course?",
      "choices": ["27", "46", "28", "47"],
      "answer": 1,
      "explanation": "46 since Russia ceased to be a member in 2022. Careful: the printed course handout (an older Irish document) still says 47, but the lecture notes and the course plan say 46. 27 and 28 are European Union figures.",
      "source": "CM Anglais, Section 1 ; Plan I.B",
      "flag": "The handout 'Guide for the Civil & Public Service' still says 47. The correct current figure is 46."
    }
  ]
}
```

Champs d'une question et correspondance en base :

| Champ JSON | Type | Obligatoire | Colonne `questions` | Remarques |
|---|---|---|---|---|
| `id` | string | recommandé | `external_id` | Identifiant stable (`a3-003`, `ann-02`) ; renvoyé par `get_review`. C'est la clé à utiliser pour corriger une question en base. |
| `topic` | string | oui | `subtype` | Doit être un `topics[].id`. Le chargeur lit `q.subtype ?? q.topic`. |
| `type` | `article` \| `case` \| `concept` \| `figure` \| `vocab` \| `exam` | non | `qtype` | Stocké mais pas exploité par l'UI aujourd'hui. |
| `difficulty` | 1..3 | non | `difficulty` | Contrainte `check (difficulty between 1 and 3)` en base ; affiché en étoiles dans la révision. |
| `question` | string | oui | `prompt` | Le chargeur lit `q.prompt ?? q.question`. |
| `choices` | string[4] | oui | `choices` | Réordonnés au seed (§5). |
| `answer` | 0..3 | oui | `correct_index` | Recalculé après mélange. |
| `explanation` | string | recommandé | `explanation` | Note « 💡 Pourquoi » de la révision. |
| `source` | string | non | `source` | Ligne « Source : … » de la révision. |
| `flag` | string | non | `flag` | Écart cours / droit positif (§4). |
| `disputed` | string | non | `disputed` | Corrigé discutable (§4). |
| `exam` | boolean | non | — | **Non stocké.** Dans la banque actuelle il marque 18 questions hors `annales` qui reprennent une question tombée ; les 20 `ann-*` ne le portent pas. |
| `iso` | string | non | `image_url` | Accepté aussi dans ce format (même transformation qu'en simple). |

Le fichier compagnon `data/courses/<theme>.md` n'est pas lu par le code : c'est la fiche de la banque (principe de vérité, tableau des modes, corrigé des annales, liste des écarts, contrôles passés). Il évoque un `echr-anglais-s7.flat.json` qui n'est pas dans le dépôt : inutile, le chargeur lit directement `raw.questions`.

### 3.3 Colonnes de `questions` (`0001_schema.sql` + `0005`)

`id uuid`, `theme`, `subtype`, `prompt`, `choices jsonb`, `correct_index int check (between 0 and 3)`, `image_url`, `created_at`, puis (0005) `explanation`, `difficulty int check (between 1 and 3)`, `flag`, `disputed`, `source`, `external_id`, `qtype`. Index : `(theme)` et `(theme, subtype)`.

Ce que le joueur voit pendant la partie (`_current_question`) : `id, subtype, prompt, choices, image_url` — jamais `correct_index`. Ce que la révision reçoit (`get_review`, seulement une fois la partie `finished`) : tout, y compris `correct_index`, `explanation`, `flag`, `disputed`, `source`, `external_id`, `difficulty`.

## 4. Principe de vérité d'un cours

Extrait de `data/courses/echr-anglais-s7.md` : **« La référence est le cours, pas le droit positif. »** L'examen note la conformité au cours ; quand le cours est daté ou inexact, la bonne réponse reste celle du cours et le champ `flag` explique l'écart. La banque CEDH porte 22 `flag` et 1 `disputed`.

| Champ | Sens | Rendu dans la révision (`ReviewList.tsx`) |
|---|---|---|
| `explanation` | Pourquoi c'est la bonne réponse, avec le vocabulaire du cours. | Note bleue « 💡 Pourquoi ». |
| `flag` | Le cours dit X, le droit positif dit Y. La réponse attendue reste X. | Chip « ⚠️ Cours ≠ droit positif » dans l'en-tête (visible carte repliée) et note jaune « ⚠️ Attention : le cours ≠ le droit positif » avec l'accroche « Pour l'examen, retiens la version du cours. », affichée **avant** l'explication. |
| `disputed` | Le corrigé retenu est défendable mais discutable (annales sans corrigé officiel, notes ambiguës). | Chip « 🤔 Discutable » et note orange « 🤔 Corrigé discutable », après l'explication. |

`isFlagged(item)` = `flag` ou `disputed` non vide ; c'est le filtre « ⚠️ À surveiller » de la page Résultats, avec le compteur « N à surveiller ». L'idée : un étudiant qui révise sur autre chose que son cours se fait piéger exactement sur ces questions, il doit pouvoir les isoler.

Règles d'écriture qui en découlent :

- Écrire `flag` du point de vue de l'étudiant : ce que dit le support, ce qui est vrai aujourd'hui, et ce qu'il faut répondre (« Answer as taught, but… »).
- Ne jamais « corriger » silencieusement le cours dans `answer` : si le cours se trompe, la réponse reste celle du cours et on ajoute un `flag`.
- `disputed` n'est pas un `flag` : il signale un doute sur le corrigé lui-même, pas un écart connu avec le droit positif.
- Lister les écarts dans le `.md` du cours (classés du plus important au plus anecdotique) : c'est la seule vue d'ensemble, la base ne les agrège pas.

## 5. Mélange déterministe des choix

Dans le JSON, la bonne réponse peut être à n'importe quelle position (dans la banque CEDH, elle a déjà été mélangée par id). Le chargeur re-mélange **toujours** les 4 choix au seed, pour ne jamais dépendre de l'auteur :

```js
// scripts/lib/load-questions.mjs
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
// …
const idx = [0, 1, 2, 3]
for (let i = idx.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[idx[i], idx[j]] = [idx[j], idx[i]]
}
return [subtype, prompt, idx.map((i) => q.choices[i]), idx.indexOf(q.answer), …]
```

- Générateur congruentiel linéaire, graine fixe `42`, un seul flux pour toute la banque : le résultat ne dépend que de l'**ordre des questions dans le fichier**. Deux exécutions donnent le même seed SQL (diff git lisible) ; insérer une question au milieu change le mélange de toutes les suivantes (diff massif mais sans conséquence fonctionnelle).
- `correct_index` est recalculé (`idx.indexOf(q.answer)`), donc `answer` dans le JSON reste l'index **dans le fichier**, pas en base.
- Répartition obtenue sur la banque CEDH après mélange : position 0 : 54, 1 : 73, 2 : 65, 3 : 58.
- Conséquence pour les explications : **aucune référence positionnelle** (« l'option b », « la première proposition ») n'est admise, puisque l'ordre en base diffère du fichier. Désigner les propositions par leur contenu.

Validations levées par le chargeur (exception, seed interrompu) :

| Message | Condition |
|---|---|
| `format inconnu : <path>` | Ni tableau, ni objet avec `questions` tableau. |
| `4 choix requis : <prompt>` | `choices` absent ou de longueur ≠ 4. |
| `answer invalide : <prompt>` | `answer` hors 0..3. |
| `doublon : <prompt>` | Même `prompt + iso` déjà vu dans la banque. |

Le chargeur ne vérifie pas : les 4 choix distincts, `difficulty` dans 1..3 (la base le refuse), l'unicité des `id`, l'existence du `topic` dans `topics`. Voir §7.

## 6. Procédures

### 6.1 Ajouter un cours

Objectif : un nouveau thème `<theme>` (ex. `droit-ue-s8`) avec ses modes dans le salon.

**1. Écrire la banque** `data/courses/<theme>.json` au format riche (§3.2). Conventions :

- `meta.id` = `<theme>` = nom du fichier = futur `questions.theme` ; en kebab-case.
- `topics[].id` en kebab-case ASCII (ce sont les `subtype`) ; `questions[].topic` doit en faire partie.
- `questions[].id` stable et préfixé (`fnd-001`, `a3-003`) : c'est l'`external_id` qui servira aux corrections.
- Une `explanation` par question, `source` renvoyant au support (page, section, numéro d'annale).
- Rédiger aussi `data/courses/<theme>.md` : principe de vérité, tableau des modes, écarts (`flag`), contrôles passés.

**2. Valider et générer le seed** (exécute toutes les validations du §5 et écrit le fichier de migration) :

```bash
node scripts/gen-seed-sql.mjs <theme>
# → "N questions -> supabase/migrations/0003_seed_<theme>.sql (… chars)"
```

Le SQL généré fait `delete from questions where theme = '<theme>'` puis un `insert … select` depuis un `jsonb_array_elements` des lignes normalisées. Commiter ce fichier.

**3. Pousser en base.** Deux voies, au choix :

- *Voie migration* : exécuter `supabase/migrations/0003_seed_<theme>.sql` tel quel (SQL editor Supabase ou `apply_migration` du MCP). C'est la voie la plus simple pour une première insertion.
- *Voie script* : `scripts/seed-remote.mjs` envoie les lignes via une RPC **temporaire** `admin_seed_questions(p_secret, p_theme, p_rows)` appelée avec la clé anon lue dans `.env.local`. Cette RPC n'est **pas versionnée** dans le dépôt : on la crée juste avant, on l'appelle, on la supprime juste après (elle donne un droit d'écriture sur `questions` à quiconque connaît le secret). Définition cohérente avec le script et avec le mapping de `gen-seed-sql.mjs` :

```sql
create or replace function admin_seed_questions(p_secret text, p_theme text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret <> '<un secret long et jetable>' then raise exception 'forbidden'; end if;
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
SEED_SECRET='<le même secret>' node scripts/seed-remote.mjs <theme>
# PowerShell : $env:SEED_SECRET = '<le même secret>'; node scripts/seed-remote.mjs <theme>
# → "N questions insérées (<theme>, source data/courses/<theme>.json)"
```

```sql
drop function admin_seed_questions(text, text, jsonb);
```

Attention dans les deux voies : le `delete from questions where theme = …` échoue avec une violation de clé étrangère si des parties ont déjà été jouées sur ce thème, car `answers.question_id references questions (id)` **sans** `on delete cascade` (`0001_schema.sql`). Pour un thème neuf, aucun problème ; pour un re-seed complet, voir §6.3.

**4. Insérer les modes** dans `modes` (même forme que dans `0005_courses_modes_review.sql`, idempotent grâce à `on conflict`). Un mode « tout le programme » avec `subtypes = null`, puis un mode par regroupement de `topics` :

```sql
insert into modes (id, course, theme, label, description, emoji, subtypes, sort) values
  ('ue:full',      'Droit de l''UE · S8', 'droit-ue-s8', 'Tout le programme', '180 questions, tout le cours', '📚', null, 20),
  ('ue:sources',   'Droit de l''UE · S8', 'droit-ue-s8', 'Sources',           'Traités, droit dérivé, principes', '📜', array['treaties','secondary-law','principles'], 21)
on conflict (id) do update set course = excluded.course, theme = excluded.theme, label = excluded.label,
  description = excluded.description, emoji = excluded.emoji, subtypes = excluded.subtypes, sort = excluded.sort;
```

Choisir `sort` pour placer le cours où on veut (10-16 CEDH, 50-52 Culture G aujourd'hui). Le `course` doit être **strictement identique** sur toutes les lignes du même groupe. Versionner ces lignes dans une nouvelle migration `supabase/migrations/000N_modes_<theme>.sql`.

**5. Ajouter les libellés** des sous-types dans `LABELS` de `src/lib/subtype.ts` (majuscules accentuées, courts : ils tiennent dans un chip à 375 px). Sans entrée, `subtypeLabel()` retombe sur `subtype.toUpperCase()` (`ARTICLE-3` au lieu de `ART. 3 · TORTURE`). Si les questions portent des images qui ne sont pas des drapeaux, adapter le texte alternatif dans `ReviewCard` (`ReviewList.tsx`, aujourd'hui `drapeau` → « Drapeau à identifier »).

**6. Tester.**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run dev
```

Dans le salon : le groupe du cours apparaît avec ses chips, la description du mode actif s'affiche, le compteur de questions se plafonne si le mode est petit. Jouer une partie solo jusqu'au bout (ou laisser le timer expirer) et vérifier sur la page Résultats : chip de sous-type, étoiles de difficulté, notes Pourquoi / ⚠️ / 🤔, filtre « À surveiller », ligne Source. Vérifier enfin que `create_game` ne renvoie pas `no_questions_for_theme` sur chaque mode (un `subtypes` mal orthographié se voit ici).

**7. Finitions** : mettre à jour le README (liste des cours, inventaire) et, si le nouveau cours doit être proposé par défaut, `DEFAULT_MODE` dans `src/types.ts`.

### 6.2 Ajouter un mode à un cours existant

Aucun changement de code ni de seed : une ligne dans `modes`.

```sql
insert into modes (id, course, theme, label, description, emoji, subtypes, sort) values
  ('echr:articles-2-5', 'Anglais CEDH · S7', 'echr-anglais-s7', 'Articles 2 à 5',
   'Vie, torture, esclavage, liberté', '🛡️', array['article-2','article-3','article-4','article-5'], 17)
on conflict (id) do update set course = excluded.course, theme = excluded.theme, label = excluded.label,
  description = excluded.description, emoji = excluded.emoji, subtypes = excluded.subtypes, sort = excluded.sort;
```

Vérifier que le mode n'est pas vide :

```sql
select count(*) from questions where theme = 'echr-anglais-s7' and subtype = any(array['article-2','article-3','article-4','article-5']);
```

Le client met en cache la liste des modes pour la session (`useModes`) : recharger la page pour voir la nouvelle ligne. Ajouter aussi le mode dans la clé `modes` du JSON du cours et dans le tableau du `.md`, pour que la documentation de la banque reste juste.

Pour retirer un mode : `delete from modes where id = '…'`. Conséquences pour les parties qui portent cet id dans `games.theme` :

- les parties **déjà lancées** continuent (leur `question_ids` est figé au démarrage) ;
- un **salon encore ouvert** sur ce mode échoue au prochain réglage de l'hôte avec `no_questions_for_theme` : `update_settings` renvoie le même `game.theme` à `_pick_questions`, dont le repli découpe l'id sur `:` (`split_part`) et cherche `questions.theme = 'echr'` pour `echr:articles-2-5`, thème qui n'existe pas (`questions.theme` = `echr-anglais-s7`). Le repli ne fonctionne que si l'id est littéralement de la forme `theme` ou `theme:subtype` d'une banque (`geo`, `geo:drapeau`, `histoire`) ; `ModePicker` affiche alors l'id brut.

### 6.3 Corriger une question

**a. Corriger le fichier source** (`data/courses/<theme>.json` ou `data/questions/<theme>.json`) : c'est la référence. Puis régénérer le seed pour garder la migration synchronisée : `node scripts/gen-seed-sql.mjs <theme>`.

**b. Répercuter en base** sans tout re-seeder, par un `update` ciblé :

- Format riche, clé `external_id` :

  ```sql
  update questions
  set explanation = '…', flag = '…'
  where theme = 'echr-anglais-s7' and external_id = 'tim-001';
  ```

- Format simple (pas d'`external_id`), clé `prompt` (+ `image_url` pour les drapeaux) :

  ```sql
  update questions set choices = '["Sydney","Canberra","Melbourne","Perth"]', correct_index = 1
  where theme = 'geo' and prompt = 'Quelle est la capitale de l''Australie ?';
  ```

Si on modifie `choices`, écrire les 4 propositions **dans l'ordre déjà en base** (celui du mélange) et ajuster `correct_index` en conséquence ; sinon les `answers.choice_index` déjà enregistrés pour cette question deviennent faux dans les révisions passées.

**c. Re-seed complet** (nouvelle version d'une banque, beaucoup de changements) : possible uniquement si aucune réponse ne référence le thème, ou après avoir purgé l'historique :

```sql
delete from answers where question_id in (select id from questions where theme = '<theme>');
-- puis exécuter supabase/migrations/0003_seed_<theme>.sql
```

Les `games.question_ids` des anciennes parties pointeront vers des uuid disparus (colonne `uuid[]` sans FK) : leurs révisions renverront des listes tronquées. Acceptable pour un projet de révision, à faire de préférence hors période d'utilisation.

## 7. Contrôles qualité recommandés

Ce que le chargeur impose (4 choix, `answer` valide, pas de doublon `prompt + iso`) est un minimum. Avant de seeder un cours, passer ces contrôles, dans cet ordre :

| Contrôle | Pourquoi | Comment |
|---|---|---|
| 4 choix **distincts** par question | Deux propositions identiques rendent la question ambiguë et faussent le mélange. | `new Set(q.choices).size === 4` sur toute la banque. |
| `id` uniques, `topic` ∈ `topics[].id` | `external_id` sert de clé de correction ; un topic inconnu rend la question invisible dans les modes filtrés. | Script node de 10 lignes ; comparer `topics[].count` et `modes[].count` aux comptes réels. |
| `difficulty` ∈ {1, 2, 3} | Contrainte `check` en base : le seed entier échoue sinon. | Grep ou script. |
| Aucune référence positionnelle dans `explanation`, `flag`, `disputed` | L'ordre des choix change au seed (§5). | Regex sur `option [a-d]`, `answer [a-d]`, `(first\|second\|third\|fourth) (option\|choice\|answer)`, « proposition 1 », « la première »… |
| Pas de doublon sémantique | Le loader ne voit que les prompts strictement identiques ; deux reformulations de la même question font deux fois le même point dans une partie. | Relecture par sous-type, tri alphabétique des prompts. |
| Une seule bonne réponse | Un distracteur accidentellement vrai est la faute la plus fréquente sur du contenu juridique. | Relecture **adversariale** : un second relecteur cherche activement une réponse fausse, une question à deux bonnes réponses, une erreur d'arrêt ou de date. Sur la banque CEDH, cette passe a corrigé 26 questions sur 250. |
| Écarts cours / droit positif | Le principe de vérité (§4) : chaque point où le support est daté doit porter un `flag`, pas une « correction ». | Vérification externe des points sensibles listés dans le `.md` (dates d'arrêts, chiffres, protocoles). |
| Libellés `subtype.ts` présents | Sinon chip en `TOPIC-ID` brut. | Comparer `topics[].id` aux clés de `LABELS`. |
| Répartition des bonnes réponses après mélange | Détecter un biais résiduel (fichier trié, banque très courte). | `loadQuestions(theme).rows` puis histogramme de `row[3]`. |

Un contrôle rapide qui couvre les quatre premières lignes :

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync('data/courses/echr-anglais-s7.json', 'utf8'))
const topics = new Set(c.topics.map((t) => t.id)), ids = new Set()
for (const q of c.questions) {
  if (ids.has(q.id)) console.log('id dupliqué', q.id); ids.add(q.id)
  if (!topics.has(q.topic)) console.log('topic inconnu', q.id, q.topic)
  if (new Set(q.choices).size !== 4) console.log('choix non distincts', q.id)
  if (q.difficulty && ![1, 2, 3].includes(q.difficulty)) console.log('difficulty', q.id)
  const txt = [q.explanation, q.flag, q.disputed].join(' ')
  if (/option [a-d]\b|answer [a-d]\b|\b(first|second|third|fourth) (option|choice|answer)/i.test(txt)) console.log('positionnel', q.id)
}
console.log(c.questions.length, 'questions vérifiées')
"
```

## 8. Pièges connus

- **`games.theme` contient un id de mode**, pas un thème (nom de colonne conservé pour ne rien casser). Ne pas comparer `games.theme` à `questions.theme`.
- **Le mélange dépend de l'ordre du fichier** : ajouter une question en fin de banque limite le diff du seed SQL ; l'insérer au milieu re-mélange tout ce qui suit.
- **`exam`, `meta`, `topics`, `modes` du JSON riche ne vont pas en base.** La table `modes` est remplie à la main (§6.1 étape 4) ; les deux peuvent diverger si on oublie l'un des deux.
- **`course` est une chaîne libre** : une apostrophe ou un espace différent crée un second groupe dans le salon.
- **Re-seeder un thème déjà joué échoue** (FK `answers.question_id`) : privilégier les `update` ciblés (§6.3).
- **Le cache client des modes** dure toute la session : après un `insert` dans `modes`, recharger la page.
- **Images** : uniquement via `iso` → flagcdn ; il n'y a pas de mécanisme d'image arbitraire (ni d'asset local) pour les questions.
