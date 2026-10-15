import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, FileText, ImagePlus, Type, X, Check, ChevronDown, RotateCcw } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { compressImage, readPdf, scanMaterial, savePlan, MAX_IMAGES, SCAN_DAILY_LIMIT } from '../../lib/scan.js'
import { recordProgress, scrollToTopics } from '../../lib/progress.js'
import { sortSubjects } from '../../lib/plan.js'
import { lumiEmit } from '../../lib/lumi.js'
import Firefly from '../lumi/Firefly.jsx'

const THINKING = [
  'Lumi liest dein Material …',
  'Lumi sucht die wichtigsten Begriffe …',
  'Themen werden sortiert …',
  'Zusammenfassungen entstehen …',
  'Fast fertig …',
]

// Foto rein, Lernplan raus.
// Schritte: pick → working (lokal lesen + KI) → review → speichern
export default function ScanDialog({ userId, initialSubjectId = '', onClose, onNavigate }) {
  const [step, setStep] = useState('pick')
  const [images, setImages] = useState([]) // data URLs
  const [pdf, setPdf] = useState(null) // { name, pages, text }
  const [text, setText] = useState('')
  const [showText, setShowText] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [goals, setGoals] = useState([])
  const [target, setTarget] = useState(initialSubjectId) // '' = neues Fach
  const [result, setResult] = useState(null)
  const [subjectName, setSubjectName] = useState('')
  const [goalId, setGoalId] = useState('')
  const [picked, setPicked] = useState([])
  const [openTopic, setOpenTopic] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [tick, setTick] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [usedToday, setUsedToday] = useState(null)
  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    Promise.all([
      supabase.from('plan_subjects').select('id, name, priority, sort_order, goal_id').eq('user_id', userId),
      supabase.from('goals').select('id, name').eq('user_id', userId).order('sort_order'),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'scan').gte('created_at', start.toISOString()),
    ]).then(([s, g, u]) => {
      setSubjects(sortSubjects(s.data || []))
      setGoals(g.data || [])
      if (g.data?.length === 1) setGoalId(g.data[0].id)
      if (typeof u.count === 'number') setUsedToday(u.count)
    })
    const onKey = e => { if (e.key === 'Escape' && step !== 'working') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [])

  // Wechselnde Statuszeilen, während die KI arbeitet
  useEffect(() => {
    if (step !== 'working') return
    const t = window.setInterval(() => setTick(x => x + 1), 1900)
    return () => window.clearInterval(t)
  }, [step])

  async function addFiles(list) {
    setError('')
    const files = [...list]
    for (const file of files) {
      try {
        if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
          setBusy(`PDF «${file.name}» wird gelesen …`)
          const out = await readPdf(file)
          setPdf({ name: file.name, pages: out.pages, text: out.text, scanned: !out.text })
          if (out.images.length) setImages(cur => [...cur, ...out.images].slice(0, MAX_IMAGES))
        } else if (file.type.startsWith('image/')) {
          setBusy('Foto wird vorbereitet …')
          const url = await compressImage(file)
          setImages(cur => (cur.length >= MAX_IMAGES ? cur : [...cur, url]))
        } else {
          setError('Dieses Format kenne ich nicht. Nimm ein Foto, ein Bild oder ein PDF.')
        }
      } catch (e) {
        setError(e.message || 'Die Datei konnte nicht gelesen werden.')
      }
    }
    setBusy('')
  }

  const material = images.length > 0 || (pdf?.text?.length || 0) > 0 || text.trim().length >= 40
  const quotaLeft = usedToday === null ? null : Math.max(0, SCAN_DAILY_LIMIT - usedToday)

  async function run() {
    setError('')
    setStep('working')
    setTick(0)
    lumiEmit('scan-start')
    try {
      const hint = target ? subjects.find(s => s.id === target)?.name || '' : ''
      const combined = [pdf?.text || '', text.trim()].filter(Boolean).join('\n\n')
      const data = await scanMaterial({ images, text: combined, hint })
      setResult(data)
      setSubjectName(data.subject)
      setPicked(data.topics.map(() => true))
      setUsedToday(u => (u === null ? u : u + 1))
      setStep('review')
    } catch (e) {
      setError(e.message)
      setStep('pick')
    }
  }

  function editTopic(i, patch) {
    setResult(r => ({ ...r, topics: r.topics.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  }

  async function save() {
    const topics = result.topics.filter((t, i) => picked[i] && t.title.trim())
    if (!topics.length) { setError('Wähle mindestens ein Thema aus.'); return }
    setStep('saving')
    try {
      const saved = await savePlan(userId, {
        subjectId: target || null,
        newSubject: { name: subjectName, priority: 'mittel', goalId },
        topics,
      })
      await recordProgress(userId)
      const name = target ? subjects.find(s => s.id === target)?.name : subjectName
      onClose()
      onNavigate('learning')
      // Erst wenn die Themenliste neu geladen ist, aufklappen und hervorheben
      window.setTimeout(() => scrollToTopics(saved.topics.map(t => t.id)), 700)
      window.setTimeout(() => lumiEmit('scan-saved', { count: saved.topics.length, subjectName: name, firstTopic: saved.topics[0] }), 1100)
    } catch (e) {
      setError(e.message)
      setStep('review')
    }
  }

  function reset() {
    setResult(null); setImages([]); setPdf(null); setText(''); setStep('pick'); setError('')
  }

  const pickedCount = picked.filter(Boolean).length

  return createPortal(
    <div className="scan-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && step !== 'working' && step !== 'saving') onClose() }}>
      <div className="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title" tabIndex={-1} ref={dialogRef}>
        <div className="scan-head">
          <div>
            <h2 id="scan-title">{step === 'review' ? 'Dein neuer Lernplan' : 'Lernstoff scannen'}</h2>
            <p>
              {step === 'review'
                ? `Lumi hat ${result.topics.length} ${result.topics.length === 1 ? 'Thema' : 'Themen'} gefunden. Prüfe sie kurz und leg sie an.`
                : 'Foto vom Arbeitsblatt, eine Buchseite oder ein PDF: Lumi macht daraus Themen mit Zusammenfassung und Lernzielen.'}
            </p>
          </div>
          {step !== 'working' && step !== 'saving' && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Schliessen"><X size={18} /></button>
          )}
        </div>

        {step === 'pick' && (
          <>
            <div
              className={`scan-drop ${dragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            >
              <div className="scan-sources">
                <button type="button" className="scan-source" onClick={() => cameraRef.current?.click()} disabled={images.length >= MAX_IMAGES}>
                  <Camera size={26} strokeWidth={2} />
                  <strong>Foto aufnehmen</strong>
                  <span>mit der Kamera</span>
                </button>
                <button type="button" className="scan-source" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={26} strokeWidth={2} />
                  <strong>Bild oder PDF</strong>
                  <span>auswählen oder hierher ziehen</span>
                </button>
                <button type="button" className={`scan-source ${showText ? 'active' : ''}`} onClick={() => setShowText(v => !v)}>
                  <Type size={26} strokeWidth={2} />
                  <strong>Text einfügen</strong>
                  <span>z.B. aus deinen Notizen</span>
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </div>

            {busy && <p className="scan-busy" role="status"><span className="quiz-spinner" aria-hidden="true" /> {busy}</p>}

            {(images.length > 0 || pdf) && (
              <div className="scan-material">
                {images.map((src, i) => (
                  <figure key={i} className="scan-thumb">
                    <img src={src} alt={`Seite ${i + 1}`} />
                    <button type="button" onClick={() => setImages(cur => cur.filter((_, j) => j !== i))} aria-label={`Seite ${i + 1} entfernen`}><X size={13} strokeWidth={3} /></button>
                  </figure>
                ))}
                {pdf && (
                  <div className="scan-pdf">
                    <FileText size={20} />
                    <div>
                      <strong>{pdf.name}</strong>
                      <span>{pdf.scanned
                        ? (Math.min(pdf.pages, MAX_IMAGES) === 1 ? 'eingescannt · wird als Bild gelesen' : `eingescannt · erste ${Math.min(pdf.pages, MAX_IMAGES)} Seiten als Bilder`)
                        : `${pdf.pages} ${pdf.pages === 1 ? 'Seite' : 'Seiten'} · Text erkannt`}</span>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => { setPdf(null); if (pdf.scanned) setImages([]) }} aria-label="PDF entfernen"><X size={15} /></button>
                  </div>
                )}
                {images.length >= MAX_IMAGES && <p className="field-hint">Maximal {MAX_IMAGES} Seiten pro Scan.</p>}
              </div>
            )}

            {showText && (
              <label className="field scan-text">
                Text
                <textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="Notizen, Zusammenfassung oder Inhaltsverzeichnis einfügen …" />
              </label>
            )}

            <div className="field-row scan-target">
              <label className="field">
                Wohin damit?
                <select value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">Neues Fach (Lumi schlägt den Namen vor)</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>Zu «{s.name}» hinzufügen</option>)}
                </select>
              </label>
            </div>

            {error && <p className="scan-error">{error}</p>}

            <div className="scan-foot">
              <span className="quiz-meta">
                {quotaLeft !== null ? `Heute noch ${quotaLeft} von ${SCAN_DAILY_LIMIT} Scans · ` : ''}Bilder werden nicht gespeichert
              </span>
              <button type="button" className="btn btn-primary" onClick={run} disabled={!material || !!busy || quotaLeft === 0}>
                Scannen
              </button>
            </div>
          </>
        )}

        {step === 'working' && (
          <div className="scan-working" role="status" aria-live="polite">
            <div className="scan-stage">
              {images[0]
                ? <img src={images[0]} alt="" />
                : <div className="scan-paper">{(pdf?.text || text).slice(0, 900)}</div>}
              <div className="scan-beam" aria-hidden="true" />
              <div className="scan-ff" aria-hidden="true"><Firefly expression="think" glasses size={64} /></div>
            </div>
            <p className="scan-status">{THINKING[Math.min(tick, THINKING.length - 1)]}</p>
          </div>
        )}

        {(step === 'review' || step === 'saving') && result && (
          <>
            <div className="field-row scan-subject">
              {target ? (
                <p className="scan-into">Wird zu <strong>{subjects.find(s => s.id === target)?.name}</strong> hinzugefügt.</p>
              ) : (
                <>
                  <label className="field grow">
                    Fach
                    <input value={subjectName} onChange={e => setSubjectName(e.target.value)} maxLength={60} />
                  </label>
                  {goals.length > 0 && (
                    <label className="field">
                      Ziel
                      <select value={goalId} onChange={e => setGoalId(e.target.value)}>
                        <option value="">Kein Ziel</option>
                        {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>

            <ol className="scan-topics">
              {result.topics.map((t, i) => (
                <li key={i} className={`scan-topic ${picked[i] ? '' : 'off'}`} style={{ animationDelay: `${i * 110}ms` }}>
                  <div className="scan-topic-head">
                    <input
                      type="checkbox" checked={picked[i]} aria-label={`${t.title} übernehmen`}
                      onChange={() => setPicked(p => p.map((v, j) => (j === i ? !v : v)))}
                    />
                    <input className="scan-topic-title" value={t.title} onChange={e => editTopic(i, { title: e.target.value })} aria-label="Thema" maxLength={80} />
                    {t.category && <span className="scan-topic-cat">{t.category}</span>}
                    <button type="button" className="icon-btn" onClick={() => setOpenTopic(openTopic === i ? null : i)} aria-expanded={openTopic === i} aria-label="Details">
                      <ChevronDown size={16} style={{ transform: openTopic === i ? 'rotate(180deg)' : 'none' }} />
                    </button>
                  </div>
                  <p className={`scan-topic-summary ${openTopic === i ? 'open' : ''}`}>{t.summary}</p>
                  {openTopic === i && t.goals.length > 0 && (
                    <ul className="scan-topic-goals">{t.goals.map((g, j) => <li key={j}><Check size={12} strokeWidth={3} /> {g}</li>)}</ul>
                  )}
                  {openTopic !== i && t.goals.length > 0 && <span className="scan-topic-meta">{t.goals.length} Lernziele</span>}
                </li>
              ))}
            </ol>

            {error && <p className="scan-error">{error}</p>}

            <div className="scan-foot">
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={step === 'saving'}>
                <RotateCcw size={15} /> Neu scannen
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={step === 'saving' || !pickedCount}>
                {step === 'saving' ? 'Wird angelegt …' : `${pickedCount} ${pickedCount === 1 ? 'Thema' : 'Themen'} anlegen`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
