import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import { useTable } from '../../lib/useTable.js'
import { notifyPlanChanged } from '../../lib/progress.js'
import { addDays, diffDays, parseDate, toISODate } from '../../lib/dates.js'
import { DeleteButton, EmptyNote, ErrorNote, InlineDate, InlineText } from './fields.jsx'

export default function PhasesEditor({ userId }) {
  const phases = useTable('plan_phases', userId, { order: [['start_date', true]] })
  const [draft, setDraft] = useState({ name: '', start_date: '', end_date: '', description: '' })
  const [unassigned, setUnassigned] = useState(0)
  const [assignTo, setAssignTo] = useState('')

  useEffect(() => { countUnassigned() }, [userId])

  async function countUnassigned() {
    const { count } = await supabase.from('plan_topics').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).is('phase_id', null)
    setUnassigned(count || 0)
  }

  async function assignUnassigned() {
    const target = assignTo || phases.rows[0]?.id
    if (!target) return
    const { error } = await supabase.from('plan_topics').update({ phase_id: target }).eq('user_id', userId).is('phase_id', null)
    if (error) { phases.setError(error.message); return }
    setUnassigned(0)
    notifyPlanChanged()
  }

  // Neue Phase schliesst direkt an die letzte an.
  const last = phases.rows?.[phases.rows.length - 1]
  const suggestedStart = last ? toISODate(addDays(last.end_date, 1)) : toISODate(new Date())

  async function add(e) {
    e.preventDefault()
    const start = draft.start_date || suggestedStart
    const created = await phases.create({
      name: draft.name.trim(),
      start_date: start,
      end_date: draft.end_date,
      description: draft.description.trim() || null,
      sort_order: phases.rows.length + 1,
    })
    if (created) {
      setDraft({ name: '', start_date: '', end_date: '', description: '' })
      notifyPlanChanged()
    }
  }

  async function save(phase, patch) {
    const next = { ...phase, ...patch }
    if (parseDate(next.end_date) < parseDate(next.start_date)) {
      phases.setError('Das Enddatum muss nach dem Startdatum liegen.')
      return
    }
    if (await phases.update(phase.id, patch)) notifyPlanChanged()
  }

  if (!phases.rows) return null
  const sorted = [...phases.rows].sort((a, b) => a.start_date.localeCompare(b.start_date))

  return (
    <section className="card">
      <div className="card-head"><h2>Phasen</h2><span className="eyebrow">{sorted.length}</span></div>
      <ErrorNote message={phases.error} />
      {unassigned > 0 && sorted.length > 0 && (
        <div className="assign-banner">
          <span>{unassigned} {unassigned === 1 ? 'Thema hat' : 'Themen haben'} noch keine Phase.</span>
          <select value={assignTo || sorted[0].id} onChange={e => setAssignTo(e.target.value)} aria-label="Phase für Themen ohne Phase">
            {sorted.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-ghost" onClick={assignUnassigned}>Zuordnen</button>
        </div>
      )}
      {sorted.length === 0 && <EmptyNote>Noch keine Phasen. Typisch sind z.B. „Erarbeiten“, „Wiederholen“, „Prüfungsphase“.</EmptyNote>}

      <ul className="editor-list">
        {sorted.map(phase => (
          <li key={phase.id} className="editor-row">
            <div className="editor-fields">
              <InlineText value={phase.name} required label="Name der Phase" className="strong" onSave={name => save(phase, { name })} />
              <div className="editor-meta">
                <label className="mini-field">Von
                  <InlineDate value={phase.start_date} required label="Startdatum" onSave={start_date => save(phase, { start_date })} />
                </label>
                <label className="mini-field">Bis
                  <InlineDate value={phase.end_date} required label="Enddatum" onSave={end_date => save(phase, { end_date })} />
                </label>
                <span className="mini-meta">{diffDays(phase.end_date, phase.start_date) + 1} Tage</span>
              </div>
              <InlineText value={phase.description} label="Beschreibung" placeholder="Beschreibung (optional)" multiline onSave={description => save(phase, { description })} />
            </div>
            <DeleteButton
              what="Phase" onConfirm={async () => { if (await phases.remove(phase.id)) notifyPlanChanged() }}
              confirmText={`Phase „${phase.name}“ löschen? Zugeordnete Themen und Wochen bleiben erhalten.`}
            />
          </li>
        ))}
      </ul>

      <form className="editor-add" onSubmit={add}>
        <h3>Neue Phase</h3>
        <div className="field-row">
          <label className="field grow">Name
            <input type="text" required value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </label>
          <label className="field">Von
            <input type="date" required value={draft.start_date || suggestedStart} onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))} />
          </label>
          <label className="field">Bis
            <input type="date" required min={draft.start_date || suggestedStart} value={draft.end_date} onChange={e => setDraft(d => ({ ...d, end_date: e.target.value }))} />
          </label>
        </div>
        <label className="field">Beschreibung <span className="hint">(optional)</span>
          <input type="text" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
        </label>
        <button className="btn btn-sm btn-primary" type="submit">Phase hinzufügen</button>
      </form>
    </section>
  )
}
