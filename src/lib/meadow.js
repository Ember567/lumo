import { supabase } from '../supabaseClient.js'
import { addDays, today, toISODate } from './dates.js'
import { getGoalProgress } from './progress.js'

// ------------------------------------------------------------
// Lichtwiese: ein Glühwürmchen pro Tag der letzten 12 Wochen.
// Es leuchtet, wenn an dem Tag gelernt wurde — Timer-Minuten,
// abgehakte Themen und Abfragen zählen. Je mehr, desto heller.
// ------------------------------------------------------------
export const MEADOW_DAYS = 84

export async function loadMeadow(userId) {
  const start = addDays(today(), -(MEADOW_DAYS - 1))
  const since = start.toISOString()
  const [{ data: sessions }, { data: topics }, { data: subtasks }, { data: quizzes }, progress] = await Promise.all([
    supabase.from('study_sessions').select('duration_seconds, created_at').eq('user_id', userId).gte('created_at', since),
    supabase.from('plan_topics').select('completed_at').eq('user_id', userId).not('completed_at', 'is', null).gte('completed_at', since),
    supabase.from('plan_subtasks').select('done_at').eq('user_id', userId).not('done_at', 'is', null).gte('done_at', since),
    supabase.from('quiz_attempts').select('created_at').eq('user_id', userId).gte('created_at', since),
    getGoalProgress(userId),
  ])

  const days = []
  const byKey = {}
  for (let i = 0; i < MEADOW_DAYS; i++) {
    const d = addDays(start, i)
    const day = { key: toISODate(d), date: d, minutes: 0, topics: 0, subtasks: 0, quizzes: 0 }
    days.push(day)
    byKey[day.key] = day
  }
  const at = ts => byKey[toISODate(new Date(ts))]
  for (const s of sessions || []) { const d = at(s.created_at); if (d) d.minutes += s.duration_seconds / 60 }
  for (const t of topics || []) { const d = at(t.completed_at); if (d) d.topics++ }
  for (const t of subtasks || []) { const d = at(t.done_at); if (d) d.subtasks++ }
  for (const q of quizzes || []) { const d = at(q.created_at); if (d) d.quizzes++ }

  for (const d of days) {
    d.minutes = Math.round(d.minutes)
    d.score = d.minutes + d.topics * 20 + d.subtasks * 6 + d.quizzes * 10
    d.glow = d.score > 0 ? Math.min(1, 0.35 + d.score / 120) : 0
  }

  const lit = days.filter(d => d.glow > 0).length
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].glow > 0) streak++
    else if (i === days.length - 1) continue // heute noch nicht gelernt: Serie zählt ab gestern
    else break
  }
  // Wichtigstes Ziel fürs Finale: das mit dem nächsten Prüfungsdatum, sonst das erste
  const goals = (progress || []).slice().sort((a, b) =>
    (a.goal.exam_date || '9999').localeCompare(b.goal.exam_date || '9999'))
  const main = goals[0] || null

  return {
    days,
    lit,
    streak,
    goal: main ? { name: main.goal.name, pct: main.pct } : null,
  }
}

export function describeDay(d) {
  const fmt = new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' })
  const parts = []
  if (d.minutes) parts.push(`${d.minutes} min gelernt`)
  if (d.topics) parts.push(`${d.topics} ${d.topics === 1 ? 'Thema' : 'Themen'} abgehakt`)
  if (d.subtasks) parts.push(`${d.subtasks} ${d.subtasks === 1 ? 'Lernziel' : 'Lernziele'}`)
  if (d.quizzes) parts.push(`${d.quizzes} ${d.quizzes === 1 ? 'Abfrage' : 'Abfragen'}`)
  return `${fmt.format(d.date)}: ${parts.length ? parts.join(', ') : 'noch dunkel'}`
}
