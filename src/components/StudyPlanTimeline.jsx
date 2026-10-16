import React, { useEffect, useRef, useState } from 'react'
import { X, Flag, CalendarDays, Layers } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { fmtDate, parseDate, today as todayDate, diffDays } from '../lib/dates.js'

const TIME_FMT = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' })
const MONTH_SHORT = new Intl.DateTimeFormat('de-CH', { month: 'short' })
const DAY_MONTH = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short' })

// Phasenfarben aus der Lumo-Palette, der Reihe nach
const PHASE_COLORS = ['#D9C8FF', '#C0F7FE', '#99E885', '#FFDC8B', '#FE90E8', '#F7CB46']

function phaseStatus(phase) {
  const today = todayDate()
  const start = parseDate(phase.start_date)
  const end = parseDate(phase.end_date)
  if (end < today) return 'done'
  if (start <= today && today <= end) return 'current'
  return 'future'
}

function phaseInfo(phase) {
  const status = phaseStatus(phase)
  if (status === 'done') return 'abgeschlossen'
  if (status === 'current') {
    const left = diffDays(phase.end_date, todayDate())
    return left === 0 ? 'endet heute' : `läuft · noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`
  }
  const until = diffDays(phase.start_date, todayDate())
  return `startet in ${until} ${until === 1 ? 'Tag' : 'Tagen'}`
}

// "in 122 Tagen", "läuft", "vorbei"
function countdown(start, end) {
  const t = todayDate()
  const s = parseDate(start)
  const e = end ? parseDate(end) : s
  if (e < t) return { text: 'vorbei', tone: 'past' }
  if (s <= t) return { text: end ? 'läuft' : 'heute', tone: 'now' }
  const d = diffDays(start, t)
  if (d === 1) return { text: 'morgen', tone: 'soon' }
  return { text: `in ${d} Tagen`, tone: d <= 30 ? 'soon' : 'later' }
}

function DateTile({ date, tone }) {
  const d = date instanceof Date ? date : parseDate(date)
  return (
    <span className={`tl-date ${tone}`} aria-hidden="true">
      <b>{d.getDate()}</b>
      <span>{MONTH_SHORT.format(d).replace('.', '')}</span>
      <small>{d.getFullYear()}</small>
    </span>
  )
}

export default function StudyPlanTimeline({ userId, onNavigate }) {
  const [phases, setPhases] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [events, setEvents] = useState([])
  const [goals, setGoals] = useState({})
  const [selectedPhaseId, setSelectedPhaseId] = useState(null)
  const [selectedDeadlineId, setSelectedDeadlineId] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [show, setShow] = useState({ phases: true, deadlines: true, events: true })
  const deadlineRefs = useRef({})
  const scrollRef = useRef(null)
  const eventRefs = useRef({})

  useEffect(() => { load() }, [userId])

  // Auf schmalen Bildschirmen scrollt der Zeitstrahl: "Heute" ins Bild holen
  useEffect(() => {
    const box = scrollRef.current
    const mark = box?.querySelector('.tl-today')
    if (!box || !mark || box.scrollWidth <= box.clientWidth) return
    box.scrollLeft = Math.max(0, mark.offsetLeft - box.clientWidth * 0.3)
  }, [phases])

  useEffect(() => {
    if (selectedDeadlineId) deadlineRefs.current[selectedDeadlineId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedDeadlineId])

  useEffect(() => {
    if (selectedEventId) eventRefs.current[selectedEventId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedEventId])

  async function load() {
    const [{ data: p }, { data: d }, { data: e }, { data: g }] = await Promise.all([
      supabase.from('plan_phases').select('*').eq('user_id', userId).order('start_date', { ascending: true }),
      supabase.from('plan_deadlines').select('*').eq('user_id', userId).order('date', { ascending: true }),
      supabase.from('events').select('*').eq('user_id', userId).order('event_date', { ascending: true }),
      supabase.from('goals').select('id, name').eq('user_id', userId),
    ])
    setPhases(p || [])
    setDeadlines(d || [])
    setEvents(e || [])
    setGoals(Object.fromEntries((g || []).map(x => [x.id, x.name])))
  }

  if (phases.length === 0) {
    return (
      <section className="card card-plan-timeline">
        <div className="card-head"><h2>Zeitstrahl</h2></div>
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
  const span = (a, b) => Math.max(0, pct(b) - pct(a))

  // Monatsachse: erster jedes Monats im Zeitraum
  const months = []
  for (let m = new Date(totalStart.getFullYear(), totalStart.getMonth() + 1, 1); m <= totalEnd; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    months.push({ at: pct(m), label: m.getMonth() === 0 ? `Jan ${String(m.getFullYear()).slice(2)}` : MONTH_SHORT.format(m).replace('.', '') })
  }

  const toggle = (setter, id) => setter(cur => (cur === id ? null : id))

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

  const now = new Date()
  const todayPct = now >= totalStart && now <= totalEnd ? pct(now) : null
  const selectedPhase = phases.find(p => p.id === selectedPhaseId)
  const colorOf = p => PHASE_COLORS[phases.indexOf(p) % PHASE_COLORS.length]

  const FILTERS = [
    { key: 'phases', label: 'Phasen', icon: Layers, n: phases.length },
    { key: 'deadlines', label: 'Fristen', icon: Flag, n: deadlines.length },
    { key: 'events', label: 'Termine', icon: CalendarDays, n: events.length },
  ]

  return (
    <section className="card card-plan-timeline tl-card">
      <div className="card-head">
        <h2>Zeitstrahl</h2>
        <span className="eyebrow">{fmtDate(totalStart)} – {fmtDate(totalEnd)}</span>
      </div>

      <div className="tl-filters" role="group" aria-label="Anzeigen">
        {FILTERS.map(f => (
          <button
            key={f.key} type="button" aria-pressed={show[f.key]}
            className={`tl-filter tl-filter-${f.key} ${show[f.key] ? 'on' : ''}`}
            onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
          >
            <f.icon size={14} strokeWidth={2.4} /> {f.label} <span className="tl-filter-n">{f.n}</span>
          </button>
        ))}
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-board">
          <div className="tl-axis" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i} className="tl-month" style={{ left: `${m.at}%` }}>{m.label}</span>
            ))}
          </div>

          {show.phases && (
            <div className="tl-row tl-row-phases">
              {phases.map(p => {
                const status = phaseStatus(p)
                const elapsed = status === 'current' ? Math.min(100, (span(p.start_date, now) / Math.max(0.01, span(p.start_date, p.end_date))) * 100) : 0
                return (
                  <button
                    key={p.id} type="button"
                    className={`tl-phase ${status} ${p.id === selectedPhaseId ? 'selected' : ''}`}
                    style={{ left: `${pct(p.start_date)}%`, width: `${Math.max(span(p.start_date, p.end_date), 1.6)}%`, '--phase': colorOf(p) }}
                    title={`${p.name}: ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`}
                    onClick={() => toggle(setSelectedPhaseId, p.id)}
                  >
                    {status === 'current' && <span className="tl-phase-elapsed" style={{ width: `${elapsed}%` }} />}
                    <span className="tl-phase-name">{p.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {show.deadlines && deadlines.length > 0 && (
            <div className="tl-row tl-row-deadlines">
              {deadlines.map(d => (
                <button
                  key={d.id} type="button"
                  className={`tl-deadline ${d.critical ? 'critical' : ''} ${d.end_date ? 'range' : ''} ${d.id === selectedDeadlineId ? 'selected' : ''}`}
                  style={{ left: `${pct(d.date)}%`, width: d.end_date ? `${Math.max(span(d.date, d.end_date), 0.8)}%` : undefined }}
                  title={`${d.title} (${fmtDate(d.date)}${d.end_date ? ' – ' + fmtDate(d.end_date) : ''})`}
                  aria-label={d.title}
                  onClick={() => toggle(setSelectedDeadlineId, d.id)}
                />
              ))}
            </div>
          )}

          {show.events && events.length > 0 && (
            <div className="tl-row tl-row-events">
              {events.map(ev => (
                <button
                  key={ev.id} type="button"
                  className={`tl-event ${ev.id === selectedEventId ? 'selected' : ''}`}
                  style={{ left: `${pct(ev.event_date)}%` }}
                  title={`${ev.title} (${fmtDate(new Date(ev.event_date))}, ${TIME_FMT.format(new Date(ev.event_date))})`}
                  aria-label={ev.title}
                  onClick={() => toggle(setSelectedEventId, ev.id)}
                />
              ))}
            </div>
          )}

          {todayPct !== null && (
            <div className="tl-today" style={{ left: `${todayPct}%` }} aria-hidden="true">
              <span>Heute · {DAY_MONTH.format(now)}</span>
            </div>
          )}
        </div>
      </div>

      {show.phases && (
        <div className="tl-phases">
          {phases.map(p => (
            <button
              key={p.id} type="button"
              className={`tl-phase-chip ${phaseStatus(p)} ${selectedPhaseId === p.id ? 'active' : ''}`}
              style={{ '--phase': colorOf(p) }}
              onClick={() => toggle(setSelectedPhaseId, p.id)}
              aria-expanded={selectedPhaseId === p.id}
            >
              <span className="tl-swatch" />
              <span className="tl-phase-chip-text">
                <strong>{p.name}</strong>
                <small>{phaseInfo(p)}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {show.phases && selectedPhase && (
        <div className="tl-detail" style={{ '--phase': colorOf(selectedPhase) }}>
          <div className="tl-detail-head">
            <strong>{selectedPhase.name}</strong>
            <span>{fmtDate(selectedPhase.start_date)} – {fmtDate(selectedPhase.end_date)} · {diffDays(selectedPhase.end_date, selectedPhase.start_date) + 1} Tage</span>
          </div>
          {selectedPhase.description && <p>{selectedPhase.description}</p>}
        </div>
      )}

      {show.deadlines && (
        <div className="tl-list">
          <h3>Fristen</h3>
          {deadlines.length === 0 ? <p className="timeline-empty">Keine Fristen.</p> : (
            <ul>
              {deadlines.map(d => {
                const c = countdown(d.date, d.end_date)
                return (
                  <li
                    key={d.id}
                    ref={el => { deadlineRefs.current[d.id] = el }}
                    className={`tl-item ${d.critical ? 'critical' : ''} ${c.tone} ${d.id === selectedDeadlineId ? 'selected' : ''}`}
                    onClick={() => toggle(setSelectedDeadlineId, d.id)}
                  >
                    <DateTile date={d.date} tone={d.critical ? 'pink' : 'butter'} />
                    <span className="tl-item-main">
                      <strong>{d.title}</strong>
                      <span>
                        {d.end_date ? `${fmtDate(d.date)} – ${fmtDate(d.end_date)}` : fmtDate(d.date)}
                        {d.goal_id && goals[d.goal_id] ? ` · ${goals[d.goal_id]}` : ''}
                        {d.description ? ` · ${d.description}` : ''}
                      </span>
                    </span>
                    <span className={`tl-countdown ${c.tone}`}>{c.text}</span>
                    <button
                      type="button" className="icon-btn tl-del" aria-label={`Frist «${d.title}» löschen`}
                      onClick={e => { e.stopPropagation(); removeDeadline(d.id) }}
                    >
                      <X size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {show.events && (
        <div className="tl-list">
          <h3>Termine</h3>
          {events.length === 0 ? <p className="timeline-empty">Keine Termine.</p> : (
            <ul>
              {events.map(ev => {
                const c = countdown(new Date(ev.event_date))
                return (
                  <li
                    key={ev.id}
                    ref={el => { eventRefs.current[ev.id] = el }}
                    className={`tl-item ${c.tone} ${ev.id === selectedEventId ? 'selected' : ''}`}
                    onClick={() => toggle(setSelectedEventId, ev.id)}
                  >
                    <DateTile date={new Date(ev.event_date)} tone="sky" />
                    <span className="tl-item-main">
                      <strong>{ev.title}</strong>
                      <span>{fmtDate(new Date(ev.event_date))} · {TIME_FMT.format(new Date(ev.event_date))} Uhr</span>
                    </span>
                    <span className={`tl-countdown ${c.tone}`}>{c.text}</span>
                    <button
                      type="button" className="icon-btn tl-del" aria-label={`Termin «${ev.title}» löschen`}
                      onClick={e => { e.stopPropagation(); removeEvent(ev.id) }}
                    >
                      <X size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
