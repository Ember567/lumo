import React, { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { APP_NAME, APP_TAGLINE } from '../config.js'
import BrandMark from './BrandMark.jsx'

const ERRORS = {
  'Invalid login credentials': 'E-Mail oder Passwort ist falsch.',
  'Email not confirmed': 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach).',
  'User already registered': 'Für diese E-Mail gibt es bereits ein Konto.',
}

function translate(message) {
  return ERRORS[message] || message
}

export default function Auth() {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null) // { text, ok }
  const [busy, setBusy] = useState(false)

  function switchMode(next) {
    setMode(next)
    setMsg(null)
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ text: translate(error.message) })
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin },
      })
      if (error) setMsg({ text: translate(error.message) })
      else if (!data.session) setMsg({ ok: true, text: 'Konto erstellt. Bestätige deine E-Mail über den Link in deinem Postfach.' })
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) setMsg({ text: translate(error.message) })
      else setMsg({ ok: true, text: 'Falls ein Konto existiert, ist ein Link zum Zurücksetzen unterwegs.' })
    }
    setBusy(false)
  }

  const submitLabel = { login: 'Anmelden', signup: 'Konto erstellen', forgot: 'Link senden' }[mode]

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandMark className="auth-mark" />
        <h1 className="auth-title">{APP_NAME}</h1>
        <p className="auth-sub">{mode === 'forgot' ? 'Wir schicken dir einen Link, um ein neues Passwort zu setzen.' : APP_TAGLINE}</p>

        <form className="auth-form" onSubmit={submit}>
          <label>E-Mail
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode !== 'forgot' && (
            <label>Passwort {mode === 'signup' && <span className="hint">(mind. 8 Zeichen)</span>}
              <input
                type="password" required minLength={mode === 'signup' ? 8 : undefined}
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>{submitLabel}</button>
        </form>

        {msg && <p className={`auth-msg ${msg.ok ? 'ok' : ''}`} role="status">{msg.text}</p>}

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button type="button" className="link-btn" onClick={() => switchMode('signup')}>Noch kein Konto? Registrieren</button>
              <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>Passwort vergessen?</button>
            </>
          )}
          {mode !== 'login' && (
            <button type="button" className="link-btn" onClick={() => switchMode('login')}>Zurück zur Anmeldung</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Wird angezeigt, wenn jemand über den Link aus der "Passwort vergessen"-Mail kommt.
export function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMsg(translate(error.message))
    else onDone()
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandMark className="auth-mark" />
        <h1 className="auth-title">Neues Passwort</h1>
        <p className="auth-sub">Wähle ein neues Passwort für dein {APP_NAME}-Konto.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Neues Passwort <span className="hint">(mind. 8 Zeichen)</span>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>Speichern</button>
        </form>
        {msg && <p className="auth-msg" role="status">{msg}</p>}
      </div>
    </div>
  )
}
