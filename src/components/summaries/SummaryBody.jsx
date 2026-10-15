import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// **fett** aus dem KI-Text als <strong> darstellen, ohne HTML zu parsen
export function Marked({ text }) {
  const parts = String(text || '').split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))
}

function Question({ q, i }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`sum-question ${open ? 'open' : ''}`}>
      <div className="sum-q">
        <span className="sum-q-num">{i + 1}</span>
        <p>{q.question}</p>
        <button type="button" className="btn btn-sm btn-ghost sum-reveal" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? <><EyeOff size={14} /> Verbergen</> : <><Eye size={14} /> Antwort</>}
        </button>
      </div>
      <p className="sum-answer">{q.answer}</p>
    </li>
  )
}

// Inhalt einer Zusammenfassung: Überblick, Abschnitte, Begriffe, Formeln, Kontrollfragen
export default function SummaryBody({ content }) {
  const c = content || {}
  return (
    <div className="sum-body">
      {c.overview && <p className="sum-overview"><Marked text={c.overview} /></p>}

      {(c.sections || []).map((sec, i) => (
        <section key={i} className="sum-section" style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}>
          <h3><span className="sum-num">{i + 1}</span>{sec.heading}</h3>
          <ul>{sec.points.map((p, j) => <li key={j}><Marked text={p} /></li>)}</ul>
        </section>
      ))}

      {c.terms?.length > 0 && (
        <section className="sum-block">
          <h3 className="sum-block-title">Begriffe</h3>
          <dl className="sum-terms">
            {c.terms.map((t, i) => (
              <div key={i} className="sum-term"><dt>{t.term}</dt><dd>{t.definition}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {c.formulas?.length > 0 && (
        <section className="sum-block">
          <h3 className="sum-block-title">Formeln und Regeln</h3>
          <div className="sum-formulas">
            {c.formulas.map((f, i) => (
              <div key={i} className="sum-formula">
                {f.name && <span className="sum-formula-name">{f.name}</span>}
                <code>{f.formula}</code>
                {f.note && <small>{f.note}</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      {c.questions?.length > 0 && (
        <section className="sum-block">
          <h3 className="sum-block-title">Teste dich</h3>
          <ol className="sum-questions">
            {c.questions.map((q, i) => <Question key={i} q={q} i={i} />)}
          </ol>
        </section>
      )}
    </div>
  )
}
