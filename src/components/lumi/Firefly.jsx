import React from 'react'

// Lumi als Glühwürmchen, Blick nach rechts. Gespiegelt wird von aussen.
// Aufbau wie ein echtes Glühwürmchen: leuchtender Hinterleib (Laterne),
// dunkle Flügeldecken, oranges Halsschild, kleiner Kopf mit grossen Augen.
// expression: normal | happy | wide | closed | sad | think
// Pupillen folgen --px/--py (gesetzt vom Controller), Leuchtkraft über --glow.
const EYE_A = { cx: 44.2, cy: 29.6 }
const EYE_B = { cx: 50.6, cy: 29.2 }

export default function Firefly({ expression = 'normal', glasses = false, book = false, cap = false, size = 56 }) {
  const eyes = {
    normal: <><Eye {...EYE_A} /><Eye {...EYE_B} small /></>,
    think: <><Eye {...EYE_A} look="up" /><Eye {...EYE_B} small look="up" /></>,
    wide: <><Eye {...EYE_A} wide /><Eye {...EYE_B} small wide /></>,
    sad: (
      <>
        <Eye {...EYE_A} look="down" /><Eye {...EYE_B} small look="down" />
        <path d="M41.2 25.4 l4.6 -1.6" className="ff-line" />
        <path d="M53 24.8 l-3.8 -1.2" className="ff-line" />
      </>
    ),
    happy: <><path d="M41.4 30 q2.8 -3.4 5.6 0" className="ff-line" /><path d="M48.4 29.6 q2.3 -2.8 4.6 0" className="ff-line" /></>,
    closed: <><path d="M41.6 29.8 q2.6 2 5.2 0" className="ff-line" /><path d="M48.6 29.4 q2.1 1.6 4.2 0" className="ff-line" /></>,
  }[expression] || null

  const mouth = {
    happy: <path d="M45.6 34 q2.4 2.8 4.8 0 z" className="ff-mouth" />,
    wide: <ellipse cx="48" cy="34.8" rx="1.3" ry="1.6" className="ff-mouth" />,
    sad: <path d="M46 35.6 q2 -1.6 4 0" className="ff-line" />,
    closed: <ellipse cx="48" cy="34.8" rx="0.9" ry="1.1" className="ff-mouth" />,
  }[expression] || <path d="M46 34.4 q2 1.6 4 0" className="ff-line" />

  return (
    <svg className="ff" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="ff-lantern" cx="40%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#fffff0" />
          <stop offset="40%" stopColor="#f6f59a" />
          <stop offset="100%" stopColor="#d6dd52" />
        </radialGradient>
        <radialGradient id="ff-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f3f77a" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#ffe45c" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffd84a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ff-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5d4433" />
          <stop offset="100%" stopColor="#3b2a1f" />
        </linearGradient>
      </defs>

      {/* Lichthof um die Laterne */}
      <circle className="ff-aura" cx="17" cy="39" r="22" fill="url(#ff-aura)" />

      {/* durchsichtige Hinterflügel (schlagen beim Fliegen) */}
      <g className="ff-wing ff-wing-back">
        <ellipse cx="22" cy="19" rx="6" ry="12" transform="rotate(-34 28 29)" />
      </g>
      <g className="ff-wing ff-wing-front">
        <ellipse cx="28" cy="17.5" rx="6.4" ry="12.5" transform="rotate(-18 30 29)" />
      </g>

      {/* Beinchen */}
      <g className="ff-legs">
        <path d="M27 39.5 l-2 5" /><path d="M31.5 40.5 l-0.4 5.4" /><path d="M36 39.5 l1.4 5" />
      </g>

      {/* Laterne: der leuchtende Hinterleib */}
      <g className="ff-lantern">
        <ellipse cx="16.5" cy="38.5" rx="11.5" ry="9.2" fill="url(#ff-lantern)" transform="rotate(16 16.5 38.5)" />
        <path d="M21.8 31.6 q-3 7 0.2 14" className="ff-seg" />
      </g>

      {/* Flügeldecken (dunkler Käferpanzer) */}
      <path className="ff-shell" d="M19.5 33.2 q6.5 -9.8 19 -6.2 q2.4 5.4 -1.2 11.4 q-10.6 4.4 -19.4 -0.6 q-1 -2.4 1.6 -4.6z" fill="url(#ff-shell)" />
      <path d="M22.6 32 q6.2 -6.4 14.4 -4" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M29 28.2 q0.6 6 -0.4 11.4" stroke="#2b1d14" strokeOpacity="0.55" strokeWidth="0.9" fill="none" />

      {/* Halsschild, orange wie beim echten Glühwürmchen */}
      <ellipse cx="39.6" cy="30" rx="5.4" ry="5.6" fill="#ec7d43" />
      <ellipse cx="39.2" cy="29.4" rx="1.8" ry="2.2" fill="#3b2a1f" opacity="0.55" />

      {/* Kopf */}
      <circle cx="47" cy="31" r="8.6" fill="#55402f" />
      <ellipse cx="44.6" cy="26.6" rx="3" ry="1.6" fill="#fff" opacity="0.15" transform="rotate(-20 44.6 26.6)" />
      <circle cx="42.6" cy="34.6" r="1.6" fill="#f08f7a" opacity="0.6" />
      <circle cx="53.2" cy="33.8" r="1.3" fill="#f08f7a" opacity="0.55" />

      {/* Fühler mit Leuchtpünktchen */}
      <g className="ff-antennae">
        <path d="M44.4 23.2 q-3 -7.6 -8.4 -10" className="ff-ant" />
        <path d="M49.6 23 q2 -8 7.2 -11" className="ff-ant" />
        <circle cx="35.6" cy="12.8" r="1.8" className="ff-bulb" />
        <circle cx="57.2" cy="11.6" r="1.8" className="ff-bulb" />
      </g>

      <g className="ff-face">
        {eyes}
        {mouth}
      </g>

      {glasses && (
        <g className="ff-glasses">
          <circle cx={EYE_A.cx} cy={EYE_A.cy} r="4.3" /><circle cx={EYE_B.cx + 0.2} cy={EYE_B.cy} r="3.5" />
          <path d="M48.5 29.4 h-0.1" /><path d="M39.9 29.2 l-2.6 -1.2" />
        </g>
      )}

      {cap && (
        <g className="ff-cap">
          <path d="M38.6 25.4 q6.4 -9 17 -2.6 q-2.2 -7 -11.6 -6.2 q-5.2 0.8 -5.4 8.8z" fill="#5b7bb5" />
          <path d="M38.2 25.6 q8.6 -2.6 17.6 -2.8" stroke="#e8eef8" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="56.2" cy="17" r="2.3" fill="#e8eef8" />
        </g>
      )}

      {book && (
        <g className="ff-book">
          <path d="M43 41 l6 -1.5 l6 1.5 v7.8 l-6 -1.5 l-6 1.5z" fill="#fdfdfc" stroke="#8f6b4e" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M49 39.5 v7.8" stroke="#8f6b4e" strokeWidth="1" />
          <path d="M44.6 42.8 l2.8 -0.7 M44.6 44.7 l2.8 -0.7 M50.6 42.1 l2.8 0.7 M50.6 44 l2.8 0.7" stroke="#c9b8a6" strokeWidth="0.8" />
        </g>
      )}
    </svg>
  )
}

function Eye({ cx, cy, small = false, wide = false, look }) {
  const r = (small ? 2.7 : 3.3) * (wide ? 1.18 : 1)
  const pr = (small ? 1.5 : 1.8) * (wide ? 0.72 : 1)
  const dy = look === 'up' ? -1 : look === 'down' ? 0.9 : 0
  const dx = look === 'up' ? 0.7 : 0
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fff" />
      <g className="ff-pupil">
        <circle cx={cx + 0.4 + dx} cy={cy + 0.3 + dy} r={pr} fill="#1f150e" />
        <circle cx={cx + 0.95 + dx} cy={cy - 0.45 + dy} r={pr * 0.38} fill="#fff" />
      </g>
    </g>
  )
}
