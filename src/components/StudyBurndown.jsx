import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getCompletionUnits, onPlanChanged } from '../lib/progress.js'
import { currentPhaseOf, fmtShort, parseDate, today as todayDate } from '../lib/dates.js'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts'

// Hex-Werte spiegeln die CSS-Variablen in style.css — SVG-Attribute lesen keine var().
const COLOR_AMBER = '#9c6b1f'
const COLOR_SAGE = '#4f7a63'
const COLOR_SLATE = '#7a7268'
const COLOR_PAPER = '#2c2825'
const COLOR_GROUND = '#fdfdfc'
const CHART_FONT = 'Inter, sans-serif'


function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const rows = payload.filter(p => p.value != null)
  if (!rows.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {rows.map(p => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-key" style={{ '--dot': p.color }}>{p.name}</span>
          <span className="chart-tooltip-value">{p.value} Einheiten</span>
        </div>
      ))}
    </div>
  )
}

// Kumulierter Soll-Wert an einem Datum: linear von 0 (Phasenstart) auf
// die Gesamtanzahl Themen (Phasenende) — die Ziellinie eines Burn-up-Charts.
function sollAt(date, start, totalDays, total) {
  const elapsedDays = (date - start) / 86400000
  const frac = Math.max(0, Math.min(1, elapsedDays / totalDays))
  return Math.round(total * frac)
}

function yTicksFor(total) {
  if (total <= 4) return Array.from({ length: total + 1 }, (_, i) => i)
  return [...new Set([0, Math.round(total / 2), total])]
}

// Standard: aktuelle Phase, sonst die nächste kommende, sonst die letzte.
function defaultPhase(phases) {
  const t = todayDate()
  return currentPhaseOf(phases)
    || phases.find(p => parseDate(p.start_date) > t)
    || phases[phases.length - 1]
    || null
}

export default function StudyBurndown({ userId, onNavigate }) {
  const [phases, setPhases] = useState([])
  const [phaseId, setPhaseId] = useState(null)
  const [units, setUnits] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadPhases()
  }, [userId])

  useEffect(() => {
    if (!phaseId) return
    loadUnits()
    return onPlanChanged(loadUnits)
  }, [phaseId])

  async function loadPhases() {
    const { data } = await supabase.from('plan_phases').select('*').eq('user_id', userId).order('start_date')
    const list = data || []
    setPhases(list)
    setPhaseId(defaultPhase(list)?.id || null)
    setLoaded(true)
  }

  async function loadUnits() {
    setUnits(await getCompletionUnits(userId, { phaseId }))
  }

  if (!loaded) return null

  const phase = phases.find(p => p.id === phaseId)

  if (!phase) {
    return (
      <section className="card card-burndown">
        <div className="card-head"><h2>Im Plan?</h2></div>
        <p className="timeline-empty">
          Der Soll/Ist-Vergleich braucht eine Phase mit Start- und Enddatum.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'phases')}>Phase anlegen</button>
        </p>
      </section>
    )
  }

  const total = units.length
  const start = parseDate(phase.start_date)
  const end = parseDate(phase.end_date)
  const totalDays = Math.max(1, (end - start) / 86400000)

  const today = todayDate()
  const cursor = today < start ? start : today > end ? end : today

  const completedDates = units
    .filter(u => u.done && u.completedAt)
    // Auf den Kalendertag normalisieren (sonst zählt ein heute abgehaktes Thema
    // erst morgen), Erledigtes von vor Phasenbeginn zählt ab Phasenstart.
    .map(u => { const d = new Date(u.completedAt); d.setHours(0, 0, 0, 0); return d < start ? start : d > end ? end : d })
    .sort((a, b) => a - b)

  const checkpointSet = new Set([start.getTime(), cursor.getTime(), end.getTime()])
  completedDates.forEach(d => checkpointSet.add(d.getTime()))
  const checkpoints = [...checkpointSet].sort((a, b) => a - b)

  let done = 0
  const completedQueue = [...completedDates]
  const chartData = checkpoints.map(ts => {
    while (completedQueue.length && completedQueue[0].getTime() <= ts) {
      completedQueue.shift()
      done += 1
    }
    const date = new Date(ts)
    return {
      label: fmtShort(date),
      soll: sollAt(date, start, totalDays, total),
      ist: ts <= cursor.getTime() ? done : null,
    }
  })

  const doneToday = completedDates.filter(d => d <= cursor).length
  const sollToday = sollAt(cursor, start, totalDays, total)
  const diff = doneToday - sollToday
  const daysDiff = total > 0 ? Math.round((Math.abs(diff) * totalDays) / total) : 0
  const statusColor = diff < 0 ? COLOR_AMBER : COLOR_SAGE

  let statusLabel
  if (diff > 0) {
    statusLabel = `${diff} Einheit${diff === 1 ? '' : 'en'} im Plan voraus`
  } else if (diff < 0) {
    const behind = Math.abs(diff)
    statusLabel = `${behind} Einheit${behind === 1 ? '' : 'en'} im Verzug`
    if (daysDiff > 0) statusLabel += ` (≈ ${daysDiff} Tag${daysDiff === 1 ? '' : 'e'})`
  } else {
    statusLabel = 'Im Plan'
  }

  const todayLabel = fmtShort(cursor)

  return (
    <section className="card card-burndown">
      <div className="card-head">
        <h2>Im Plan?</h2>
        {phases.length > 1 ? (
          <select className="phase-select" value={phaseId} onChange={e => setPhaseId(e.target.value)} aria-label="Phase">
            {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <span className="eyebrow">{phase.name}</span>
        )}
      </div>

      {total > 0 && (
        <div className={`burndown-badge ${diff < 0 ? 'behind' : 'ontrack'}`}>
          {statusLabel}
        </div>
      )}

      {total === 0 ? (
        <p className="timeline-empty">
          Dieser Phase sind noch keine Themen zugeordnet.{' '}
          <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'phases')}>Zuordnen</button>
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="burndown-ist-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={statusColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={statusColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLOR_SLATE} strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLOR_PAPER, fontSize: 12, fontFamily: CHART_FONT }} axisLine={{ stroke: COLOR_SLATE, strokeOpacity: 0.3 }} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} domain={[0, total]} ticks={yTicksFor(total)} tick={{ fill: COLOR_PAPER, fontSize: 12, fontFamily: CHART_FONT }} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLOR_SLATE, strokeOpacity: 0.3 }} />
            <Legend iconType="plainline" wrapperStyle={{ fontFamily: CHART_FONT, fontSize: 11, color: COLOR_SLATE }} />
            <ReferenceLine x={todayLabel} stroke={COLOR_SLATE} strokeOpacity={0.4} strokeDasharray="3 3" label={{ value: 'Heute', position: 'top', fill: COLOR_SLATE, fontSize: 11, fontFamily: CHART_FONT }} />
            <Line type="linear" dataKey="soll" name="Soll" stroke={COLOR_SLATE} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
            <Area type="monotone" dataKey="ist" name="Ist" stroke={statusColor} strokeWidth={2.5} fill="url(#burndown-ist-fill)" dot={false} activeDot={{ r: 5, stroke: COLOR_GROUND, strokeWidth: 2, fill: statusColor }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
