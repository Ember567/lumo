import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, FileText, ImagePlus, Type, X, Check, ChevronDown, RotateCcw, ListChecks, NotebookPen } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import {
  compressImage, readPdf, renderPdfPages, fitPages, pdfRangeText, scanMaterial, savePlan,
  MAX_IMAGES, MAX_SCAN_CHARS, SCAN_DAILY_LIMIT,
} from '../../lib/scan.js'
import { saveSummary, focusSummary, summaryStats } from '../../lib/summaries.js'
import { recordProgress, scrollToTopics } from '../../lib/progress.js'
import { sortSubjects } from '../../lib/plan.js'
import { lumiEmit } from '../../lib/lumi.js'
import Firefly from '../lumi/Firefly.jsx'
import SummaryBody from '../summaries/SummaryBody.jsx'

const THINKING = {
  plan: ['Lumi liest dein Material …', 'Lumi sucht die wichtigsten Begriffe …', 'Themen werden sortiert …', 'Zusammenfassungen entstehen …', 'Fast fertig …'],
  summary: ['Lumi liest dein Material …', 'Lumi markiert das Wichtigste …', 'Begriffe und Formeln werden gesammelt …', 'Kontrollfragen entstehen …', 'Das Blatt wird geschrieben …', 'Fast fertig …'],
}

const nf = new Intl.NumberFormat('de-CH')

// Foto rein, Lernplan oder Zusammenfassung raus.
// Schritte: pick → working (lokal lesen + KI) → review → saving
export default function ScanDialog({ userId, initialSubjectId = '', initialTopicId = '', initialMode = 'plan', onClose, onNavigate }) {
  const [mode, setMode] = useState(initialMode === 'summary' ? 'summary' : 'plan')
  const [step, setStep] = useState('pick')
  const [images, setImages] = useState([]) // Fotos als data URLs
  const [pdf, setPdf] = useState(null) // { file, name, pages, pageTexts, scanned, from, to }
  const [pdfImages, setPdfImages] = useState([]) // gerenderte Seiten eingescannter PDFs
  const [text, setText] = useState('')
  const [showText, setShowText] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [goals, setGoals] = useState([])
  const [target, setTarget] = useState(initialSubjectId) // Lernplan: '' = neues Fach
  const [sumSubject, setSumSubject] = useState(initialSubjectId) // Zusammenfassung: '' = neues Fach
  const [sumTopic, setSumTopic] = useState(initialTopicId) // '' = neues Thema
  const [result, setResult] = useState(null)
  const [subjectName, setSubjectName] = useState('')
  const [title, setTitle] = useState('')
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
  const stepRef = useRef(step)
  stepRef.current = step

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    Promise.all([
      supabase.from('plan_subjects').select('id, name, priority, sort_order, goal_id').eq('user_id', userId),
      supabase.from('goals').select('id, name').eq('user_id', userId).order('sort_order'),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'scan').gte('created_at', start.toISOString()),
      supabase.from('plan_topics').select('id, title, subject_id, sort_order').eq('user_id', userId).order('sort_order'),
    ]).then(([s, g, u, t]) => {
      setSubjects(sortSubjects(s.data || []))
      setGoals(g.data || [])
      setTopics(t.data || [])
      if (g.data?.length === 1) setGoalId(g.data[0].id)
      if (typeof u.count === 'number') setUsedToday(u.count)
      // Vom Thema aus geöffnet: Fach dazu vorwählen
      const tp = (t.data || []).find(x => x.id === initialTopicId)
      if (tp) setSumSubject(tp.subject_id)
    })
    const onKey = e => { if (e.key === 'Escape' && stepRef.current !== 'working' && stepRef.current !== 'saving') onClose() }
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

  // Eingescanntes PDF: die gewählten Seiten als Bilder rendern
  useEffect(() => {
    if (!pdf?.scanned) return
    let alive = true
    const t = window.setTimeout(async () => {
      setBusy('Seiten werden vorbereitet …')
      try {
        const out = await renderPdfPages(pdf.file, pdf.from, MAX_IMAGES - images.length)
        if (alive) setPdfImages(out)
      } catch { if (alive) setError('Die PDF-Seiten konnten nicht gelesen werden.') }
      if (alive) setBusy('')
    }, 350)
    return () => { alive = false; window.clearTimeout(t) }
  }, [pdf?.file, pdf?.from, pdf?.scanned])

  async function addFiles(list) {
    setError('')
    for (const file of [...list]) {
      try {
        if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
          setBusy(`PDF «${file.name}» wird gelesen …`)
          const out = await readPdf(file)
          setPdfImages(out.images)
          setPdf({
            file, name: file.name, pages: out.pages, pageTexts: out.pageTexts, scanned: out.scanned,
            from: 1, to: out.scanned ? Math.min(out.pages, MAX_IMAGES) : fitPages(out.pageTexts, 1),
          })
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

  function setRange(patch) {
    setPdf(p => {
      const from = Math.min(p.pages, Math.max(1, Number(patch.from ?? p.from) || 1))
      let to = Math.min(p.pages, Math.max(from, Number(patch.to ?? p.to) || from))
      if (patch.from !== undefined && !p.scanned && patch.to === undefined) to = fitPages(p.pageTexts, from)
      return { ...p, from, to }
    })
  }

  const pdfText = pdf && !pdf.scanned ? pdfRangeText(pdf.pageTexts, pdf.from, pdf.to) : ''
  const allImages = [...images, ...pdfImages].slice(0, MAX_IMAGES)
  const combined = [pdfText, text.trim()].filter(Boolean).join('\n\n')
  const material = allImages.length > 0 || pdfText.length > 0 || text.trim().length >= 40
  const tooLong = combined.length > MAX_SCAN_CHARS
  const quotaLeft = usedToday === null ? null : Math.max(0, SCAN_DAILY_LIMIT - usedToday)
  const subjectById = id => subjects.find(s => s.id === id)
  const topicById = id => topics.find(t => t.id === id)
  const presetTopic = topicById(sumTopic)

  function sourceLabel() {
    if (pdf) return `aus PDF «${pdf.name.slice(0, 80)}»${pdf.pages > 1 ? `, S. ${pdf.from}–${pdf.scanned ? Math.min(pdf.pages, pdf.from + pdfImages.length - 1) : pdf.to}` : ''}`
    if (images.length) return images.length === 1 ? 'aus einem Foto' : `aus ${images.length} Fotos`
    return 'aus eingefügtem Text'
  }

  async function run() {
    setError('')
    setStep('working')
    setTick(0)
    lumiEmit('scan-start')
    try {
      const subj = mode === 'plan' ? target : sumSubject
      const hint = subj ? subjectById(subj)?.name || '' : ''
      const data = await scanMaterial({ images: allImages, text: combined, hint, mode, topic: mode === 'summary' ? presetTopic?.title || '' : '' })
      setResult({ ...data, mode })
      setSubjectName(data.subject)
      setUsedToday(u => (u === null ? u : u + 1))
      if (mode === 'plan') {
        setPicked(data.topics.map(() => true))
      } else {
        setTitle(data.title)
        if (!sumSubject) {
          const match = subjects.find(s => s.name.trim().toLowerCase() === data.subject.trim().toLowerCase())
          if (match) setSumSubject(match.id)
        }
      }
      setStep('review')
    } catch (e) {
      setError(e.message)
      setStep('pick')
    }
  }

  function editTopic(i, patch) {
    setResult(r => ({ ...r, topics: r.topics.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  }

  async function savePlanResult() {
    const chosen = result.topics.filter((t, i) => picked[i] && t.title.trim())
    if (!chosen.length) { setError('Wähle mindestens ein Thema aus.'); return }
    setStep('saving')
    try {
      const saved = await savePlan(userId, {
        subjectId: target || null,
        newSubject: { name: subjectName, priority: 'mittel', goalId },
        topics: chosen,
      })
      await recordProgress(userId)
      const name = target ? subjectById(target)?.name : subjectName
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

  async function saveSummaryResult() {
    if (!title.trim()) { setError('Gib der Zusammenfassung einen Titel.'); return }
    setStep('saving')
    try {
      const topicTitle = sumTopic ? topicById(sumTopic)?.title : title.trim()
      const saved = await saveSummary(userId, {
        subjectId: sumSubject || null,
        newSubject: { name: subjectName, goalId },
        topicId: sumTopic || null,
        newTopicTitle: title,
        title,
        source: sourceLabel(),
        content: result.content,
      })
      await recordProgress(userId)
      const stats = summaryStats(result.content)
      onClose()
      onNavigate('learning')
      window.setTimeout(() => focusSummary(saved.id), 700)
      window.setTimeout(() => lumiEmit('summary-saved', { id: saved.id, title: title.trim(), topic: { id: saved.topicId, title: topicTitle }, stats }), 1100)
    } catch (e) {
      setError(e.message)
      setStep('review')
    }
  }

  function reset() {
    setResult(null); setImages([]); setPdf(null); setPdfImages([]); setText(''); setStep('pick'); setError('')
  }

  const pickedCount = picked.filter(Boolean).length
  const isSummary = mode === 'summary'
  const reviewing = (step === 'review' || step === 'saving') && result
  const thinking = THINKING[mode]
  const subjectTopics = topics.filter(t => t.subject_id === sumSubject)

  let heading = isSummary ? 'Zusammenfassung erstellen' : 'Lernstoff scannen'
  let intro = isSummary
    ? 'Foto vom Arbeitsblatt, eine Buchseite oder ein PDF: Lumi schreibt dir daraus eine Zusammenfassung mit Begriffen, Formeln und Kontrollfragen.'
    : 'Foto vom Arbeitsblatt, eine Buchseite oder ein PDF: Lumi macht daraus Themen mit Zusammenfassung und Lernzielen.'
  if (reviewing && !isSummary) {
    heading = 'Dein neuer Lernplan'
    intro = `Lumi hat ${result.topics.length} ${result.topics.length === 1 ? 'Thema' : 'Themen'} gefunden. Prüfe sie kurz und leg sie an.`
  } else if (reviewing) {
    heading = 'Deine Zusammenfassung'
    intro = 'Lies kurz drüber, gib ihr einen Titel und leg fest, wohin sie gehört.'
  }

  return createPortal(
    <div className="scan-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && step !== 'working' && step !== 'saving') onClose() }}>
      <div className={`scan-dialog ${isSummary ? 'is-summary' : ''} ${reviewing && isSummary ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="scan-title" tabIndex={-1} ref={dialogRef}>
        <div className="scan-head">
          <div>
            <h2 id="scan-title">{heading}</h2>
            <p>{intro}</p>
          </div>
          {step !== 'working' && step !== 'saving' && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Schliessen"><X size={18} /></button>
          )}
        </div>

        {step === 'pick' && (
          <>
            <div className="scan-mode" role="group" aria-label="Was soll Lumi machen?">
              <button type="button" aria-pressed={!isSummary} className={!isSummary ? 'on' : ''} onClick={() => setMode('plan')}>
                <ListChecks size={16} strokeWidth={2.3} /> Lernplan
              </button>
              <button type="button" aria-pressed={isSummary} className={isSummary ? 'on' : ''} onClick={() => setMode('summary')}>
                <NotebookPen size={16} strokeWidth={2.3} /> Zusammenfassung
              </button>
            </div>

            <div
              className={`scan-drop ${dragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            >
              <div className="scan-sources">
                <button type="button" className="scan-source" onClick={() => cameraRef.current?.click()} disabled={allImages.length >= MAX_IMAGES}>
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

            {(allImages.length > 0 || pdf) && (
              <div className="scan-material">
                {images.map((src, i) => (
                  <figure key={i} className="scan-thumb">
                    <img src={src} alt={`Foto ${i + 1}`} />
                    <button type="button" onClick={() => setImages(cur => cur.filter((_, j) => j !== i))} aria-label={`Foto ${i + 1} entfernen`}><X size={13} strokeWidth={3} /></button>
                  </figure>
                ))}
                {pdfImages.slice(0, Math.max(0, MAX_IMAGES - images.length)).map((src, i) => (
                  <figure key={`p${i}`} className="scan-thumb is-pdf">
                    <img src={src} alt={`PDF-Seite ${pdf.from + i}`} />
                    <span className="scan-thumb-page">S. {pdf.from + i}</span>
                  </figure>
                ))}
                {pdf && (
                  <div className="scan-pdf">
                    <FileText size={20} />
                    <div>
                      <strong>{pdf.name}</strong>
                      <span>{pdf.scanned
                        ? `${pdf.pages} ${pdf.pages === 1 ? 'Seite' : 'Seiten'} · eingescannt, wird als Bild gelesen`
                        : `${pdf.pages} ${pdf.pages === 1 ? 'Seite' : 'Seiten'} · Text erkannt`}</span>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => { setPdf(null); setPdfImages([]) }} aria-label="PDF entfernen"><X size={15} /></button>
                  </div>
                )}
                {allImages.length >= MAX_IMAGES && <p className="field-hint">Maximal {MAX_IMAGES} Bilder pro Scan.</p>}
              </div>
            )}

            {pdf && pdf.pages > 1 && (
              <div className={`scan-range ${tooLong ? 'warn' : ''}`}>
                <label>
                  Seiten
                  <input type="number" min={1} max={pdf.pages} value={pdf.from} onChange={e => setRange({ from: e.target.value })} aria-label="Erste Seite" />
                </label>
                {pdf.scanned ? (
                  <span>bis {Math.min(pdf.pages, pdf.from + Math.max(1, MAX_IMAGES - images.length) - 1)}</span>
                ) : (
                  <label>
                    bis
                    <input type="number" min={pdf.from} max={pdf.pages} value={pdf.to} onChange={e => setRange({ to: e.target.value })} aria-label="Letzte Seite" />
                  </label>
                )}
                <span className="scan-range-info">
                  {pdf.scanned
                    ? `Eingescannte Seiten liest Lumi als Bilder, höchstens ${MAX_IMAGES} pro Scan.`
                    : tooLong
                      ? `${nf.format(combined.length)} Zeichen: zu viel für einen Scan. Lumi liest etwa bis Seite ${fitPages(pdf.pageTexts, pdf.from)}.`
                      : `${nf.format(pdfText.length)} Zeichen · passt in einen Scan`}
                </span>
              </div>
            )}

            {showText && (
              <label className="field scan-text">
                Text
                <textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="Notizen, Zusammenfassung oder Inhaltsverzeichnis einfügen …" />
              </label>
            )}

            {!isSummary && (
              <div className="field-row scan-target">
                <label className="field">
                  Wohin damit?
                  <select value={target} onChange={e => setTarget(e.target.value)}>
                    <option value="">Neues Fach (Lumi schlägt den Namen vor)</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>Zu «{s.name}» hinzufügen</option>)}
                  </select>
                </label>
              </div>
            )}
            {isSummary && presetTopic && (
              <p className="scan-for">
                Für das Thema <strong>{presetTopic.title}</strong>
                <button type="button" className="icon-btn" onClick={() => setSumTopic('')} aria-label="Thema nicht vorgeben"><X size={14} /></button>
              </p>
            )}

            {error && <p className="scan-error">{error}</p>}

            <div className="scan-foot">
              <span className="quiz-meta">
                {quotaLeft !== null ? `Heute noch ${quotaLeft} von ${SCAN_DAILY_LIMIT} Scans · ` : ''}Bilder werden nicht gespeichert
              </span>
              <button type="button" className="btn btn-primary" onClick={run} disabled={!material || !!busy || quotaLeft === 0}>
                {isSummary ? 'Zusammenfassen' : 'Scannen'}
              </button>
            </div>
          </>
        )}

        {step === 'working' && (
          <div className="scan-working" role="status" aria-live="polite">
            <div className="scan-stage">
              {allImages[0]
                ? <img src={allImages[0]} alt="" />
                : <div className="scan-paper">{combined.slice(0, 900)}</div>}
              <div className="scan-beam" aria-hidden="true" />
              <div className="scan-ff" aria-hidden="true"><Firefly expression="think" glasses size={64} /></div>
            </div>
            <p className="scan-status">{thinking[Math.min(tick, thinking.length - 1)]}</p>
          </div>
        )}

        {reviewing && !isSummary && (
          <>
            <div className="field-row scan-subject">
              {target ? (
                <p className="scan-into">Wird zu <strong>{subjectById(target)?.name}</strong> hinzugefügt.</p>
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
            {result.trimmed && <p className="scan-note">Das Material war länger als ein Scan schafft. Lumi hat den Anfang ausgewertet.</p>}

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
              <button type="button" className="btn btn-primary" onClick={savePlanResult} disabled={step === 'saving' || !pickedCount}>
                {step === 'saving' ? 'Wird angelegt …' : `${pickedCount} ${pickedCount === 1 ? 'Thema' : 'Themen'} anlegen`}
              </button>
            </div>
          </>
        )}

        {reviewing && isSummary && (
          <>
            <label className="field scan-sum-title">
              Titel
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
            </label>
            <div className="field-row scan-sum-target">
              <label className="field">
                Fach
                <select value={sumSubject} onChange={e => { setSumSubject(e.target.value); setSumTopic('') }}>
                  <option value="">Neues Fach{subjectName ? ` «${subjectName}»` : ''}</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {!sumSubject && (
                <label className="field">
                  Name des Fachs
                  <input value={subjectName} onChange={e => setSubjectName(e.target.value)} maxLength={60} />
                </label>
              )}
              <label className="field">
                Thema
                <select value={sumTopic} onChange={e => setSumTopic(e.target.value)}>
                  <option value="">Neues Thema «{(title || 'Zusammenfassung').slice(0, 40)}»</option>
                  {subjectTopics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </label>
            </div>
            {result.trimmed && <p className="scan-note">Das Material war länger als ein Scan schafft. Lumi hat den Anfang zusammengefasst; für den Rest mach einfach einen zweiten Scan.</p>}

            <div className="scan-sum-preview">
              <SummaryBody content={result.content} />
            </div>

            {error && <p className="scan-error">{error}</p>}

            <div className="scan-foot">
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={step === 'saving'}>
                <RotateCcw size={15} /> Neu scannen
              </button>
              <button type="button" className="btn btn-primary" onClick={saveSummaryResult} disabled={step === 'saving' || !title.trim()}>
                {step === 'saving' ? 'Wird gespeichert …' : 'Zusammenfassung speichern'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
