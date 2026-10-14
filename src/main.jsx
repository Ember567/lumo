import React from 'react'
// Schriften selbst gehostet (keine Anfragen an Google, schneller, datenschutzfreundlich)
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/caveat/600.css'
import '@fontsource/caveat/700.css'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
