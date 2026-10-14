import { STORAGE_PREFIX } from '../config.js'

// ------------------------------------------------------------
// Lumi-Ereignisse: Komponenten melden, was gerade passiert,
// das Glühwürmchen entscheidet selbst, wie es reagiert.
//
//   lumiEmit('topic-done', { el, title, subjectName, openInSubject, subjectDone })
//   lumiEmit('subtask-done', { el })
//   lumiEmit('topic-undone', { el })
//   lumiEmit('timer-start', { el }) · ('timer-pause') · ('timer-saved', { minutes }) · ('timer-cancel')
//   lumiEmit('quiz-answer', { el, correct }) · ('quiz-finish', { el, pct })
//   lumiEmit('milestone', { goalName, pct })
//   lumiEmit('section', { section })
//   lumiEmit('task-done', { el })
// ------------------------------------------------------------
const EVENT = `${STORAGE_PREFIX}:lumi-event`

export function lumiEmit(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail } }))
}

export function onLumiEvent(cb) {
  const handler = e => cb(e.detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

// ------------------------------------------------------------
// Sprüche. Platzhalter in {geschweiften Klammern}.
// ------------------------------------------------------------
export const QUIPS = {
  topicDone: ['Abgehakt!', 'Zack, erledigt.', 'Das sitzt.', 'Ein Thema weniger!', 'Schön! Noch {open} offen in {subject}.', 'Weiter so, {subject} schrumpft.'],
  subjectDone: ['Ganzes Fach {subject} erledigt! Ich leuchte vor Stolz.', '{subject} komplett! Was für ein Licht!'],
  subtaskDone: ['Stück für Stück.', 'Gut!', 'Weiter so.', 'Läuft.'],
  undone: ['Oh, doch nochmal?', 'Kein Problem, wieder offen.'],
  timerStart: ['Ich lese mit.', 'Fokus an. Ich bin ganz leise.', 'Los gehts, ich halte das Licht.', 'Ich setz mich dazu.'],
  timerPause: ['Kurze Pause. Ich warte hier.', 'Durchatmen.'],
  timerSaved: ['{min} Minuten! Ich leuchte gleich heller.', 'Stark, {min} Minuten gelernt.', '{min} Minuten mehr Licht für mich.'],
  quizRight: ['Richtig!', 'Genau!', 'Volltreffer.', 'Stimmt!', 'Sitzt!'],
  quizWrong: ['Autsch.', 'Knapp daneben.', 'Lies die Erklärung, dann sitzt es.', 'Hoppla.'],
  quizGood: ['{pct} %! Das kannst du.', 'Wow, {pct} %. Ich mach einen Looping.'],
  quizMid: ['{pct} %. Die Fehler schauen wir uns nochmal an?', 'Gar nicht schlecht, {pct} %.'],
  quizLow: ['{pct} %. Kein Drama, dafür üben wir ja.', 'Das Thema braucht noch etwas Licht.'],
  milestone: ['{goal}: {pct} %! Ein neuer Meilenstein!', '{pct} % bei {goal}. Ich glühe!'],
  taskDone: ['Erledigt. Eine Sorge weniger.', 'Abgehakt!'],
  poke: ['Hihi, das kitzelt.', 'Hey!', 'Psst, ich bin es nur.', 'Brauchst du mich? Tipp mich an.'],
  dodge: ['Fang mich doch!', 'Zu langsam!', 'Huch!'],
  wake: ['Hm? Ich war kurz weg …', 'Gähn. Ich bin wach!'],
  section: {
    quiz: ['Brille auf. Ich frag mit.', 'Abfragezeit! Ich drück dir die Fühler.'],
    planner: ['Gute Pläne brauchen gutes Licht.', 'Planen? Ich halte die Laterne.'],
    organisation: ['Fristen behalte ich im Auge.'],
    settings: ['Hier kannst du mich auch in den Ruhemodus schicken.'],
  },
  tourTopic: ['«{title}» sieht spannend aus.', 'Hier ist noch «{title}» offen.'],
}

const lastPick = {}
export function quip(key, vars = {}) {
  const path = key.split('.')
  let list = QUIPS
  for (const p of path) list = list?.[p]
  if (!Array.isArray(list) || !list.length) return ''
  // Nicht zweimal hintereinander derselbe Spruch, und nur Sprüche, deren Platzhalter gefüllt sind.
  const usable = list.filter(t => [...t.matchAll(/\{(\w+)\}/g)].every(m => vars[m[1]] !== undefined && vars[m[1]] !== ''))
  const pool = (usable.length ? usable : list).filter(t => t !== lastPick[key])
  const text = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))]
  lastPick[key] = text
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

// ---- Einstellungen pro Gerät ----
const quietKey = `${STORAGE_PREFIX}:lumi-quiet`
export function isLumiQuiet() {
  try { return localStorage.getItem(quietKey) === 'true' } catch { return false }
}
export function setLumiQuiet(quiet) {
  try { localStorage.setItem(quietKey, String(quiet)) } catch { /* ignorieren */ }
  window.dispatchEvent(new CustomEvent(`${STORAGE_PREFIX}:lumi-visibility`))
}

export function timerRunning(userId) {
  try {
    const t = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:timer`))
    return t?.userId === userId && !!t.timer?.startedAt
  } catch { return false }
}
