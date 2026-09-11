// Génère supabase/migrations/0003_seed_<theme>.sql à partir de data/questions|courses/<theme>.json
// Usage: node scripts/gen-seed-sql.mjs geo
import { writeFileSync } from 'node:fs'
import { loadQuestions } from './lib/load-questions.mjs'

const theme = process.argv[2] ?? 'geo'
const { rows, path } = loadQuestions(theme)

// Format compact : un tableau JSON de lignes normalisées, dépilé côté SQL
const payload = JSON.stringify(rows).replace(/'/g, "''")
const sql = `-- Seed ${theme} (${rows.length} questions, source ${path}) — généré par scripts/gen-seed-sql.mjs
delete from questions where theme = '${theme}';
insert into questions (theme, subtype, prompt, choices, correct_index, image_url,
                       explanation, difficulty, flag, disputed, source, external_id, qtype)
select '${theme}', x->>0, x->>1, x->2, (x->>3)::int,
       case when x->>4 is null then null else 'https://flagcdn.com/w320/' || (x->>4) || '.png' end,
       x->>5, (x->>6)::int, x->>7, x->>8, x->>9, x->>10, x->>11
from jsonb_array_elements('${payload}'::jsonb) x;
`

const out = `supabase/migrations/0003_seed_${theme}.sql`
writeFileSync(out, sql)
console.log(`${rows.length} questions -> ${out} (${sql.length} chars)`)
