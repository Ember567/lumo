import React from 'react'
import { Sun, ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react'
import { APP_NAME } from '../config.js'

export default function Sidebar({ sections, active, onChange, collapsed, onToggleCollapse, onLogout, mobileOpen, onCloseMobile }) {
  const expanded = !collapsed || mobileOpen

  function selectSection(id) {
    onChange(id)
    onCloseMobile()
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <Sun className="sidebar-logo-mark" size={20} strokeWidth={2} aria-hidden="true" />
          {expanded && <span className="brand">{APP_NAME}</span>}
        </div>

        <nav className="sidebar-nav">
          {sections.map(s => (
            <button
              key={s.id}
              type="button"
              className={`sidebar-nav-item ${active === s.id ? 'active' : ''}`}
              data-lumi-nav={s.id}
              onClick={() => selectSection(s.id)}
              title={!expanded ? s.label : undefined}
            >
              <s.icon className="sidebar-nav-icon" size={19} strokeWidth={2} />
              {expanded && <span className="sidebar-nav-label">{s.label}</span>}
              {!expanded && <span className="sidebar-tooltip">{s.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={mobileOpen ? onCloseMobile : onToggleCollapse}
            title={!expanded ? 'Sidebar ausklappen' : undefined}
          >
            {mobileOpen ? <X size={18} strokeWidth={2} /> : collapsed ? <ChevronRight size={18} strokeWidth={2} /> : <ChevronLeft size={18} strokeWidth={2} />}
            {expanded && <span>{mobileOpen ? 'Schliessen' : 'Einklappen'}</span>}
            {!expanded && <span className="sidebar-tooltip">Ausklappen</span>}
          </button>

          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={onLogout}
            title={!expanded ? 'Abmelden' : undefined}
          >
            <LogOut size={18} strokeWidth={2} />
            {expanded && <span>Abmelden</span>}
            {!expanded && <span className="sidebar-tooltip">Abmelden</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
