import React, { useEffect, useRef, useState } from 'react'
import { Check, X, ArrowRight, RotateCcw, Sparkles, Repeat } from 'lucide-react'
import { generateQuiz, saveAttempt, scoreClass, pct, reshuffle } from '../../lib/quiz.js'
import { notifyPlanChanged } from '../../lib/progress.js'
import { lumiEmit } from '../../lib/lumi.js'

const LETTERS = ['A', 'B', 'C', 'D']
const KEY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }

const MODE_LABEL = {
  topic: 'Themen-Abfrage',
  subject: 'Fach-Abfrage',
  mistakes: 'Fehler wiederholen',
  retry: 'Falsche nochmal',
}

// Eine Abfrage, Frage für Frage: antworten → sofort sehen, ob es stimmt,
// Erklärung lesen → weiter. Am Ende Auswertung mit allen Fragen.
//
// target: { mode, topicId?, subjectId?, label, subjectName?, count, questions? }
//   mode 'topic' | 'subject'   → Fragen kommen von der KI, Ergebnis wird gespeichert
//   mode 'mistakes' | 'retry'  → Fragen sind schon da (kein KI-Aufruf, nichts gespeichert)
export default function QuizSession({ userId, target, onExit, onQuota }) {
  const [current, setCurrent] = useState(target)
  const [phase, setPhase] = useState('loading') // loading | answering | result | error
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [index, setIndex] = useState(0)
  const [remaining, setRemaining] = useState(null)
  const [error, setError] = useState('')
  const rootRef = useRef(null)
  const nextRef = useRef(null)
  const requestId = useRef(0)
  const started = useRef(false)

  const usesAi = current.mode === 'topic' || current.mode === 'subject'

  // Jede KI-Anfrage kostet Kontingent: der Ref verhindert im StrictMode eine zweite.
  useEffect(() => {
    if (started.current) return
    started.current = true
    begin(target)
  }, [])

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [current])

  async function begin(t) {
    const id = ++requestId.current
    setCurrent(t)
    setIndex(0)
    setError('')
    if (t.questions) {
      start(t.questions.map(reshuffle))
      return
    }
    setPhase('loading')
    try {
      const data = await generateQuiz({ topicId: t.topicId, subjectId: t.subjectId, count: t.count })
      if (id !== requestId.current) return
      setRemaining(data.remaining)
      onQuota?.(data.remaining)
      start(data.questions)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err.message)
      setPhase('error')
    }
  }

  function start(list) {
    setQuestions(list)
    setAnswers(Array(list.length).fill(null))
    setIndex(0)
    setPhase('answering')
  }

  const q = questions[index]
  const chosen = answers[index]
  const revealed = chosen !== null && chosen !== undefined
  const isLast = index === questions.length - 1
  const correctCount = questions.filter((qq, i) => answers[i] === qq.correct_index).length
  const score = pct(correctCount, questions.length)
  const wrongQuestions = questions.filter((qq, i) => answers[i] !== qq.correct_index)

  function choose(oi, el) {
    if (phase !== 'answering' || revealed) return
    setAnswers(list => list.map((a, i) => (i === index ? oi : a)))
    lumiEmit('quiz-answer', { el: el || rootRef.current?.querySelectorAll('.quiz-option')[oi], correct: oi === q.correct_index })
  }

  useEffect(() => {
    if (revealed) nextRef.current?.focus({ preventScroll: true })
  }, [revealed, index])

  async function next() {
    if (!revealed) return
    if (!isLast) { setIndex(i => i + 1); return }
    if (usesAi) {
      await saveAttempt(userId, { topicId: current.topicId, subjectId: current.subjectId, questions, answers })
      notifyPlanChanged()
    }
    setPhase('result')
    const right = questions.filter((qq, i) => answers[i] === qq.correct_index).length
    lumiEmit('quiz-finish', { el: rootRef.current, pct: pct(right, questions.length) })
  }

  // Tastatur: 1–4 bzw. A–D wählt, Enter geht weiter.
  useEffect(() => {
    function onKey(e) {
      if (phase !== 'answering' || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (k in KEY_TO_INDEX && !revealed) { e.preventDefault(); choose(KEY_TO_INDEX[k]) }
      else if (k === 'enter' && revealed && e.target.tagName !== 'BUTTON') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function retryWrong() {
    begin({ ...current, mode: 'retry', questions: wrongQuestions, parent: current.parent || current })
  }

  function again() {
    const base = current.parent || current
    if (base.mode === 'mistakes') begin({ ...base, questions: base.questions })
    else begin({ ...base, questions: undefined })
  }

  return (
    <section className="card quiz-session" ref={rootRef} aria-live="polite">
      <div className="quiz-session-head">
        <div>
          <span className="quiz-eyebrow"><Sparkles size={13} strokeWidth={2} /> {MODE_LABEL[current.mode]}</span>
          <h2>{current.label}</h2>
          {current.subjectName && current.subjectName !== current.label && <span className="quiz-session-sub">{current.subjectName}</span>}
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onExit}>
          {phase === 'result' ? 'Fertig' : 'Beenden'}
        </button>
      </div>

      {phase === 'loading' && (
        <div className="quiz-loading" role="status">
          <span className="quiz-spinner" aria-hidden="true" />
          Die KI stellt deine Fragen zusammen …
        </div>
      )}

      {phase === 'error' && (
        <div className="quiz-error">
          <p>{error}</p>
          <div className="quiz-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onExit}>Zurück</button>
            {!/heute|morgen|eingerichtet/i.test(error) && <button type="button" className="btn btn-sm btn-primary" onClick={() => begin(current)}>Nochmal versuchen</button>}
          </div>
        </div>
      )}

      {(phase === 'answering' || phase === 'result') && (
        <div className="quiz-steps" aria-hidden="true">
          {questions.map((qq, i) => {
            const a = answers[i]
            const state = a === null || a === undefined ? (i === index && phase === 'answering' ? 'now' : '') : a === qq.correct_index ? 'right' : 'wrong'
            return <span key={i} className={`quiz-step ${state}`} />
          })}
        </div>
      )}

      {phase === 'answering' && q && (
        <div className="quiz-card" key={`${requestId.current}-${index}`}>
          <p className="quiz-counter">Frage {index + 1} von {questions.length}</p>
          <h3 className="quiz-card-question">{q.question}</h3>

          <div className="quiz-options" role="radiogroup" aria-label={`Antworten zu Frage ${index + 1}`}>
            {q.options.map((opt, oi) => {
              const state = !revealed ? '' : oi === q.correct_index ? 'correct' : oi === chosen ? 'chosen-wrong' : 'dimmed'
              return (
                <button
                  key={oi} type="button" role="radio" aria-checked={oi === chosen}
                  className={`quiz-option ${state}`} disabled={revealed} onClick={e => choose(oi, e.currentTarget)}
                >
                  <span className="quiz-letter">
                    {revealed && oi === q.correct_index ? <Check size={13} strokeWidth={3} />
                      : revealed && oi === chosen ? <X size={13} strokeWidth={3} /> : LETTERS[oi]}
                  </span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>

          {revealed && (
            <div className={`quiz-feedback ${chosen === q.correct_index ? 'right' : 'wrong'}`}>
              <strong>{chosen === q.correct_index ? 'Richtig.' : `Nicht ganz – richtig ist ${LETTERS[q.correct_index]}.`}</strong>
              <p>{q.explanation}</p>
            </div>
          )}

          <div className="quiz-card-foot">
            <span className="quiz-meta quiz-keys">{revealed ? 'Enter → weiter' : 'Tasten 1–4 oder A–D'}</span>
            <button ref={nextRef} type="button" className="btn btn-sm btn-primary" disabled={!revealed} onClick={next}>
              {isLast ? 'Auswertung' : 'Weiter'} <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="quiz-result">
          <div className={`quiz-result-score ${scoreClass(score)}`}>
            <span className="quiz-result-big">{correctCount}<small>/{questions.length}</small></span>
            <div>
              <strong>{score}% richtig</strong>
              <span>
                {score >= 80 ? 'Sitzt. Das Thema kannst du abhaken.'
                  : score >= 50 ? 'Auf gutem Weg. Schau dir die Fehler unten an.'
                    : 'Das lohnt sich nochmal anzuschauen. Lies die Erklärungen und versuch es erneut.'}
              </span>
            </div>
          </div>

          <div className="quiz-actions quiz-result-actions">
            {wrongQuestions.length > 0 && (
              <button type="button" className="btn btn-sm btn-primary" onClick={retryWrong}>
                <Repeat size={14} strokeWidth={2} /> Falsche nochmal ({wrongQuestions.length})
              </button>
            )}
            {(remaining !== 0 || !usesAi) && (
              <button type="button" className={`btn btn-sm ${wrongQuestions.length ? 'btn-ghost' : 'btn-primary'}`} onClick={again}>
                <RotateCcw size={14} strokeWidth={2} /> {(current.parent || current).mode === 'mistakes' ? 'Nochmal üben' : 'Neue Fragen'}
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={onExit}>Fertig</button>
          </div>

          <ol className="quiz-review">
            {questions.map((qq, i) => {
              const right = answers[i] === qq.correct_index
              return (
                <li key={i} className={right ? 'right' : 'wrong'}>
                  <span className="quiz-review-icon">{right ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
                  <div>
                    <p className="quiz-review-q">{qq.question}</p>
                    {!right && <p className="quiz-review-a"><span className="bad">{qq.options[answers[i]]}</span> → <span className="good">{qq.options[qq.correct_index]}</span></p>}
                    {!right && <p className="quiz-review-x">{qq.explanation}</p>}
                  </div>
                </li>
              )
            })}
          </ol>

          <p className="quiz-meta">
            {usesAi && typeof remaining === 'number' ? `Heute noch ${remaining} ${remaining === 1 ? 'Abfrage' : 'Abfragen'} · ` : ''}
            {usesAi ? 'Fragen KI-generiert, können Fehler enthalten' : 'Übungsrunde, wird nicht gewertet'}
          </p>
        </div>
      )}
    </section>
  )
}
