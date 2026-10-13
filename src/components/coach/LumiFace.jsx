import React from 'react'

// Lumi: ein kleines Licht mit Strahlenkranz. Gesicht wechselt mit der Stimmung.
// Reines SVG, Animationen (schweben, blinzeln, Strahlen) kommen aus dem CSS.
const EYES = {
  open: (
    <>
      <ellipse className="lumi-eye" cx="25.5" cy="30" rx="2.6" ry="3.2" />
      <ellipse className="lumi-eye" cx="38.5" cy="30" rx="2.6" ry="3.2" />
      <circle cx="26.4" cy="28.8" r="0.9" fill="#fff" />
      <circle cx="39.4" cy="28.8" r="0.9" fill="#fff" />
    </>
  ),
  smile: (
    <>
      <path d="M22.6 30.6 q2.9 -3.6 5.8 0" className="lumi-line" />
      <path d="M35.6 30.6 q2.9 -3.6 5.8 0" className="lumi-line" />
    </>
  ),
  closed: (
    <>
      <path d="M22.8 30.4 q2.7 2.2 5.4 0" className="lumi-line" />
      <path d="M35.8 30.4 q2.7 2.2 5.4 0" className="lumi-line" />
    </>
  ),
  up: (
    <>
      <ellipse className="lumi-eye" cx="26.5" cy="28.8" rx="2.4" ry="3" />
      <ellipse className="lumi-eye" cx="39.5" cy="28.8" rx="2.4" ry="3" />
      <circle cx="27.4" cy="27.4" r="0.9" fill="#fff" />
      <circle cx="40.4" cy="27.4" r="0.9" fill="#fff" />
    </>
  ),
}

const MOUTHS = {
  smile: <path d="M27.5 37 q4.5 4 9 0" className="lumi-line" />,
  grin: <path d="M26.5 36 q5.5 6.5 11 0 z" className="lumi-mouth-fill" />,
  small: <path d="M29.5 38 q2.5 1.6 5 0" className="lumi-line" />,
  flat: <path d="M29.5 38.3 h5" className="lumi-line" />,
  wobble: <path d="M28 39 q1.4 -1.4 2.8 0 q1.4 1.4 2.8 0 q1.4 -1.4 2.8 0" className="lumi-line" />,
  o: <ellipse cx="32" cy="38.4" rx="1.8" ry="2.1" className="lumi-mouth-fill" />,
}

const FACES = {
  happy: { eyes: 'open', mouth: 'smile' },
  calm: { eyes: 'open', mouth: 'small' },
  proud: { eyes: 'smile', mouth: 'grin' },
  cheer: { eyes: 'smile', mouth: 'grin' },
  thinking: { eyes: 'up', mouth: 'flat' },
  worried: { eyes: 'open', mouth: 'wobble', brows: true },
  sleepy: { eyes: 'closed', mouth: 'o' },
}

export default function LumiFace({ mood = 'calm', size = 56, busy = false, className = '' }) {
  const face = FACES[mood] || FACES.calm
  return (
    <svg
      className={`lumi lumi-${mood} ${busy ? 'lumi-busy' : ''} ${className}`}
      width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"
    >
      <defs>
        <radialGradient id="lumi-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffe3a3" />
          <stop offset="55%" stopColor="#f6bd57" />
          <stop offset="100%" stopColor="#e5942f" />
        </radialGradient>
        <radialGradient id="lumi-glow" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#f6bd57" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f6bd57" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="lumi-halo" cx="32" cy="33" r="31" fill="url(#lumi-glow)" />
      <g className="lumi-rays">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="30.6" y="2.5" width="2.8" height="6.5" rx="1.4" fill="#f0aa45" transform={`rotate(${i * 45} 32 33)`} />
        ))}
      </g>
      <g className="lumi-body">
        <circle cx="32" cy="33" r="19" fill="url(#lumi-body)" />
        <ellipse cx="25" cy="24" rx="5" ry="3" fill="#fff" opacity="0.35" transform="rotate(-25 25 24)" />
        <g className="lumi-eyes">{EYES[face.eyes]}</g>
        {face.brows && (
          <>
            <path d="M22.5 24.6 l5 -1.6" className="lumi-line" />
            <path d="M41.5 24.6 l-5 -1.6" className="lumi-line" />
          </>
        )}
        <circle cx="21" cy="36" r="2.6" fill="#ef8a5b" opacity="0.45" />
        <circle cx="43" cy="36" r="2.6" fill="#ef8a5b" opacity="0.45" />
        {MOUTHS[face.mouth]}
      </g>
      {mood === 'sleepy' && (
        <g className="lumi-z">
          <text x="47" y="16" fontSize="9" fontWeight="700">z</text>
          <text x="53" y="9" fontSize="6.5" fontWeight="700">z</text>
        </g>
      )}
      {(mood === 'proud' || mood === 'cheer') && (
        <g className="lumi-sparkles" fill="#f0aa45">
          <path d="M53 22 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
          <path d="M9 18 l0.9 2.2 2.2 0.9 -2.2 0.9 -0.9 2.2 -0.9 -2.2 -2.2 -0.9 2.2 -0.9z" />
        </g>
      )}
    </svg>
  )
}
