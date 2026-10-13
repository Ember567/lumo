import React, { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { friendlyError } from '../../lib/useTable.js'

// Inline-Felder im Notion-Stil: Text speichert beim Verlassen des Feldes
// (oder Enter), Datum/Auswahl speichern sofort beim Ändern.

export function InlineText({ value, onSave, placeholder, label, required = false, multiline = false, className = '' }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { setDraft(value ?? '') }, [value])

  function commit() {
    const next = draft.trim()
    if (required && !next) { setDraft(value ?? ''); return }
    if (next !== (value ?? '')) onSave(next || null)
  }

  const props = {
    className: `inline-field ${className}`,
    value: draft,
    placeholder,
    'aria-label': label,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: e => {
      if (e.key === 'Enter' && !multiline) e.currentTarget.blur()
      if (e.key === 'Escape') { setDraft(value ?? ''); e.currentTarget.blur() }
    },
  }
  return multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />
}

export function InlineDate({ value, onSave, label, required = false }) {
  return (
    <input
      type="date" className="inline-field inline-date" aria-label={label}
      value={value || ''} required={required}
      onChange={e => {
        if (required && !e.target.value) return
        onSave(e.target.value || null)
      }}
    />
  )
}

export function InlineNumber({ value, onSave, label, min = 1 }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { setDraft(value ?? '') }, [value])
  return (
    <input
      type="number" min={min} step="1" className="inline-field inline-number" aria-label={label}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (draft === '' || !(n >= min)) { setDraft(value ?? ''); return }
        if (n !== Number(value)) onSave(n)
      }}
    />
  )
}

export function InlineSelect({ value, onSave, options, label, className = '' }) {
  return (
    <select
      className={`inline-field inline-select ${className}`} aria-label={label}
      value={value ?? ''} onChange={e => onSave(e.target.value || null)}
    >
      {options.map(o => <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>)}
    </select>
  )
}

export function DeleteButton({ onConfirm, what, confirmText }) {
  return (
    <button
      type="button" className="icon-btn danger" aria-label={`${what} löschen`} title={`${what} löschen`}
      onClick={() => { if (window.confirm(confirmText || `${what} wirklich löschen?`)) onConfirm() }}
    >
      <Trash2 size={15} strokeWidth={2} />
    </button>
  )
}

export function ErrorNote({ message }) {
  if (!message) return null
  return <p className="form-error" role="alert">{friendlyError(message)}</p>
}

export function EmptyNote({ children }) {
  return <p className="timeline-empty">{children}</p>
}
