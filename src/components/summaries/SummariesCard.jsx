import React, { useEffect, useRef, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { requestScan } from '../../lib/scan.js'
import { loadSummaries, onFocusSummary, onSummariesChanged, openSummary, summaryStats } from '../../lib/summaries.js'
import { onPlanChanged } from '../../lib/progress.js'

const fmtShort = d => new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short' }).format(new Date(d))

// Lernen-Tab: alle Zusammenfassungen als Karteikarten, nach Fach filterbar
export default function SummariesCard({ userId }) {
  const [list, setList] = useState(null)
  const [subjects, setSubjects] = useState({})
  const [topics, setTopics] = useState({})
  const [filter, setFilter] = useState('')
  const [focus, setFocus] = useState(null)
  const refs = useRef({})

  async function load() {
    const [rows, { data: s }, { data: t }] = await Promise.all([
      loadSummaries(userId),
      supabase.from('plan_subjects').select('id, name').eq('user_id', userId),
      supabase.from('plan_topics').select('id, title').eq('user_id', userId),
    ])
    setSubjects(Object.fromEntries((s || []).map(x => [x.id, x.name])))
    setTopics(Object.fromEntries((t || []).map(x => [x.id, x.title])))
    setList(rows)
  }

  useEffect(() => {
    load()
    const a = onSummariesChanged(load)
    const b = onPlanChanged(load)
    return () => { a(); b() }
  }, [userId])

  useEffect(() => onFocusSummary(id => {
    setFilter('')
    setFocus(id)
    window.setTimeout(() => setFocus(null), 3800)
  }), [])

  useEffect(() => {
    if (focus) refs.current[focus]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, list])

  if (!list) return null

  const usedSubjects = [...new Set(list.map(s => s.subject_id))].filter(id => subjects[id])
  const shown = filter ? list.filter(s => s.subject_id === filter) : list

  return (
    <section className="card summaries-card">
      <div className="card-head">
        <h2>Zusammenfassungen</h2>
        <div className="card-head-tools">
          {list.length > 0 && <span className="eyebrow">{list.length}</span>}
          <button type="button" className="btn btn-sm btn-primary summaries-new" onClick={() => requestScan({ mode: 'summary' })}>
            <Plus size={15} strokeWidth={2.4} /> Neue Zusammenfassung
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="summaries-empty">
          <div className="summaries-empty-art" aria-hidden="true">
            <span /><span /><span />
          </div>
          <p>
            Fotografier ein Arbeitsblatt oder lade ein PDF hoch: Lumi schreibt dir eine Zusammenfassung mit den wichtigsten Punkten,
            Begriffen, Formeln und Kontrollfragen. Die Abfragen stützen sich danach darauf.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => requestScan({ mode: 'summary' })}>
            <FileText size={15} /> Erste Zusammenfassung erstellen
          </button>
        </div>
      ) : (
        <>
          {usedSubjects.length > 1 && (
            <div className="summaries-filter" role="group" aria-label="Nach Fach filtern">
              <button type="button" className={!filter ? 'on' : ''} onClick={() => setFilter('')}>Alle</button>
              {usedSubjects.map(id => (
                <button key={id} type="button" className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{subjects[id]}</button>
              ))}
            </div>
          )}
          <ul className="summaries-grid">
            {shown.map((s, i) => {
              const st = summaryStats(s.content)
              return (
                <li key={s.id} ref={el => { refs.current[s.id] = el }}>
                  <button
                    type="button" data-summary-id={s.id}
                    className={`summary-tile ${focus === s.id ? 'focus' : ''}`}
                    style={{ '--tilt': `${(i % 3 - 1) * 0.6}deg` }}
                    onClick={() => openSummary(s.id)}
                  >
                    <span className="summary-tile-subject">{subjects[s.subject_id] || 'Fach'}</span>
                    <strong>{s.title}</strong>
                    {s.topic_id && topics[s.topic_id] && topics[s.topic_id] !== s.title && (
                      <span className="summary-tile-topic">Thema: {topics[s.topic_id]}</span>
                    )}
                    <span className="summary-tile-meta">
                      {st.sections} Abschnitte{st.terms ? ` · ${st.terms} Begriffe` : ''}{st.questions ? ` · ${st.questions} Fragen` : ''}
                    </span>
                    <span className="summary-tile-date">{fmtShort(s.created_at)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
