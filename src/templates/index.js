import { addDays, diffDays, startOfWeek, toISODate } from '../lib/dates.js'
import passerelleEms from './passerelle-ems.json'
import semester from './semester.json'

// Neue Vorlagen: JSON-Datei im selben Format ablegen und hier eintragen.
export const TEMPLATES = [passerelleEms, semester]

// Vorschlag für das Startdatum: feste Termine (z.B. Prüfungssessionen) bleiben
// auf ihrem Originaldatum, Beispielpläne starten am nächsten Montag.
export function defaultStartDate(template) {
  if (!template.startsNextMonday) return template.anchorDate
  return toISODate(addDays(startOfWeek(new Date()), 7))
}

export function shiftDaysFor(template, startDate) {
  return diffDays(startDate, template.anchorDate)
}

export function templateStats(template) {
  return {
    subjects: template.subjects.length,
    topics: template.topics.length,
    phases: template.phases.length,
    weeks: template.weeks.length,
  }
}
