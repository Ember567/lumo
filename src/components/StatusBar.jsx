import React, { useEffect, useState } from 'react'
import { getGoalProgress, onPlanChanged } from '../lib/progress.js'
import { daysUntil, fmtDate } from '../lib/dates.js'
import { goalColor } from '../lib/plan.js'

export default function StatusBar({ userId, onNavigate }) {
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  async function load() {
    setProgress(await getGoalProgress(userId))
  }

  if (progress === null) return null

  if (progress.length === 0) {
    return (
      <section className="vitality">
        <div className="vitality-eyebrow">Status heute</div>
        <p className="timeline-empty status-empty">
          Noch keine Ziele.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'goals')}>Ziel anlegen</button>
        </p>
      </section>
    )
  }

  const withDate = progress.filter(p => p.goal.exam_date)

  return (
    <section className="vitality">
      <div className="vitality-head">
        <div className="vitality-eyebrow">Status heute</div>
        {withDate.length > 0 && (
          <div className="countdowns">
            {withDate.map(({ goal }) => (
              <div key={goal.id} className="countdown" title={fmtDate(goal.exam_date)}>
                <span className="countdown-value">{daysUntil(goal.exam_date)}d</span>
                <span className="countdown-label">{goal.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vitality-bars">
        {progress.map(p => (
          <div key={p.goal.id} className="vbar">
            <div className="vbar-label">
              <span>{p.goal.name}</span>
              <span>{p.pct}%</span>
            </div>
            <div className="vbar-track">
              <div className="vbar-fill" style={{ width: `${p.pct}%`, background: goalColor(p.goal) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
