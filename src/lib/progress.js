import { supabase } from '../supabaseClient.js'
import { STORAGE_PREFIX } from '../config.js'

// Einzige Quelle für alle Fortschrittsformeln. Jede Anzeige (Status-Leiste,
// Fortschritts-Karte, Burn-up) rechnet über diese Funktionen, damit die
// Zahlen nie auseinanderlaufen.

const PLAN_CHANGED_EVENT = `${STORAGE_PREFIX}:plan-changed`
const SCROLL_TO_TOPICS_EVENT = `${STORAGE_PREFIX}:scroll-to-topics`

// Komponenten bleiben innerhalb einer Sektion gemeinsam gemountet. Wenn eine
// davon ein Thema abhakt oder eine Session speichert, signalisiert dieses
// Event den anderen, dass sie neu laden sollen.
export function onPlanChanged(callback) {
  window.addEventListener(PLAN_CHANGED_EVENT, callback)
  return () => window.removeEventListener(PLAN_CHANGED_EVENT, callback)
}

export function notifyPlanChanged() {
  window.dispatchEvent(new Event(PLAN_CHANGED_EVENT))
}

export function onScrollToTopics(callback) {
  window.addEventListener(SCROLL_TO_TOPICS_EVENT, callback)
  return () => window.removeEventListener(SCROLL_TO_TOPICS_EVENT, callback)
}

export function scrollToTopics(topicIds) {
  window.dispatchEvent(new CustomEvent(SCROLL_TO_TOPICS_EVENT, { detail: { topicIds } }))
}

// Eine "Completion Unit" ist die kleinste Fortschrittseinheit: ein Unterthema,
// oder — für Themen ohne Unterthemen — das Thema selbst.
export function topicUnits(topic, subtasks) {
  if (subtasks && subtasks.length > 0) {
    return subtasks.map(st => ({ done: st.is_done, completedAt: st.done_at }))
  }
  return [{ done: topic.done, completedAt: topic.completed_at }]
}

function groupBy(list, key) {
  const out = {}
  for (const item of list) (out[item[key]] ||= []).push(item)
  return out
}

async function fetchTopicsWithSubtasks(userId, { phaseId } = {}) {
  let q = supabase.from('plan_topics').select('id, subject_id, phase_id, done, completed_at').eq('user_id', userId)
  if (phaseId) q = q.eq('phase_id', phaseId)
  const { data: topics } = await q
  const list = topics || []
  if (list.length === 0) return { topics: [], subtasksByTopic: {} }

  const { data: subtasks } = await supabase
    .from('plan_subtasks')
    .select('topic_id, is_done, done_at')
    .eq('user_id', userId)
    .in('topic_id', list.map(t => t.id))
  return { topics: list, subtasksByTopic: groupBy(subtasks || [], 'topic_id') }
}

// Alle Units einer Phase (für den Burn-up-Chart).
export async function getCompletionUnits(userId, { phaseId } = {}) {
  const { topics, subtasksByTopic } = await fetchTopicsWithSubtasks(userId, { phaseId })
  return topics.flatMap(t => topicUnits(t, subtasksByTopic[t.id]))
}

// Fortschritt pro Ziel.
//   kind 'topics': Durchschnitt des relativen Fortschritts der zugeordneten
//     Fächer — jedes Fach zählt gleich viel, egal wie viele Themen es hat.
//   kind 'hours' : geloggte Timer-Stunden für dieses Ziel / target_hours.
export async function getGoalProgress(userId) {
  const [{ data: goals }, { data: subjects }, { data: sessions }, { topics, subtasksByTopic }] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', userId).order('sort_order').order('created_at'),
    supabase.from('plan_subjects').select('id, goal_id').eq('user_id', userId),
    supabase.from('study_sessions').select('goal_id, duration_seconds').eq('user_id', userId),
    fetchTopicsWithSubtasks(userId),
  ])

  const topicsBySubject = groupBy(topics, 'subject_id')
  const secondsByGoal = {}
  for (const s of sessions || []) {
    if (s.goal_id) secondsByGoal[s.goal_id] = (secondsByGoal[s.goal_id] || 0) + s.duration_seconds
  }

  return (goals || []).map(goal => {
    if (goal.kind === 'hours') {
      const hoursLogged = (secondsByGoal[goal.id] || 0) / 3600
      const targetHours = Number(goal.target_hours) || 0
      const pct = targetHours > 0 ? Math.min(100, Math.round((hoursLogged / targetHours) * 100)) : 0
      return { goal, pct, hoursLogged, targetHours }
    }

    const subjectPcts = []
    let doneUnits = 0
    let totalUnits = 0
    for (const subject of (subjects || []).filter(s => s.goal_id === goal.id)) {
      const units = (topicsBySubject[subject.id] || []).flatMap(t => topicUnits(t, subtasksByTopic[t.id]))
      if (units.length === 0) continue
      const done = units.filter(u => u.done).length
      doneUnits += done
      totalUnits += units.length
      subjectPcts.push((done / units.length) * 100)
    }
    const pct = subjectPcts.length ? Math.round(subjectPcts.reduce((a, b) => a + b, 0) / subjectPcts.length) : 0
    return { goal, pct, doneUnits, totalUnits, subjectCount: subjectPcts.length }
  })
}

// Gesamte Lernzeit, aufgeteilt nach Ziel ("none" = ohne Ziel).
export async function getStudyTotals(userId) {
  const { data } = await supabase.from('study_sessions').select('duration_seconds, goal_id').eq('user_id', userId)
  const byGoal = {}
  let totalSeconds = 0
  for (const s of data || []) {
    totalSeconds += s.duration_seconds
    const key = s.goal_id || 'none'
    byGoal[key] = (byGoal[key] || 0) + s.duration_seconds
  }
  return { totalSeconds, byGoal }
}

// Der Verlauf zeigt Meilensteine (alle 10%), nicht jeden Prozentpunkt.
// Der erste Eintrag eines Ziels und 100% werden immer geloggt.
function isMilestone(newPct, lastPct) {
  if (lastPct == null) return newPct > 0
  if (newPct === 100 && lastPct !== 100) return true
  return Math.floor(newPct / 10) !== Math.floor(lastPct / 10)
}

// Nach jeder Änderung am Fortschritt aufrufen (Thema abgehakt, Session
// gespeichert …): berechnet alle Ziele neu, schreibt Meilensteine und
// informiert die übrigen Komponenten.
export async function recordProgress(userId) {
  try {
    const [progress, { data: snapshots }] = await Promise.all([
      getGoalProgress(userId),
      supabase.from('progress_snapshots').select('goal_id, pct, created_at').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(500),
    ])
    const lastByGoal = {}
    for (const s of snapshots || []) if (!(s.goal_id in lastByGoal)) lastByGoal[s.goal_id] = s.pct

    const rows = progress
      .filter(p => isMilestone(p.pct, lastByGoal[p.goal.id]))
      .map(p => ({ user_id: userId, goal_id: p.goal.id, pct: p.pct }))
    if (rows.length) await supabase.from('progress_snapshots').insert(rows)
  } finally {
    notifyPlanChanged()
  }
}
