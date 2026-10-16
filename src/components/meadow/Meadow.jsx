import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Sparkles, X } from 'lucide-react'
import { loadMeadow, describeDay, MEADOW_DAYS } from '../../lib/meadow.js'
import { onPlanChanged } from '../../lib/progress.js'

// ------------------------------------------------------------
// Lichtwiese: Nachtwiese mit einem Glühwürmchen pro Lerntag.
// Finale: Aus den Glühwürmchen steigt ein Schwarm auf und schreibt
// den Fortschritt in den Himmel.
// ------------------------------------------------------------

// Kleiner, reproduzierbarer Zufall: gleiche Wiese bei jedem Neuladen
function seeded(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6D2B79F5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const DISPLAY_FONT = '"Bricolage Grotesque Variable", "Bricolage Grotesque", "Plus Jakarta Sans", sans-serif'

function makeSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,230,1)')
  grad.addColorStop(0.22, 'rgba(243,247,122,0.85)')
  grad.addColorStop(0.55, 'rgba(255,214,74,0.22)')
  grad.addColorStop(1, 'rgba(255,214,74,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

// Hintergrund (Himmel, Mond, Hügel) und Vordergrund (Gräser) einmal vorzeichnen
function paintLayers(w, h, dpr, rand) {
  const bg = document.createElement('canvas')
  bg.width = w * dpr; bg.height = h * dpr
  const b = bg.getContext('2d')
  b.scale(dpr, dpr)
  const sky = b.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#120F27')
  sky.addColorStop(0.55, '#241C4A')
  sky.addColorStop(1, '#3A2C5E')
  b.fillStyle = sky
  b.fillRect(0, 0, w, h)
  // Mond
  const mx = w * 0.84, my = h * 0.2, mr = Math.min(28, h * 0.09)
  const halo = b.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4)
  halo.addColorStop(0, 'rgba(255,240,200,0.18)')
  halo.addColorStop(1, 'rgba(255,240,200,0)')
  b.fillStyle = halo
  b.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8)
  b.fillStyle = '#FFF4D6'
  b.beginPath(); b.arc(mx, my, mr, 0, Math.PI * 2); b.fill()
  b.fillStyle = '#1C1638'
  b.beginPath(); b.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2); b.fill()
  // Hügel
  const hill = (base, amp, color, f) => {
    b.fillStyle = color
    b.beginPath(); b.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) b.lineTo(x, base + Math.sin(x * f + base) * amp + Math.sin(x * f * 2.7) * amp * 0.35)
    b.lineTo(w, h); b.closePath(); b.fill()
  }
  hill(h * 0.58, h * 0.05, '#2B2252', 0.006)
  hill(h * 0.7, h * 0.04, '#1F1940', 0.009)

  const fg = document.createElement('canvas')
  fg.width = w * dpr; fg.height = h * dpr
  const f = fg.getContext('2d')
  f.scale(dpr, dpr)
  f.fillStyle = '#16122F'
  f.beginPath(); f.moveTo(0, h)
  for (let x = 0; x <= w; x += 10) f.lineTo(x, h * 0.9 + Math.sin(x * 0.02) * 4)
  f.lineTo(w, h); f.closePath(); f.fill()
  f.strokeStyle = '#16122F'
  f.lineCap = 'round'
  for (let x = 0; x < w; x += 3) {
    const bh = 8 + rand() * h * 0.12
    f.lineWidth = 1 + rand() * 1.4
    f.beginPath()
    f.moveTo(x, h)
    f.quadraticCurveTo(x + (rand() - 0.5) * 8, h - bh * 0.6, x + (rand() - 0.5) * 14, h * 0.92 - bh)
    f.stroke()
  }
  return { bg, fg }
}

async function textPoints(text, w, h, maxPoints) {
  try { await document.fonts.load(`800 120px ${DISPLAY_FONT}`) } catch { /* Fallback-Schrift */ }
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  let size = Math.min(h * 0.46, (w * 0.86) / Math.max(2.2, text.length * 0.62))
  g.font = `800 ${size}px ${DISPLAY_FONT}`
  const tw = g.measureText(text).width
  if (tw > w * 0.88) { size *= (w * 0.88) / tw; g.font = `800 ${size}px ${DISPLAY_FONT}` }
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, w / 2, h * 0.36)
  const data = g.getImageData(0, 0, w, h).data
  for (let step = 4; step < 30; step++) {
    const pts = []
    for (let y = 0; y < h; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
        if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 128) pts.push({ x, y })
      }
    }
    if (pts.length <= maxPoints) return pts
  }
  return []
}

export function MeadowScene({ data, height, finale = 0, finaleLabel = '', onFinaleDone, className = '' }) {
  const doneRef = useRef(onFinaleDone)
  doneRef.current = onFinaleDone
  const labelRef = useRef(finaleLabel)
  labelRef.current = finaleLabel
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [tip, setTip] = useState(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const sprite = makeSprite()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const S = { w: 0, h: 0, dpr: 1, layers: null, flies: [], stars: [], swarm: null, visible: true, hover: null }
    sceneRef.current = S

    function layout() {
      const w = wrap.clientWidth, h = height || wrap.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      Object.assign(S, { w, h, dpr })
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      const rand = seeded(`lumo-wiese-${data.days[0]?.key}`)
      S.layers = paintLayers(w, h, dpr, rand)
      S.stars = Array.from({ length: Math.round((w * h) / 2600) }, () => ({ x: rand() * w, y: rand() * h * 0.55, r: 0.4 + rand() * 1.1, ph: rand() * 6.3, sp: 0.6 + rand() * 1.6 }))
      const n = data.days.length
      const pad = Math.max(18, w * 0.04)
      S.flies = data.days.map((d, i) => {
        const r = seeded(d.key)
        return {
          day: d, today: i === n - 1,
          bx: pad + (i / Math.max(1, n - 1)) * (w - pad * 2) + (r() - 0.5) * ((w - pad * 2) / n) * 0.9,
          by: h * 0.5 + r() * h * 0.36,
          ph: r() * 6.3, f1: 0.4 + r() * 0.5, f2: 0.5 + r() * 0.6,
        }
      })
    }
    layout()

    let raf = 0, start = performance.now()
    function frame(now) {
      const t = (now - start) / 1000
      const { w, h, dpr } = S
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.drawImage(S.layers.bg, 0, 0, w, h)
      // Sterne
      for (const s of S.stars) {
        ctx.globalAlpha = reduced ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))
        ctx.fillStyle = '#FFFBEA'
        ctx.fillRect(s.x, s.y, s.r, s.r)
      }
      ctx.globalAlpha = 1
      const sw = S.swarm
      const dimDays = sw ? Math.max(0.25, 1 - Math.min(1, (now - sw.start) / 800)) : 1
      // Glühwürmchen der Tage
      ctx.globalCompositeOperation = 'lighter'
      for (const fl of S.flies) {
        const mx = reduced ? 0 : Math.sin(t * fl.f1 + fl.ph) * 7
        const my = reduced ? 0 : Math.cos(t * fl.f2 + fl.ph) * 5
        fl.x = fl.bx + mx; fl.y = fl.by + my
        const g = fl.day.glow
        if (g > 0) {
          const tw = reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 2.2 + fl.ph * 3)
          const size = (9 + 20 * g) * (fl.today ? 1.25 + 0.12 * Math.sin(t * 3) : 1)
          ctx.globalAlpha = Math.min(1, g * tw) * dimDays
          ctx.drawImage(sprite, fl.x - size, fl.y - size, size * 2, size * 2)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      for (const fl of S.flies) {
        if (fl.day.glow > 0) continue
        ctx.globalAlpha = 0.35
        ctx.fillStyle = '#B9C4A8'
        ctx.beginPath(); ctx.arc(fl.x, fl.y, 1.6, 0, Math.PI * 2); ctx.fill()
        if (fl.today) {
          ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3)
          ctx.strokeStyle = '#F3F77A'
          ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(fl.x, fl.y, 9, 0, Math.PI * 2); ctx.stroke()
          ctx.setLineDash([])
        }
      }
      if (S.hover) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = '#FFFBEA'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(S.hover.x, S.hover.y, 12, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
      // Schwarm (Finale)
      if (sw) {
        const e = (now - sw.start) / 1000
        ctx.globalCompositeOperation = 'lighter'
        let alive = false
        for (const p of sw.parts) {
          let x, y, a = 1
          const rise = Math.min(1, Math.max(0, (e - p.delay) / 0.9))
          const seek = easeInOut(Math.min(1, Math.max(0, (e - p.delay - 0.7) / 2.2)))
          const fall = Math.min(1, Math.max(0, (e - 7.2 - p.delay * 0.5) / 2))
          const cx = p.ox + (p.tx - p.ox) * 0.3, cy = Math.min(p.oy, p.ty) - h * 0.25
          if (fall > 0) {
            const u = easeInOut(fall)
            x = p.tx + (p.ox - p.tx) * u + Math.sin(e * 3 + p.ph) * 8 * u
            y = p.ty + (p.oy - p.ty) * u
            a = 1 - u
          } else if (seek > 0) {
            const u = seek, v = 1 - u
            x = v * v * (p.ox) + 2 * v * u * cx + u * u * p.tx
            y = v * v * (p.oy - 30 * rise) + 2 * v * u * cy + u * u * p.ty
            if (u >= 1) { x += Math.sin(e * 2.4 + p.ph) * 0.9; y += Math.cos(e * 2 + p.ph) * 0.9 }
          } else {
            x = p.ox + Math.sin(e * 4 + p.ph) * 4 * rise
            y = p.oy - 30 * rise
            a = rise
          }
          if (a > 0.01) alive = true
          const size = p.s * (0.85 + 0.15 * Math.sin(e * 5 + p.ph))
          ctx.globalAlpha = a * p.bright
          ctx.drawImage(sprite, x - size, y - size, size * 2, size * 2)
        }
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        if (!alive && e > 2) { S.swarm = null; doneRef.current?.() }
      }
      ctx.drawImage(S.layers.fg, 0, 0, w, h)
      if (!reduced || S.swarm) raf = S.visible && !document.hidden ? requestAnimationFrame(frame) : 0
    }
    raf = requestAnimationFrame(frame)
    const resume = () => { if (!raf && S.visible && !document.hidden) raf = requestAnimationFrame(frame) }
    S.resume = resume

    const io = new IntersectionObserver(([en]) => { S.visible = en.isIntersecting; resume() })
    io.observe(wrap)
    const ro = new ResizeObserver(() => { layout(); if (reduced) requestAnimationFrame(frame) })
    ro.observe(wrap)
    document.addEventListener('visibilitychange', resume)

    function onMove(e) {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      let best = null, bd = 18
      for (const fl of S.flies) {
        const d = Math.hypot(fl.x - x, fl.y - y)
        if (d < bd) { bd = d; best = fl }
      }
      S.hover = best
      setTip(best ? { x: best.x, y: best.y, text: describeDay(best.day) } : null)
      if (reduced) requestAnimationFrame(frame)
    }
    function onLeave() { S.hover = null; setTip(null) }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
      document.removeEventListener('visibilitychange', resume)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [data, height])

  // Finale starten
  useEffect(() => {
    const S = sceneRef.current
    if (!finale || !S || !data) return
    let cancelled = false
    ;(async () => {
      const label = labelRef.current || (data.goal ? `${data.goal.pct}%` : 'Lumo')
      const small = S.w < 500
      const pts = await textPoints(label, Math.round(S.w), Math.round(S.h), small ? 220 : 420)
      if (cancelled || !pts.length) return
      const weights = S.flies.map(f => (f.day.glow > 0 ? 0.6 + f.day.glow * 2 : 0.12))
      const total = weights.reduce((a, b) => a + b, 0)
      const pick = () => {
        let r = Math.random() * total
        for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return S.flies[i] }
        return S.flies[S.flies.length - 1]
      }
      const parts = pts.sort(() => Math.random() - 0.5).map(pt => {
        const o = pick()
        return { ox: o.x ?? o.bx, oy: o.y ?? o.by, tx: pt.x, ty: pt.y, delay: Math.random() * 0.8, ph: Math.random() * 6.3, s: (small ? 3.2 : 5) + Math.random() * (small ? 2.5 : 4), bright: 0.75 + Math.random() * 0.25 }
      })
      S.swarm = { start: performance.now(), parts }
      S.resume?.()
    })()
    return () => { cancelled = true }
  }, [finale])

  return (
    <div className={`meadow-scene ${className}`} ref={wrapRef} style={height ? { height } : undefined}>
      <canvas ref={canvasRef} role="img" aria-label={data ? `Lichtwiese: ${data.lit} von ${MEADOW_DAYS} Tagen leuchten` : 'Lichtwiese'} />
      {tip && (
        <div className="meadow-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
      )}
    </div>
  )
}

export default function MeadowCard({ userId }) {
  const [data, setData] = useState(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => loadMeadow(userId).then(d => { if (alive) setData(d) })
    load()
    const off = onPlanChanged(load)
    return () => { alive = false; off() }
  }, [userId])

  if (!data) return null
  const caption = data.lit === 0
    ? 'Noch dunkel hier. Jeder Lerntag lässt ein Glühwürmchen aufleuchten.'
    : `${data.lit} ${data.lit === 1 ? 'Tag leuchtet' : 'Tage leuchten'} in den letzten 12 Wochen${data.streak > 1 ? ` · ${data.streak} Tage in Folge` : ''}`
  const goals = data.goals || []

  return (
    <section className="card meadow-card">
      <div className="card-head">
        <h2>Deine Lichtwiese</h2>
        <button type="button" className="btn btn-sm btn-ghost meadow-open" onClick={() => setFull(true)}>
          <Maximize2 size={15} strokeWidth={2.2} /> Vollbild
        </button>
      </div>
      <MeadowScene data={data} height={window.innerWidth < 600 ? 190 : 240} />
      <div className="meadow-foot">
        <p className="meadow-caption">{caption}</p>
        {goals.length > 0 && (
          <div className="meadow-goals-mini">
            {goals.map(g => <span key={g.id}><strong>{g.name}</strong> {g.pct} %</span>)}
          </div>
        )}
      </div>
      {full && <MeadowFullscreen data={data} onClose={() => setFull(false)} />}
    </section>
  )
}

function MeadowFullscreen({ data, onClose }) {
  const goals = data.goals || []
  const [pick, setPick] = useState(goals.length > 1 ? 'all' : goals[0]?.id || '')
  const [current, setCurrent] = useState(null) // Ziel, das gerade in den Himmel geschrieben wird
  const [finale, setFinale] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showCaption, setShowCaption] = useState(false)
  const timer = useRef(null)
  const queue = useRef([])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; window.clearTimeout(timer.current) }
  }, [])

  function next() {
    const g = queue.current.shift() ?? null
    setCurrent(g)
    setPlaying(true)
    setShowCaption(false)
    setFinale(f => f + 1)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShowCaption(true), 3200)
  }

  // Bei "Alle" schreibt der Schwarm die Ziele nacheinander in den Himmel
  function fly() {
    queue.current = pick === 'all' ? [...goals] : goals.filter(g => g.id === pick)
    if (!queue.current.length) queue.current = [null]
    next()
  }

  function done() {
    if (queue.current.length) { next(); return }
    setPlaying(false)
    setShowCaption(false)
  }

  return createPortal(
    <div className="meadow-full" role="dialog" aria-modal="true" aria-label="Lichtwiese im Vollbild">
      <MeadowScene
        data={data} finale={finale} finaleLabel={current ? `${current.pct}%` : ''}
        onFinaleDone={done} className="meadow-scene-full"
      />
      <div className="meadow-full-top">
        <div>
          <h2>Deine Lichtwiese</h2>
          <p>{data.lit} von {MEADOW_DAYS} Tagen leuchten{data.streak > 1 ? ` · ${data.streak} Tage in Folge` : ''}</p>
        </div>
        <button type="button" className="meadow-close" onClick={onClose} aria-label="Vollbild schliessen"><X size={20} /></button>
      </div>
      <div className={`meadow-full-caption ${showCaption ? 'show' : ''}`} aria-live="polite">
        {showCaption && (current
          ? <><strong>{current.name}</strong> · {current.pct} % geschafft</>
          : <><strong>Lumo</strong> · jedes Licht ist ein Lerntag</>)}
      </div>
      <div className="meadow-full-foot">
        {goals.length > 1 && (
          <div className="meadow-goal-pick" role="group" aria-label="Welches Ziel?">
            <button type="button" className={pick === 'all' ? 'on' : ''} aria-pressed={pick === 'all'} onClick={() => setPick('all')} disabled={playing}>Alle</button>
            {goals.map(g => (
              <button key={g.id} type="button" className={pick === g.id ? 'on' : ''} aria-pressed={pick === g.id} onClick={() => setPick(g.id)} disabled={playing}>
                {g.name} <span>{g.pct} %</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-primary meadow-fly" onClick={fly} disabled={playing}>
          <Sparkles size={17} strokeWidth={2.2} /> {playing ? 'Sie fliegen …' : 'Fliegen lassen'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
