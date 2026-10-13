import React, { useState } from 'react'
import { useTable } from '../../lib/useTable.js'
import { notifyPlanChanged } from '../../lib/progress.js'
import { addDays, fmtDate, isWithin, parseDate, startOfWeek, toISODate, today } from '../../lib/dates.js'
import { sortSubjects } from '../../lib/plan.js'
import { DeleteButton, EmptyNote, ErrorNote, InlineDate, InlineSelect, InlineText } from './fields.jsx'

function phaseFor(phases, date) {
  return phases.find(p => isWithin(date, p.start_date, p.end_date))?.id || null
}

export default function WeeksEditor({ userId }) {
  const weeks = useTable('plan_weeks', userId, { order: [['start_date', true]] })
  const subjects = useTable('plan_subjects', userId, { order: [['sort_order', true]] })
  const topics = useTable('plan_topics', userId, { order: [['sort_order', true]] })
  const phases = useTable('plan_phases', userId, { order: [['start_date', true]] })
  const [showPast, setShowPast] = useState(false)

  if (!weeks.rows || !subjects.rows || !topics.rows || !phases.rows) return null

  const sorted = [...weeks.rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const t = today()
  const pastCount = sorted.filter(w => parseDate(w.end_date) < t).length
  const visible = showPast ? sorted : sorted.filter(w => parseDate(w.end_date) >= t)

  const last = sorted[sorted.length - 1]
  const nextStart = last && parseDate(last.end_date) >= t ? addDays(last.end_date, 1) : startOfWeek(t)

  const subjectOptions = [{ value: null, label: '— kein Fach —' }, ...sortSubjects(subjects.rows).map(s => ({ value: s.id, label: s.name }))]

  async function addWeek() {
    const start = toISODate(nextStart)
    const created = await weeks.create({
      start_date: start,
      end_date: toISODate(addDays(nextStart, 6)),
      phase_id: phaseFor(phases.rows, start),
    })
    if (created) notifyPlanChanged()
  }

  async function save(week, patch) {
    const next = { ...week, ...patch }
    if (parseDate(next.end_date) < parseDate(next.start_date)) {
      weeks.setError('Das Enddatum muss nach dem Startdatum liegen.')
      return
    }
    if (patch.start_date) patch = { ...patch, phase_id: phaseFor(phases.rows, patch.start_date) }
    // Fachwechsel: Themen des alten Fachs passen nicht mehr.
    if ('primary_subject_id' in patch) patch.primary_topic_ids = []
    if ('secondary_subject_id' in patch) patch.secondary_topic_ids = []
    if (await weeks.update(week.id, patch)) notifyPlanChanged()
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Wochenplan</h2>
        {pastCount > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowPast(v => !v)}>
            {showPast ? 'Vergangene ausblenden' : `${pastCount} vergangene anzeigen`}
          </button>
        )}
      </div>
      <ErrorNote message={weeks.error} />
      {visible.length === 0 && <EmptyNote>Keine kommenden Wochen geplant.</EmptyNote>}

      <ul className="editor-list weeks">
        {visible.map(week => {
          const isCurrent = isWithin(t, week.start_date, week.end_date)
          const phase = phases.rows.find(p => p.id === week.phase_id)
          return (
            <li key={week.id} className={`editor-row week-row ${isCurrent ? 'current' : ''}`}>
              <div className="editor-fields">
                <div className="editor-meta">
                  <label className="mini-field">Von
                    <InlineDate value={week.start_date} required label="Wochenstart" onSave={start_date => save(week, { start_date })} />
                  </label>
                  <label className="mini-field">Bis
                    <InlineDate value={week.end_date} required label="Wochenende" onSave={end_date => save(week, { end_date })} />
                  </label>
                  {isCurrent && <span className="badge">diese Woche</span>}
                  {phase && <span className="mini-meta">{phase.name}</span>}
                  <label className="mini-check">
                    <input type="checkbox" checked={week.is_buffer_week} onChange={e => save(week, { is_buffer_week: e.target.checked })} />
                    Pufferwoche
                  </label>
                </div>

                {['primary', 'secondary'].map(slot => (
                  <FocusSlot
                    key={slot} slot={slot} week={week} subjectOptions={subjectOptions}
                    topics={topics.rows.filter(tp => tp.subject_id === week[`${slot}_subject_id`])}
                    onSave={patch => save(week, patch)}
                  />
                ))}

                <InlineText value={week.note} label="Notiz" placeholder="Notiz (optional)" onSave={note => save(week, { note })} />
              </div>
              <DeleteButton what="Woche" onConfirm={async () => { if (await weeks.remove(week.id)) notifyPlanChanged() }}
                confirmText={`Woche ${fmtDate(week.start_date)} löschen?`} />
            </li>
          )
        })}
      </ul>

      <div className="editor-add">
        <button type="button" className="btn btn-sm btn-primary" onClick={addWeek}>
          Woche ab {fmtDate(toISODate(nextStart))} hinzufügen
        </button>
      </div>
    </section>
  )
}

function FocusSlot({ slot, week, subjectOptions, topics, onSave }) {
  const label = slot === 'primary' ? 'Hauptfokus' : 'Nebenfokus'
  const selected = week[`${slot}_topic_ids`] || []

  function toggleTopic(id) {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    onSave({ [`${slot}_topic_ids`]: next })
  }

  return (
    <div className={`focus-slot ${slot}`}>
      <span className="focus-slot-label">{label}</span>
      <div className="focus-slot-fields">
        <InlineSelect
          value={week[`${slot}_subject_id`]} options={subjectOptions} label={`${label}: Fach`}
          onSave={value => onSave({ [`${slot}_subject_id`]: value })}
        />
        <InlineText
          value={week[`${slot}_focus`]} label={`${label}: Beschreibung`} placeholder="Was genau? (optional)"
          onSave={value => onSave({ [`${slot}_focus`]: value })}
        />
      </div>
      {topics.length > 0 && (
        <details className="focus-topics">
          <summary>{selected.length ? `${selected.length} Themen verknüpft` : 'Themen verknüpfen'}</summary>
          <ul>
            {topics.map(tp => (
              <li key={tp.id}>
                <label>
                  <input type="checkbox" checked={selected.includes(tp.id)} onChange={() => toggleTopic(tp.id)} />
                  {tp.title}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
