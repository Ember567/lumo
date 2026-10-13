import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { onPlanChanged } from '../lib/progress.js'
import { PRIORITY_ORDER } from '../lib/plan.js'
import { currentPhaseOf, daysUntil, fmtDate, parseDate, today } from '../lib/dates.js'
import { lastScoresByTopic } from '../lib/quiz.js'

const REVIEW_THRESHOLD = 60

export default function NextUp({ userId, onNavigate }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  async function load() {
    const [{ data: phases }, { data: subjects }, { data: topics }, { data: deadlines }, scores] = await Promise.all([
      supabase.from('plan_phases').select('*').eq('user_id', userId),
      supabase.from('plan_subjects').select('id, name, priority').eq('user_id', userId),
      supabase.from('plan_topics').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('plan_deadlines').select('*').eq('user_id', userId).order('date'),
      lastScoresByTopic(userId),
    ])
    setData({ phases: phases || [], subjects: subjects || [], allTopics: topics || [], deadlines: deadlines || [], scores })
  }

  if (!data) return null
  const { phases, subjects, allTopics, deadlines, scores } = data
  const topics = allTopics.filter(tp => !tp.done)

  if (subjects.length === 0) {
    return (
      <section className="card card-nextup">
        <div className="card-head"><h2>Was steht an</h2></div>
        <p className="timeline-empty">
          Dein Plan ist noch leer.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'subjects')}>Fächer und Themen anlegen</button>
        </p>
      </section>
    )
  }

  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]))
  const nextTopics = [...topics]
    .sort((a, b) =>
      (PRIORITY_ORDER[subjectById[a.subject_id]?.priority] ?? 9) - (PRIORITY_ORDER[subjectById[b.subject_id]?.priority] ?? 9)
      || a.sort_order - b.sort_order
    )
    .slice(0, 3)

  // Themen, deren letztes Quiz unter der Schwelle lag — schwächstes zuerst.
  const reviewTopics = allTopics
    .filter(tp => scores[tp.id] && scores[tp.id].pct < REVIEW_THRESHOLD)
    .sort((a, b) => scores[a.id].pct - scores[b.id].pct)
    .slice(0, 3)

  const t = today()
  const nextDeadline = deadlines.find(d => parseDate(d.end_date || d.date) >= t) || null

  const currentPhase = currentPhaseOf(phases)
  const daysLeftInPhase = currentPhase ? daysUntil(currentPhase.end_date) : null
  const phaseTopicsOpen = currentPhase ? topics.filter(tp => tp.phase_id === currentPhase.id).length : 0
  const phaseTopicsTotal = currentPhase ? allTopics.filter(tp => tp.phase_id === currentPhase.id).length : 0
  // Bei mehr offenen Themen als verbleibenden Tagen "pro Tag", sonst "alle X Tage".
  let rhythm = ''
  if (currentPhase && phaseTopicsOpen > 0) {
    const perDay = phaseTopicsOpen / Math.max(1, daysLeftInPhase)
    rhythm = perDay >= 1
      ? `etwa ${Math.round(perDay * 10) / 10} Themen pro Tag`
      : `etwa alle ${Math.round(1 / perDay)} Tage ein Thema`
  }

  return (
    <section className="card card-nextup">
      <div className="card-head">
        <h2>Was steht an</h2>
        {currentPhase && <span className="eyebrow">{currentPhase.name}</span>}
      </div>

      <div className="nextup-grid">
        <div className="nextup-block">
          <h3>Nächste Themen</h3>
          <ul className="nextup-topics">
            {nextTopics.map(tp => (
              <li key={tp.id}>
                {tp.title}
                <span className="nextup-subject"> · {subjectById[tp.subject_id]?.name}</span>
              </li>
            ))}
            {nextTopics.length === 0 && <li>Keine offenen Themen.</li>}
          </ul>
        </div>

        <div className="nextup-block">
          <h3>Nächste Deadline</h3>
          {nextDeadline ? (
            <>
              <p className="nextup-deadline">
                <strong>{nextDeadline.title}</strong>
                <span className="nextup-deadline-days">
                  {parseDate(nextDeadline.date) <= t ? 'läuft' : `noch ${daysUntil(nextDeadline.date)} Tage`}
                </span>
              </p>
              <p className="nextup-deadline-date">
                {fmtDate(nextDeadline.date)}{nextDeadline.end_date ? ` – ${fmtDate(nextDeadline.end_date)}` : ''}
              </p>
            </>
          ) : (
            <p className="nextup-deadline-empty">Keine bevorstehenden Deadlines.</p>
          )}
        </div>
      </div>

      {reviewTopics.length > 0 && (
        <div className="nextup-review">
          <h3>Wiederholen</h3>
          <ul className="nextup-topics">
            {reviewTopics.map(tp => (
              <li key={tp.id}>
                {tp.title}
                <span className="nextup-subject"> · {subjectById[tp.subject_id]?.name}</span>
                <span className="nextup-score">{scores[tp.id].correct}/{scores[tp.id].total} im letzten Quiz</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentPhase && phaseTopicsTotal > 0 && (
        <p className="nextup-rhythm">
          {phaseTopicsOpen > 0
            ? `Noch ${daysLeftInPhase} Tage bis Ende der Phase „${currentPhase.name}“, ${phaseTopicsOpen} Themen offen → ${rhythm} abschliessen, um im Plan zu bleiben.`
            : `Alle Themen der Phase „${currentPhase.name}“ sind abgeschlossen.`}
        </p>
      )}
    </section>
  )
}
