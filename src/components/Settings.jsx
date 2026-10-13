import React, { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { APP_NAME } from '../config.js'
import { recordProgress } from '../lib/progress.js'
import { toISODate } from '../lib/dates.js'
import { TEMPLATES, defaultStartDate, shiftDaysFor, templateStats } from '../templates/index.js'

const EXPORT_TABLES = [
  'settings', 'goals', 'plan_phases', 'plan_subjects', 'plan_topics', 'plan_subtasks',
  'plan_weeks', 'plan_deadlines', 'tasks', 'events', 'study_sessions', 'progress_snapshots', 'links',
  'quiz_attempts', 'ai_usage',
]

export default function SettingsView({ userId, email, settings, onSettingsChange, onNavigate }) {
  return (
    <div className="plan-section settings-page">
      <ProfileCard userId={userId} email={email} settings={settings} onSettingsChange={onSettingsChange} />
      <TemplateCard userId={userId} onNavigate={onNavigate} />
      <DataCard userId={userId} onSettingsChange={onSettingsChange} />
    </div>
  )
}

function ProfileCard({ userId, email, settings, onSettingsChange }) {
  const [name, setName] = useState(settings.display_name || '')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)

  async function saveName(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('settings')
      .update({ display_name: name.trim() || null }).eq('user_id', userId).select().single()
    if (error) setMsg({ text: error.message })
    else { onSettingsChange(data); setMsg({ ok: true, text: 'Name gespeichert.' }) }
  }

  async function savePassword(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setMsg({ text: error.message })
    else { setPassword(''); setMsg({ ok: true, text: 'Passwort geändert.' }) }
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Profil</h2><span className="eyebrow">{email}</span></div>
      <form className="settings-form" onSubmit={saveName}>
        <label className="field grow">Anzeigename
          <input type="text" value={name} maxLength={40} onChange={e => setName(e.target.value)} />
        </label>
        <button className="btn btn-sm btn-ghost" type="submit">Speichern</button>
      </form>
      <form className="settings-form" onSubmit={savePassword}>
        <label className="field grow">Neues Passwort
          <input type="password" minLength={8} required value={password} autoComplete="new-password" onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-sm btn-ghost" type="submit">Ändern</button>
      </form>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</p>}
    </section>
  )
}

function TemplateCard({ userId, onNavigate }) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const template = TEMPLATES.find(t => t.id === templateId)
  const [startDate, setStartDate] = useState(defaultStartDate(template))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  function pick(id) {
    setTemplateId(id)
    setStartDate(defaultStartDate(TEMPLATES.find(t => t.id === id)))
    setMsg(null)
  }

  async function importTemplate(e) {
    e.preventDefault()
    if (!window.confirm(`Vorlage „${template.name}“ zu deinem bestehenden Plan hinzufügen?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('import_template', { template, shift_days: shiftDaysFor(template, startDate) })
    setBusy(false)
    if (error) { setMsg({ text: error.message }); return }
    await recordProgress(userId)
    setMsg({ ok: true, text: 'Vorlage hinzugefügt.' })
  }

  const stats = templateStats(template)

  return (
    <section className="card">
      <div className="card-head"><h2>Vorlage hinzufügen</h2></div>
      <p className="field-hint">Vorlagen werden zu deinem bestehenden Plan ergänzt — nichts wird überschrieben.</p>
      <form className="settings-form wrap" onSubmit={importTemplate}>
        <label className="field grow">Vorlage
          <select value={templateId} onChange={e => pick(e.target.value)}>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Beginnt am
          <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>{busy ? 'Wird importiert…' : 'Hinzufügen'}</button>
      </form>
      <p className="field-hint">{template.description} ({stats.subjects} Fächer, {stats.topics} Themen)</p>
      {msg && (
        <p className={msg.ok ? 'form-ok' : 'form-error'} role="status">
          {msg.text}{' '}
          {msg.ok && <button type="button" className="inline-link" onClick={() => onNavigate('planner', 'subjects')}>Im Planer ansehen</button>}
        </p>
      )}
    </section>
  )
}

function DataCard({ userId, onSettingsChange }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function exportData() {
    setBusy('export')
    const result = { app: APP_NAME, exported_at: new Date().toISOString() }
    for (const table of EXPORT_TABLES) {
      const { data, error: err } = await supabase.from(table).select('*').eq('user_id', userId)
      if (err) { setError(err.message); setBusy(''); return }
      result[table] = data
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${APP_NAME.toLowerCase()}-export-${toISODate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBusy('')
  }

  async function resetData() {
    if (!window.confirm('Wirklich den ganzen Plan löschen? Ziele, Fächer, Themen, Sessions, Aufgaben, Termine und Links werden entfernt. Dein Konto bleibt bestehen.')) return
    setBusy('reset')
    const { error: err } = await supabase.rpc('reset_my_data')
    setBusy('')
    if (err) { setError(err.message); return }
    const { data } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle()
    onSettingsChange(data)
  }

  async function deleteAccount() {
    const answer = window.prompt('Konto und alle Daten endgültig löschen? Tippe LÖSCHEN zur Bestätigung.')
    if (answer !== 'LÖSCHEN') return
    setBusy('delete')
    const { error: err } = await supabase.rpc('delete_my_account')
    if (err) { setError(err.message); setBusy(''); return }
    await supabase.auth.signOut()
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Deine Daten</h2></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="data-actions">
        <div className="data-action">
          <div>
            <strong>Exportieren</strong>
            <p className="field-hint">Alle deine Daten als JSON-Datei herunterladen.</p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={exportData} disabled={!!busy}>
            {busy === 'export' ? 'Exportiert…' : 'Export'}
          </button>
        </div>
        <div className="data-action">
          <div>
            <strong>Neu starten</strong>
            <p className="field-hint">Löscht deinen kompletten Plan und startet die Einrichtung neu.</p>
          </div>
          <button type="button" className="btn btn-sm btn-danger" onClick={resetData} disabled={!!busy}>Plan löschen</button>
        </div>
        <div className="data-action">
          <div>
            <strong>Konto löschen</strong>
            <p className="field-hint">Entfernt dein Konto und alle Daten endgültig.</p>
          </div>
          <button type="button" className="btn btn-sm btn-danger" onClick={deleteAccount} disabled={!!busy}>Konto löschen</button>
        </div>
      </div>
    </section>
  )
}
