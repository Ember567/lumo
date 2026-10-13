import React, { useState } from 'react'
import { useTable } from '../../lib/useTable.js'
import { recordProgress } from '../../lib/progress.js'
import { GOAL_COLORS, GOAL_KINDS } from '../../lib/plan.js'
import { DeleteButton, EmptyNote, ErrorNote, InlineDate, InlineNumber, InlineSelect, InlineText } from './fields.jsx'

const KIND_OPTIONS = Object.entries(GOAL_KINDS).map(([value, v]) => ({ value, label: v.label }))
const EMPTY = { name: '', kind: 'topics', exam_date: '', target_hours: '', color: 'ink' }

export default function GoalsEditor({ userId }) {
  const goals = useTable('goals', userId, { order: [['sort_order', true], ['created_at', true]] })
  const [draft, setDraft] = useState(EMPTY)

  async function add(e) {
    e.preventDefault()
    const usedColors = new Set((goals.rows || []).map(g => g.color))
    const color = draft.color !== 'ink' ? draft.color : Object.keys(GOAL_COLORS).find(c => !usedColors.has(c)) || 'ink'
    const created = await goals.create({
      name: draft.name.trim(),
      kind: draft.kind,
      exam_date: draft.exam_date || null,
      target_hours: draft.kind === 'hours' ? Number(draft.target_hours) : null,
      color,
      sort_order: (goals.rows?.length || 0),
    })
    if (created) { setDraft(EMPTY); recordProgress(userId) }
  }

  async function save(goal, patch) {
    // Wechsel auf "Lernstunden" braucht ein Stundenziel (DB-Regel).
    if (patch.kind === 'hours' && !goal.target_hours) patch = { ...patch, target_hours: 100 }
    if (await goals.update(goal.id, patch)) recordProgress(userId)
  }

  async function remove(goal) {
    if (await goals.remove(goal.id)) recordProgress(userId)
  }

  if (!goals.rows) return null

  return (
    <section className="card">
      <div className="card-head"><h2>Ziele</h2><span className="eyebrow">{goals.rows.length}</span></div>
      <ErrorNote message={goals.error} />

      {goals.rows.length === 0 && <EmptyNote>Noch kein Ziel. Leg unten dein erstes an.</EmptyNote>}

      <ul className="editor-list">
        {goals.rows.map(goal => (
          <li key={goal.id} className="editor-row">
            <span className="color-dot" style={{ background: GOAL_COLORS[goal.color]?.hex }} aria-hidden="true" />
            <div className="editor-fields">
              <InlineText value={goal.name} required label="Name des Ziels" className="strong" onSave={name => save(goal, { name })} />
              <div className="editor-meta">
                <label className="mini-field">Prüfung
                  <InlineDate value={goal.exam_date} label="Prüfungsdatum" onSave={exam_date => save(goal, { exam_date })} />
                </label>
                <label className="mini-field">Messung
                  <InlineSelect value={goal.kind} options={KIND_OPTIONS} label="Messart" onSave={kind => save(goal, { kind })} />
                </label>
                {goal.kind === 'hours' && (
                  <label className="mini-field">Stunden
                    <InlineNumber value={goal.target_hours} label="Stundenziel" onSave={target_hours => save(goal, { target_hours })} />
                  </label>
                )}
                <label className="mini-field">Farbe
                  <InlineSelect
                    value={goal.color} label="Farbe"
                    options={Object.entries(GOAL_COLORS).map(([value, c]) => ({ value, label: c.label }))}
                    onSave={color => save(goal, { color })}
                  />
                </label>
              </div>
            </div>
            <DeleteButton
              what="Ziel" onConfirm={() => remove(goal)}
              confirmText={`Ziel „${goal.name}“ löschen? Fächer bleiben erhalten, verlieren aber die Zuordnung. Der Fortschrittsverlauf dieses Ziels wird gelöscht.`}
            />
          </li>
        ))}
      </ul>

      <form className="editor-add" onSubmit={add}>
        <h3>Neues Ziel</h3>
        <div className="field-row">
          <label className="field grow">Name
            <input type="text" required placeholder="z.B. Maturaprüfung" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </label>
          <label className="field">Prüfungsdatum
            <input type="date" value={draft.exam_date} onChange={e => setDraft(d => ({ ...d, exam_date: e.target.value }))} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">Fortschritt messen nach
            <select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
              {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {draft.kind === 'hours' && (
            <label className="field">Stundenziel
              <input type="number" min="1" required value={draft.target_hours} onChange={e => setDraft(d => ({ ...d, target_hours: e.target.value }))} />
            </label>
          )}
        </div>
        <p className="field-hint">{GOAL_KINDS[draft.kind].hint}.</p>
        <button className="btn btn-sm btn-primary" type="submit">Ziel hinzufügen</button>
      </form>
    </section>
  )
}
