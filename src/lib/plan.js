// Gemeinsame Konstanten des Plan-Modells.

export const PRIORITIES = ['sehr hoch', 'hoch', 'mittel', 'niedrig']
export const PRIORITY_ORDER = { 'sehr hoch': 0, hoch: 1, mittel: 2, niedrig: 3 }

export function priorityClass(priority) {
  return (priority || 'mittel').replace(/\s+/g, '-')
}

export function sortSubjects(list) {
  return [...list].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || a.sort_order - b.sort_order
  )
}

// Ziel-Farben. Hex-Werte, weil Recharts-SVG-Attribute keine CSS-Variablen lesen.
// hex = Füllfarbe (Balken, Punkte), line = dunklere Variante für Linien in Diagrammen.
// Die Schlüssel bleiben stabil, weil sie in der Datenbank stehen.
export const GOAL_COLORS = {
  ink: { label: 'Tinte', hex: '#1E1B2E', line: '#1E1B2E' },
  amber: { label: 'Sonne', hex: '#F7CB46', line: '#B98A00' },
  sage: { label: 'Minze', hex: '#99E885', line: '#2E9B4E' },
  blue: { label: 'Himmel', hex: '#7FDCEF', line: '#1C8DAA' },
  rose: { label: 'Kaugummi', hex: '#FE90E8', line: '#C23FA8' },
  slate: { label: 'Butter', hex: '#FFDC8B', line: '#B07A12' },
}

export function goalColor(goal) {
  return (GOAL_COLORS[goal?.color] || GOAL_COLORS.ink).hex
}

export function goalLine(goal) {
  return (GOAL_COLORS[goal?.color] || GOAL_COLORS.ink).line
}

export const GOAL_KINDS = {
  topics: { label: 'Themen-Fortschritt', hint: 'Prozent der erledigten Themen in den zugeordneten Fächern' },
  hours: { label: 'Lernstunden', hint: 'Geloggte Timer-Stunden im Verhältnis zu einem Stundenziel' },
}
