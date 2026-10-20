import { supabase } from '../supabaseClient.js'
import { STORAGE_PREFIX } from '../config.js'
import { notifyPlanChanged } from './progress.js'

// ------------------------------------------------------------
// Zusammenfassungen (Tabelle summaries): Lumi schreibt sie aus einem
// Foto oder PDF. Gespeichert wird nur der Text als JSON:
// { overview, sections: [{heading, points}], terms: [{term, definition}],
//   formulas: [{name, formula, note}], questions: [{question, answer}] }
// ------------------------------------------------------------

const OPEN = `${STORAGE_PREFIX}:open-summary`
const CHANGED = `${STORAGE_PREFIX}:summaries-changed`
const FOCUS = `${STORAGE_PREFIX}:focus-summary`

// Leseansicht von überall öffnen
export function openSummary(id) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: { id } }))
}
export function onOpenSummary(cb) {
  const h = e => cb(e.detail?.id)
  window.addEventListener(OPEN, h)
  return () => window.removeEventListener(OPEN, h)
}

export function notifySummariesChanged() {
  window.dispatchEvent(new Event(CHANGED))
}
export function onSummariesChanged(cb) {
  window.addEventListener(CHANGED, cb)
  return () => window.removeEventListener(CHANGED, cb)
}

// Nach dem Speichern: Karte im Lernen-Tab hervorheben
export function focusSummary(id) {
  window.dispatchEvent(new CustomEvent(FOCUS, { detail: { id } }))
}
export function onFocusSummary(cb) {
  const h = e => cb(e.detail?.id)
  window.addEventListener(FOCUS, h)
  return () => window.removeEventListener(FOCUS, h)
}

export function summaryStats(content) {
  const c = content || {}
  return {
    sections: c.sections?.length || 0,
    points: (c.sections || []).reduce((n, s) => n + (s.points?.length || 0), 0),
    terms: c.terms?.length || 0,
    formulas: c.formulas?.length || 0,
    questions: c.questions?.length || 0,
  }
}

export function statsLine(content) {
  const s = summaryStats(content)
  return [
    s.sections && `${s.sections} ${s.sections === 1 ? 'Abschnitt' : 'Abschnitte'}`,
    s.terms && `${s.terms} ${s.terms === 1 ? 'Begriff' : 'Begriffe'}`,
    s.formulas && `${s.formulas} ${s.formulas === 1 ? 'Formel' : 'Formeln'}`,
    s.questions && `${s.questions} Kontrollfragen`,
  ].filter(Boolean).join(' · ')
}

export async function loadSummaries(userId) {
  const { data } = await supabase.from('summaries')
    .select('id, title, subject_id, topic_id, source, content, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false })
  return data || []
}

export async function loadSummary(id) {
  const { data } = await supabase.from('summaries')
    .select('id, user_id, title, subject_id, topic_id, source, content, created_at')
    .eq('id', id).maybeSingle()
  return data
}

// Speichern: Fach und Thema bei Bedarf neu anlegen, damit jede
// Zusammenfassung an einem Thema hängt (dann nutzen die Abfragen sie).
export async function saveSummary(userId, { subjectId, newSubject, topicId, newTopicTitle, title, source, content }) {
  let sid = subjectId
  if (!sid) {
    const { data: last } = await supabase.from('plan_subjects').select('sort_order').eq('user_id', userId)
      .order('sort_order', { ascending: false }).limit(1)
    const { data, error } = await supabase.from('plan_subjects').insert({
      user_id: userId,
      name: newSubject?.name?.trim() || 'Neues Fach',
      priority: 'mittel',
      goal_id: newSubject?.goalId || null,
      sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    }).select('id').single()
    if (error) throw new Error('Das Fach konnte nicht angelegt werden.')
    sid = data.id
  }

  let tid = topicId
  if (!tid) {
    const { data: lastTopic } = await supabase.from('plan_topics').select('sort_order').eq('user_id', userId).eq('subject_id', sid)
      .order('sort_order', { ascending: false }).limit(1)
    const { data, error } = await supabase.from('plan_topics').insert({
      user_id: userId,
      subject_id: sid,
      title: (newTopicTitle || title).trim().slice(0, 80) || 'Neues Thema',
      notes: content.overview?.replaceAll('**', '').trim() || null,
      sort_order: (lastTopic?.[0]?.sort_order ?? -1) + 1,
    }).select('id').single()
    if (error) throw new Error('Das Thema konnte nicht angelegt werden.')
    tid = data.id
  }

  const { data, error } = await supabase.from('summaries').insert({
    user_id: userId,
    subject_id: sid,
    topic_id: tid,
    title: title.trim().slice(0, 120) || 'Zusammenfassung',
    source: source?.slice(0, 160) || null,
    content,
  }).select('id').single()
  if (error) throw new Error('Die Zusammenfassung konnte nicht gespeichert werden.')
  notifySummariesChanged()
  notifyPlanChanged()
  return { id: data.id, subjectId: sid, topicId: tid }
}

export async function deleteSummary(id) {
  const { error } = await supabase.from('summaries').delete().eq('id', id)
  if (error) throw new Error('Die Zusammenfassung konnte nicht gelöscht werden.')
  notifySummariesChanged()
}
