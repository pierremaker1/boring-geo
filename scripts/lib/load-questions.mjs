// Charge une banque de questions et la normalise en lignes prêtes pour la base.
// Deux formats acceptés :
//   - data/questions/<theme>.json : tableau simple { subtype, prompt, choices, answer, iso? }
//   - data/courses/<theme>.json   : { meta, topics, modes, questions: [{ id, topic, type, difficulty,
//                                     question, choices, answer, explanation, source, flag?, disputed? }] }
// Ligne normalisée : [subtype, prompt, choices, correct, iso, explanation, difficulty, flag, disputed, source, external_id, qtype]
import { existsSync, readFileSync } from 'node:fs'

export function loadQuestions(theme) {
  const coursePath = `data/courses/${theme}.json`
  const simplePath = `data/questions/${theme}.json`
  const path = existsSync(coursePath) ? coursePath : simplePath
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const questions = Array.isArray(raw) ? raw : raw.questions
  if (!Array.isArray(questions)) throw new Error(`format inconnu : ${path}`)

  // RNG déterministe : le seed est reproductible d'un build à l'autre
  let seed = 42
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

  const seen = new Set()
  return {
    path,
    rows: questions.map((q) => {
      const prompt = q.prompt ?? q.question
      const subtype = q.subtype ?? q.topic
      if (!Array.isArray(q.choices) || q.choices.length !== 4) throw new Error(`4 choix requis : ${prompt}`)
      if (q.answer < 0 || q.answer > 3) throw new Error(`answer invalide : ${prompt}`)
      const key = prompt + (q.iso ?? '')
      if (seen.has(key)) throw new Error(`doublon : ${prompt}`)
      seen.add(key)

      // mélange des choix pour éviter tout biais de position
      const idx = [0, 1, 2, 3]
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[idx[i], idx[j]] = [idx[j], idx[i]]
      }
      return [
        subtype,
        prompt,
        idx.map((i) => q.choices[i]),
        idx.indexOf(q.answer),
        q.iso ?? null,
        q.explanation ?? null,
        q.difficulty ?? null,
        q.flag ?? null,
        q.disputed ?? null,
        q.source ?? null,
        q.id ?? null,
        q.type ?? null,
      ]
    }),
  }
}
