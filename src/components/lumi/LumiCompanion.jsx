import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Check, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { notifyPlanChanged, onPlanChanged } from '../../lib/progress.js'
import { today } from '../../lib/dates.js'
import {
  loadCoachState, contextFor, askLumi, QUICK_PROMPTS, COACH_DAILY_LIMIT,
  isLumiHidden, setLumiHidden, onLumiVisibility, loadChat, saveChat, seenTips, markTipSeen,
} from '../../lib/coach.js'
import { onLumiEvent, quip, isLumiQuiet, timerRunning } from '../../lib/lumi.js'
import { requestScan } from '../../lib/scan.js'
import { openSummary } from '../../lib/summaries.js'
import Firefly from './Firefly.jsx'

// ------------------------------------------------------------
// Lumi, das Glühwürmchen.
//
// Fliegt frei über die Seite (eigene kleine Physik), reagiert auf
// Ereignisse aus der App (lumiEmit), spricht in Sprechblasen und
// beantwortet Fragen über die Edge Function "coach".
// Die Bewegung läuft in einem requestAnimationFrame-Loop direkt
// am DOM, damit React nicht 60-mal pro Sekunde rendern muss.
// ------------------------------------------------------------

const NAV_LABELS = { overview: 'Zur Übersicht', learning: 'Zum Lernen', quiz: 'Zu den Abfragen', planner: 'Zum Planer', organisation: 'Zur Organisation' }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)

function withLabel(a) {
  const generic = !a.label || /^(öffnen|los|start|ok)$/i.test(a.label.trim())
  if (!generic) return a
  const label = a.type === 'start_quiz' && a.target ? `${a.target.title} abfragen`
    : a.type === 'start_subject_quiz' && a.target ? `${a.target.name} abfragen`
      : a.type === 'open_section' ? NAV_LABELS[a.section] || 'Öffnen'
        : a.type === 'add_task' ? 'Aufgabe anlegen' : 'Öffnen'
  return { ...a, label }
}

// "- " → Liste, **x** → fett. Kein HTML aus der KI.
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

function visible(el) {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null
  return r
}

function spotlight(el, ms = 2600) {
  if (!el) return
  el.classList.remove('lumi-spot')
  void el.offsetWidth // Animation neu starten
  el.classList.add('lumi-spot')
  window.setTimeout(() => el.classList.remove('lumi-spot'), ms)
}

const topicEl = id => document.querySelector(`[data-topic-id="${id}"]`)
const navEl = id => document.querySelector(`[data-lumi-nav="${id}"]`)

export default function LumiCompanion({ userId, section, onNavigate, onStartQuiz }) {
  const [hidden, setHidden] = useState(isLumiHidden)
  const [quiet, setQuiet] = useState(isLumiQuiet)
  const [coach, setCoach] = useState(null)
  const [expr, setExpr] = useState(null) // kurzzeitiger Ausdruck
  const [pose, setPose] = useState({ book: timerRunning(userId), glasses: section === 'quiz', cap: false, folded: false, sleeping: false })
  const [bubble, setBubble] = useState(null) // { kind: 'quip' | 'tip' | 'ask', text, actions, id }
  const [history, setHistory] = useState(() => loadChat(userId))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(null)
  const [doneActions, setDoneActions] = useState({})
  const [mobile, setMobile] = useState(false)

  const rootRef = useRef(null)
  const flyRef = useRef(null)
  const bubbleRef = useRef(null)
  const canvasRef = useRef(null)
  const inputRef = useRef(null)
  const timers = useRef({})
  const live = useRef({}) // aktuelle Werte für den Loop
  live.current = { bubble, quiet, coach, sending, pose, section }

  const m = useRef({
    x: -80, y: -80, vx: 0, vy: 0, face: -1, tilt: 0, init: false,
    target: { kind: 'home' }, perchTimer: timerRunning(userId), perchEl: null, perchCheck: 0,
    script: null, lookAt: null, lookUntil: 0,
    cursor: { x: -1, y: -1, t: 0, vx: 0, vy: 0 },
    activity: Date.now(), nextTour: Date.now() + rand(40000, 70000), dodgeAt: 0, pokeAt: 0,
    particles: [], lastScroll: window.scrollY, size: 64,
  })

  const media = useRef({ mobile: false, reduced: false })

  // ---------- Sichtbarkeit & Einstellungen ----------
  useEffect(() => onLumiVisibility(() => {
    setHidden(isLumiHidden()); setQuiet(isLumiQuiet()); setHistory(loadChat(userId))
  }), [userId])

  useEffect(() => { saveChat(userId, history) }, [history])

  // ---------- Lernstand ----------
  useEffect(() => {
    const first = window.setTimeout(refresh, 900)
    let debounce
    const off = onPlanChanged(() => { window.clearTimeout(debounce); debounce = window.setTimeout(refresh, 1200) })
    const every = window.setInterval(refresh, 5 * 60000)
    return () => { window.clearTimeout(first); window.clearTimeout(debounce); window.clearInterval(every); off() }
  }, [userId])

  async function refresh() {
    try { setCoach(await loadCoachState(userId)) } catch { /* Lumi bleibt still */ }
  }

  // ---------- Hilfen ----------
  function later(key, fn, ms) {
    window.clearTimeout(timers.current[key])
    timers.current[key] = window.setTimeout(fn, ms)
  }
  useEffect(() => () => Object.values(timers.current).forEach(t => window.clearTimeout(t)), [])

  function flash(e, ms = 1400) {
    setExpr(e)
    later('expr', () => setExpr(null), ms)
  }

  function say(text, ms = 3600) {
    if (!text) return
    const b = live.current.bubble
    if (b?.kind === 'ask' || (b?.kind === 'tip' && Date.now() - (b.at || 0) < 8000)) return
    setBubble({ kind: 'quip', text, at: Date.now() })
    later('bubble', () => setBubble(cur => (cur?.kind === 'quip' ? null : cur)), ms)
  }

  function awake() {
    const s = m.current
    s.activity = Date.now()
    if (live.current.pose.sleeping) setPose(p => ({ ...p, sleeping: false, cap: false }))
  }

  function flyTo(el, { ms = 2600, anchor = 'top' } = {}) {
    if (!el) return
    m.current.target = { kind: 'el', el, anchor, until: Date.now() + ms }
  }

  function flyToPoint(x, y, ms = 3000) {
    m.current.target = { kind: 'point', x, y, until: Date.now() + ms }
  }

  function script(type, dur) {
    if (media.current.reduced) return
    m.current.script = { type, start: performance.now(), dur }
  }

  function burst(x, y, n = 24, power = 1) {
    const ps = m.current.particles
    const count = media.current.reduced ? Math.ceil(n / 4) : n
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(60, 220) * power
      ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * power, g: 260, life: rand(0.6, 1.2), max: 1.2, s: rand(5, 11) })
    }
  }

  // ---------- Medien ----------
  useEffect(() => {
    const mq1 = window.matchMedia('(hover: none), (max-width: 767px)')
    const mq2 = window.matchMedia('(prefers-reduced-motion: reduce)')
    const upd = () => {
      media.current = { mobile: mq1.matches, reduced: mq2.matches }
      m.current.size = mq1.matches ? 50 : 64
      setMobile(mq1.matches)
    }
    upd()
    mq1.addEventListener('change', upd); mq2.addEventListener('change', upd)
    return () => { mq1.removeEventListener('change', upd); mq2.removeEventListener('change', upd) }
  }, [])

  // ---------- Bereich ----------
  const seenSections = useRef(new Set())
  useEffect(() => {
    setPose(p => ({ ...p, glasses: section === 'quiz' }))
    if (hidden || quiet || seenSections.current.has(section)) return
    seenSections.current.add(section)
    if (QUIP_SECTIONS.has(section) && Math.random() < 0.6) later('sectionQuip', () => say(quip(`section.${section}`)), 900)
  }, [section])

  // ---------- Ereignisse aus der App ----------
  useEffect(() => onLumiEvent(ev => {
    const s = m.current
    awake()
    if (['topic-done', 'timer-saved', 'quiz-finish', 'timer-start'].includes(ev.type)) s.reactedAt = Date.now()
    switch (ev.type) {
      case 'topic-done': {
        flyTo(ev.el, { ms: 2800, anchor: 'above' })
        later('react', () => {
          const r = visible(ev.el)
          if (r) burst(r.left + 8, r.top + 8, ev.subjectDone ? 70 : 30, ev.subjectDone ? 1.4 : 1)
          flash('happy', 1800)
          script(ev.subjectDone ? 'loop' : 'hop', ev.subjectDone ? 1000 : 650)
          say(ev.subjectDone ? quip('subjectDone', { subject: ev.subjectName }) : quip('topicDone', { open: ev.openInSubject, subject: ev.subjectName }), 3000)
        }, 650)
        break
      }
      case 'subtask-done': {
        const r = visible(ev.el)
        if (r) burst(r.left + 8, r.top + 8, 10, 0.6)
        flash('happy', 900)
        s.subtasks = (s.subtasks || 0) + 1
        if (s.subtasks % 4 === 0) say(quip('subtaskDone'), 1800)
        break
      }
      case 'topic-undone':
        flash('wide', 900)
        if (Math.random() < 0.4) say(quip('undone'), 2000)
        break
      case 'timer-start':
        s.perchTimer = true
        s.perchEl = ev.el || null
        setPose(p => ({ ...p, book: true }))
        if (!live.current.quiet || Math.random() < 0.5) later('timerQuip', () => say(quip('timerStart'), 2600), 900)
        break
      case 'timer-pause':
        setPose(p => ({ ...p, book: false }))
        say(quip('timerPause'), 2200)
        break
      case 'timer-saved': {
        s.perchTimer = false; s.perchEl = null
        setPose(p => ({ ...p, book: false }))
        const r = flyRef.current?.getBoundingClientRect()
        if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 40, 1.1)
        script('loop', 1000); flash('happy', 2000)
        say(quip('timerSaved', { min: ev.minutes }), 3600)
        break
      }
      case 'timer-cancel':
        s.perchTimer = false; s.perchEl = null
        setPose(p => ({ ...p, book: false }))
        break
      case 'quiz-answer': {
        flyTo(ev.el, { ms: 1600, anchor: 'right' })
        later('react', () => {
          const r = visible(ev.el)
          if (ev.correct) {
            script('loop', 900); flash('happy', 1400)
            if (r) burst(r.right - 20, r.top + r.height / 2, 18, 0.8)
          } else {
            script('flinch', 520); flash('wide', 700)
            later('sad', () => flash('sad', 1200), 700)
          }
        }, 380)
        break
      }
      case 'quiz-finish': {
        const key = ev.pct >= 80 ? 'quizGood' : ev.pct >= 50 ? 'quizMid' : 'quizLow'
        if (ev.pct >= 80) {
          const r = flyRef.current?.getBoundingClientRect()
          if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 50, 1.2)
          script('loop', 1000); flash('happy', 2200)
        } else flash(ev.pct >= 50 ? 'normal' : 'sad', 1800)
        say(quip(key, { pct: ev.pct }), 3800)
        break
      }
      case 'milestone': {
        // Erst die laufende Reaktion (z.B. aufs Abhaken) ausspielen lassen.
        const wait = Math.max(0, 3200 - (Date.now() - (s.reactedAt || 0)))
        later('milestone', () => {
          flyToPoint(window.innerWidth / 2, Math.min(180, window.innerHeight / 3), 4200)
          later('milestoneReact', () => {
            burst(m.current.x, m.current.y, 80, 1.5)
            script('loop', 1100); flash('happy', 2500)
            setBubble(cur => (cur?.kind === 'ask' ? cur : null))
            later('milestoneSay', () => say(quip('milestone', { goal: ev.goalName, pct: ev.pct }), 4500), 30)
          }, 900)
        }, wait)
        break
      }
      case 'scan-saved': {
        const el = ev.firstTopic ? topicEl(ev.firstTopic.id) : null
        if (el) flyTo(el, { ms: 9000, anchor: 'right' })
        later('scanReact', () => {
          const r = visible(el)
          if (r) burst(r.left + 20, r.top + r.height / 2, 60, 1.3)
          script('loop', 1000); flash('happy', 2200)
          setBubble({
            kind: 'tip', at: Date.now(),
            text: `${ev.count} ${ev.count === 1 ? 'neues Thema' : 'neue Themen'} in ${ev.subjectName || 'deinem Fach'}! Mit Zusammenfassung und Lernzielen. Soll ich dich gleich abfragen?`,
            actions: ev.firstTopic ? [{ type: 'start_quiz', label: `«${ev.firstTopic.title}» abfragen`, topic: ev.firstTopic }] : [],
          })
          later('bubble', () => setBubble(cur => (cur?.kind === 'tip' ? null : cur)), 25000)
        }, 900)
        break
      }
      case 'summary-saved': {
        const el = document.querySelector(`[data-summary-id="${ev.id}"]`)
        if (el) flyTo(el, { ms: 9000, anchor: 'right' })
        later('sumReact', () => {
          const r = visible(el)
          if (r) burst(r.left + r.width / 2, r.top + 16, 60, 1.3)
          script('loop', 1000); flash('happy', 2200)
          const st = ev.stats || {}
          const parts = [
            st.sections && `${st.sections} Abschnitte`,
            st.terms && `${st.terms} Begriffe`,
            st.questions && `${st.questions} Kontrollfragen`,
          ].filter(Boolean)
          setBubble({
            kind: 'tip', at: Date.now(),
            text: `Deine Zusammenfassung «${ev.title}» ist fertig${parts.length ? `: ${parts.join(', ')}` : ''}. Die Abfragen stützen sich ab jetzt darauf.`,
            actions: [
              { type: 'open_summary', label: 'Lesen', id: ev.id },
              ev.topic?.id && { type: 'start_quiz', label: 'Gleich abfragen', topic: ev.topic },
            ].filter(Boolean),
          })
          later('bubble', () => setBubble(cur => (cur?.kind === 'tip' ? null : cur)), 25000)
        }, 1200)
        break
      }
      case 'task-done': {
        const r = visible(ev.el)
        if (r) burst(r.left + 8, r.top + 8, 16, 0.7)
        if (Math.random() < 0.5) say(quip('taskDone'), 2000)
        break
      }
      default:
    }
  }), [])

  // ---------- Tipp des Tages als Sprechblase ----------
  useEffect(() => {
    if (!coach || hidden) return
    if (bubble) return
    const tip = coach.tips.find(t => !seenTips(userId).includes(t.id))
    if (!tip) return
    const show = window.setTimeout(() => {
      if (live.current.bubble) return
      markTipSeen(userId, tip.id)
      const el = tip.topicId ? topicEl(tip.topicId) : null
      if (el && visible(el)) { flyTo(el, { ms: 9000, anchor: 'right' }); spotlight(el, 3500) }
      setBubble({ kind: 'tip', text: tip.text, actions: tip.actions, at: Date.now() })
      later('bubble', () => setBubble(cur => (cur?.kind === 'tip' ? null : cur)), 22000)
    }, 2200)
    return () => window.clearTimeout(show)
  }, [coach, hidden])

  // ---------- Eingabe: Maus, Scroll, Tasten ----------
  useEffect(() => {
    if (hidden) return
    function onMove(e) {
      const c = m.current.cursor
      const now = performance.now()
      const dt = Math.max(1, now - c.t) / 1000
      c.vx = (e.clientX - c.x) / dt; c.vy = (e.clientY - c.y) / dt
      c.x = e.clientX; c.y = e.clientY; c.t = now
      const s = m.current
      if (media.current.mobile || live.current.quiet || live.current.bubble || live.current.pose.sleeping) return
      const dx = s.x - c.x, dy = s.y - c.y
      const dist = Math.hypot(dx, dy)
      const speed = Math.hypot(c.vx, c.vy)
      const approaching = (c.vx * dx + c.vy * dy) > 0
      if (dist < 70 && speed > 1100 && approaching && Date.now() - s.dodgeAt > 6000) {
        s.dodgeAt = Date.now()
        s.vx += (dx / (dist || 1)) * 650; s.vy += (dy / (dist || 1)) * 650
        flash('wide', 600)
        if (Math.random() < 0.4) say(quip('dodge'), 1400)
      }
    }
    function onScroll() {
      const s = m.current
      const dy = window.scrollY - s.lastScroll
      s.lastScroll = window.scrollY
      if (s.target.kind !== 'el' && !s.perchTimer && !media.current.reduced) s.vy -= clamp(dy * 2.2, -420, 420)
    }
    function onKey(e) {
      if (e.key === 'Escape' && live.current.bubble) setBubble(null)
    }
    function onDown(e) {
      const b = live.current.bubble
      if (b?.kind === 'ask' && !rootRef.current?.contains(e.target) && !inputRef.current?.value && !live.current.sending) setBubble(null)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [hidden])

  // ---------- Der Loop ----------
  useEffect(() => {
    if (hidden) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 64
    const sg = sprite.getContext('2d')
    const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,248,200,1)')
    grad.addColorStop(0.3, 'rgba(255,214,70,0.75)')
    grad.addColorStop(1, 'rgba(255,200,40,0)')
    sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64)

    let dpr = 1
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`; canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    let raf, last = performance.now(), drewLast = false, lastFolded = null
    const step = now => {
      raf = requestAnimationFrame(step)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = m.current
      const L = live.current
      const { mobile, reduced } = media.current
      const vw = window.innerWidth, vh = window.innerHeight
      const t = now / 1000
      const wall = Date.now()

      // --- Zuhause ---
      const home = mobile ? { x: vw - 36, y: vh - 44 } : { x: vw - 58, y: vh - 62 }
      if (!s.init) { s.x = home.x + 40; s.y = home.y + 80; s.init = true }

      // --- Schlafen: nachts, wenn länger nichts passiert ---
      const h = new Date().getHours()
      const night = h >= 23 || h < 5
      if (night && !L.pose.sleeping && !L.bubble && !s.perchTimer && wall - s.activity > 25000) {
        setPose(p => ({ ...p, sleeping: true, cap: true }))
        s.target = { kind: 'home' }
      }

      // --- Ziel bestimmen ---
      let tx = home.x, ty = home.y, perched = false
      const tg = s.target
      if (tg.kind !== 'home' && tg.until && wall > tg.until) s.target = { kind: 'home' }
      if (s.perchTimer && s.target.kind === 'home') {
        if (!s.perchEl?.isConnected && now - s.perchCheck > 1000) {
          s.perchCheck = now
          s.perchEl = document.querySelector('[data-lumi-perch="timer"]')
        }
        const r = visible(s.perchEl)
        if (r) { tx = r.right - 54; ty = r.top - 10; perched = true }
      }
      if (s.target.kind === 'el') {
        const r = visible(s.target.el)
        if (r) {
          const a = s.target.anchor
          if (a === 'above') { tx = r.left + 10; ty = r.top - 30 }
          else if (a === 'right') { tx = Math.min(r.right + 26, vw - 30); ty = r.top + Math.min(r.height / 2, 18) }
          else { tx = r.right - 30; ty = r.top - 16 }
          perched = true
        } else s.target = { kind: 'home' }
      } else if (s.target.kind === 'point') { tx = s.target.x; ty = s.target.y }

      // Erkundungsflug
      if (!mobile && !reduced && !L.quiet && !L.bubble && !L.pose.sleeping && !s.perchTimer && s.target.kind === 'home' && wall > s.nextTour && !document.hidden) {
        s.nextTour = wall + rand(50000, 100000)
        const cands = [...document.querySelectorAll('[data-topic-id], .card-head h2')]
          .filter(el => { const r = visible(el); return r && r.top > 60 && r.bottom < vh - 60 && !rootRef.current?.contains(el) })
        const el = cands[Math.floor(Math.random() * cands.length)]
        if (el) {
          flyTo(el, { ms: rand(4500, 6500), anchor: 'top' })
          const title = el.getAttribute('data-topic-title')
          if (title && Math.random() < 0.35) later('tourQuip', () => say(quip('tourTopic', { title }), 2600), 1400)
        }
      }

      // Sprechblase mit Eingabe: Lumi hält still
      const frozen = L.bubble?.kind === 'ask'
      if (frozen) { tx = s.fx ?? s.x; ty = s.fy ?? s.y } else { s.fx = s.x; s.fy = s.y }

      // Schweben
      // Mit Knöpfen in der Blase hält Lumi still, damit man sie treffen kann.
      const talking = L.bubble && L.bubble.kind !== 'quip'
      const amp = reduced || frozen || talking || s.hover ? 0 : L.pose.sleeping ? 0.25 : perched ? 0.35 : 1
      tx += (Math.sin(t * 0.9) * 10 + Math.sin(t * 0.37) * 7) * amp
      ty += (Math.cos(t * 1.3) * 6 + Math.sin(t * 0.53) * 5) * amp
      if (L.pose.sleeping) ty += 6
      tx = clamp(tx, 28, vw - 28); ty = clamp(ty, 28, vh - 28)

      // --- Feder-Physik ---
      const k = reduced ? 140 : 16
      const c = 2 * Math.sqrt(k) * (reduced ? 1 : 0.8)
      s.vx += (k * (tx - s.x) - c * s.vx) * dt
      s.vy += (k * (ty - s.y) - c * s.vy) * dt
      const sp = Math.hypot(s.vx, s.vy)
      if (sp > 950) { s.vx *= 950 / sp; s.vy *= 950 / sp }
      s.x += s.vx * dt; s.y += s.vy * dt

      // Blickrichtung & Neigung
      const cur = s.cursor
      if (Math.abs(s.vx) > 30) s.face = s.vx > 0 ? 1 : -1
      else if (!mobile && cur.x >= 0) s.face = cur.x > s.x + 40 ? 1 : cur.x < s.x - 40 ? -1 : s.face
      const tilt = clamp(s.vx / 45, -16, 16)
      s.tilt += (tilt - s.tilt) * Math.min(1, dt * 8)

      // --- Skript-Animationen ---
      let ox = 0, oy = 0, rot = 0
      if (s.script) {
        const p = (now - s.script.start) / s.script.dur
        if (p >= 1) s.script = null
        else if (s.script.type === 'loop') {
          const th = p * Math.PI * 2
          ox = s.face * 26 * Math.sin(th); oy = -26 * (1 - Math.cos(th)); rot = s.face * th * 57.3
        } else if (s.script.type === 'hop') oy = -14 * Math.abs(Math.sin(p * Math.PI * 2))
        else if (s.script.type === 'flinch') ox = Math.sin(p * 42) * 7 * (1 - p)
        else if (s.script.type === 'wiggle') rot = Math.sin(p * 28) * 12 * (1 - p)
      }
      if (L.sending && !reduced) { ox += Math.cos(t * 5) * 6; oy += Math.sin(t * 5) * 6 }

      const size = s.size
      const fx = s.x + ox, fy = s.y + oy
      if (flyRef.current) {
        flyRef.current.style.transform = `translate3d(${fx - size / 2}px, ${fy - size / 2}px, 0)`
        const inner = flyRef.current.firstElementChild
        if (inner) inner.style.transform = `scaleX(${s.face}) rotate(${s.tilt + rot * s.face}deg)`
      }

      // Augen: zur Maus, zu einem gezeigten Element oder in Flugrichtung
      let lx = s.vx, ly = s.vy
      if (s.lookAt && wall < s.lookUntil) {
        const r = visible(s.lookAt)
        if (r) { lx = r.left + r.width / 2 - fx; ly = r.top + r.height / 2 - fy }
      } else if (!mobile && cur.x >= 0 && sp < 120) { lx = cur.x - fx; ly = cur.y - fy }
      const ll = Math.hypot(lx, ly) || 1
      rootRef.current?.style.setProperty('--px', `${(lx / ll) * 1.3 * s.face}px`)
      rootRef.current?.style.setProperty('--py', `${(ly / ll) * 1.1}px`)

      // Flügel anlegen, wenn Lumi sitzt
      const folded = (perched && sp < 25) || L.pose.sleeping
      if (folded !== lastFolded) { lastFolded = folded; flyRef.current?.classList.toggle('lumi-sitting', folded) }

      // --- Sprechblase positionieren ---
      const b = bubbleRef.current
      if (b && !b.classList.contains('lumi-sheet')) {
        const bw = b.offsetWidth, bh = b.offsetHeight
        const left = fx > vw / 2
        const up = fy > bh + 60
        let bx = left ? fx - bw - size * 0.25 : fx + size * 0.25
        let by = up ? fy - bh - size * 0.45 : fy + size * 0.45
        bx = Math.round(clamp(bx, 10, vw - bw - 10)); by = Math.round(clamp(by, 10, vh - bh - 10))
        const tf = `translate3d(${bx}px, ${by}px, 0)`
        if (b.style.transform !== tf) b.style.transform = tf
        b.dataset.tail = `${up ? 'b' : 't'}${left ? 'r' : 'l'}`
      }

      // --- Partikel ---
      const ps = s.particles
      if (!reduced && sp > 160 && !L.pose.sleeping) {
        const k2 = size / 64
        ps.push({ x: fx - s.face * 12 * k2 + rand(-2, 2), y: fy + 5 * k2 + rand(-2, 2), vx: rand(-10, 10), vy: rand(-20, 5), g: -15, life: 0.55, max: 0.55, s: rand(6, 10) })
      }
      if (ps.length || drewLast) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, vw, vh)
        ctx.globalCompositeOperation = 'lighter'
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i]
          p.life -= dt
          if (p.life <= 0) { ps.splice(i, 1); continue }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt
          const a = p.life / p.max
          ctx.globalAlpha = a
          const sz = p.s * (0.6 + a * 0.6)
          ctx.drawImage(sprite, p.x - sz, p.y - sz, sz * 2, sz * 2)
        }
        ctx.globalAlpha = 1
        drewLast = ps.length > 0
      }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [hidden])

  // ---------- Fragen ----------
  function openAsk() {
    awake()
    m.current.nextTour = Date.now() + 90000
    setError('')
    setBubble({ kind: 'ask', at: Date.now() })
    if (remaining === null) loadRemaining()
    later('focus', () => inputRef.current?.focus({ preventScroll: true }), 60)
  }

  async function loadRemaining() {
    const { count } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('kind', 'coach').gte('created_at', today().toISOString())
    if (typeof count === 'number') setRemaining(Math.max(0, COACH_DAILY_LIMIT - count))
  }

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setBubble({ kind: 'ask', at: Date.now() })
    setInput('')
    setError('')
    const next = [...history, { role: 'user', content, at: Date.now() }]
    setHistory(next)
    setSending(true)
    flash('think', 60000)
    try {
      const fresh = coach && Date.now() - coach.loadedAt < 30000 ? coach : await loadCoachState(userId)
      if (fresh !== coach) setCoach(fresh)
      const data = await askLumi(next.slice(-10), contextFor(fresh, section))
      const actions = (data.actions || []).map(a => withLabel({ ...a, target: a.ref ? fresh.refs[a.ref] : null }))
        .filter(a => !['start_quiz', 'start_subject_quiz'].includes(a.type) || a.target)
      const reply = data.reply.replace(/\[?\b([TS]\d{1,3})\b\]?/g, (mm, key) => {
        const obj = fresh.refs[key]
        return obj ? (obj.title || obj.name) : mm
      })
      setHistory(list => [...list, { role: 'assistant', content: reply, mood: data.mood, actions, at: Date.now() }])
      if (typeof data.remaining === 'number') setRemaining(data.remaining)
      react(data.mood)
      // Lumi zeigt auf das, worüber es spricht
      const shown = actions.map(a => (a.type === 'start_quiz' ? topicEl(a.target.id) : a.type === 'open_section' ? navEl(a.section) : null)).find(el => visible(el))
      if (shown) { m.current.lookAt = shown; m.current.lookUntil = Date.now() + 3500; spotlight(shown, 3200) }
    } catch (err) {
      setError(err.message)
      setHistory(list => list.slice(0, -1))
      setInput(content)
      flash('sad', 1500)
    } finally {
      setSending(false)
    }
  }

  function react(mood) {
    if (mood === 'cheer' || mood === 'proud') {
      script('loop', 900); flash('happy', 1800)
      const r = flyRef.current?.getBoundingClientRect()
      if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 26, 0.9)
    } else if (mood === 'worried') flash('sad', 1800)
    else if (mood === 'thinking') flash('think', 1500)
    else if (mood === 'sleepy') flash('closed', 1500)
    else flash('happy', 1200)
  }

  function hoverAction(a, on) {
    const el = a.type === 'start_quiz' ? topicEl(a.target?.id || a.topic?.id)
      : a.type === 'open_section' ? navEl(a.section)
        : a.type === 'open_summary' ? document.querySelector(`[data-summary-id="${a.id}"]`) : null
    if (on && visible(el)) { spotlight(el, 1600); m.current.lookAt = el; m.current.lookUntil = Date.now() + 1600 }
  }

  async function runAction(a, key, evt) {
    awake()
    if (a.type === 'chat') { openAsk(); send(a.prompt); return }
    if (a.type === 'add_task') {
      const { error: err } = await supabase.from('tasks').insert({ user_id: userId, title: a.title, due_date: a.due_date || null })
      if (err) { setError('Die Aufgabe konnte nicht angelegt werden.'); return }
      setDoneActions(d => ({ ...d, [key]: true }))
      const r = evt?.currentTarget?.getBoundingClientRect()
      if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 20, 0.8)
      flash('happy', 1400)
      notifyPlanChanged()
      return
    }
    setBubble(null)
    if (a.type === 'open_summary') { openSummary(a.id); flash('happy', 1200); return }
    if (a.type === 'open_section') {
      const el = navEl(a.section)
      if (visible(el)) { flyTo(el, { ms: 1500, anchor: 'right' }); spotlight(el, 1200) }
      later('nav', () => onNavigate(a.section), visible(el) ? 450 : 0)
      return
    }
    const tp = a.topic || a.target
    if (a.type === 'start_quiz' && tp) onStartQuiz({ topicId: tp.id, label: tp.title })
    if (a.type === 'start_subject_quiz' && a.target) onStartQuiz({ subjectId: a.target.id, label: a.target.name, count: 8 })
    flash('happy', 1200)
  }

  function onPetClick() {
    if (pose.sleeping) {
      awake(); flash('wide', 900)
      say(quip('wake'), 2200)
      return
    }
    if (bubble?.kind === 'ask') { setBubble(null); return }
    openAsk()
  }

  function onPetEnter(e) {
    const s = m.current
    if (e.pointerType === 'mouse') s.hover = true
    flash('happy', 1100)
    script('wiggle', 420)
    if (!live.current.bubble && Date.now() - s.pokeAt > 30000 && !media.current.mobile) {
      s.pokeAt = Date.now()
      say(quip('poke'), 1800)
    }
  }

  if (hidden) return null

  // ---------- Darstellung ----------
  const c = coach?.stats
  const dormant = c && c.todayMin === 0 && c.lastStudyDaysAgo !== null && c.lastStudyDaysAgo >= 3
  const glow = !c ? 0.55 : dormant ? 0.15 : clamp(0.35 + (c.todayMin / 120) * 0.65 + (pose.book ? 0.1 : 0), 0.35, 1)
  const baseExpr = pose.sleeping ? 'closed' : dormant ? 'sad' : coach?.mood === 'worried' ? 'normal' : 'normal'
  const expression = sending ? 'think' : expr || baseExpr

  const lastMsg = history[history.length - 1]
  const answer = lastMsg?.role === 'assistant' && Date.now() - (lastMsg.at || 0) < 45 * 60000 ? lastMsg : null
  const lastQuestion = answer ? history[history.length - 2] : null
  const name = coach?.name ? `, ${coach.name}` : ''

  return createPortal(
    <div className="lumi-root" ref={rootRef} style={{ '--glow': glow }}>
      <canvas className="lumi-canvas" ref={canvasRef} aria-hidden="true" />

      <div className={`lumi-fly ${pose.sleeping ? 'lumi-asleep' : ''}`} ref={flyRef}>
        <button
          type="button" className="lumi-ff-btn"
          onClick={onPetClick} onPointerEnter={onPetEnter} onPointerLeave={() => { m.current.hover = false }}
          aria-label={pose.sleeping ? 'Lumi schläft. Antippen zum Wecken' : 'Lumi, dein Lernbegleiter. Antippen, um etwas zu fragen'}
          aria-expanded={bubble?.kind === 'ask'}
        >
          <Firefly expression={expression} glasses={pose.glasses} book={pose.book} cap={pose.cap} size={mobile ? 50 : 64} />
        </button>
        {pose.sleeping && <span className="lumi-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>}
      </div>

      {bubble && (
        <div
          ref={bubbleRef}
          className={`lumi-bubble lumi-bubble-${bubble.kind} ${bubble.kind === 'ask' && mobile ? 'lumi-sheet' : ''}`}
          role={bubble.kind === 'ask' ? 'dialog' : 'status'}
          aria-label={bubble.kind === 'ask' ? 'Lumi fragen' : undefined}
        >
          {bubble.kind !== 'quip' && (
            <button type="button" className="lumi-bubble-close" onClick={() => setBubble(null)} aria-label="Sprechblase schliessen"><X size={14} /></button>
          )}

          {bubble.kind === 'quip' && <p className="lumi-quip">{bubble.text}</p>}

          {bubble.kind === 'tip' && (
            <>
              <p>{bubble.text}</p>
              <Actions list={bubble.actions} prefix="tip" />
            </>
          )}

          {bubble.kind === 'ask' && (
            <>
              <div className="lumi-ask-body">
                {sending ? (
                  <>
                    {lastMsg?.role === 'user' && <p className="lumi-asked">«{lastMsg.content}»</p>}
                    <p className="lumi-thinking"><span /><span /><span /></p>
                  </>
                ) : answer ? (
                  <>
                    {lastQuestion?.role === 'user' && <p className="lumi-asked">«{lastQuestion.content}»</p>}
                    <div className="lumi-answer"><RichText text={answer.content} /></div>
                    <Actions list={answer.actions} prefix={`a${history.length}`} />
                  </>
                ) : (
                  <>
                    <p>Hallo{name}! Was möchtest du wissen?</p>
                    <div className="lumi-chips">
                      {QUICK_PROMPTS.slice(0, 3).map(q => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}
                      <button type="button" className="lumi-chip-scan" onClick={() => { setBubble(null); requestScan() }}>Lernstoff scannen</button>
                      <button type="button" className="lumi-chip-scan" onClick={() => { setBubble(null); requestScan({ mode: 'summary' }) }}>Zusammenfassung erstellen</button>
                    </div>
                  </>
                )}
                {error && <p className="lumi-error">{error}</p>}
              </div>
              <form className="lumi-ask" onSubmit={e => { e.preventDefault(); send() }}>
                <input
                  ref={inputRef} value={input} maxLength={1500} onChange={e => setInput(e.target.value)}
                  placeholder={answer ? 'Antworten …' : 'Frag Lumi etwas …'} aria-label="Frage an Lumi"
                />
                <button type="submit" disabled={!input.trim() || sending || remaining === 0} aria-label="Senden"><ArrowUp size={16} strokeWidth={2.4} /></button>
              </form>
              <p className="lumi-meta">
                {remaining !== null ? `Noch ${remaining} ${remaining === 1 ? 'Frage' : 'Fragen'} heute · ` : ''}
                {history.length > 0 && <button type="button" className="lumi-link" onClick={() => { setHistory([]); setDoneActions({}) }}>Neu anfangen</button>}
                {history.length > 0 && ' · '}
                <button type="button" className="lumi-link" onClick={() => { setBubble(null); setLumiHidden(true) }}>Ausblenden</button>
              </p>
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  )

  function Actions({ list, prefix }) {
    if (!list?.length) return null
    return (
      <div className="lumi-chips lumi-actions">
        {list.map((a, i) => {
          const key = `${prefix}-${i}`
          return (
            <button
              key={i} type="button" className={doneActions[key] ? 'done' : ''} disabled={doneActions[key]}
              onPointerEnter={() => hoverAction(a, true)} onFocus={() => hoverAction(a, true)}
              onClick={e => runAction(a, key, e)}
            >
              {doneActions[key] ? <><Check size={13} strokeWidth={3} /> Angelegt</> : a.label}
            </button>
          )
        })}
      </div>
    )
  }
}

const QUIP_SECTIONS = new Set(['quiz', 'planner', 'organisation', 'settings'])
