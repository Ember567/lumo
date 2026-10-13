import React from 'react'
import { Sun } from 'lucide-react'

// Bildmarke von Lumo (Esperanto für "Licht").
export default function BrandMark({ className = '', size = 22 }) {
  return (
    <div className={className} aria-hidden="true">
      <Sun size={size} strokeWidth={2} />
    </div>
  )
}
