import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileText, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { STORAGE_PREFIX } from '../../config.js'
import { requestScan } from '../../lib/scan.js'
import { loadSummaries, onFocusSummary, onSummariesChanged, openSummary, summaryStats } from '../../lib/summaries.js'
import { onPlanChanged } from '../../lib/progress.js'

const fmtShort = d => new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short' }).format(new Date(d))
const COLORS = ['var(--pink)', 'var(--sky)', 'var(--mint)', 'var(--sun)', 'var(--lilac)']
const COLLAPSED_KEY = `${STORAGE_PREFIX}:summaries-collapsed`
const NO_TOPIC = 'ohne'

function readCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')) } catch { return new Set() }
}
function writeCollapsed(set) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])) } catch { /* ignorieren */ }
}

// Volltext für die Suche: Titel, Überblick, Abschnitte, Begriffe
function haystack(s, topicTitle) {
  const c = s.content || {}
  return [
    s.title, topicTitle, c.overview,
    ...(c.sections || []).map(x => x.heading),
    ...(c.terms || []).map(x => x.term),
  ].filter(Boolean).join(' ').toLowerCase()
}

// Lernen-Tab: Zusammenfassungen geordnet nach Fach → Thema, durchsuchbar
export default function SummariesCard({ userId }) {
  const [list, setList] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState({})
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [focus, setFocus] = useState(null)
  const refs = useRef({})

  async function load() {
    const [rows, { data: s }, { data: t }] = await Promise.all([
      loadSummaries(userId),
      supabase.from('plan_subjects').select('id, name, sort_order').eq('user_id', userId).order('sort_order'),
      supabase.from('plan_topics').select('id, title, category, sort_order').eq('user_id', userId),
    ])
    setSubjects(s || [])
    setTopics(Object.fromEntries((t || []).map(x => [x.id, x])))
    setList(rows)
  }

  useEffect(() => {
    load()
    const a = onSummariesChanged(load)
    const b = onPlanChanged(load)
    return () => { a(); b() }
  }, [userId])

  useEffect(() => onFocusSummary(id => {
    setFilter('')
    setQuery('')
    setFocus(id)
    window.setTimeout(() => setFocus(null), 3800)
  }), [])

  // Fokussierte Zusammenfassung: ihre Gruppe aufklappen und hinscrollen
  useEffect(() => {
    if (!focus || !list) return
    const s = list.find(x => x.id === focus)
    if (s) {
      const key = s.topic_id && topics[s.topic_id] ? s.topic_id : `${NO_TOPIC}:${s.subject_id}`
      setCollapsed(cur => {
        if (!cur.has(key)) return cur
        const next = new Set(cur); next.delete(key); writeCollapsed(next); return next
      })
    }
    window.setTimeout(() => refs.current[focus]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }, [focus, list])

  function toggle(key) {
    setCollapsed(cur => {
      const next = new Set(cur)
      next.has(key) ? next.delete(key) : next.add(key)
      writeCollapsed(next)
      return next
    })
  }

  // Fach → Thema → Zusammenfassungen, in der Reihenfolge des Plans
  const groups = useMemo(() => {
    if (!list) return []
    const q = query.trim().toLowerCase()
    const known = new Set(subjects.map(s => s.id))
    return subjects
      .filter(s => !filter || s.id === filter)
      .map(subj => {
        const mine = list.filter(x => x.subject_id === subj.id && known.has(x.subject_id))
          .filter(x => !q || haystack(x, topics[x.topic_id]?.title).includes(q))
        const byTopic = new Map()
        for (const x of mine) {
          const key = x.topic_id && topics[x.topic_id] ? x.topic_id : `${NO_TOPIC}:${subj.id}`
          if (!byTopic.has(key)) byTopic.set(key, [])
          byTopic.get(key).push(x)
        }
        const topicGroups = [...byTopic.entries()]
          .map(([key, items]) => ({ key, topic: topics[key] || null, items }))
          .sort((a, b) => {
            if (!a.topic) return 1
            if (!b.topic) return -1
            const ca = a.topic.category || '\uffff', cb = b.topic.category || '\uffff'
            return ca.localeCompare(cb, 'de') || a.topic.sort_order - b.topic.sort_order
          })
        return { subj, count: mine.length, topicGroups }
      })
      .filter(g => g.count > 0)
  }, [list, subjects, topics, filter, query])

  if (!list) return null

  const counts = Object.fromEntries(subjects.map(s => [s.id, list.filter(x => x.subject_id === s.id).length]))
  const usedSubjects = subjects.filter(s => counts[s.id] > 0)
  const searching = query.trim().length > 0
  const allKeys = groups.flatMap(g => g.topicGroups.map(t => t.key))
  const allClosed = allKeys.length > 0 && allKeys.every(k => collapsed.has(k))

  function setAll(close) {
    setCollapsed(cur => {
      const next = new Set(cur)
      allKeys.forEach(k => (close ? next.add(k) : next.delete(k)))
      writeCollapsed(next)
      return next
    })
  }

  return (
    <section className="card summaries-card">
      <div className="card-head">
        <h2>Zusammenfassungen</h2>
        <div className="card-head-tools">
          {list.length > 0 && <span className="eyebrow">{list.length}</span>}
          <button type="button" className="btn btn-sm btn-primary summaries-new" onClick={() => requestScan({ mode: 'summary' })}>
            <Plus size={15} strokeWidth={2.4} /> Neue Zusammenfassung
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="summaries-empty">
          <div className="summaries-empty-art" aria-hidden="true">
            <span /><span /><span />
          </div>
          <p>
            Fotografier ein Arbeitsblatt oder lade ein PDF hoch: Lumi schreibt dir eine Zusammenfassung mit den wichtigsten Punkten,
            Begriffen, Formeln und Kontrollfragen. Die Abfragen stützen sich danach darauf.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => requestScan({ mode: 'summary' })}>
            <FileText size={15} /> Erste Zusammenfassung erstellen
          </button>
        </div>
      ) : (
        <>
          <div className="sum-toolbar">
            <label className="sum-search">
              <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              <input
                type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Suchen: Titel, Thema, Begriff …" aria-label="Zusammenfassungen durchsuchen"
              />
              {query && <button type="button" className="sum-search-clear" onClick={() => setQuery('')} aria-label="Suche leeren"><X size={14} /></button>}
            </label>
            {allKeys.length > 1 && !searching && (
              <button type="button" className="sum-fold-all" onClick={() => setAll(!allClosed)}>
                {allClosed ? 'Alle aufklappen' : 'Alle zuklappen'}
              </button>
            )}
          </div>

          {usedSubjects.length > 1 && (
            <div className="summaries-filter" role="group" aria-label="Nach Fach filtern">
              <button type="button" className={!filter ? 'on' : ''} onClick={() => setFilter('')}>Alle <span>{list.length}</span></button>
              {usedSubjects.map(s => (
                <button key={s.id} type="button" className={filter === s.id ? 'on' : ''} onClick={() => setFilter(filter === s.id ? '' : s.id)}>
                  {s.name} <span>{counts[s.id]}</span>
                </button>
              ))}
            </div>
          )}

          {groups.length === 0 && <p className="sum-none">Nichts gefunden für «{query.trim()}».</p>}

          {groups.map(({ subj, count, topicGroups }) => (
            <div key={subj.id} className="sum-subject">
              <h3 className="sum-subject-head">
                {subj.name} <span className="sum-count">{count}</span>
              </h3>
              {topicGroups.map(({ key, topic, items }, gi) => {
                const open = searching || !collapsed.has(key)
                const color = COLORS[gi % COLORS.length]
                return (
                  <div key={key} className={`sum-topic ${open ? 'open' : ''}`} style={{ '--topic-color': color }}>
                    <button type="button" className="sum-topic-head" aria-expanded={open} onClick={() => toggle(key)} disabled={searching}>
                      <span className="sum-topic-dot" aria-hidden="true" />
                      <span className="sum-topic-name">
                        {topic?.category && <small>{topic.category}</small>}
                        {topic ? topic.title : 'Ohne Thema'}
                      </span>
                      <span className="sum-count">{items.length}</span>
                      <ChevronDown className="sum-topic-chevron" size={18} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                    {open && (
                      <ul className="summaries-grid">
                        {items.map((s, i) => {
                          const st = summaryStats(s.content)
                          return (
                            <li key={s.id} ref={el => { refs.current[s.id] = el }}>
                              <button
                                type="button" data-summary-id={s.id}
                                className={`summary-tile ${focus === s.id ? 'focus' : ''}`}
                                style={{ '--tilt': `${(i % 3 - 1) * 0.5}deg` }}
                                onClick={() => openSummary(s.id)}
                              >
                                <span className="summary-tile-date">{fmtShort(s.created_at)}</span>
                                <strong>{s.title}</strong>
                                <span className="summary-tile-meta">
                                  {st.sections} Abschnitte{st.terms ? ` · ${st.terms} Begriffe` : ''}{st.questions ? ` · ${st.questions} Fragen` : ''}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                        {!searching && (
                          <li>
                            <button
                              type="button" className="summary-tile summary-tile-add"
                              onClick={() => requestScan({ mode: 'summary', subjectId: subj.id, topicId: topic?.id || '' })}
                            >
                              <Plus size={18} strokeWidth={2.4} />
                              <span>Neue zu {topic ? 'diesem Thema' : subj.name}</span>
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
