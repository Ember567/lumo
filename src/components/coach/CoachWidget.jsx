import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, X, RotateCcw, EyeOff, Check } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { notifyPlanChanged, onPlanChanged } from '../../lib/progress.js'
import { today } from '../../lib/dates.js'
import {
  loadCoachState, contextFor, askLumi, greeting, QUICK_PROMPTS, MOOD_TEXT, COACH_DAILY_LIMIT,
  isLumiHidden, setLumiHidden, onLumiVisibility, loadChat, saveChat, seenTips, markTipSeen,
} from '../../lib/coach.js'
import LumiFace from './LumiFace.jsx'

const SECTION_LABELS = { overview: 'Zur Übersicht', learning: 'Zum Lernen', quiz: 'Zu den Abfragen', planner: 'Zum Planer', organisation: 'Zur Organisation' }

// Knopfbeschriftung: von der KI, sonst sinnvoll aus der Aktion abgeleitet.
function withLabel(a) {
  const generic = !a.label || /^(öffnen|los|start|ok)$/i.test(a.label.trim())
  if (!generic) return a
  const label = a.type === 'start_quiz' && a.target ? `${a.target.title} abfragen`
    : a.type === 'start_subject_quiz' && a.target ? `${a.target.name} abfragen`
      : a.type === 'open_section' ? SECTION_LABELS[a.section] || 'Öffnen'
        : a.type === 'add_task' ? 'Aufgabe anlegen' : 'Öffnen'
  return { ...a, label }
}

// Einfache, sichere Darstellung: "- " → Liste, **x** → fett. Kein HTML.
function RichText({ text }) {
  const inline = s => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
  const blocks = []
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*[-•]\s+(.*)/)
    if (item) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'ul') last.items.push(item[1])
      else blocks.push({ type: 'ul', items: [item[1]] })
    } else if (line.trim()) blocks.push({ type: 'p', text: line })
  }
  return blocks.map((b, i) => b.type === 'ul'
    ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
    : <p key={i}>{inline(b.text)}</p>)
}

export default function CoachWidget({ userId, section, onNavigate, onStartQuiz }) {
  const [hidden, setHidden] = useState(isLumiHidden)
  const [state, setState] = useState(null)
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState(null)
  const [messages, setMessages] = useState(() => loadChat(userId))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(null)
  const [replyMood, setReplyMood] = useState(null)
  const [doneActions, setDoneActions] = useState({})
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const reloadTimer = useRef(null)

  useEffect(() => onLumiVisibility(() => { setHidden(isLumiHidden()); setMessages(loadChat(userId)) }), [userId])

  useEffect(() => {
    const first = window.setTimeout(refresh, 1200)
    const off = onPlanChanged(() => {
      window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(refresh, 1500)
    })
    return () => { window.clearTimeout(first); window.clearTimeout(reloadTimer.current); off() }
  }, [userId])

  async function refresh() {
    try { setState(await loadCoachState(userId)) } catch { /* Lumi bleibt still */ }
  }

  // Sprechblase: wichtigster Tipp, den du heute noch nicht gesehen hast.
  useEffect(() => {
    if (!state || open || hidden) return
    const tip = state.tips.find(t => !seenTips(userId).includes(t.id))
    if (!tip) return
    const show = window.setTimeout(() => { setBubble(tip); markTipSeen(userId, tip.id) }, 1500)
    return () => window.clearTimeout(show)
  }, [state, open, hidden])

  useEffect(() => {
    if (!bubble) return
    const hide = window.setTimeout(() => setBubble(null), 25000)
    return () => window.clearTimeout(hide)
  }, [bubble])

  useEffect(() => { saveChat(userId, messages) }, [messages])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
    if (!state || Date.now() - state.loadedAt > 60000) refresh()
    if (remaining === null) loadRemaining()
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function loadRemaining() {
    const { count } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('kind', 'coach').gte('created_at', today().toISOString())
    if (typeof count === 'number') setRemaining(Math.max(0, COACH_DAILY_LIMIT - count))
  }

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setOpen(true)
    setBubble(null)
    setInput('')
    setError('')
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setSending(true)
    try {
      const fresh = state && Date.now() - state.loadedAt < 30000 ? state : await loadCoachState(userId)
      if (fresh !== state) setState(fresh)
      const data = await askLumi(next.slice(-12), contextFor(fresh, section))
      // Kürzel → echte Objekte, sobald die Antwort da ist (Kontext kann sich später ändern).
      const actions = (data.actions || []).map(a => withLabel({ ...a, target: a.ref ? fresh.refs[a.ref] : null }))
        .filter(a => !['start_quiz', 'start_subject_quiz'].includes(a.type) || a.target)
      // Falls die KI doch ein Kürzel in den Text schreibt: durch den Namen ersetzen.
      const reply = data.reply.replace(/\[?\b([TS]\d{1,3})\b\]?/g, (m, key) => {
        const obj = fresh.refs[key]
        return obj ? (obj.title || obj.name) : m
      })
      setMessages(list => [...list, { role: 'assistant', content: reply, mood: data.mood, actions, at: Date.now() }])
      setReplyMood(data.mood)
      if (typeof data.remaining === 'number') setRemaining(data.remaining)
    } catch (err) {
      setError(err.message)
      setMessages(list => list.slice(0, -1))
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  async function runAction(action, key) {
    if (action.type === 'chat') { setOpen(true); send(action.prompt); return }
    if (action.type === 'start_quiz') {
      const tp = action.topic || action.target
      if (!tp) return
      onStartQuiz({ topicId: tp.id, label: tp.title })
      setOpen(false); setBubble(null)
    } else if (action.type === 'start_subject_quiz') {
      if (!action.target) return
      onStartQuiz({ subjectId: action.target.id, label: action.target.name, count: 8 })
      setOpen(false); setBubble(null)
    } else if (action.type === 'open_section') {
      onNavigate(action.section)
      setOpen(false); setBubble(null)
    } else if (action.type === 'add_task') {
      const { error: err } = await supabase.from('tasks').insert({ user_id: userId, title: action.title, due_date: action.due_date || null })
      if (err) { setError('Die Aufgabe konnte nicht angelegt werden.'); return }
      setDoneActions(d => ({ ...d, [key]: true }))
      notifyPlanChanged()
    }
  }

  function reset() {
    setMessages([])
    setReplyMood(null)
    setError('')
    setDoneActions({})
  }

  if (hidden) return null

  // Antwort-Stimmung gilt eine Weile, danach wieder die aus dem Lernstand.
  const lastReply = [...messages].reverse().find(m => m.role === 'assistant')
  const mood = sending ? 'thinking'
    : replyMood && lastReply && Date.now() - (lastReply.at || 0) < 5 * 60000 ? replyMood
      : state?.mood || 'calm'

  const panel = open && (
    <div className="lumi-panel" role="dialog" aria-label="Lumi, dein Lernbegleiter">
      <div className="lumi-panel-head">
        <LumiFace mood={mood} size={42} busy={sending} />
        <div className="lumi-panel-title">
          <strong>Lumi</strong>
          <span>{sending ? 'überlegt …' : MOOD_TEXT[mood]}</span>
        </div>
        <div className="lumi-panel-tools">
          {messages.length > 0 && (
            <button type="button" className="icon-btn" onClick={reset} title="Neues Gespräch" aria-label="Neues Gespräch"><RotateCcw size={16} /></button>
          )}
          <button type="button" className="icon-btn" onClick={() => { setOpen(false); setLumiHidden(true) }} title="Lumi ausblenden (in den Einstellungen wieder einblenden)" aria-label="Lumi ausblenden"><EyeOff size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Schliessen"><X size={18} /></button>
        </div>
      </div>

      <div className="lumi-messages" ref={listRef} aria-live="polite">
        <div className="lumi-msg assistant">
          <div className="lumi-bubble-text">{state ? greeting(state) : 'Hallo! Ich bin Lumi. Einen Moment, ich schaue mir deinen Lernstand an …'}</div>
        </div>
        {messages.length === 0 && state?.tips[0] && (
          <div className="lumi-msg assistant">
            <div className="lumi-bubble-text">{state.tips[0].text}</div>
            {state.tips[0].actions.length > 0 && (
              <div className="lumi-actions">
                {state.tips[0].actions.map((a, i) => (
                  <button key={i} type="button" className="lumi-action" onClick={() => runAction(a, `tip-${i}`)}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, mi) => (
          <div key={mi} className={`lumi-msg ${m.role}`}>
            <div className="lumi-bubble-text"><RichText text={m.content} /></div>
            {m.actions?.length > 0 && (
              <div className="lumi-actions">
                {m.actions.map((a, ai) => {
                  const key = `${mi}-${ai}`
                  return (
                    <button key={ai} type="button" className={`lumi-action ${doneActions[key] ? 'done' : ''}`}
                      disabled={doneActions[key]} onClick={() => runAction(a, key)}>
                      {doneActions[key] ? <><Check size={13} strokeWidth={3} /> Angelegt</> : a.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="lumi-msg assistant"><div className="lumi-bubble-text lumi-typing"><span /><span /><span /></div></div>}
        {error && <p className="lumi-error">{error}</p>}
      </div>

      {messages.length === 0 && !sending && (
        <div className="lumi-quick">
          {QUICK_PROMPTS.map(p => <button key={p} type="button" onClick={() => send(p)}>{p}</button>)}
        </div>
      )}

      <form className="lumi-input" onSubmit={e => { e.preventDefault(); send() }}>
        <textarea
          ref={inputRef} rows={1} value={input} maxLength={1500}
          placeholder="Frag Lumi etwas …" aria-label="Nachricht an Lumi"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <button type="submit" className="lumi-send" disabled={!input.trim() || sending || remaining === 0} aria-label="Senden">
          <ArrowUp size={17} strokeWidth={2.4} />
        </button>
      </form>
      <p className="lumi-foot">
        {remaining !== null ? `Heute noch ${remaining} ${remaining === 1 ? 'Nachricht' : 'Nachrichten'} · ` : ''}KI, kann sich irren
      </p>
    </div>
  )

  return createPortal(
    <div className="lumi-root">
      {panel}
      {!open && (
        <div className="lumi-dock">
          {bubble && (
            <div className="lumi-tip" role="status">
              <button type="button" className="lumi-tip-close" onClick={() => setBubble(null)} aria-label="Hinweis schliessen"><X size={14} /></button>
              <p>{bubble.text}</p>
              {bubble.actions.length > 0 && (
                <div className="lumi-actions">
                  {bubble.actions.map((a, i) => (
                    <button key={i} type="button" className="lumi-action" onClick={() => runAction(a, `bubble-${i}`)}>{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="lumi-pet" onClick={() => { setOpen(true); setBubble(null) }} aria-label="Lumi öffnen, deinen Lernbegleiter" title="Lumi">
            <LumiFace mood={mood} size={64} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
