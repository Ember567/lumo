import { supabase } from '../supabaseClient.js'

// Fragt die Edge Function "quiz" nach neuen Fragen. Die KI läuft serverseitig,
// der API-Key verlässt Supabase nie.
export async function generateQuiz({ topicId, subjectId, count = 5 }) {
  const { data, error } = await supabase.functions.invoke('quiz', {
    body: { topicId, subjectId, count },
  })
  if (error) {
    let message = ''
    try {
      const body = await error.context.json()
      message = body?.message || ''
    } catch { /* keine JSON-Antwort */ }
    if (!message && /Failed to send|fetch/i.test(error.message || '')) {
      message = 'Die KI ist noch nicht eingerichtet oder gerade nicht erreichbar.'
    }
    throw new Error(message || 'Die KI ist gerade nicht erreichbar. Bitte versuch es nochmal.')
  }
  return data
}

export async function saveAttempt(userId, { topicId, subjectId, questions, answers }) {
  const correct = questions.filter((q, i) => answers[i] === q.correct_index).length
  await supabase.from('quiz_attempts').insert({
    user_id: userId,
    topic_id: topicId || null,
    subject_id: subjectId || null,
    question_count: questions.length,
    correct_count: correct,
    questions: questions.map((q, i) => ({ ...q, answer: answers[i] })),
  })
  return correct
}

// Letztes Quiz-Ergebnis pro Thema: { [topicId]: { correct, total, pct, at } }
export async function lastScoresByTopic(userId) {
  const { data } = await supabase
    .from('quiz_attempts')
    .select('topic_id, correct_count, question_count, created_at')
    .eq('user_id', userId)
    .not('topic_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const out = {}
  for (const row of data || []) {
    if (out[row.topic_id]) continue
    out[row.topic_id] = {
      correct: row.correct_count,
      total: row.question_count,
      pct: Math.round((row.correct_count / row.question_count) * 100),
      at: row.created_at,
    }
  }
  return out
}

export function scoreClass(pct) {
  if (pct >= 80) return 'good'
  if (pct >= 50) return 'mid'
  return 'low'
}
