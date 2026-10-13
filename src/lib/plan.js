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
// Die Töne stammen aus der Palette in style.css.
export const GOAL_COLORS = {
  ink: { label: 'Graphit', hex: '#2c2825' },
  amber: { label: 'Bernstein', hex: '#9c6b1f' },
  sage: { label: 'Salbei', hex: '#4f7a63' },
  blue: { label: 'Blau', hex: '#1f6c9f' },
  rose: { label: 'Ziegel', hex: '#a8493c' },
  slate: { label: 'Stein', hex: '#7a7268' },
}

export function goalColor(goal) {
  return (GOAL_COLORS[goal?.color] || GOAL_COLORS.ink).hex
}

export const GOAL_KINDS = {
  topics: { label: 'Themen-Fortschritt', hint: 'Prozent der erledigten Themen in den zugeordneten Fächern' },
  hours: { label: 'Lernstunden', hint: 'Geloggte Timer-Stunden im Verhältnis zu einem Stundenziel' },
}
