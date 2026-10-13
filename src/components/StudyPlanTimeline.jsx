import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { fmtDate, parseDate, today as todayDate } from '../lib/dates.js'

const EVENT_DT_FMT = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function phaseStatus(phase) {
  const today = todayDate()
  const start = parseDate(phase.start_date)
  const end = parseDate(phase.end_date)
  if (end < today) return 'done'
  if (start <= today && today <= end) return 'current'
  return 'future'
}

export default function StudyPlanTimeline({ userId, onNavigate }) {
  const [phases, setPhases] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [events, setEvents] = useState([])
  const [selectedPhaseId, setSelectedPhaseId] = useState(null)
  const [selectedDeadlineId, setSelectedDeadlineId] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [showPhases, setShowPhases] = useState(true)
  const [showDeadlines, setShowDeadlines] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const deadlineRefs = useRef({})
  const eventRefs = useRef({})

  useEffect(() => { load() }, [userId])

  useEffect(() => {
    if (selectedDeadlineId && deadlineRefs.current[selectedDeadlineId]) {
      deadlineRefs.current[selectedDeadlineId].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedDeadlineId])

  useEffect(() => {
    if (selectedEventId && eventRefs.current[selectedEventId]) {
      eventRefs.current[selectedEventId].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedEventId])

  async function load() {
    const [{ data: p }, { data: d }, { data: e }] = await Promise.all([
      supabase.from('plan_phases').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      supabase.from('plan_deadlines').select('*').eq('user_id', userId).order('date', { ascending: true }),
      supabase.from('events').select('*').eq('user_id', userId).order('event_date', { ascending: true }),
    ])
    setPhases(p || [])
    setDeadlines(d || [])
    setEvents(e || [])
  }

  if (phases.length === 0) {
    return (
      <section className="card card-plan-timeline">
        <div className="card-head">
          <h2>Zeitstrahl</h2>
        </div>
        <p className="timeline-empty">
          Noch keine Phasen.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'phases')}>Phasen anlegen</button>
        </p>
      </section>
    )
  }

  const totalStart = new Date(Math.min(...phases.map(p => parseDate(p.start_date))))
  const totalEnd = new Date(Math.max(...phases.map(p => parseDate(p.end_date))))
  const totalSpanDays = Math.max(1, (totalEnd - totalStart) / 86400000)

  function pct(dateLike) {
    const d = typeof dateLike === 'string' && dateLike.length === 10 ? parseDate(dateLike) : new Date(dateLike)
    return Math.max(0, Math.min(100, ((d - totalStart) / 86400000 / totalSpanDays) * 100))
  }

  function pctWidth(startStr, endStr) {
    return Math.max(0, pct(endStr) - pct(startStr))
  }

  function togglePhase(id) {
    setSelectedPhaseId(current => (current === id ? null : id))
  }

  function toggleDeadline(id) {
    setSelectedDeadlineId(current => (current === id ? null : id))
  }

  function toggleEvent(id) {
    setSelectedEventId(current => (current === id ? null : id))
  }

  async function removeDeadline(id) {
    await supabase.from('plan_deadlines').delete().eq('id', id)
    if (selectedDeadlineId === id) setSelectedDeadlineId(null)
    load()
  }

  async function removeEvent(id) {
    await supabase.from('events').delete().eq('id', id)
    if (selectedEventId === id) setSelectedEventId(null)
    load()
  }

  const today = new Date()
  const todayPct = today >= totalStart && today <= totalEnd ? pct(today) : null
  const selectedPhase = phases.find(p => p.id === selectedPhaseId)

  return (
    <section className="card card-plan-timeline">
      <div className="card-head">
        <h2>Zeitstrahl</h2>
        <span className="eyebrow">{phases.length} Phasen · {deadlines.length} Deadlines · {events.length} Termine</span>
      </div>

      <div className="timeline-filter-bar">
        <button
          type="button"
          className={`timeline-filter-btn ${showPhases ? 'active' : ''}`}
          onClick={() => setShowPhases(v => !v)}
        >
          Phasen
        </button>
        <button
          type="button"
          className={`timeline-filter-btn ${showDeadlines ? 'active' : ''}`}
          onClick={() => setShowDeadlines(v => !v)}
        >
          Deadlines
        </button>
        <button
          type="button"
          className={`timeline-filter-btn ${showEvents ? 'active' : ''}`}
          onClick={() => setShowEvents(v => !v)}
        >
          Termine
        </button>
      </div>

      <div className="timeline">
        <div className="timeline-tracks">
          {showPhases && (
            <div className="timeline-track">
              {phases.map(p => (
                <div
                  key={p.id}
                  className={`timeline-bar ${phaseStatus(p)} ${p.id === selectedPhaseId ? 'selected' : ''}`}
                  style={{ left: `${pct(p.start_date)}%`, width: `${Math.max(pctWidth(p.start_date, p.end_date), 1.5)}%` }}
                  title={`${p.name}: ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`}
                />
              ))}
            </div>
          )}

          {showDeadlines && (
            <div className="timeline-deadline-track">
              {deadlines.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className={`timeline-deadline ${d.critical ? 'critical' : ''} ${d.end_date ? 'range' : ''} ${d.id === selectedDeadlineId ? 'selected' : ''}`}
                  style={{
                    left: `${pct(d.date)}%`,
                    width: d.end_date ? `${Math.max(pctWidth(d.date, d.end_date), 0.6)}%` : undefined,
                  }}
                  title={`${d.title} (${fmtDate(d.date)}${d.end_date ? ' – ' + fmtDate(d.end_date) : ''})`}
                  onClick={() => toggleDeadline(d.id)}
                />
              ))}
            </div>
          )}

          {showEvents && (
            <div className="timeline-event-track">
              {events.map(ev => (
                <button
                  key={ev.id}
                  type="button"
                  className={`timeline-event ${ev.id === selectedEventId ? 'selected' : ''}`}
                  style={{ left: `${pct(ev.event_date)}%` }}
                  title={`${ev.title} (${EVENT_DT_FMT.format(new Date(ev.event_date))})`}
                  onClick={() => toggleEvent(ev.id)}
                />
              ))}
            </div>
          )}

          {todayPct !== null && (
            <div className="timeline-today" style={{ left: `${todayPct}%` }}>
              <span className="timeline-today-label">Heute</span>
            </div>
          )}
        </div>
      </div>

      {showPhases && (
        <div className="timeline-legend">
          {phases.map(p => (
            <button
              key={p.id}
              type="button"
              className={`timeline-legend-item ${phaseStatus(p)} ${selectedPhaseId === p.id ? 'active' : ''}`}
              onClick={() => togglePhase(p.id)}
            >
              <span className="timeline-dot" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {showPhases && selectedPhase && (
        <div className="timeline-detail">
          <div className="timeline-detail-head">
            <strong>{selectedPhase.name}</strong>
            <span className="timeline-detail-dates">{fmtDate(selectedPhase.start_date)} – {fmtDate(selectedPhase.end_date)}</span>
          </div>
          {selectedPhase.description && <p>{selectedPhase.description}</p>}
        </div>
      )}

      {showDeadlines && (
        <div className="log">
          <h3>Deadlines</h3>
          <ul className="log-list">
            {deadlines.map(d => (
              <li
                key={d.id}
                ref={el => { deadlineRefs.current[d.id] = el }}
                className={[
                  'deadline-item',
                  d.critical ? 'deadline-critical' : '',
                  d.id === selectedDeadlineId ? 'deadline-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggleDeadline(d.id)}
              >
                <span className="timeline-list-text">
                  {fmtDate(d.date)}{d.end_date ? `–${fmtDate(d.end_date)}` : ''} — {d.title}
                  {d.description ? ` (${d.description})` : ''}
                </span>
                <button
                  type="button"
                  className="task-del"
                  onClick={e => { e.stopPropagation(); removeDeadline(d.id) }}
                >
                  ✕
                </button>
              </li>
            ))}
            {deadlines.length === 0 && <li>Keine Deadlines.</li>}
          </ul>
        </div>
      )}

      {showEvents && (
        <div className="log">
          <h3>Termine</h3>
          <ul className="log-list">
            {events.map(ev => (
              <li
                key={ev.id}
                ref={el => { eventRefs.current[ev.id] = el }}
                className={[
                  'timeline-event-item',
                  ev.id === selectedEventId ? 'timeline-event-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggleEvent(ev.id)}
              >
                <span className="timeline-list-text">
                  {EVENT_DT_FMT.format(new Date(ev.event_date))} — {ev.title}
                </span>
                <button
                  type="button"
                  className="task-del"
                  onClick={e => { e.stopPropagation(); removeEvent(ev.id) }}
                >
                  ✕
                </button>
              </li>
            ))}
            {events.length === 0 && <li>Keine Termine.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}
