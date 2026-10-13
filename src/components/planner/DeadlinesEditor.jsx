import React, { useState } from 'react'
import { useTable } from '../../lib/useTable.js'
import { notifyPlanChanged } from '../../lib/progress.js'
import { parseDate } from '../../lib/dates.js'
import { DeleteButton, EmptyNote, ErrorNote, InlineDate, InlineSelect, InlineText } from './fields.jsx'

const EMPTY = { title: '', date: '', end_date: '', goal_id: '', critical: false }

export default function DeadlinesEditor({ userId }) {
  const deadlines = useTable('plan_deadlines', userId, { order: [['date', true]] })
  const goals = useTable('goals', userId, { order: [['sort_order', true], ['created_at', true]] })
  const [draft, setDraft] = useState(EMPTY)

  async function add(e) {
    e.preventDefault()
    const created = await deadlines.create({
      title: draft.title.trim(),
      date: draft.date,
      end_date: draft.end_date || null,
      goal_id: draft.goal_id || null,
      critical: draft.critical,
    })
    if (created) { setDraft(EMPTY); notifyPlanChanged() }
  }

  async function save(d, patch) {
    const next = { ...d, ...patch }
    if (next.end_date && parseDate(next.end_date) < parseDate(next.date)) {
      deadlines.setError('Das Enddatum muss nach dem Startdatum liegen.')
      return
    }
    if (await deadlines.update(d.id, patch)) notifyPlanChanged()
  }

  if (!deadlines.rows || !goals.rows) return null
  const goalOptions = [{ value: null, label: 'Kein Ziel' }, ...goals.rows.map(g => ({ value: g.id, label: g.name }))]
  const sorted = [...deadlines.rows].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <section className="card">
      <div className="card-head"><h2>Fristen</h2><span className="eyebrow">{sorted.length}</span></div>
      <ErrorNote message={deadlines.error} />
      {sorted.length === 0 && <EmptyNote>Noch keine Fristen.</EmptyNote>}

      <ul className="editor-list">
        {sorted.map(d => (
          <li key={d.id} className={`editor-row ${d.critical ? 'critical' : ''}`}>
            <div className="editor-fields">
              <InlineText value={d.title} required label="Titel" className="strong" onSave={title => save(d, { title })} />
              <div className="editor-meta">
                <label className="mini-field">Am / ab
                  <InlineDate value={d.date} required label="Datum" onSave={date => save(d, { date })} />
                </label>
                <label className="mini-field">Bis <span className="hint">(optional)</span>
                  <InlineDate value={d.end_date} label="Enddatum" onSave={end_date => save(d, { end_date })} />
                </label>
                <label className="mini-field">Ziel
                  <InlineSelect value={d.goal_id} options={goalOptions} label="Ziel" onSave={goal_id => save(d, { goal_id })} />
                </label>
                <label className="mini-check">
                  <input type="checkbox" checked={d.critical} onChange={e => save(d, { critical: e.target.checked })} />
                  kritisch
                </label>
              </div>
            </div>
            <DeleteButton what="Frist" onConfirm={async () => { if (await deadlines.remove(d.id)) notifyPlanChanged() }} />
          </li>
        ))}
      </ul>

      <form className="editor-add" onSubmit={add}>
        <h3>Neue Frist</h3>
        <div className="field-row">
          <label className="field grow">Titel
            <input type="text" required placeholder="z.B. Anmeldeschluss" value={draft.title} onChange={e => setDraft(x => ({ ...x, title: e.target.value }))} />
          </label>
          <label className="field">Am / ab
            <input type="date" required value={draft.date} onChange={e => setDraft(x => ({ ...x, date: e.target.value }))} />
          </label>
          <label className="field">Bis <span className="hint">(optional)</span>
            <input type="date" min={draft.date || undefined} value={draft.end_date} onChange={e => setDraft(x => ({ ...x, end_date: e.target.value }))} />
          </label>
        </div>
        <div className="field-row align-end">
          <label className="field">Ziel
            <select value={draft.goal_id} onChange={e => setDraft(x => ({ ...x, goal_id: e.target.value }))}>
              {goalOptions.map(o => <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>)}
            </select>
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={draft.critical} onChange={e => setDraft(x => ({ ...x, critical: e.target.checked }))} />
            kritisch
          </label>
        </div>
        <button className="btn btn-sm btn-primary" type="submit">Frist hinzufügen</button>
      </form>
    </section>
  )
}
