import React, { useState } from 'react'
import { ArrowDown, ArrowUp, Camera, ChevronDown, ChevronRight, X } from 'lucide-react'
import { requestScan } from '../../lib/scan.js'
import { useTable } from '../../lib/useTable.js'
import { recordProgress } from '../../lib/progress.js'
import { PRIORITIES, PRIORITY_ORDER, priorityClass } from '../../lib/plan.js'
import { DeleteButton, EmptyNote, ErrorNote, InlineSelect, InlineText } from './fields.jsx'

const PRIORITY_OPTIONS = PRIORITIES.map(p => ({ value: p, label: p }))

function splitLines(text) {
  return text.split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)
}

export default function SubjectsEditor({ userId, onTabChange }) {
  const subjects = useTable('plan_subjects', userId, { order: [['sort_order', true], ['created_at', true]] })
  const topics = useTable('plan_topics', userId, { order: [['sort_order', true], ['created_at', true]] })
  const subtasks = useTable('plan_subtasks', userId, { order: [['sort_order', true], ['created_at', true]] })
  const goals = useTable('goals', userId, { order: [['sort_order', true], ['created_at', true]] })
  const phases = useTable('plan_phases', userId, { order: [['start_date', true]] })

  const [expanded, setExpanded] = useState(null)
  const [newSubject, setNewSubject] = useState({ name: '', priority: 'mittel', goal_id: '' })

  const ready = subjects.rows && topics.rows && subtasks.rows && goals.rows && phases.rows
  if (!ready) return null

  const error = subjects.error || topics.error || subtasks.error
  const goalOptions = [{ value: null, label: 'Kein Ziel' }, ...goals.rows.map(g => ({ value: g.id, label: g.name }))]
  const phaseOptions = [{ value: null, label: 'Keine Phase' }, ...phases.rows.map(p => ({ value: p.id, label: p.name }))]
  const defaultGoal = goals.rows.length === 1 ? goals.rows[0].id : ''

  const sortedSubjects = [...subjects.rows].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || a.sort_order - b.sort_order
  )

  async function addSubject(e) {
    e.preventDefault()
    const created = await subjects.create({
      name: newSubject.name.trim(),
      priority: newSubject.priority,
      goal_id: (newSubject.goal_id || defaultGoal) || null,
      sort_order: subjects.rows.length,
    })
    if (created) {
      setNewSubject({ name: '', priority: 'mittel', goal_id: '' })
      setExpanded(created.id)
      recordProgress(userId)
    }
  }

  async function removeSubject(subject) {
    if (await subjects.remove(subject.id)) {
      topics.load(); subtasks.load()
      recordProgress(userId)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Fächer &amp; Themen</h2>
        <div className="card-head-tools">
          <span className="eyebrow">{subjects.rows.length} Fächer · {topics.rows.length} Themen</span>
          <button type="button" className="btn btn-sm btn-primary scan-open-btn" onClick={() => requestScan()}>
            <Camera size={15} strokeWidth={2.2} /> Aus Foto oder PDF
          </button>
        </div>
      </div>
      <ErrorNote message={error} />

      {goals.rows.length === 0 && (
        <p className="field-hint">
          Tipp: Ordne Fächer einem Ziel zu, damit ihr Fortschritt dort zählt.{' '}
          <button type="button" className="inline-link" onClick={() => onTabChange('goals')}>Ziel anlegen</button>
        </p>
      )}
      {sortedSubjects.length === 0 && <EmptyNote>Noch keine Fächer.</EmptyNote>}

      <div className="subject-editor-list">
        {sortedSubjects.map(subject => {
          const subjectTopics = topics.rows.filter(t => t.subject_id === subject.id).sort((a, b) => a.sort_order - b.sort_order)
          const isOpen = expanded === subject.id
          return (
            <div key={subject.id} className={`subject-editor ${isOpen ? 'open' : ''}`}>
              <div className="subject-editor-head">
                <button
                  type="button" className="icon-btn" aria-expanded={isOpen}
                  aria-label={isOpen ? 'Themen zuklappen' : 'Themen aufklappen'}
                  onClick={() => setExpanded(isOpen ? null : subject.id)}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <InlineText
                  value={subject.name} required label="Fachname" className="strong"
                  onSave={name => subjects.update(subject.id, { name })}
                />
                <InlineSelect
                  value={subject.priority} options={PRIORITY_OPTIONS} label="Priorität"
                  className={`priority-select ${priorityClass(subject.priority)}`}
                  onSave={priority => subjects.update(subject.id, { priority })}
                />
                <InlineSelect
                  value={subject.goal_id} options={goalOptions} label="Ziel"
                  onSave={async goal_id => { if (await subjects.update(subject.id, { goal_id })) recordProgress(userId) }}
                />
                <button type="button" className="subject-count" onClick={() => setExpanded(isOpen ? null : subject.id)}>
                  {subjectTopics.length} {subjectTopics.length === 1 ? 'Thema' : 'Themen'}
                </button>
                <DeleteButton
                  what="Fach" onConfirm={() => removeSubject(subject)}
                  confirmText={`Fach „${subject.name}“ mit allen ${subjectTopics.length} Themen und Unterthemen löschen?`}
                />
              </div>

              {isOpen && (
                <TopicList
                  userId={userId} subject={subject} subjectTopics={subjectTopics}
                  topics={topics} subtasks={subtasks} phaseOptions={phaseOptions}
                  defaultPhaseId={phases.rows.length === 1 ? phases.rows[0].id : ''}
                />
              )}
            </div>
          )
        })}
      </div>

      <form className="editor-add" onSubmit={addSubject}>
        <h3>Neues Fach</h3>
        <div className="field-row">
          <label className="field grow">Name
            <input type="text" required placeholder="z.B. Mathematik" value={newSubject.name} onChange={e => setNewSubject(s => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="field">Priorität
            <select value={newSubject.priority} onChange={e => setNewSubject(s => ({ ...s, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">Ziel
            <select value={newSubject.goal_id || defaultGoal} onChange={e => setNewSubject(s => ({ ...s, goal_id: e.target.value }))}>
              {goalOptions.map(o => <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <button className="btn btn-sm btn-primary" type="submit">Fach hinzufügen</button>
      </form>
    </section>
  )
}

function TopicList({ userId, subject, subjectTopics, topics, subtasks, phaseOptions, defaultPhaseId }) {
  const [openTopic, setOpenTopic] = useState(null)
  const [bulk, setBulk] = useState('')
  const [category, setCategory] = useState('')
  const [phaseId, setPhaseId] = useState(defaultPhaseId)

  const categories = [...new Set(subjectTopics.map(t => t.category).filter(Boolean))]
  const listId = `categories-${subject.id}`

  async function addTopics(e) {
    e.preventDefault()
    const titles = splitLines(bulk)
    if (titles.length === 0) return
    const base = subjectTopics.reduce((m, t) => Math.max(m, t.sort_order), 0)
    const created = await topics.createMany(titles.map((title, i) => ({
      subject_id: subject.id, title, category: category.trim() || null, phase_id: phaseId || null, sort_order: base + i + 1,
    })))
    if (created.length) { setBulk(''); recordProgress(userId) }
  }

  // Verschieben: Reihenfolge im Fach neu durchnummerieren und nur
  // geänderte Zeilen speichern.
  async function move(topic, dir) {
    const order = [...subjectTopics]
    const i = order.findIndex(t => t.id === topic.id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    await Promise.all(order.map((t, idx) => (t.sort_order !== idx + 1 ? topics.update(t.id, { sort_order: idx + 1 }) : null)))
  }

  async function removeTopic(topic) {
    if (await topics.remove(topic.id)) {
      subtasks.setRows(list => list.filter(st => st.topic_id !== topic.id))
      recordProgress(userId)
    }
  }

  return (
    <div className="topic-editor">
      {subjectTopics.length === 0 && <EmptyNote>Noch keine Themen in diesem Fach.</EmptyNote>}
      <datalist id={listId}>{categories.map(c => <option key={c} value={c} />)}</datalist>

      <ul className="topic-editor-list">
        {subjectTopics.map((topic, idx) => {
          const topicSubtasks = subtasks.rows.filter(st => st.topic_id === topic.id).sort((a, b) => a.sort_order - b.sort_order)
          const isOpen = openTopic === topic.id
          return (
            <li key={topic.id} className={`topic-editor-row ${topic.done ? 'done' : ''}`}>
              <div className="topic-editor-main">
                <div className="reorder">
                  <button type="button" className="icon-btn small" disabled={idx === 0} onClick={() => move(topic, -1)} aria-label="Nach oben">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" className="icon-btn small" disabled={idx === subjectTopics.length - 1} onClick={() => move(topic, 1)} aria-label="Nach unten">
                    <ArrowDown size={13} />
                  </button>
                </div>
                <div className="editor-fields">
                  <InlineText value={topic.title} required label="Thema" onSave={title => topics.update(topic.id, { title })} />
                  <div className="editor-meta">
                    <CategoryField topic={topic} listId={listId} onSave={c => topics.update(topic.id, { category: c })} />
                    <InlineSelect
                      value={topic.phase_id} options={phaseOptions} label="Phase"
                      onSave={phase_id => topics.update(topic.id, { phase_id }).then(() => recordProgress(userId))}
                    />
                    <button type="button" className="subtask-toggle" onClick={() => setOpenTopic(isOpen ? null : topic.id)} aria-expanded={isOpen}>
                      {topicSubtasks.length ? `${topicSubtasks.length} Unterthemen` : '+ Unterthemen'}
                    </button>
                  </div>
                </div>
                <DeleteButton
                  what="Thema" onConfirm={() => removeTopic(topic)}
                  confirmText={`Thema „${topic.title}“${topicSubtasks.length ? ` mit ${topicSubtasks.length} Unterthemen` : ''} löschen?`}
                />
              </div>

              {isOpen && <SubtaskEditor userId={userId} topic={topic} list={topicSubtasks} subtasks={subtasks} topics={topics} />}
            </li>
          )
        })}
      </ul>

      <form className="editor-add compact" onSubmit={addTopics}>
        <label className="field">Themen hinzufügen <span className="hint">(eine Zeile pro Thema)</span>
          <textarea rows={3} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'z.B.\nAbleitungen\nIntegrale'} />
        </label>
        <div className="field-row align-end">
          <label className="field">Kategorie <span className="hint">(optional)</span>
            <input type="text" list={listId} value={category} onChange={e => setCategory(e.target.value)} placeholder="z.B. Analysis" />
          </label>
          <label className="field">Phase
            <select value={phaseId} onChange={e => setPhaseId(e.target.value)}>
              {phaseOptions.map(o => <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>)}
            </select>
          </label>
          <button className="btn btn-sm btn-primary" type="submit">
            {splitLines(bulk).length > 1 ? `${splitLines(bulk).length} Themen hinzufügen` : 'Thema hinzufügen'}
          </button>
        </div>
      </form>
    </div>
  )
}

function CategoryField({ topic, listId, onSave }) {
  const [draft, setDraft] = useState(topic.category || '')
  return (
    <input
      type="text" className="inline-field category-field" list={listId} placeholder="Kategorie"
      aria-label="Kategorie" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if ((draft.trim() || null) !== (topic.category || null)) onSave(draft.trim() || null) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

function SubtaskEditor({ userId, topic, list, subtasks, topics }) {
  const [text, setText] = useState('')

  // Ein Thema mit Unterthemen gilt als erledigt, wenn alle erledigt sind.
  async function syncTopic(nextList) {
    const allDone = nextList.length > 0 && nextList.every(st => st.is_done)
    if (nextList.length > 0 && allDone !== topic.done) {
      await topics.update(topic.id, { done: allDone, completed_at: allDone ? new Date().toISOString() : null })
    }
    recordProgress(userId)
  }

  async function add(e) {
    e.preventDefault()
    const titles = splitLines(text)
    if (titles.length === 0) return
    const base = list.reduce((m, st) => Math.max(m, st.sort_order), 0)
    const created = await subtasks.createMany(titles.map((title, i) => ({ topic_id: topic.id, title, sort_order: base + i + 1 })))
    if (created.length) {
      setText('')
      syncTopic([...list, ...created])
    }
  }

  async function remove(st) {
    if (await subtasks.remove(st.id)) syncTopic(list.filter(x => x.id !== st.id))
  }

  return (
    <div className="subtask-editor">
      <ul>
        {list.map(st => (
          <li key={st.id} className={st.is_done ? 'done' : ''}>
            <InlineText value={st.title} required label="Unterthema" onSave={title => subtasks.update(st.id, { title })} />
            <button type="button" className="icon-btn small danger" onClick={() => remove(st)} aria-label="Unterthema löschen">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form className="subtask-add" onSubmit={add}>
        <textarea
          rows={1} value={text} onChange={e => setText(e.target.value)}
          placeholder="Unterthema hinzufügen (mehrere: eine Zeile pro Unterthema)"
          aria-label="Unterthemen hinzufügen"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) { e.preventDefault(); add(e) } }}
        />
        <button className="btn btn-sm btn-ghost" type="submit">Hinzufügen</button>
      </form>
    </div>
  )
}
