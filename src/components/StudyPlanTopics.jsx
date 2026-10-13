import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { onPlanChanged, onScrollToTopics, recordProgress } from '../lib/progress.js'
import { priorityClass, sortSubjects } from '../lib/plan.js'
import { Sparkles } from 'lucide-react'
import { lastScoresByTopic, scoreClass } from '../lib/quiz.js'
import QuizDialog from './QuizDialog.jsx'

// Gruppiert Themen (bereits nach sort_order sortiert) nach category, ohne
// die Reihenfolge zu verändern. Themen ohne category (Deutsch/Englisch)
// landen in einer namenlosen Gruppe, die ohne Sub-Header gerendert wird.
function groupByCategory(list) {
  const groups = []
  let current = null
  for (const topic of list) {
    const key = topic.category || null
    if (!current || current.category !== key) {
      current = { category: key, topics: [] }
      groups.push(current)
    }
    current.topics.push(topic)
  }
  return groups
}

// "Units" blenden Subtasks und (subtask-lose) Themen zu einer gemeinsamen
// Fortschritts-Zählung — dieselbe Logik wie topicUnits in lib/progress.js,
// hier lokal auf bereits geladenen Daten (kein Extra-Fetch).
function topicUnits(topic, subtasks) {
  if (subtasks.length > 0) {
    return { total: subtasks.length, done: subtasks.filter(st => st.is_done).length }
  }
  return { total: 1, done: topic.done ? 1 : 0 }
}

export default function StudyPlanTopics({ userId, onNavigate }) {
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [subtasksByTopic, setSubtasksByTopic] = useState({})
  const [expandedSubjectId, setExpandedSubjectId] = useState(null)
  const [expandedTopicId, setExpandedTopicId] = useState(null)
  const [highlightTopicIds, setHighlightTopicIds] = useState([])
  const [scores, setScores] = useState({})
  const [quizTarget, setQuizTarget] = useState(null) // { topicId | subjectId, label }
  const topicRefs = useRef({})

  // Eigene Änderungen werden optimistisch gesetzt; neu geladen wird nur,
  // wenn eine andere Komponente (z.B. der Timer) den Plan verändert hat.
  const selfChange = useRef(false)

  useEffect(() => {
    load()
    return onPlanChanged(() => {
      if (selfChange.current) { selfChange.current = false; return }
      load()
    })
  }, [userId])

  // WeeklyFocusCard schickt beim Klick auf eine Fokus-Zeile die
  // zugehörigen Themen-IDs — Fach aufklappen, kurz hervorheben, hinscrollen.
  useEffect(() => {
    return onScrollToTopics(e => {
      const ids = e.detail?.topicIds?.filter(Boolean) || []
      if (ids.length === 0) return
      const firstTopic = topics.find(t => t.id === ids[0])
      if (!firstTopic) return
      setExpandedSubjectId(firstTopic.subject_id)
      setHighlightTopicIds(ids)
      window.setTimeout(() => setHighlightTopicIds([]), 3000)
    })
  }, [topics])

  useEffect(() => {
    if (highlightTopicIds.length === 0) return
    const el = topicRefs.current[highlightTopicIds[0]]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightTopicIds])

  async function load() {
    const [{ data: s }, { data: t }, { data: st }, lastScores] = await Promise.all([
      supabase.from('plan_subjects').select('*').eq('user_id', userId),
      supabase.from('plan_topics').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      supabase.from('plan_subtasks').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      lastScoresByTopic(userId),
    ])
    setScores(lastScores)
    setSubjects(sortSubjects(s || []))
    setTopics(t || [])

    const grouped = {}
    for (const task of st || []) {
      if (!grouped[task.topic_id]) grouped[task.topic_id] = []
      grouped[task.topic_id].push(task)
    }
    setSubtasksByTopic(grouped)
  }

  function subjectTopics(subjectId) {
    return topics.filter(t => t.subject_id === subjectId)
  }

  // Subtask togglen: aktualisiert lokal sofort (optimistic), synct danach die
  // DB. Wenn dadurch alle Subtasks eines Themas erledigt/nicht mehr alle
  // erledigt sind, wird das Thema automatisch mitgezogen (in beide Richtungen).
  async function toggleSubtask(subtask, topic) {
    const nextDone = !subtask.is_done
    const nextDoneAt = nextDone ? new Date().toISOString() : null
    const siblings = subtasksByTopic[topic.id] || []
    const updatedSiblings = siblings.map(st => st.id === subtask.id ? { ...st, is_done: nextDone } : st)
    const allDone = updatedSiblings.length > 0 && updatedSiblings.every(st => st.is_done)
    const topicChanges = allDone !== topic.done

    setSubtasksByTopic(prev => ({
      ...prev,
      [topic.id]: prev[topic.id].map(st => st.id === subtask.id ? { ...st, is_done: nextDone, done_at: nextDoneAt } : st),
    }))
    if (topicChanges) {
      setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, done: allDone, completed_at: allDone ? nextDoneAt : null } : t))
    }

    await supabase.from('plan_subtasks').update({ is_done: nextDone, done_at: nextDoneAt }).eq('id', subtask.id)
    if (topicChanges) {
      await supabase.from('plan_topics').update({ done: allDone, completed_at: allDone ? nextDoneAt : null }).eq('id', topic.id)
    }
    selfChange.current = true
    await recordProgress(userId)
  }

  // Themen-Checkbox: ohne Subtasks bleibt es binär wie bisher. Mit Subtasks
  // togglet die Checkbox alle zugehörigen Subtasks gemeinsam.
  async function toggleTopic(topic) {
    const subtasks = subtasksByTopic[topic.id] || []
    const done = !topic.done
    const doneAt = done ? new Date().toISOString() : null

    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, done, completed_at: doneAt } : t))

    if (subtasks.length > 0) {
      setSubtasksByTopic(prev => ({
        ...prev,
        [topic.id]: prev[topic.id].map(st => ({ ...st, is_done: done, done_at: doneAt })),
      }))
      await Promise.all([
        supabase.from('plan_topics').update({ done, completed_at: doneAt }).eq('id', topic.id),
        supabase.from('plan_subtasks').update({ is_done: done, done_at: doneAt }).eq('topic_id', topic.id),
      ])
    } else {
      await supabase.from('plan_topics').update({ done, completed_at: doneAt }).eq('id', topic.id)
    }
    selfChange.current = true
    await recordProgress(userId)
  }

  function subjectUnits(subjectId) {
    return subjectTopics(subjectId).reduce((acc, topic) => {
      const u = topicUnits(topic, subtasksByTopic[topic.id] || [])
      acc.total += u.total
      acc.done += u.done
      return acc
    }, { total: 0, done: 0 })
  }

  const overall = topics.reduce((acc, topic) => {
    const u = topicUnits(topic, subtasksByTopic[topic.id] || [])
    acc.total += u.total
    acc.done += u.done
    return acc
  }, { total: 0, done: 0 })

  return (
    <section className="card card-plan-topics">
      <div className="card-head">
        <h2>Themen</h2>
        <span className="eyebrow">{overall.done}/{overall.total} erledigt</span>
      </div>

      <div className="subject-accordion">
        {subjects.map(s => {
          const list = subjectTopics(s.id)
          const units = subjectUnits(s.id)
          const openCount = units.total - units.done
          const pct = units.total ? Math.round((units.done / units.total) * 100) : 0
          const expanded = expandedSubjectId === s.id

          return (
            <div key={s.id} className={`subject-group ${expanded ? 'expanded' : ''}`}>
              <button
                type="button"
                className="subject-header"
                onClick={() => setExpandedSubjectId(expanded ? null : s.id)}
              >
                <div className="subject-header-main">
                  <span className="subject-name">{s.name}</span>
                  <span className={`priority-badge ${priorityClass(s.priority)}`}>{s.priority}</span>
                </div>
                <div className="subject-header-meta">
                  <span className="subject-open-count">{openCount} offen</span>
                  <span className="subject-chevron">{expanded ? '−' : '+'}</span>
                </div>
              </button>

              <div className="subject-progress-track">
                <div className="subject-progress-fill" style={{ width: `${pct}%` }} />
              </div>

              {expanded && (
                <div className="topic-category-groups">
                  {list.length > 0 && (
                    <button
                      type="button" className="quiz-subject-btn"
                      onClick={() => setQuizTarget({ subjectId: s.id, label: s.name })}
                    >
                      <Sparkles size={14} strokeWidth={2} /> Fach-Quiz: gemischte Fragen aus {s.name}
                    </button>
                  )}
                  {groupByCategory(list).map((group, gi) => (
                    <div key={group.category || `_${gi}`} className="topic-category-group">
                      {group.category && <h4 className="topic-category-heading">{group.category}</h4>}
                      <ul className="topic-list">
                        {group.topics.map(t => {
                    const subtasks = subtasksByTopic[t.id] || []
                    const tUnits = topicUnits(t, subtasks)
                    const tPct = tUnits.total ? Math.round((tUnits.done / tUnits.total) * 100) : 0
                    const topicExpanded = expandedTopicId === t.id
                    const isHighlighted = highlightTopicIds.includes(t.id)

                    return (
                      <li
                        key={t.id}
                        ref={el => { topicRefs.current[t.id] = el }}
                        className={`topic-item ${t.done ? 'done' : ''} ${isHighlighted ? 'highlight' : ''}`}
                      >
                        <div className="topic-row">
                          <input type="checkbox" checked={t.done} onChange={() => toggleTopic(t)} aria-label={`${t.title} erledigt`} />
                          {subtasks.length > 0 ? (
                            <button
                              type="button"
                              className="topic-title-btn"
                              onClick={() => setExpandedTopicId(topicExpanded ? null : t.id)}
                            >
                              <span className="topic-title">{t.title}</span>
                              <span className="topic-subtask-count">{tUnits.done}/{tUnits.total}</span>
                              <span className="topic-chevron">{topicExpanded ? '−' : '+'}</span>
                            </button>
                          ) : (
                            <span className="topic-title">{t.title}</span>
                          )}
                          <button
                            type="button"
                            className={`quiz-topic-btn ${scores[t.id] ? scoreClass(scores[t.id].pct) : ''}`}
                            onClick={() => setQuizTarget({ topicId: t.id, label: t.title })}
                            title={scores[t.id] ? `Letztes Quiz: ${scores[t.id].correct}/${scores[t.id].total} richtig — neues Quiz starten` : 'Quiz zu diesem Thema starten'}
                            aria-label={`Quiz zu ${t.title}`}
                          >
                            <Sparkles size={13} strokeWidth={2} />
                            {scores[t.id] && <span>{scores[t.id].correct}/{scores[t.id].total}</span>}
                          </button>
                        </div>

                        {subtasks.length > 0 && (
                          <div className="topic-progress-track">
                            <div className="topic-progress-fill" style={{ width: `${tPct}%` }} />
                          </div>
                        )}

                        {topicExpanded && subtasks.length > 0 && (
                          <ul className="subtask-list">
                            {subtasks.map(st => (
                              <li key={st.id} className={`subtask-item ${st.is_done ? 'done' : ''}`}>
                                <input type="checkbox" checked={st.is_done} onChange={() => toggleSubtask(st, t)} aria-label={`${st.title} erledigt`} />
                                <span className="subtask-title">{st.title}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                        })}
                      </ul>
                    </div>
                  ))}
                  {list.length === 0 && <p className="timeline-empty">Keine Themen für dieses Fach.</p>}
                </div>
              )}
            </div>
          )
        })}
        {subjects.length === 0 && (
          <p className="timeline-empty">
            Noch keine Fächer.{' '}
            <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'subjects')}>Im Planer anlegen</button>
          </p>
        )}
      </div>

      {quizTarget && <QuizDialog userId={userId} target={quizTarget} onClose={() => setQuizTarget(null)} />}
    </section>
  )
}
