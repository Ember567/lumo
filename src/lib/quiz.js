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

// Muss zu AI_DAILY_LIMIT_USER der Edge Function passen (Standard 20).
// Nur für die Anzeige — durchgesetzt wird das Limit auf dem Server.
export const QUIZ_DAILY_LIMIT = 20

// Unter dieser Trefferquote schlägt Lumo ein Thema zum Wiederholen vor.
export const REVIEW_THRESHOLD = 60

export const pct = (correct, total) => (total ? Math.round((correct / total) * 100) : 0)

// Alles, was der Abfragen-Bereich braucht, in einem Rutsch.
export async function loadQuizData(userId) {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const [subjects, topics, attempts, mistakes, usage] = await Promise.all([
    supabase.from('plan_subjects').select('id, name, priority').eq('user_id', userId),
    supabase.from('plan_topics').select('id, title, subject_id, category, done, sort_order').eq('user_id', userId).order('sort_order'),
    supabase.from('quiz_attempts')
      .select('id, topic_id, subject_id, question_count, correct_count, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1000),
    supabase.from('quiz_attempts')
      .select('id, topic_id, subject_id, questions, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(40),
    supabase.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('kind', 'quiz').gte('created_at', dayStart.toISOString()),
  ])
  return {
    subjects: subjects.data || [],
    topics: topics.data || [],
    attempts: attempts.data || [],
    mistakeAttempts: mistakes.data || [],
    usedToday: usage.count || 0,
  }
}

// Letztes Ergebnis pro Thema aus bereits geladenen Versuchen (neueste zuerst).
export function lastScores(attempts) {
  const out = {}
  for (const a of attempts) {
    if (!a.topic_id || out[a.topic_id]) continue
    out[a.topic_id] = { correct: a.correct_count, total: a.question_count, pct: pct(a.correct_count, a.question_count), at: a.created_at }
  }
  return out
}

// Falsch beantwortete Fragen, neueste zuerst, ohne Doppelte.
export function collectMistakes(mistakeAttempts) {
  const seen = new Set()
  const out = []
  for (const a of mistakeAttempts) {
    for (const q of a.questions || []) {
      if (q.answer === q.correct_index || q.answer == null) continue
      const key = q.question.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...q, topic_id: a.topic_id, subject_id: a.subject_id, at: a.created_at })
    }
  }
  return out
}

// Antwortreihenfolge neu mischen, damit man sich nicht die Position merkt.
export function reshuffle(q) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
  return {
    question: q.question,
    options: order.map(i => q.options[i]),
    correct_index: order.indexOf(q.correct_index),
    explanation: q.explanation,
  }
}
