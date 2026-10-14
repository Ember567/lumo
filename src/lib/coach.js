import { supabase } from '../supabaseClient.js'
import { getGoalProgress } from './progress.js'
import { PRIORITY_ORDER } from './plan.js'
import { addDays, currentPhaseOf, daysUntil, diffDays, fmtDate, isWithin, parseDate, today, toISODate } from './dates.js'
import { lastScores, pct, REVIEW_THRESHOLD } from './quiz.js'
import { STORAGE_PREFIX } from '../config.js'

// ------------------------------------------------------------
// Lumi — der Lernbegleiter
//
// loadCoachState() liest den Lernstand und leitet daraus ab:
//   - mood:  Gesichtsausdruck des Maskottchens (ohne KI, aus Regeln)
//   - tips:  kurze Hinweise mit Aktionen (ohne KI)
//   - context: kompakter Text für den KI-Chat. Themen und Fächer tragen
//     kurze Kürzel (T1, S1 …), die KI antwortet mit diesen Kürzeln und
//     `refs` übersetzt sie zurück. So sieht die KI keine IDs und kann
//     keine erfinden, die zufällig gültig wären.
// ------------------------------------------------------------

export const COACH_DAILY_LIMIT = 30 // = AI_CHAT_DAILY_LIMIT_USER der Edge Function (nur Anzeige)

export const MOOD_TEXT = {
  happy: 'freut sich, dass du da bist',
  proud: 'ist stolz auf dich',
  thinking: 'denkt mit',
  cheer: 'feuert dich an',
  calm: 'ist ganz entspannt',
  sleepy: 'ist schon etwas müde',
  worried: 'behält deine Fristen im Blick',
}

const SECTION_NAMES = {
  overview: 'Übersicht', learning: 'Lernen', quiz: 'Abfragen', planner: 'Planer',
  organisation: 'Organisation', links: 'Links', settings: 'Einstellungen',
}

const minutes = secs => Math.round(secs / 60)
const dayKey = d => toISODate(d instanceof Date ? d : new Date(d))

export async function loadCoachState(userId) {
  const since = addDays(today(), -30).toISOString()
  const [
    { data: settings }, progress, { data: phases }, { data: weeks }, { data: subjects }, { data: topics },
    { data: deadlines }, { data: tasks }, { data: events }, { data: sessions }, { data: attempts },
  ] = await Promise.all([
    supabase.from('settings').select('display_name').eq('user_id', userId).maybeSingle(),
    getGoalProgress(userId),
    supabase.from('plan_phases').select('id, name, start_date, end_date').eq('user_id', userId).order('start_date'),
    supabase.from('plan_weeks').select('*').eq('user_id', userId).order('start_date'),
    supabase.from('plan_subjects').select('id, name, priority, sort_order').eq('user_id', userId),
    supabase.from('plan_topics').select('id, title, subject_id, phase_id, category, done, completed_at, sort_order').eq('user_id', userId).order('sort_order'),
    supabase.from('plan_deadlines').select('title, date, end_date, critical').eq('user_id', userId).gte('date', toISODate(today())).order('date').limit(4),
    supabase.from('tasks').select('title, due_date').eq('user_id', userId).eq('done', false).order('due_date', { nullsFirst: false }).limit(6),
    supabase.from('events').select('title, event_date').eq('user_id', userId)
      .gte('event_date', today().toISOString()).lte('event_date', addDays(today(), 8).toISOString()).order('event_date').limit(5),
    supabase.from('study_sessions').select('duration_seconds, topic_id, created_at').eq('user_id', userId).gte('created_at', since),
    supabase.from('quiz_attempts').select('topic_id, subject_id, correct_count, question_count, created_at').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(300),
  ])

  const t = today()
  const now = new Date()
  const subjectList = [...(subjects || [])].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || a.sort_order - b.sort_order)
  const subjectById = Object.fromEntries(subjectList.map(s => [s.id, s]))
  const allTopics = topics || []
  const topicById = Object.fromEntries(allTopics.map(tp => [tp.id, tp]))
  const scores = lastScores(attempts || [])

  // ---- Lernzeit ----
  const secsByDay = {}
  for (const s of sessions || []) secsByDay[dayKey(s.created_at)] = (secsByDay[dayKey(s.created_at)] || 0) + s.duration_seconds
  const todayMin = minutes(secsByDay[dayKey(t)] || 0)
  const weekStart = addDays(t, -((t.getDay() + 6) % 7))
  const weekMin = minutes(Object.entries(secsByDay).filter(([d]) => parseDate(d) >= weekStart).reduce((n, [, s]) => n + s, 0))
  let streak = 0
  for (let d = secsByDay[dayKey(t)] ? t : addDays(t, -1); secsByDay[dayKey(d)]; d = addDays(d, -1)) streak++
  const studyDays = Object.keys(secsByDay).sort()
  const lastStudyDaysAgo = studyDays.length ? diffDays(t, studyDays[studyDays.length - 1]) : null

  const quizzesToday = (attempts || []).filter(a => dayKey(a.created_at) === dayKey(t))
  const bestQuizToday = quizzesToday.reduce((m, a) => Math.max(m, pct(a.correct_count, a.question_count)), -1)

  // ---- Phase & Woche ----
  const phase = currentPhaseOf(phases || [])
  let phaseStatus = null
  if (phase) {
    const list = allTopics.filter(tp => tp.phase_id === phase.id)
    const total = diffDays(phase.end_date, phase.start_date) + 1
    const elapsed = Math.min(total, diffDays(t, phase.start_date) + 1)
    const expected = Math.round((list.length * elapsed) / total)
    const done = list.filter(tp => tp.done).length
    phaseStatus = { phase, total: list.length, done, expected, behind: expected - done, daysLeft: daysUntil(phase.end_date) }
  }
  const week = (weeks || []).find(w => isWithin(t, w.start_date, w.end_date)) || null
  const focusIds = week ? [...(week.primary_topic_ids || []), ...(week.secondary_topic_ids || [])] : []

  // ---- Nächstes Thema: Wochenfokus → Phase → Priorität ----
  const byPriority = (a, b) =>
    (PRIORITY_ORDER[subjectById[a.subject_id]?.priority] ?? 9) - (PRIORITY_ORDER[subjectById[b.subject_id]?.priority] ?? 9) || a.sort_order - b.sort_order
  const open = allTopics.filter(tp => !tp.done)
  const focusOpen = focusIds.map(id => topicById[id]).filter(tp => tp && !tp.done)
  const phaseOpen = phase ? open.filter(tp => tp.phase_id === phase.id).sort(byPriority) : []
  const nextTopic = focusOpen[0] || phaseOpen[0] || [...open].sort(byPriority)[0] || null

  const weak = allTopics.filter(tp => scores[tp.id] && scores[tp.id].pct < REVIEW_THRESHOLD).sort((a, b) => scores[a.id].pct - scores[b.id].pct)
  const doneNeverQuizzed = allTopics.filter(tp => tp.done && !scores[tp.id]).sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))

  const goals = (progress || []).map(p => ({ ...p, daysLeft: p.goal.exam_date ? daysUntil(p.goal.exam_date) : null }))
  const nextDeadline = (deadlines || [])[0] || null
  const deadlineDays = nextDeadline ? daysUntil(nextDeadline.date) : null

  // ---- Stimmung ----
  const hour = now.getHours()
  let mood = 'calm'
  if (hour >= 23 || hour < 5) mood = 'sleepy'
  else if (todayMin >= 60 || bestQuizToday >= 80) mood = 'proud'
  else if ((deadlineDays !== null && deadlineDays <= 7) || (phaseStatus && phaseStatus.behind >= 5) || (lastStudyDaysAgo !== null && lastStudyDaysAgo >= 3)) mood = 'worried'
  else if (todayMin > 0 || quizzesToday.length) mood = 'happy'

  // ---- Tipps (wichtigster zuerst) ----
  const subjectName = tp => subjectById[tp.subject_id]?.name || ''
  const quizAction = (tp, label) => ({ type: 'start_quiz', label: label || `${tp.title} abfragen`, topic: tp })
  const tips = []
  if (mood === 'sleepy') {
    tips.push({ id: 'sleepy', text: 'Schon spät. Schlaf festigt, was du heute gelernt hast. Morgen geht es frisch weiter.', actions: [{ type: 'chat', label: 'Plan für morgen', prompt: 'Was soll ich morgen lernen? Mach mir einen kurzen Plan.' }] })
  }
  if (nextDeadline && deadlineDays <= 7) {
    tips.push({ id: `deadline-${nextDeadline.title}`, text: `«${nextDeadline.title}» ist ${deadlineDays === 0 ? 'heute' : deadlineDays === 1 ? 'morgen' : `in ${deadlineDays} Tagen`} fällig.`, actions: [{ type: 'open_section', label: 'Zur Organisation', section: 'organisation' }] })
  }
  if (weak[0]) {
    const s = scores[weak[0].id]
    tips.push({ id: `weak-${weak[0].id}-${s.at}`, topicId: weak[0].id, text: `«${weak[0].title}» war in der letzten Abfrage knapp (${s.correct}/${s.total}). Noch eine Runde?`, actions: [quizAction(weak[0], 'Nochmal abfragen')] })
  }
  if (todayMin === 0 && nextTopic && mood !== 'sleepy') {
    const why = focusOpen[0] === nextTopic ? 'Es steht im Wochenfokus.'
      : phaseOpen[0] === nextTopic ? `Es gehört zur Phase «${phase.name}».`
        : `${subjectName(nextTopic)} hat Priorität «${subjectById[nextTopic.subject_id]?.priority}».`
    tips.push({ id: `next-${nextTopic.id}`, topicId: nextTopic.id, text: `Heute noch nichts gelernt. Wie wär's mit «${nextTopic.title}»? ${why}`, actions: [{ type: 'open_section', label: 'Los geht\'s', section: 'learning' }, quizAction(nextTopic, 'Erst abfragen')] })
  }
  if (phaseStatus && phaseStatus.behind >= 3) {
    tips.push({ id: `behind-${phaseStatus.behind}`, text: `In der Phase «${phase.name}» liegst du ${phaseStatus.behind} Themen hinter dem Plan. Wollen wir das zusammen sortieren?`, actions: [{ type: 'chat', label: 'Wie hole ich auf?', prompt: 'Ich liege hinter dem Plan. Wie hole ich realistisch auf?' }] })
  }
  if (mood === 'proud') {
    tips.push({ id: `proud-${dayKey(t)}`, text: todayMin >= 60 ? `Schon ${todayMin} Minuten heute. Stark!` : 'Super Abfrage heute!', actions: doneNeverQuizzed[0] ? [quizAction(doneNeverQuizzed[0], 'Noch kurz abfragen')] : [] })
  }
  if (doneNeverQuizzed[0]) {
    tips.push({ id: `unquizzed-${doneNeverQuizzed[0].id}`, topicId: doneNeverQuizzed[0].id, text: `«${doneNeverQuizzed[0].title}» hast du abgehakt, aber nie abgefragt. Sitzt es wirklich?`, actions: [quizAction(doneNeverQuizzed[0], 'Abfragen')] })
  }

  // ---- Kontext für die KI ----
  const refs = {}
  const ref = (prefix, obj) => {
    const existing = Object.entries(refs).find(([, v]) => v.id === obj.id)
    if (existing) return existing[0]
    const key = `${prefix}${Object.keys(refs).filter(k => k[0] === prefix).length + 1}`
    refs[key] = obj
    return key
  }
  const topicLine = tp => {
    const s = scores[tp.id]
    const bits = [subjectName(tp)]
    if (tp.category) bits.push(tp.category)
    if (tp.done) bits.push('erledigt')
    if (s) bits.push(`letzte Abfrage ${s.correct}/${s.total}`)
    return `- [${ref('T', tp)}] ${tp.title} (${bits.join(', ')})`
  }

  const L = []
  L.push(`Jetzt: ${new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now)}`)
  if (settings?.display_name) L.push(`Name: ${settings.display_name}`)
  L.push('', 'Ziele:')
  for (const g of goals) {
    const amount = g.goal.kind === 'hours' ? `${Math.round(g.hoursLogged)}/${g.targetHours} Stunden` : `${g.doneUnits}/${g.totalUnits} Lerneinheiten`
    L.push(`- ${g.goal.name}: ${g.pct}% (${amount})${g.goal.exam_date ? `, Prüfung ${fmtDate(g.goal.exam_date)} (in ${g.daysLeft} Tagen)` : ''}`)
  }
  if (!goals.length) L.push('- (keine Ziele angelegt)')
  if (phaseStatus) {
    const st = phaseStatus.behind > 0 ? `${phaseStatus.behind} hinter Plan` : phaseStatus.behind < 0 ? `${-phaseStatus.behind} vor Plan` : 'genau im Plan'
    L.push('', `Aktuelle Phase: ${phase.name} (${fmtDate(phase.start_date)}–${fmtDate(phase.end_date)}, noch ${phaseStatus.daysLeft} Tage): ${phaseStatus.done}/${phaseStatus.total} Themen erledigt, Soll heute ${phaseStatus.expected} → ${st}`)
  }
  if (week) {
    const part = (subjectId, focus, ids) => {
      const s = subjectById[subjectId]
      const list = (ids || []).map(id => topicById[id]).filter(Boolean).map(tp => `[${ref('T', tp)}] ${tp.title}${tp.done ? ' ✓' : ''}`)
      return `${s ? s.name : '–'}${focus ? ` – ${focus}` : ''}${list.length ? ` (${list.join(', ')})` : ''}`
    }
    L.push(`Wochenfokus ${fmtDate(week.start_date)}–${fmtDate(week.end_date)}${week.is_buffer_week ? ' (Pufferwoche)' : ''}: Haupt: ${part(week.primary_subject_id, week.primary_focus, week.primary_topic_ids)}; Neben: ${part(week.secondary_subject_id, week.secondary_focus, week.secondary_topic_ids)}`)
  }
  L.push('', `Lernzeit: heute ${todayMin} min, diese Woche ${weekMin} min, ${streak} Tag(e) in Folge${lastStudyDaysAgo !== null ? `, zuletzt gelernt ${lastStudyDaysAgo === 0 ? 'heute' : `vor ${lastStudyDaysAgo} Tagen`}` : ', noch nie mit dem Timer gelernt'}`)
  L.push(`Abfragen heute: ${quizzesToday.length}${bestQuizToday >= 0 ? `, bestes Ergebnis ${bestQuizToday}%` : ''}`)

  if ((deadlines || []).length) {
    L.push('', 'Nächste Fristen:')
    for (const d of deadlines) L.push(`- ${d.title}: ${fmtDate(d.date)} (in ${daysUntil(d.date)} Tagen)${d.critical ? ', wichtig' : ''}`)
  }
  if ((tasks || []).length) {
    L.push('', 'Offene Aufgaben:')
    for (const tk of tasks) L.push(`- ${tk.title}${tk.due_date ? ` (fällig ${fmtDate(tk.due_date)})` : ''}`)
  }
  if ((events || []).length) {
    L.push('', 'Termine nächste Tage:')
    for (const e of events) L.push(`- ${e.title}: ${new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(e.event_date))}`)
  }

  L.push('', 'Fächer (Kürzel, Priorität, erledigt/gesamt, Ø letzte Abfragen):')
  for (const s of subjectList) {
    const list = allTopics.filter(tp => tp.subject_id === s.id)
    if (!list.length) continue
    const quizzed = list.filter(tp => scores[tp.id])
    const avg = quizzed.length ? `${Math.round(quizzed.reduce((n, tp) => n + scores[tp.id].pct, 0) / quizzed.length)}%` : 'nie abgefragt'
    L.push(`- [${ref('S', s)}] ${s.name}: ${s.priority}, ${list.filter(tp => tp.done).length}/${list.length}, ${avg}`)
  }

  const seen = new Set()
  const pick = (list, n) => list.filter(tp => !seen.has(tp.id) && seen.add(tp.id)).slice(0, n)
  const nextUp = pick([...focusOpen, ...phaseOpen, ...[...open].sort(byPriority)], 18)
  if (nextUp.length) { L.push('', 'Nächste offene Themen (empfohlene Reihenfolge: Wochenfokus, Phase, Priorität):'); nextUp.forEach(tp => L.push(topicLine(tp))) }
  const weakList = pick(weak, 6)
  if (weakList.length) { L.push('', 'Schwache Themen (letzte Abfrage unter 60%):'); weakList.forEach(tp => L.push(topicLine(tp))) }
  const recentDone = pick([...allTopics].filter(tp => tp.done).sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0)), 6)
  if (recentDone.length) { L.push('', 'Zuletzt erledigt:'); recentDone.forEach(tp => L.push(topicLine(tp))) }
  L.push('', `Offene Themen insgesamt: ${open.length} von ${allTopics.length}`)

  return {
    name: settings?.display_name || '',
    mood,
    tips,
    refs,
    baseContext: L.join('\n'),
    stats: { todayMin, weekMin, streak, lastStudyDaysAgo, quizzesToday: quizzesToday.length },
    nextTopic,
    loadedAt: Date.now(),
  }
}

export function contextFor(state, section) {
  return `${state.baseContext}\n\nDie Person ist gerade im Bereich: ${SECTION_NAMES[section] || section}`
}

export async function askLumi(messages, context) {
  const { data, error } = await supabase.functions.invoke('coach', {
    body: { messages: messages.map(m => ({ role: m.role, content: m.content })), context },
  })
  if (error) {
    let message = ''
    try { message = (await error.context.json())?.message || '' } catch { /* keine JSON-Antwort */ }
    throw new Error(message || 'Ich bin gerade nicht erreichbar. Versuch es gleich nochmal.')
  }
  return data
}

// Begrüssung ohne KI — spart Kontingent und ist sofort da.
export function greeting(state) {
  const h = new Date().getHours()
  const hello = h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend'
  const name = state.name ? `, ${state.name}` : ''
  const parts = [`${hello}${name}! Ich bin Lumi und begleite dich beim Lernen.`]
  if (state.stats.todayMin > 0) parts.push(`Heute hast du schon ${state.stats.todayMin} Minuten gelernt.`)
  if (state.stats.streak >= 2) parts.push(`${state.stats.streak} Tage in Folge, weiter so!`)
  parts.push('Frag mich, was als Nächstes dran ist, wie du im Plan stehst, oder lass dir etwas erklären.')
  return parts.join(' ')
}

export const QUICK_PROMPTS = [
  'Was soll ich als Nächstes lernen?',
  'Wie stehe ich im Plan?',
  'Mach mir einen Plan für heute',
  'Wo bin ich am schwächsten?',
]

// ---- Lokale Einstellungen (pro Gerät) ----
const hiddenKey = `${STORAGE_PREFIX}:lumi-hidden`
const chatKey = userId => `${STORAGE_PREFIX}:lumi-chat:${userId}`
const tipKey = userId => `${STORAGE_PREFIX}:lumi-tips:${userId}`

export function isLumiHidden() {
  try { return localStorage.getItem(hiddenKey) === 'true' } catch { return false }
}
export function setLumiHidden(hidden) {
  try { localStorage.setItem(hiddenKey, String(hidden)) } catch { /* ignorieren */ }
  window.dispatchEvent(new CustomEvent(`${STORAGE_PREFIX}:lumi-visibility`))
}
export function onLumiVisibility(cb) {
  window.addEventListener(`${STORAGE_PREFIX}:lumi-visibility`, cb)
  return () => window.removeEventListener(`${STORAGE_PREFIX}:lumi-visibility`, cb)
}

export function loadChat(userId) {
  try { return JSON.parse(localStorage.getItem(chatKey(userId))) || [] } catch { return [] }
}
export function saveChat(userId, messages) {
  try { localStorage.setItem(chatKey(userId), JSON.stringify(messages.slice(-30))) } catch { /* ignorieren */ }
}

export function clearChat(userId) {
  saveChat(userId, [])
  window.dispatchEvent(new CustomEvent(`${STORAGE_PREFIX}:lumi-visibility`))
}

// Ein Tipp erscheint pro Tag höchstens einmal als Sprechblase.
export function seenTips(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(tipKey(userId)))
    return v?.day === toISODate(today()) ? v.ids : []
  } catch { return [] }
}
export function markTipSeen(userId, id) {
  const ids = [...new Set([...seenTips(userId), id])]
  try { localStorage.setItem(tipKey(userId), JSON.stringify({ day: toISODate(today()), ids })) } catch { /* ignorieren */ }
}
