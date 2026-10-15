import { supabase } from '../supabaseClient.js'
import { STORAGE_PREFIX } from '../config.js'

// ------------------------------------------------------------
// Lernmaterial scannen: Foto, Bild, PDF oder Text → Fach mit Themen.
// Bilder werden im Browser verkleinert und nie gespeichert; in die
// Datenbank kommt nur der Text (Themen, Zusammenfassungen, Lernziele).
// ------------------------------------------------------------

export const SCAN_DAILY_LIMIT = 10 // = AI_SCAN_DAILY_LIMIT_USER der Edge Function (nur Anzeige)
export const MAX_IMAGES = 3

// Von überall den Scan-Dialog öffnen (Lernen, Planer, Lumi)
const OPEN = `${STORAGE_PREFIX}:open-scan`
export function requestScan(detail = {}) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail }))
}
export function onScanRequest(cb) {
  const h = e => cb(e.detail || {})
  window.addEventListener(OPEN, h)
  return () => window.removeEventListener(OPEN, h)
}

// Foto verkleinern: längste Seite max. 1600 px, JPEG. Aus 4–8 MB werden ~300 KB.
export async function compressImage(file, max = 1600, quality = 0.82) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'))
      img.src = URL.createObjectURL(file)
    })
  }
  const w = source.width, h = source.height
  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

// PDF: Text auslesen. Hat das PDF keinen Text (eingescannt), werden die
// ersten Seiten als Bilder gerendert und wie Fotos behandelt.
export async function readPdf(file, { maxPages = 20, maxChars = 24000 } = {}) {
  // "legacy"-Build: bringt Polyfills mit, läuft damit auch in älteren Safari-Versionen
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  const pages = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= pages && text.length < maxChars; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(it => it.str).join(' ').replace(/\s+/g, ' ') + '\n\n'
  }
  text = text.trim().slice(0, maxChars)
  if (text.length >= 200) return { text, images: [], pages: doc.numPages }

  const images = []
  for (let i = 1; i <= Math.min(doc.numPages, MAX_IMAGES); i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2, 1600 / Math.max(viewport.width, viewport.height))
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.82))
  }
  return { text: '', images, pages: doc.numPages }
}

export async function scanMaterial({ images = [], text = '', hint = '' }) {
  const { data, error } = await supabase.functions.invoke('scan', { body: { images, text, hint } })
  if (error) {
    let message = ''
    try { message = (await error.context.json())?.message || '' } catch { /* keine JSON-Antwort */ }
    throw new Error(message || 'Das Material konnte gerade nicht ausgewertet werden. Bitte versuch es nochmal.')
  }
  return data
}

// Ergebnis anlegen: neues Fach oder bestehendes, dazu Themen mit
// Zusammenfassung (notes) und Lernzielen (Unterthemen).
export async function savePlan(userId, { subjectId, newSubject, topics }) {
  let sid = subjectId
  if (!sid) {
    const { data: last } = await supabase.from('plan_subjects').select('sort_order').eq('user_id', userId)
      .order('sort_order', { ascending: false }).limit(1)
    const { data, error } = await supabase.from('plan_subjects').insert({
      user_id: userId,
      name: newSubject.name.trim() || 'Neues Fach',
      priority: newSubject.priority || 'mittel',
      goal_id: newSubject.goalId || null,
      sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    }).select('id').single()
    if (error) throw new Error('Das Fach konnte nicht angelegt werden.')
    sid = data.id
  }

  const { data: lastTopic } = await supabase.from('plan_topics').select('sort_order').eq('user_id', userId).eq('subject_id', sid)
    .order('sort_order', { ascending: false }).limit(1)
  const base = (lastTopic?.[0]?.sort_order ?? -1) + 1
  const { data: created, error } = await supabase.from('plan_topics').insert(topics.map((t, i) => ({
    user_id: userId,
    subject_id: sid,
    title: t.title.trim(),
    category: t.category?.trim() || null,
    notes: t.summary?.trim() || null,
    sort_order: base + i,
  }))).select('id, title')
  if (error) throw new Error('Die Themen konnten nicht angelegt werden.')

  const subtasks = created.flatMap((row, i) => (topics[i].goals || []).filter(Boolean).map((g, j) => ({
    user_id: userId, topic_id: row.id, title: g, sort_order: j,
  })))
  if (subtasks.length) await supabase.from('plan_subtasks').insert(subtasks)
  return { subjectId: sid, topics: created }
}
