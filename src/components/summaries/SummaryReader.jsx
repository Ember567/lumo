import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Trash2, Sparkles, FileText, FolderInput } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { deleteSummary, loadSummary, notifySummariesChanged, statsLine } from '../../lib/summaries.js'
import { lumiEmit } from '../../lib/lumi.js'
import SummaryBody from './SummaryBody.jsx'

const fmtDate = d => new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))

// Leseansicht einer Zusammenfassung — als Blatt über der Seite, druckbar.
export default function SummaryReader({ id, onClose, onStartQuiz }) {
  const [sheet, setSheet] = useState(null)
  const [meta, setMeta] = useState({ subject: '', topic: null })
  const [missing, setMissing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [place, setPlace] = useState(null) // { title, subjectId, topicId } während «Einordnen» offen ist
  const [options, setOptions] = useState({ subjects: [], topics: [] })
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  async function openPlace() {
    if (place) { setPlace(null); return }
    setPlace({ title: sheet.title, subjectId: sheet.subject_id, topicId: sheet.topic_id || '' })
    if (!options.subjects.length) {
      const [{ data: subjects }, { data: topics }] = await Promise.all([
        supabase.from('plan_subjects').select('id, name').eq('user_id', sheet.user_id).order('sort_order'),
        supabase.from('plan_topics').select('id, title, subject_id, category').eq('user_id', sheet.user_id).order('sort_order'),
      ])
      setOptions({ subjects: subjects || [], topics: topics || [] })
    }
  }

  async function savePlace(e) {
    e.preventDefault()
    const title = place.title.trim()
    if (!title) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('summaries')
      .update({ title, subject_id: place.subjectId, topic_id: place.topicId || null })
      .eq('id', sheet.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    const subject = options.subjects.find(x => x.id === place.subjectId)
    const topic = options.topics.find(x => x.id === place.topicId)
    setSheet(cur => ({ ...cur, title, subject_id: place.subjectId, topic_id: place.topicId || null }))
    setMeta({ subject: subject?.name || '', topic: topic ? { id: topic.id, title: topic.title } : null })
    setPlace(null)
    notifySummariesChanged()
  }

  useEffect(() => {
    let alive = true
    loadSummary(id).then(async s => {
      if (!alive) return
      if (!s) { setMissing(true); return }
      setSheet(s)
      const [{ data: subj }, { data: topic }] = await Promise.all([
        supabase.from('plan_subjects').select('name').eq('id', s.subject_id).maybeSingle(),
        s.topic_id ? supabase.from('plan_topics').select('id, title').eq('id', s.topic_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (alive) setMeta({ subject: subj?.name || '', topic })
    })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('summary-open')
    ref.current?.focus()
    lumiEmit('summary-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      document.body.classList.remove('summary-open')
    }
  }, [])

  useEffect(() => {
    if (!confirmDelete) return
    const t = window.setTimeout(() => setConfirmDelete(false), 4000)
    return () => window.clearTimeout(t)
  }, [confirmDelete])

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    try {
      await deleteSummary(id)
      onClose()
    } catch (e) { setError(e.message) }
  }

  function quiz() {
    onClose()
    onStartQuiz({ topicId: meta.topic.id, label: meta.topic.title, subjectName: meta.subject })
  }

  return createPortal(
    <div className="summary-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <article className="summary-sheet" role="dialog" aria-modal="true" aria-labelledby="summary-title" tabIndex={-1} ref={ref}>
        <div className="summary-bar">
          <span className="summary-badge"><FileText size={14} strokeWidth={2.4} /> Zusammenfassung</span>
          <div className="summary-tools">
            {meta.topic && (
              <button type="button" className="btn btn-sm btn-primary" onClick={quiz}>
                <Sparkles size={14} /> Abfragen
              </button>
            )}
            <button type="button" className={`btn btn-sm btn-ghost ${place ? 'on' : ''}`} onClick={openPlace} disabled={!sheet} aria-expanded={!!place}>
              <FolderInput size={14} /> Einordnen
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.print()} disabled={!sheet}>
              <Printer size={14} /> Drucken
            </button>
            <button type="button" className={`btn btn-sm btn-ghost summary-delete ${confirmDelete ? 'armed' : ''}`} onClick={remove} disabled={!sheet}>
              <Trash2 size={14} /> {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Schliessen"><X size={18} /></button>
          </div>
        </div>

        {missing && <p className="field-hint">Diese Zusammenfassung gibt es nicht mehr.</p>}
        {!sheet && !missing && <p className="scan-busy"><span className="quiz-spinner" aria-hidden="true" /> Wird geladen …</p>}

        {sheet && (
          <>
            {place && (
              <form className="summary-place" onSubmit={savePlace}>
                <label>
                  <span>Titel</span>
                  <input value={place.title} maxLength={120} onChange={e => setPlace(p => ({ ...p, title: e.target.value }))} />
                </label>
                <label>
                  <span>Fach</span>
                  <select value={place.subjectId} onChange={e => setPlace(p => ({ ...p, subjectId: e.target.value, topicId: '' }))}>
                    {options.subjects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Thema</span>
                  <select value={place.topicId} onChange={e => setPlace(p => ({ ...p, topicId: e.target.value }))}>
                    <option value="">Ohne Thema</option>
                    {options.topics.filter(x => x.subject_id === place.subjectId).map(x => (
                      <option key={x.id} value={x.id}>{x.category ? `${x.category} · ` : ''}{x.title}</option>
                    ))}
                  </select>
                </label>
                <div className="summary-place-actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPlace(null)}>Abbrechen</button>
                  <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !place.title.trim()}>{saving ? 'Speichert …' : 'Speichern'}</button>
                </div>
                <p className="summary-place-hint">Mit Thema fliesst die Zusammenfassung in die Abfragen zu diesem Thema ein.</p>
              </form>
            )}
            <header className="summary-head">
              <p className="summary-crumbs">
                {meta.subject}{meta.topic && meta.topic.title !== sheet.title ? <> · {meta.topic.title}</> : null}
              </p>
              <h2 id="summary-title">{sheet.title}</h2>
              <p className="summary-meta">
                {sheet.source ? `${sheet.source} · ` : ''}{fmtDate(sheet.created_at)}
                {statsLine(sheet.content) ? ` · ${statsLine(sheet.content)}` : ''}
              </p>
            </header>
            <SummaryBody content={sheet.content} />
            <footer className="summary-foot">Mit Lumo erstellt · Lumi kann sich irren, prüf wichtige Details im Original.</footer>
          </>
        )}
        {error && <p className="scan-error">{error}</p>}
      </article>
    </div>,
    document.body,
  )
}
