import React, { useEffect, useMemo, useState } from 'react'
import { Sparkles, Shuffle, RotateCcw, Repeat, Check } from 'lucide-react'
import {
  loadQuizData, lastScores, collectMistakes, scoreClass, pct,
  QUIZ_DAILY_LIMIT, REVIEW_THRESHOLD,
} from '../../lib/quiz.js'
import { onPlanChanged } from '../../lib/progress.js'
import { sortSubjects, priorityClass } from '../../lib/plan.js'
import { fmtShort } from '../../lib/dates.js'
import QuizSession from './QuizSession.jsx'

const COUNTS = { topic: [3, 5, 8], subject: [5, 8, 10], mistakes: [5, 10] }
const DEFAULT_COUNT = { topic: 5, subject: 8, mistakes: 5 }
const DAY = 86400000

export default function QuizView({ userId, request, onRequestHandled, onNavigate }) {
  const [data, setData] = useState(null)
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('topic')
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [count, setCount] = useState(DEFAULT_COUNT.topic)
  const [showAllMistakes, setShowAllMistakes] = useState(false)

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  // Start von aussen (Lernen-Tab, Übersicht): direkt in die Abfrage.
  useEffect(() => {
    if (!request) return
    setSession({ ...request, count: request.count || DEFAULT_COUNT[request.mode] })
    onRequestHandled()
  }, [request])

  async function load() {
    setData(await loadQuizData(userId))
  }

  const view = useMemo(() => {
    if (!data) return null
    const subjects = sortSubjects(data.subjects)
    const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]))
    const topicById = Object.fromEntries(data.topics.map(t => [t.id, t]))
    const scores = lastScores(data.attempts)
    const mistakes = collectMistakes(data.mistakeAttempts)
    const now = Date.now()

    // Vorschläge: schwach → erledigt, aber nie abgefragt → lange her
    const suggestions = []
    const add = (topic, reason, tone) => {
      if (!topic || suggestions.some(s => s.topic.id === topic.id) || suggestions.length >= 4) return
      suggestions.push({ topic, reason, tone })
    }
    data.topics
      .filter(t => scores[t.id] && scores[t.id].pct < REVIEW_THRESHOLD)
      .sort((a, b) => scores[a.id].pct - scores[b.id].pct)
      .forEach(t => add(t, `Letztes Mal ${scores[t.id].correct}/${scores[t.id].total}`, 'low'))
    data.topics
      .filter(t => t.done && !scores[t.id])
      .forEach(t => add(t, 'Erledigt, noch nie abgefragt', 'new'))
    data.topics
      .filter(t => scores[t.id] && now - new Date(scores[t.id].at) > 14 * DAY)
      .sort((a, b) => new Date(scores[a.id].at) - new Date(scores[b.id].at))
      .forEach(t => add(t, `Vor ${Math.round((now - new Date(scores[t.id].at)) / DAY)} Tagen abgefragt`, 'old'))

    // Stand pro Fach: Durchschnitt der letzten Ergebnisse je Thema
    const perSubject = subjects.map(s => {
      const list = data.topics.filter(t => t.subject_id === s.id)
      const quizzed = list.filter(t => scores[t.id])
      const avg = quizzed.length ? Math.round(quizzed.reduce((n, t) => n + scores[t.id].pct, 0) / quizzed.length) : null
      return { subject: s, total: list.length, quizzed: quizzed.length, avg }
    }).filter(r => r.total > 0)

    const recent = data.attempts.filter(a => now - new Date(a.created_at) <= 30 * DAY)
    const sum = recent.reduce((acc, a) => ({ c: acc.c + a.correct_count, t: acc.t + a.question_count }), { c: 0, t: 0 })

    return {
      subjects, subjectById, topicById, scores, mistakes, suggestions, perSubject,
      kpis: {
        attempts: data.attempts.length,
        rate: sum.t ? pct(sum.c, sum.t) : null,
        quizzedTopics: Object.keys(scores).length,
        topics: data.topics.length,
        answered: data.attempts.reduce((n, a) => n + a.question_count, 0),
      },
      left: Math.max(0, QUIZ_DAILY_LIMIT - data.usedToday),
    }
  }, [data])

  // Auswahl sinnvoll vorbelegen, sobald die Daten da sind
  useEffect(() => {
    if (!view) return
    if (!subjectId || !view.subjectById[subjectId]) {
      const first = view.suggestions[0]?.topic.subject_id || view.perSubject[0]?.subject.id || ''
      setSubjectId(first)
    }
  }, [view])

  const subjectTopics = useMemo(
    () => (view ? data.topics.filter(t => t.subject_id === subjectId) : []),
    [view, subjectId],
  )

  useEffect(() => {
    if (!subjectTopics.some(t => t.id === topicId)) {
      const suggested = view?.suggestions.find(s => s.topic.subject_id === subjectId)?.topic
      setTopicId(suggested?.id || subjectTopics.find(t => !view?.scores[t.id])?.id || subjectTopics[0]?.id || '')
    }
  }, [subjectTopics])

  function switchMode(m) {
    setMode(m)
    setCount(DEFAULT_COUNT[m])
  }

  function startTopic(topic, n = DEFAULT_COUNT.topic) {
    setSession({ mode: 'topic', topicId: topic.id, label: topic.title, subjectName: view.subjectById[topic.subject_id]?.name, count: n })
  }

  function startFromForm() {
    if (mode === 'topic') {
      const topic = view.topicById[topicId]
      if (topic) startTopic(topic, count)
    } else if (mode === 'subject') {
      const s = view.subjectById[subjectId]
      if (s) setSession({ mode: 'subject', subjectId: s.id, label: s.name, count })
    } else {
      const pool = [...view.mistakes].sort(() => Math.random() - 0.5).slice(0, count)
      setSession({ mode: 'mistakes', label: 'Deine letzten Fehler', questions: pool })
    }
  }

  function startRandom() {
    const weighted = [
      ...view.suggestions.map(s => s.topic),
      ...data.topics.filter(t => t.done),
    ]
    const pool = weighted.length ? weighted : data.topics
    const topic = pool[Math.floor(Math.random() * pool.length)]
    if (topic) startTopic(topic)
  }

  function restart(attempt) {
    if (attempt.topic_id) {
      const topic = view.topicById[attempt.topic_id]
      if (topic) startTopic(topic)
    } else if (attempt.subject_id) {
      const s = view.subjectById[attempt.subject_id]
      if (s) setSession({ mode: 'subject', subjectId: s.id, label: s.name, count: DEFAULT_COUNT.subject })
    }
  }

  function pickSubject(id) {
    setMode('subject')
    setCount(DEFAULT_COUNT.subject)
    setSubjectId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function exitSession() {
    setSession(null)
    load()
    window.scrollTo({ top: 0 })
  }

  if (session) {
    return (
      <div className="plan-section quiz-view">
        <QuizSession
          key={JSON.stringify([session.mode, session.topicId, session.subjectId, session.label])}
          userId={userId}
          target={session}
          onExit={exitSession}
        />
      </div>
    )
  }

  if (!view) return null

  if (view.subjects.length === 0 || data.topics.length === 0) {
    return (
      <div className="plan-section quiz-view">
        <section className="card">
          <div className="card-head"><h2>Abfragen</h2></div>
          <p className="timeline-empty">
            Lumo fragt dich zu deinen eigenen Themen ab. Lege dafür zuerst Fächer und Themen an.{' '}
            <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'subjects')}>Zum Planer</button>
          </p>
        </section>
      </div>
    )
  }

  const { kpis, mistakes } = view
  const hasHistory = kpis.attempts > 0
  const recentAttempts = data.attempts.slice(0, 8)
  const shownMistakes = showAllMistakes ? mistakes.slice(0, 30) : mistakes.slice(0, 5)
  const canStart = mode === 'topic' ? !!topicId : mode === 'subject' ? !!subjectId : mistakes.length > 0
  const noQuota = mode !== 'mistakes' && view.left === 0

  return (
    <div className="plan-section quiz-view">
      <section className="card quiz-start">
        <div className="card-head">
          <h2>Neue Abfrage</h2>
          <span className={`eyebrow ${view.left === 0 ? 'quiz-quota-empty' : ''}`}>
            Heute noch {view.left} von {QUIZ_DAILY_LIMIT} KI-Abfragen
          </span>
        </div>

        <div className="quiz-modes" role="tablist" aria-label="Art der Abfrage">
          {[
            ['topic', 'Ein Thema'],
            ['subject', 'Ganzes Fach'],
            ['mistakes', `Fehler wiederholen${mistakes.length ? ` (${mistakes.length})` : ''}`],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id}
              className={`quiz-mode ${mode === id ? 'active' : ''}`} onClick={() => switchMode(id)}>
              {label}
            </button>
          ))}
        </div>

        {mode !== 'mistakes' ? (
          <div className="field-row quiz-form">
            <label className="field">
              Fach
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)}>
                {view.perSubject.map(({ subject }) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            {mode === 'topic' && (
              <label className="field grow">
                Thema
                <select value={topicId} onChange={e => setTopicId(e.target.value)}>
                  {subjectTopics.map(t => {
                    const s = view.scores[t.id]
                    return (
                      <option key={t.id} value={t.id}>
                        {t.title}{s ? `  ·  zuletzt ${s.correct}/${s.total}` : ''}{t.done ? '  ✓' : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
          </div>
        ) : (
          <p className="quiz-mode-hint">
            {mistakes.length
              ? 'Fragen, die du in letzter Zeit falsch beantwortet hast, in neuer Reihenfolge. Läuft ohne KI und zählt nicht zum Tageslimit.'
              : 'Noch keine Fehler gesammelt. Sobald du in einer Abfrage danebenliegst, landet die Frage hier.'}
          </p>
        )}

        <div className="quiz-start-foot">
          <div className="quiz-count" role="group" aria-label="Anzahl Fragen">
            <span>Fragen</span>
            {COUNTS[mode].map(n => (
              <button key={n} type="button" className={count === n ? 'active' : ''} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
          <div className="quiz-actions">
            {mode === 'topic' && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={startRandom} disabled={noQuota}>
                <Shuffle size={14} strokeWidth={2} /> Zufälliges Thema
              </button>
            )}
            <button type="button" className="btn btn-sm btn-primary" onClick={startFromForm} disabled={!canStart || noQuota}>
              <Sparkles size={14} strokeWidth={2} /> Abfrage starten
            </button>
          </div>
        </div>

        {view.suggestions.length > 0 && mode !== 'mistakes' && (
          <div className="quiz-suggestions">
            <h3>Vorschläge</h3>
            <ul>
              {view.suggestions.map(({ topic, reason, tone }) => (
                <li key={topic.id}>
                  <button type="button" className="quiz-suggestion" onClick={() => startTopic(topic)} disabled={noQuota}>
                    <span className="quiz-suggestion-title">{topic.title}</span>
                    <span className="quiz-suggestion-meta">
                      {view.subjectById[topic.subject_id]?.name} · <span className={`tone-${tone}`}>{reason}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!hasHistory && (
        <section className="card quiz-howto">
          <div className="card-head"><h2>So funktioniert's</h2></div>
          <ol>
            <li><strong>Thema wählen.</strong> Die KI erstellt Multiple-Choice-Fragen aus deinen Themen und Lernzielen.</li>
            <li><strong>Antworten.</strong> Nach jeder Frage siehst du sofort, ob es stimmt, mit kurzer Erklärung.</li>
            <li><strong>Dranbleiben.</strong> Lumo merkt sich deine Ergebnisse, schlägt schwache Themen zum Wiederholen vor und sammelt deine Fehler.</li>
          </ol>
        </section>
      )}

      {hasHistory && (
        <section className="weekly-review quiz-kpis">
          <div className="weekly-stats">
            <div className="weekly-stat"><span className="weekly-stat-value">{kpis.attempts}</span><span className="weekly-stat-label">Abfragen</span></div>
            <div className="weekly-stat"><span className="weekly-stat-value">{kpis.answered}</span><span className="weekly-stat-label">Fragen beantwortet</span></div>
            <div className="weekly-stat"><span className="weekly-stat-value">{kpis.rate === null ? '–' : `${kpis.rate}%`}</span><span className="weekly-stat-label">Trefferquote · 30 Tage</span></div>
            <div className="weekly-stat"><span className="weekly-stat-value">{kpis.quizzedTopics}<small className="quiz-kpi-of">/{kpis.topics}</small></span><span className="weekly-stat-label">Themen abgefragt</span></div>
            <div className="weekly-stat"><span className="weekly-stat-value">{mistakes.length}</span><span className="weekly-stat-label">Fehler zum Üben</span></div>
          </div>
        </section>
      )}

      {hasHistory && (
        <div className="plan-two-col">
          <section className="card">
            <div className="card-head"><h2>Stand pro Fach</h2><span className="eyebrow">Ø letztes Ergebnis je Thema</span></div>
            <ul className="quiz-subjects">
              {view.perSubject.map(({ subject, total, quizzed, avg }) => (
                <li key={subject.id}>
                  <button type="button" className="quiz-subject-row" onClick={() => pickSubject(subject.id)} title={`Fach-Abfrage ${subject.name} vorbereiten`}>
                    <span className="quiz-subject-name">
                      {subject.name}
                      <span className={`priority-badge ${priorityClass(subject.priority)}`}>{subject.priority}</span>
                    </span>
                    <span className={`quiz-subject-score ${avg === null ? '' : scoreClass(avg)}`}>{avg === null ? '–' : `${avg}%`}</span>
                    <span className="quiz-subject-bar"><span className={avg === null ? '' : scoreClass(avg)} style={{ width: `${avg ?? 0}%` }} /></span>
                    <span className="quiz-subject-meta">{quizzed} von {total} Themen abgefragt</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-head"><h2>Verlauf</h2><span className="eyebrow">Letzte Abfragen</span></div>
            <ul className="quiz-history">
              {recentAttempts.map(a => {
                const topic = a.topic_id ? view.topicById[a.topic_id] : null
                const subject = view.subjectById[a.subject_id || topic?.subject_id]
                const p = pct(a.correct_count, a.question_count)
                return (
                  <li key={a.id}>
                    <div className="quiz-history-main">
                      <span className="quiz-history-title">{topic ? topic.title : `Fach-Abfrage ${subject?.name || ''}`}</span>
                      <span className="quiz-history-meta">{fmtShort(new Date(a.created_at))}{topic && subject ? ` · ${subject.name}` : ''}</span>
                    </div>
                    <span className={`quiz-pill ${scoreClass(p)}`}>{a.correct_count}/{a.question_count}</span>
                    <button type="button" className="icon-btn" onClick={() => restart(a)} disabled={view.left === 0}
                      aria-label={`Nochmal abfragen: ${topic ? topic.title : subject?.name}`} title="Nochmal abfragen">
                      <RotateCcw size={15} strokeWidth={2} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}

      {mistakes.length > 0 && (
        <section className="card quiz-mistakes">
          <div className="card-head">
            <h2>Fehlerheft</h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { switchMode('mistakes'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              <Repeat size={14} strokeWidth={2} /> Üben
            </button>
          </div>
          <ul className="quiz-mistake-list">
            {shownMistakes.map((m, i) => {
              const topic = m.topic_id ? view.topicById[m.topic_id] : null
              const subject = view.subjectById[m.subject_id || topic?.subject_id]
              return (
                <li key={i}>
                  <details>
                    <summary>
                      <span className="quiz-mistake-q">{m.question}</span>
                      <span className="quiz-mistake-src">{topic?.title || subject?.name}</span>
                    </summary>
                    <div className="quiz-mistake-body">
                      <p><span className="bad">Deine Antwort:</span> {m.options[m.answer]}</p>
                      <p><span className="good"><Check size={12} strokeWidth={3} /> Richtig:</span> {m.options[m.correct_index]}</p>
                      <p className="quiz-review-x">{m.explanation}</p>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
          {mistakes.length > 5 && (
            <button type="button" className="inline-link quiz-more" onClick={() => setShowAllMistakes(v => !v)}>
              {showAllMistakes ? 'Weniger anzeigen' : `Alle ${Math.min(mistakes.length, 30)} anzeigen`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
