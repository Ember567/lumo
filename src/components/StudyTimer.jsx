import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getStudyTotals, onPlanChanged, recordProgress } from '../lib/progress.js'
import { goalColor, sortSubjects } from '../lib/plan.js'
import { currentPhaseOf, daysUntil, formatDuration, startOfWeek, today } from '../lib/dates.js'
import { STORAGE_PREFIX } from '../config.js'

// Ein laufender Timer überlebt Neuladen und Sektionswechsel: Start-Zeitpunkt
// und Auswahl liegen in localStorage, die Anzeige rechnet daraus.
const TIMER_KEY = `${STORAGE_PREFIX}:timer`
const MIN_SESSION_SECONDS = 60

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function readStoredTimer() {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || null } catch { return null }
}

function writeStoredTimer(value) {
  try {
    if (value) localStorage.setItem(TIMER_KEY, JSON.stringify(value))
    else localStorage.removeItem(TIMER_KEY)
  } catch { /* ignorieren */ }
}

export default function StudyTimer({ userId }) {
  const stored = readStoredTimer()
  // timer: { startedAt: ms | null, accumulated: s } — startedAt null = pausiert
  const [timer, setTimer] = useState(stored?.userId === userId ? stored.timer : null)
  const [goalId, setGoalId] = useState(stored?.userId === userId ? stored.goalId ?? '' : '')
  const [topicId, setTopicId] = useState(stored?.userId === userId ? stored.topicId ?? '' : '')
  const [now, setNow] = useState(Date.now())
  const [stats, setStats] = useState({ today: 0, week: 0, total: 0, byGoal: {} })
  const [goals, setGoals] = useState([])
  const [phases, setPhases] = useState([])
  const [subjectGroups, setSubjectGroups] = useState([])
  const [pendingStop, setPendingStop] = useState(null)
  const [notice, setNotice] = useState('')
  const intervalRef = useRef(null)

  const status = !timer ? 'idle' : timer.startedAt ? 'running' : 'paused'
  const elapsed = timer ? timer.accumulated + (timer.startedAt ? Math.floor((now - timer.startedAt) / 1000) : 0) : 0

  useEffect(() => {
    loadStats(); loadContext()
    return onPlanChanged(() => { loadStats(); loadContext() })
  }, [userId])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (status === 'running') intervalRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(intervalRef.current)
  }, [status])

  useEffect(() => {
    writeStoredTimer(timer ? { userId, timer, goalId, topicId } : null)
  }, [timer, goalId, topicId, userId])

  async function loadStats() {
    const todayStart = today()
    const weekStart = startOfWeek(todayStart)
    const [{ data }, totals] = await Promise.all([
      supabase.from('study_sessions').select('duration_seconds, created_at').eq('user_id', userId).gte('created_at', weekStart.toISOString()),
      getStudyTotals(userId),
    ])
    let todaySec = 0
    let weekSec = 0
    for (const s of data || []) {
      weekSec += s.duration_seconds
      if (new Date(s.created_at) >= todayStart) todaySec += s.duration_seconds
    }
    setStats({ today: todaySec, week: weekSec, total: totals.totalSeconds, byGoal: totals.byGoal })
  }

  async function loadContext() {
    const [{ data: g }, { data: p }, { data: s }, { data: t }] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', userId).order('sort_order').order('created_at'),
      supabase.from('plan_phases').select('*').eq('user_id', userId),
      supabase.from('plan_subjects').select('*').eq('user_id', userId),
      supabase.from('plan_topics').select('id, title, subject_id').eq('user_id', userId).eq('done', false).order('sort_order'),
    ])
    setGoals(g || [])
    setPhases(p || [])
    setSubjectGroups(
      sortSubjects(s || [])
        .map(subject => ({ subject, topics: (t || []).filter(topic => topic.subject_id === subject.id) }))
        .filter(group => group.topics.length > 0)
    )
  }

  // Ein gewähltes Thema bestimmt das Ziel automatisch (über sein Fach).
  function selectTopic(id) {
    setTopicId(id)
    const group = subjectGroups.find(gr => gr.topics.some(tp => tp.id === id))
    if (group?.subject.goal_id) setGoalId(group.subject.goal_id)
  }

  function start() {
    setNotice('')
    setNow(Date.now())
    setTimer(cur => ({ startedAt: Date.now(), accumulated: cur?.accumulated || 0 }))
  }

  function pause() {
    setTimer(cur => ({ startedAt: null, accumulated: elapsed }))
  }

  async function stop() {
    const seconds = elapsed
    setTimer(null)
    if (seconds < MIN_SESSION_SECONDS) {
      setNotice('Sessions unter einer Minute werden nicht gespeichert.')
      return
    }
    if (topicId) {
      const topic = subjectGroups.flatMap(gr => gr.topics).find(tp => tp.id === topicId)
      setPendingStop({ seconds, goalId, topicId, topicTitle: topic?.title || '' })
      return
    }
    await saveSession({ seconds, goalId, topicId: null })
  }

  async function saveSession({ seconds, goalId: gid, topicId: tid }, markDone = false) {
    const { error } = await supabase.from('study_sessions').insert({
      user_id: userId, duration_seconds: seconds, goal_id: gid || null, topic_id: tid || null,
    })
    if (error) { setNotice('Session konnte nicht gespeichert werden.'); return }
    if (markDone && tid) {
      const doneAt = new Date().toISOString()
      await Promise.all([
        supabase.from('plan_topics').update({ done: true, completed_at: doneAt }).eq('id', tid),
        supabase.from('plan_subtasks').update({ is_done: true, done_at: doneAt }).eq('topic_id', tid).eq('is_done', false),
      ])
      setTopicId('')
    }
    await recordProgress(userId)
  }

  async function confirmDone(done) {
    const pending = pendingStop
    setPendingStop(null)
    await saveSession(pending, done)
  }

  const currentPhase = currentPhaseOf(phases)
  const controlsDisabled = status !== 'idle' || !!pendingStop
  const breakdown = [
    ...goals.map(g => ({ key: g.id, label: g.name, color: goalColor(g) })),
    { key: 'none', label: 'Ohne Ziel', color: 'var(--line-strong)' },
  ].map(b => ({ ...b, seconds: stats.byGoal[b.key] || 0 })).filter(b => b.seconds > 0)

  return (
    <section className="card card-study">
      <div className="card-head">
        <h2>Lern-Timer</h2>
        <span className="eyebrow">{status === 'idle' ? 'Bereit' : status === 'running' ? 'Läuft' : 'Pausiert'}</span>
      </div>

      {currentPhase && (
        <p className="study-phase-banner">
          Aktuelle Phase: <strong>{currentPhase.name}</strong> · noch {daysUntil(currentPhase.end_date)} Tage
        </p>
      )}

      <div className="study-stats">
        <div className="study-stat"><span className="study-stat-label">Heute gelernt</span><span className="study-stat-value">{formatDuration(stats.today)}</span></div>
        <div className="study-stat"><span className="study-stat-label">Diese Woche</span><span className="study-stat-value">{formatDuration(stats.week)}</span></div>
        <div className="study-stat"><span className="study-stat-label">Insgesamt</span><span className="study-stat-value">{formatDuration(stats.total)}</span></div>
      </div>

      {stats.total > 0 && breakdown.length > 0 && (
        <div className="study-breakdown">
          <div className="study-breakdown-bar">
            {breakdown.map(b => (
              <div
                key={b.key} className="study-breakdown-segment"
                style={{ width: `${(b.seconds / stats.total) * 100}%`, background: b.color }}
                title={`${b.label} · ${formatDuration(b.seconds)}`}
              />
            ))}
          </div>
          <div className="study-breakdown-legend">
            {breakdown.map(b => (
              <div key={b.key} className="study-breakdown-legend-row">
                <span className="study-breakdown-legend-label">
                  <span className="study-breakdown-dot" style={{ background: b.color }} />
                  {b.label}
                  <span className="study-breakdown-pct">{Math.round((b.seconds / stats.total) * 100)}%</span>
                </span>
                <span className="study-breakdown-value">{formatDuration(b.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="study-timer-display" aria-live="off">{formatClock(elapsed)}</div>

      <div className="study-topic-row">
        <label className="study-topic-label" htmlFor="study-topic-select">Woran arbeitest du?</label>
        <select
          id="study-topic-select" className="study-topic-select"
          value={topicId} onChange={e => selectTopic(e.target.value)} disabled={controlsDisabled}
        >
          <option value="">Kein spezifisches Thema</option>
          {subjectGroups.map(({ subject, topics }) => (
            <optgroup key={subject.id} label={subject.name}>
              {topics.map(tp => <option key={tp.id} value={tp.id}>{tp.title}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="study-controls">
        <select value={goalId} onChange={e => setGoalId(e.target.value)} disabled={controlsDisabled} aria-label="Ziel">
          <option value="">Ohne Ziel</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        {status === 'idle' && !pendingStop && <button className="btn btn-sm btn-primary" onClick={start}>Start</button>}
        {status === 'running' && <button className="btn btn-sm btn-ghost" onClick={pause}>Pause</button>}
        {status === 'paused' && <button className="btn btn-sm btn-primary" onClick={start}>Weiter</button>}
        {status !== 'idle' && <button className="btn btn-sm btn-ghost" onClick={stop}>Stop</button>}
      </div>

      {notice && <p className="field-hint" role="status">{notice}</p>}

      {pendingStop && (
        <div className="study-confirm">
          <p>Thema <strong>„{pendingStop.topicTitle}“</strong> abgeschlossen?</p>
          <div className="study-confirm-actions">
            <button className="btn btn-sm btn-primary" onClick={() => confirmDone(true)}>Ja</button>
            <button className="btn btn-sm btn-ghost" onClick={() => confirmDone(false)}>Nein</button>
          </div>
        </div>
      )}
    </section>
  )
}
