import React from 'react'
import GoalsEditor from './GoalsEditor.jsx'
import PhasesEditor from './PhasesEditor.jsx'
import SubjectsEditor from './SubjectsEditor.jsx'
import DeadlinesEditor from './DeadlinesEditor.jsx'
import WeeksEditor from './WeeksEditor.jsx'

const TABS = [
  { id: 'goals', label: 'Ziele', component: GoalsEditor, hint: 'Wofür lernst du? Jedes Ziel hat ein optionales Prüfungsdatum und misst Fortschritt über Themen oder Lernstunden.' },
  { id: 'subjects', label: 'Fächer & Themen', component: SubjectsEditor, hint: 'Gliedere den Stoff in Fächer, Themen und Unterthemen. Abgehakt wird im Bereich Lernen.' },
  { id: 'phases', label: 'Phasen', component: PhasesEditor, hint: 'Grosse Etappen mit Start und Ende — Grundlage für Zeitstrahl und Soll/Ist-Vergleich.' },
  { id: 'weeks', label: 'Wochenplan', component: WeeksEditor, hint: 'Lege pro Woche einen Haupt- und optional einen Nebenfokus fest.' },
  { id: 'deadlines', label: 'Fristen', component: DeadlinesEditor, hint: 'Anmeldeschlüsse, Abgaben, Prüfungstage — einzeln oder als Zeitraum.' },
]

export default function Planner({ userId, tab, onTabChange }) {
  const active = TABS.find(t => t.id === tab) || TABS[0]
  const Editor = active.component

  return (
    <div className="plan-section">
      <div className="planner-tabs" role="tablist" aria-label="Planer-Bereiche">
        {TABS.map(t => (
          <button
            key={t.id} type="button" role="tab" aria-selected={t.id === active.id}
            className={`planner-tab ${t.id === active.id ? 'active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="planner-hint">{active.hint}</p>
      <Editor key={active.id} userId={userId} onTabChange={onTabChange} />
    </div>
  )
}
