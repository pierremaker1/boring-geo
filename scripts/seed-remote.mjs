// Pousse une banque de questions en base via la RPC temporaire admin_seed_questions.
// La RPC est créée juste avant (MCP Supabase / SQL editor) et supprimée juste après, voir README.
// Usage : SEED_SECRET=... node scripts/seed-remote.mjs geo
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadQuestions } from './lib/load-questions.mjs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())),
)
const theme = process.argv[2] ?? 'geo'
const { rows, path } = loadQuestions(theme)

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
console.log(`${data} questions insérées (${theme}, source ${path})`)
