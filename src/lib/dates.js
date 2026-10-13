// Datums-Helfer. Spalten vom Typ `date` kommen als "YYYY-MM-DD" aus der DB.
// `new Date("2027-08-09")` würde das als UTC-Mitternacht lesen und je nach
// Zeitzone auf den Vortag kippen — darum wird hier immer lokal geparst.

export function parseDate(str) {
  if (!str) return null
  if (str instanceof Date) return new Date(str)
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function toISODate(date) {
  const d = date instanceof Date ? date : parseDate(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : parseDate(date)
  d.setDate(d.getDate() + days)
  return d
}

export function diffDays(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / 86400000)
}

export function daysUntil(dateStr) {
  return Math.max(0, diffDays(dateStr, today()))
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sonntag
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

export function isWithin(date, start, end) {
  const d = parseDate(date)
  return parseDate(start) <= d && d <= parseDate(end)
}

export function currentPhaseOf(phases) {
  const t = today()
  return phases.find(p => isWithin(t, p.start_date, p.end_date)) || null
}

const DATE_FMT = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
const SHORT_FMT = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit' })
const LONG_FMT = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const fmtDate = str => (str ? DATE_FMT.format(parseDate(str)) : '')
export const fmtShort = date => SHORT_FMT.format(date instanceof Date ? date : parseDate(date))
export const fmtLong = date => LONG_FMT.format(date)

export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h ${m}m`
}
