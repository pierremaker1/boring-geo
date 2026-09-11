// Génère supabase/migrations/0003_seed_<theme>.sql à partir de data/questions/<theme>.json
// Usage: node scripts/gen-seed-sql.mjs geo
import { readFileSync, writeFileSync } from 'node:fs';

const theme = process.argv[2] ?? 'geo';
const questions = JSON.parse(readFileSync(`data/questions/${theme}.json`, 'utf8'));

// RNG déterministe pour que le seed soit reproductible
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const seen = new Set();
const rows = [];

for (const q of questions) {
  if (!Array.isArray(q.choices) || q.choices.length !== 4) throw new Error(`4 choix requis: ${q.prompt}`);
  if (q.answer < 0 || q.answer > 3) throw new Error(`answer invalide: ${q.prompt}`);
  const key = q.prompt + (q.iso ?? '');
  if (seen.has(key)) throw new Error(`doublon: ${q.prompt} ${q.iso ?? ''}`);
  seen.add(key);

  // mélange des choix pour éviter tout biais de position
  const idx = [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const choices = idx.map((i) => q.choices[i]);
  rows.push([q.subtype, q.prompt, choices, idx.indexOf(q.answer), q.iso ?? null]);
}

// Format compact : un tableau JSON [subtype, prompt, choices, correct, iso] dépilé côté SQL
const payload = JSON.stringify(rows).replace(/'/g, "''");
const sql = `-- Seed ${theme} (${rows.length} questions) — généré par scripts/gen-seed-sql.mjs
delete from questions where theme = '${theme}';
insert into questions (theme, subtype, prompt, choices, correct_index, image_url)
select '${theme}', x->>0, x->>1, x->2, (x->>3)::int,
       case when x->>4 is null then null else 'https://flagcdn.com/w320/' || (x->>4) || '.png' end
from jsonb_array_elements('${payload}'::jsonb) x;
`;

const out = `supabase/migrations/0003_seed_${theme}.sql`;
writeFileSync(out, sql);
console.log(`${rows.length} questions → ${out} (${sql.length} chars)`);
