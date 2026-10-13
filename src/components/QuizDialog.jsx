import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Sparkles, X } from 'lucide-react'
import { generateQuiz, saveAttempt, scoreClass } from '../lib/quiz.js'
import { notifyPlanChanged } from '../lib/progress.js'

const LETTERS = ['A', 'B', 'C', 'D']

export default function QuizDialog({ userId, target, onClose }) {
  const [phase, setPhase] = useState('loading') // loading | answering | result | error
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState([])
  const [correct, setCorrect] = useState(0)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const requestId = useRef(0)

  // Jede Anfrage kostet KI-Kontingent: im React-StrictMode laufen Effekte beim
  // ersten Mount doppelt — der Ref sorgt dafür, dass nur eine Anfrage rausgeht.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    load()
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => { dialogRef.current?.focus() }, [phase])

  async function load() {
    const id = ++requestId.current
    setPhase('loading')
    setError('')
    try {
      const data = await generateQuiz({ topicId: target.topicId, subjectId: target.subjectId, count: target.subjectId ? 8 : 5 })
      if (id !== requestId.current) return
      setQuiz(data)
      setAnswers(Array(data.questions.length).fill(null))
      setPhase('answering')
    } catch (err) {
      if (id !== requestId.current) return
      setError(err.message)
      setPhase('error')
    }
  }

  async function evaluate() {
    const count = await saveAttempt(userId, { topicId: target.topicId, subjectId: target.subjectId, questions: quiz.questions, answers })
    setCorrect(count)
    setPhase('result')
    notifyPlanChanged()
    dialogRef.current?.scrollTo({ top: 0 })
  }

  const allAnswered = answers.length > 0 && answers.every(a => a !== null)
  const total = quiz?.questions.length || 0
  const pct = total ? Math.round((correct / total) * 100) : 0

  // Portal an <body>: Karten mit Einblend-Animation bilden eigene Ebenen-
  // Kontexte, darin könnte der Dialog nicht über der ganzen Seite liegen.
  return createPortal(
    <div className="quiz-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-title" tabIndex={-1} ref={dialogRef}>
        <div className="quiz-head">
          <div>
            <span className="quiz-eyebrow"><Sparkles size={13} strokeWidth={2} /> {target.subjectId ? 'Fach-Quiz' : 'Themen-Quiz'}</span>
            <h2 id="quiz-title">{target.label}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Quiz schliessen"><X size={18} /></button>
        </div>

        {phase === 'loading' && (
          <div className="quiz-loading" role="status">
            <span className="quiz-spinner" aria-hidden="true" />
            Fragen werden erstellt …
          </div>
        )}

        {phase === 'error' && (
          <div className="quiz-error">
            <p>{error}</p>
            <div className="quiz-actions">
              <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Schliessen</button>
              {!/heute|morgen|eingerichtet/i.test(error) && <button type="button" className="btn btn-sm btn-primary" onClick={load}>Nochmal versuchen</button>}
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className={`quiz-score ${scoreClass(pct)}`}>
            <strong>{correct} von {total} richtig</strong>
            <span>{pct >= 80 ? 'Sitzt.' : pct >= 50 ? 'Auf gutem Weg — schau dir die Erklärungen an.' : 'Das Thema lohnt sich nochmal anzuschauen.'}</span>
          </div>
        )}

        {(phase === 'answering' || phase === 'result') && (
          <ol className="quiz-questions">
            {quiz.questions.map((q, qi) => {
              const chosen = answers[qi]
              const isRight = chosen === q.correct_index
              return (
                <li key={qi} className={`quiz-question ${phase === 'result' ? (isRight ? 'right' : 'wrong') : ''}`}>
                  <p className="quiz-question-text">{q.question}</p>
                  <div className="quiz-options" role="radiogroup" aria-label={`Frage ${qi + 1}`}>
                    {q.options.map((opt, oi) => {
                      const state = phase === 'result'
                        ? oi === q.correct_index ? 'correct' : oi === chosen ? 'chosen-wrong' : ''
                        : oi === chosen ? 'chosen' : ''
                      return (
                        <button
                          key={oi} type="button" role="radio" aria-checked={oi === chosen}
                          className={`quiz-option ${state}`}
                          disabled={phase === 'result'}
                          onClick={() => setAnswers(list => list.map((a, i) => (i === qi ? oi : a)))}
                        >
                          <span className="quiz-letter">{phase === 'result' && oi === q.correct_index ? <Check size={13} strokeWidth={3} /> : LETTERS[oi]}</span>
                          <span>{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                  {phase === 'result' && <p className="quiz-explanation">{q.explanation}</p>}
                </li>
              )
            })}
          </ol>
        )}

        {phase === 'answering' && (
          <div className="quiz-footer">
            <span className="quiz-meta">{answers.filter(a => a !== null).length} / {total} beantwortet</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={!allAnswered} onClick={evaluate}>Auswerten</button>
          </div>
        )}

        {phase === 'result' && (
          <div className="quiz-footer">
            <span className="quiz-meta">
              {typeof quiz.remaining === 'number' ? `Heute noch ${quiz.remaining} ${quiz.remaining === 1 ? 'Quiz' : 'Quizze'} · ` : ''}
              KI-generiert, kann Fehler enthalten
            </span>
            <div className="quiz-actions">
              <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Schliessen</button>
              {quiz.remaining !== 0 && <button type="button" className="btn btn-sm btn-primary" onClick={load}>Neues Quiz</button>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
