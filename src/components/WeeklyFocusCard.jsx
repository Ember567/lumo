import React, { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { onPlanChanged, scrollToTopics } from '../lib/progress.js'
import { priorityClass } from '../lib/plan.js'
import { diffDays, isWithin, today } from '../lib/dates.js'

export default function WeeklyFocusCard({ userId, onNavigate }) {
  const [weeks, setWeeks] = useState(null)
  const [subjectsById, setSubjectsById] = useState({})

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  async function load() {
    const [{ data: w }, { data: s }] = await Promise.all([
      supabase.from('plan_weeks').select('*').eq('user_id', userId).order('start_date'),
      supabase.from('plan_subjects').select('id, name, priority').eq('user_id', userId),
    ])
    setSubjectsById(Object.fromEntries((s || []).map(subject => [subject.id, subject])))
    setWeeks(w || [])
  }

  if (weeks === null) return null

  const t = today()
  const currentWeek = weeks.find(w => isWithin(t, w.start_date, w.end_date))

  if (!currentWeek) {
    return (
      <section className="card card-weekly-focus">
        <div className="card-head"><h2>Diese Woche</h2></div>
        <p className="timeline-empty">
          Kein Wochenfokus für diese Woche.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'weeks')}>Fokus festlegen</button>
        </p>
      </section>
    )
  }

  const siblings = currentWeek.phase_id ? weeks.filter(w => w.phase_id === currentWeek.phase_id) : weeks
  const weekNumber = siblings.findIndex(w => w.id === currentWeek.id) + 1

  const totalDays = diffDays(currentWeek.end_date, currentWeek.start_date) + 1
  const elapsedDays = Math.min(totalDays, diffDays(t, currentWeek.start_date) + 1)
  const weekPct = Math.round((elapsedDays / totalDays) * 100)

  const rows = [
    { subject: subjectsById[currentWeek.primary_subject_id], focus: currentWeek.primary_focus, topicIds: currentWeek.primary_topic_ids },
    { subject: subjectsById[currentWeek.secondary_subject_id], focus: currentWeek.secondary_focus, topicIds: currentWeek.secondary_topic_ids },
  ].filter(r => r.focus || r.subject)

  return (
    <section className="card card-weekly-focus">
      <div className="card-head">
        <h2>Diese Woche</h2>
        <span className="eyebrow">Woche {weekNumber} von {siblings.length}</span>
      </div>

      {currentWeek.is_buffer_week && <span className="buffer-week-badge">Pufferwoche</span>}

      <div className="weekly-focus-rows">
        {rows.map((row, i) => {
          const clickable = row.topicIds?.length > 0
          return (
            <button
              key={i}
              type="button"
              className={`weekly-focus-row ${clickable ? 'clickable' : ''}`}
              disabled={!clickable}
              onClick={() => clickable && scrollToTopics(row.topicIds)}
            >
              <span className={`weekly-focus-icon priority-${priorityClass(row.subject?.priority)}`}>
                <BookOpen size={16} strokeWidth={2} />
              </span>
              <span>
                {row.subject && <span className="weekly-focus-subject">{row.subject.name}</span>}
                <span className="weekly-focus-topic">{row.focus || row.subject?.name}</span>
              </span>
            </button>
          )
        })}
        {rows.length === 0 && <p className="timeline-empty">Kein spezifischer Fokus diese Woche.</p>}
      </div>

      {currentWeek.note && <p className="weekly-focus-note">{currentWeek.note}</p>}

      <div className="weekly-focus-progress">
        <div className="weekly-focus-progress-track">
          <div className="weekly-focus-progress-fill" style={{ width: `${weekPct}%` }} />
        </div>
        <span className="weekly-focus-progress-label">Tag {elapsedDays} von {totalDays}</span>
      </div>
    </section>
  )
}

