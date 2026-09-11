// Pousse data/questions/<theme>.json en base via la RPC temporaire admin_seed_questions.
// La RPC est créée juste avant (via le MCP Supabase / SQL editor) et supprimée juste après :
//   create function admin_seed_questions(p_secret text, p_theme text, p_rows jsonb) ... (voir README)
// Usage : SEED_SECRET=... node scripts/seed-remote.mjs geo
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())),
)
const theme = process.argv[2] ?? 'geo'
const questions = JSON.parse(readFileSync(`data/questions/${theme}.json`, 'utf8'))

// même mélange déterministe que gen-seed-sql.mjs
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const rows = questions.map((q) => {
  const idx = [0, 1, 2, 3]
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return [q.subtype, q.prompt, idx.map((i) => q.choices[i]), idx.indexOf(q.answer), q.iso ?? null]
})

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const { data, error } = await sb.rpc('admin_seed_questions', {
  p_secret: process.env.SEED_SECRET,
  p_theme: theme,
  p_rows: rows,
})
if (error) {
  console.error(error)
  process.exit(1)
}
console.log(`${data} questions insérées (${theme})`)
