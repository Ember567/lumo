import React, { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { supabase } from '../supabaseClient.js'
import { getGoalProgress, onPlanChanged } from '../lib/progress.js'
import { goalColor } from '../lib/plan.js'
import { daysUntil, fmtShort, toISODate } from '../lib/dates.js'

// Hex-Werte spiegeln die CSS-Variablen in style.css — SVG-Attribute lesen keine var().
const COLOR_SLATE = '#7a7268'
const COLOR_PAPER = '#2c2825'
const COLOR_GROUND = '#fdfdfc'
const CHART_FONT = 'Inter, sans-serif'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-key" style={{ '--dot': p.color }}>{p.name}</span>
          <span className="chart-tooltip-value">{p.value}%</span>
        </div>
      ))}
    </div>
  )
}

// Meilensteine verschiedener Ziele entstehen zu unterschiedlichen Zeitpunkten.
// Für das Liniendiagramm werden sie pro Tag zusammengeführt; jedes Ziel trägt
// seinen letzten bekannten Wert weiter, damit keine Lücken entstehen.
function buildHistory(snapshots, goals) {
  const byDay = new Map()
  for (const s of snapshots) {
    const day = toISODate(new Date(s.created_at))
    if (!byDay.has(day)) byDay.set(day, {})
    byDay.get(day)[s.goal_id] = s.pct
  }
  const last = {}
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, values]) => {
    Object.assign(last, values)
    const row = { label: fmtShort(day) }
    for (const g of goals) row[g.id] = last[g.id] ?? null
    return row
  })
}

export default function ProgressCard({ userId, onNavigate }) {
  const [progress, setProgress] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  async function load() {
    const [goalProgress, { data: snapshots }] = await Promise.all([
      getGoalProgress(userId),
      supabase.from('progress_snapshots').select('goal_id, pct, created_at').eq('user_id', userId).order('created_at'),
    ])
    setProgress(goalProgress)
    setHistory(buildHistory(snapshots || [], goalProgress.map(p => p.goal)))
  }

  if (progress === null) return null

  return (
    <section className="card card-progress">
      <div className="card-head">
        <h2>Fortschritt</h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNavigate('planner', 'goals')}>Ziele bearbeiten</button>
      </div>

      {progress.length === 0 && (
        <p className="timeline-empty">Noch keine Ziele angelegt.</p>
      )}

      <div className="progress-rows">
        {progress.map(p => (
          <div key={p.goal.id} className="progress-row-static">
            <div className="progress-row-head">
              <label>{p.goal.name}</label>
              <span className="progress-row-value">{p.pct}%</span>
            </div>
            <div className="vbar-track">
              <div className="vbar-fill" style={{ width: `${p.pct}%`, background: goalColor(p.goal) }} />
            </div>
            <p className="progress-row-detail">
              {p.goal.kind === 'hours'
                ? `${Math.round(p.hoursLogged * 10) / 10} von ${p.targetHours} Stunden geloggt`
                : p.totalUnits > 0
                  ? `${p.doneUnits} von ${p.totalUnits} Einheiten aus ${p.subjectCount} ${p.subjectCount === 1 ? 'Fach' : 'Fächern'} erledigt`
                  : 'Diesem Ziel sind noch keine Fächer mit Themen zugeordnet.'}
              {p.goal.exam_date ? ` · Prüfung in ${daysUntil(p.goal.exam_date)} Tagen` : ''}
            </p>
          </div>
        ))}
      </div>

      {history.length > 1 && (
        <div className="log">
          <h3>Verlauf <span className="log-hint">· Meilensteine in 10%-Schritten</span></h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={COLOR_SLATE} strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: COLOR_PAPER, fontSize: 11, fontFamily: CHART_FONT }} axisLine={{ stroke: COLOR_SLATE, strokeOpacity: 0.3 }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: COLOR_PAPER, fontSize: 11, fontFamily: CHART_FONT }} axisLine={false} tickLine={false} width={32} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLOR_SLATE, strokeOpacity: 0.3 }} />
                <Legend iconType="plainline" wrapperStyle={{ fontFamily: CHART_FONT, fontSize: 11, color: COLOR_SLATE }} />
                {progress.map(({ goal }) => (
                  <Line
                    key={goal.id} type="monotone" dataKey={goal.id} name={goal.name}
                    stroke={goalColor(goal)} strokeWidth={2} connectNulls
                    dot={{ r: 3, stroke: COLOR_GROUND, strokeWidth: 2, fill: goalColor(goal) }} activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
