import React, { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { addDays, today, toISODate } from '../lib/dates.js'
import { onPlanChanged } from '../lib/progress.js'
import { QUIZ_DAILY_LIMIT } from '../lib/quiz.js'
import { COACH_DAILY_LIMIT } from '../lib/coach.js'
import { SCAN_DAILY_LIMIT } from '../lib/scan.js'

// ------------------------------------------------------------
// KI-Kontingent: was du heute noch frei hast (Lumos eigene Tageslimits)
// und wie es bei Groq aussieht (Limits pro Modell, für alle zusammen).
// Groq meldet seine Limits bei jeder Antwort; die Edge Functions
// speichern den letzten Stand in ai_provider_status.
// ------------------------------------------------------------

const KINDS = [
  { id: 'quiz', label: 'Abfragen', limit: QUIZ_DAILY_LIMIT, color: '#FE90E8' },
  { id: 'coach', label: 'Fragen an Lumi', limit: COACH_DAILY_LIMIT, color: '#F7CB46' },
  { id: 'scan', label: 'Scans', limit: SCAN_DAILY_LIMIT, color: '#7FDCEF' },
]

const MODEL_ROLES = {
  'openai/gpt-oss-120b': 'Abfragen und PDF-Scans',
  'openai/gpt-oss-20b': 'Lumi',
  'qwen/qwen3.8-27b': 'Foto-Scans',
}

const nf = new Intl.NumberFormat('de-CH')

// Groq-Zeitangaben wie "2m59.56s" oder "7.66s" lesbar machen
function readableReset(s) {
  if (!s) return ''
  const h = Number((s.match(/(\d+(?:\.\d+)?)h/) || [])[1] || 0)
  const m = Number((s.match(/(\d+(?:\.\d+)?)m(?!s)/) || [])[1] || 0)
  const sec = Number((s.match(/(\d+(?:\.\d+)?)s/) || [])[1] || 0)
  const total = h * 3600 + m * 60 + sec
  if (total < 60) return `in ${Math.max(1, Math.round(total))} s`
  if (total < 3600) return `in ${Math.round(total / 60)} min`
  return `in ${Math.round(total / 3600)} h`
}

function ago(ts) {
  const min = Math.round((Date.now() - new Date(ts)) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`
}

function Meter({ value, max, color, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <span className="quota-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${pct}%`, background: color }} />
    </span>
  )
}

export default function QuotaCard({ userId }) {
  const [usage, setUsage] = useState(null)
  const [status, setStatus] = useState([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const since = addDays(today(), -6).toISOString()
    const [{ data: u }, { data: st }] = await Promise.all([
      supabase.from('ai_usage').select('kind, tokens, created_at').eq('user_id', userId).gte('created_at', since),
      supabase.from('ai_provider_status').select('*').order('model'),
    ])
    setUsage(u || [])
    setStatus(st || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  if (!usage) return null

  const todayKey = toISODate(today())
  const todays = usage.filter(r => toISODate(new Date(r.created_at)) === todayKey)
  const tokensToday = todays.reduce((n, r) => n + (r.tokens || 0), 0)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today(), i - 6)
    const key = toISODate(d)
    const rows = usage.filter(r => toISODate(new Date(r.created_at)) === key)
    return {
      label: new Intl.DateTimeFormat('de-CH', { weekday: 'short' }).format(d),
      ...Object.fromEntries(KINDS.map(k => [k.id, rows.filter(r => r.kind === k.id).length])),
      tokens: rows.reduce((n, r) => n + (r.tokens || 0), 0),
    }
  })
  const weekTotal = week.reduce((n, d) => n + d.quiz + d.coach + d.scan, 0)

  return (
    <section className="card quota-card">
      <div className="card-head">
        <h2>KI-Kontingent</h2>
        <button type="button" className="icon-btn" onClick={load} aria-label="Aktualisieren" title="Aktualisieren">
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <h3 className="quota-sub">Heute für dich</h3>
      <div className="quota-tiles">
        {KINDS.map(k => {
          const used = todays.filter(r => r.kind === k.id).length
          const left = Math.max(0, k.limit - used)
          return (
            <div key={k.id} className="quota-tile" style={{ '--tile': k.color }}>
              <span className="quota-tile-label">{k.label}</span>
              <span className="quota-tile-value">{left}<small> von {k.limit} frei</small></span>
              <Meter value={left} max={k.limit} color="var(--paper)" label={`${k.label}: ${left} von ${k.limit} frei`} />
            </div>
          )
        })}
      </div>
      <p className="field-hint quota-note">
        Setzt sich um Mitternacht zurück. Heute hast du {nf.format(tokensToday)} Tokens verbraucht.
      </p>

      <h3 className="quota-sub">Groq, für alle zusammen</h3>
      {status.length === 0 ? (
        <p className="field-hint">Noch keine Angaben. Sie erscheinen nach der nächsten KI-Anfrage.</p>
      ) : (
        <ul className="quota-models">
          {status.map(s => {
            const reqPct = s.limit_requests ? s.remaining_requests / s.limit_requests : 0
            return (
              <li key={s.model} className={`quota-model ${s.last_status === 429 ? 'limited' : ''}`}>
                <div className="quota-model-head">
                  <strong>{MODEL_ROLES[s.model] || s.model}</strong>
                  <span className="quota-model-name">{s.model}</span>
                  {s.last_status === 429 && <span className="quota-badge">Limit erreicht</span>}
                </div>
                {s.limit_requests != null && (
                  <div className="quota-row">
                    <span>Anfragen heute</span>
                    <Meter value={s.remaining_requests} max={s.limit_requests} color={reqPct < 0.15 ? '#FF9AA8' : reqPct < 0.4 ? '#F7CB46' : '#99E885'} label="Anfragen pro Tag übrig" />
                    <span className="quota-num">{nf.format(s.remaining_requests)} / {nf.format(s.limit_requests)}</span>
                  </div>
                )}
                {s.limit_tokens != null && (
                  <div className="quota-row">
                    <span>Tokens pro Minute</span>
                    <Meter value={s.remaining_tokens} max={s.limit_tokens} color="#7FDCEF" label="Tokens pro Minute übrig" />
                    <span className="quota-num">{nf.format(s.remaining_tokens)} / {nf.format(s.limit_tokens)}</span>
                  </div>
                )}
                <span className="quota-model-meta">
                  Stand {ago(s.updated_at)}{s.reset_requests ? ` · Tageslimit wieder voll ${readableReset(s.reset_requests)}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="quota-sub">Deine letzten 7 Tage</h3>
      {weekTotal === 0 ? (
        <p className="field-hint">Noch keine KI-Anfragen in den letzten 7 Tagen.</p>
      ) : (
        <div className="quota-chart">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={week} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#1E1B2E', fontSize: 12 }} axisLine={{ stroke: '#1E1B2E' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#6E6982', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(30,27,46,0.06)' }}
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="chart-tooltip">
                    <strong>{label}</strong>
                    {KINDS.map(k => <div key={k.id}>{k.label}: {payload[0].payload[k.id]}</div>)}
                    <div>{nf.format(payload[0].payload.tokens)} Tokens</div>
                  </div>
                ) : null}
              />
              {KINDS.map((k, i) => (
                <Bar key={k.id} dataKey={k.id} name={k.label} stackId="a" fill={k.color} stroke="#1E1B2E" strokeWidth={1.5}
                  radius={i === KINDS.length - 1 ? [6, 6, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="quota-legend">
            {KINDS.map(k => <span key={k.id}><i style={{ background: k.color }} />{k.label}</span>)}
          </div>
        </div>
      )}
    </section>
  )
}
