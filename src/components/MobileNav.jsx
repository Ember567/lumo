import React, { useEffect, useState } from 'react'
import { MoreHorizontal, LogOut, X } from 'lucide-react'

// Untere Tab-Leiste fürs Handy: die vier Alltags-Bereiche direkt, der Rest unter «Mehr».
const MAIN = ['overview', 'learning', 'quiz', 'organisation']
const SHORT = { overview: 'Übersicht', learning: 'Lernen', quiz: 'Abfragen', organisation: 'Orga' }
const ACCENT = {
  overview: 'var(--sun)', learning: 'var(--mint)', quiz: 'var(--pink)', planner: 'var(--sky)',
  organisation: 'var(--butter)', links: 'var(--lilac)', settings: 'var(--butter)',
}

export default function MobileNav({ sections, active, onChange, onLogout }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const main = sections.filter(s => MAIN.includes(s.id))
  const more = sections.filter(s => !MAIN.includes(s.id))
  const moreActive = more.some(s => s.id === active)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = e => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  function go(id) {
    setMoreOpen(false)
    onChange(id)
  }

  return (
    <>
      {moreOpen && (
        <div className="mnav-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="mnav-sheet" role="dialog" aria-label="Weitere Bereiche" onClick={e => e.stopPropagation()}>
            <div className="mnav-sheet-head">
              <strong>Mehr</strong>
              <button type="button" className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Schliessen"><X size={18} /></button>
            </div>
            {more.map(s => (
              <button
                key={s.id} type="button"
                className={`mnav-sheet-item ${active === s.id ? 'active' : ''}`}
                style={{ '--tab-accent': ACCENT[s.id] }}
                onClick={() => go(s.id)}
              >
                <span className="mnav-sheet-icon"><s.icon size={20} strokeWidth={2} /></span>
                {s.label}
              </button>
            ))}
            <button type="button" className="mnav-sheet-item mnav-logout" onClick={onLogout}>
              <span className="mnav-sheet-icon"><LogOut size={20} strokeWidth={2} /></span>
              Abmelden
            </button>
          </div>
        </div>
      )}

      <nav className="mobile-tabbar" aria-label="Hauptnavigation">
        {main.map(s => (
          <button
            key={s.id} type="button"
            className={`mnav-tab ${active === s.id ? 'active' : ''}`}
            style={{ '--tab-accent': ACCENT[s.id] }}
            data-lumi-nav-mobile={s.id}
            aria-current={active === s.id ? 'page' : undefined}
            onClick={() => go(s.id)}
          >
            <span className="mnav-pill"><s.icon size={21} strokeWidth={2} /></span>
            <span className="mnav-label">{SHORT[s.id]}</span>
          </button>
        ))}
        <button
          type="button"
          className={`mnav-tab ${moreActive || moreOpen ? 'active' : ''}`}
          style={{ '--tab-accent': ACCENT[moreActive ? active : 'planner'] }}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="mnav-pill"><MoreHorizontal size={21} strokeWidth={2} /></span>
          <span className="mnav-label">Mehr</span>
        </button>
      </nav>
    </>
  )
}
