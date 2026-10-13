import React, { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { APP_NAME, APP_DESCRIPTION } from '../config.js'
import { TEMPLATES, defaultStartDate, shiftDaysFor, templateStats } from '../templates/index.js'
import { GOAL_KINDS } from '../lib/plan.js'
import BrandMark from './BrandMark.jsx'

export default function Onboarding({ userId, onDone }) {
  const [step, setStep] = useState('name') // name | start
  const [name, setName] = useState('')
  const [choice, setChoice] = useState('empty') // 'empty' | template.id
  const [startDates, setStartDates] = useState(() =>
    Object.fromEntries(TEMPLATES.map(t => [t.id, defaultStartDate(t)]))
  )
  const [goal, setGoal] = useState({ name: '', kind: 'topics', exam_date: '', target_hours: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function finish(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (choice === 'empty') {
        const { error: goalError } = await supabase.from('goals').insert({
          user_id: userId,
          name: goal.name.trim(),
          kind: goal.kind,
          exam_date: goal.exam_date || null,
          target_hours: goal.kind === 'hours' ? Number(goal.target_hours) : null,
        })
        if (goalError) throw goalError
      } else {
        const template = TEMPLATES.find(t => t.id === choice)
        const { error: rpcError } = await supabase.rpc('import_template', {
          template, shift_days: shiftDaysFor(template, startDates[choice]),
        })
        if (rpcError) throw rpcError
      }

      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .upsert({ user_id: userId, display_name: name.trim() || null, onboarded: true }, { onConflict: 'user_id' })
        .select()
        .single()
      if (settingsError) throw settingsError

      onDone(settings, choice === 'empty' ? { section: 'planner', tab: 'subjects' } : { section: 'overview' })
    } catch (err) {
      setError(err.message || 'Etwas ist schiefgelaufen.')
      setBusy(false)
    }
  }

  if (step === 'name') {
    return (
      <div className="auth-screen">
        <div className="auth-card onboarding-card">
          <BrandMark className="auth-mark" />
          <h1 className="auth-title">Willkommen bei {APP_NAME}</h1>
          <p className="auth-sub">{APP_DESCRIPTION}</p>
          <form className="auth-form" onSubmit={e => { e.preventDefault(); setStep('start') }}>
            <label>Wie sollen wir dich nennen? <span className="hint">(optional)</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
            </label>
            <button className="btn btn-primary" type="submit">Weiter</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card onboarding-card onboarding-wide">
        <h1 className="auth-title">Womit startest du?</h1>
        <p className="auth-sub">Du kannst später alles im Planer anpassen oder weitere Vorlagen dazuholen.</p>

        <form className="onboarding-form" onSubmit={finish}>
          <div className="choice-list" role="radiogroup">
            <label className={`choice ${choice === 'empty' ? 'selected' : ''}`}>
              <input type="radio" name="start" checked={choice === 'empty'} onChange={() => setChoice('empty')} />
              <span className="choice-body">
                <strong>Eigener Plan</strong>
                <span>Leg dein erstes Ziel an und füge danach Fächer und Themen hinzu.</span>
              </span>
            </label>

            {choice === 'empty' && (
              <div className="choice-detail">
                <label className="field">Ziel
                  <input
                    type="text" required placeholder="z.B. Maturaprüfung, Führerschein Theorie"
                    value={goal.name} onChange={e => setGoal(g => ({ ...g, name: e.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label className="field">Prüfungsdatum <span className="hint">(optional)</span>
                    <input type="date" value={goal.exam_date} onChange={e => setGoal(g => ({ ...g, exam_date: e.target.value }))} />
                  </label>
                  <label className="field">Fortschritt messen nach
                    <select value={goal.kind} onChange={e => setGoal(g => ({ ...g, kind: e.target.value }))}>
                      {Object.entries(GOAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                </div>
                {goal.kind === 'hours' && (
                  <label className="field">Stundenziel
                    <input
                      type="number" min="1" step="1" required
                      value={goal.target_hours} onChange={e => setGoal(g => ({ ...g, target_hours: e.target.value }))}
                    />
                  </label>
                )}
                <p className="field-hint">{GOAL_KINDS[goal.kind].hint}.</p>
              </div>
            )}

            {TEMPLATES.map(t => {
              const stats = templateStats(t)
              return (
                <React.Fragment key={t.id}>
                  <label className={`choice ${choice === t.id ? 'selected' : ''}`}>
                    <input type="radio" name="start" checked={choice === t.id} onChange={() => setChoice(t.id)} />
                    <span className="choice-body">
                      <strong>Vorlage: {t.name}</strong>
                      <span>{t.description}</span>
                      <span className="choice-meta">
                        {stats.subjects} Fächer · {stats.topics} Themen · {stats.phases} Phasen{stats.weeks ? ` · ${stats.weeks} Wochen` : ''}
                      </span>
                    </span>
                  </label>
                  {choice === t.id && (
                    <div className="choice-detail">
                      <label className="field">Plan beginnt am
                        <input
                          type="date" required value={startDates[t.id]}
                          onChange={e => setStartDates(d => ({ ...d, [t.id]: e.target.value }))}
                        />
                      </label>
                      <p className="field-hint">Alle Phasen, Wochen und Fristen werden entsprechend verschoben.</p>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {error && <p className="auth-msg" role="alert">{error}</p>}

          <div className="onboarding-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('name')} disabled={busy}>Zurück</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Wird eingerichtet…' : 'Los geht’s'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
