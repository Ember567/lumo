import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { lumiEmit } from '../lib/lumi.js'
import { fmtDate } from '../lib/dates.js'
import { goalColor } from '../lib/plan.js'

export default function Tasks({ userId }) {
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState('')
  const [due, setDue] = useState('')

  useEffect(() => { load() }, [userId])

  async function load() {
    const [{ data: t }, { data: g }] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId)
        .order('done').order('due_date', { ascending: true, nullsFirst: false }).order('created_at'),
      supabase.from('goals').select('id, name, color').eq('user_id', userId).order('sort_order').order('created_at'),
    ])
    setTasks(t || [])
    setGoals(g || [])
  }

  async function addTask(e) {
    e.preventDefault()
    if (!title.trim()) return
    const { error } = await supabase.from('tasks').insert({
      user_id: userId, title: title.trim(), goal_id: goalId || null, due_date: due || null,
    })
    if (!error) { setTitle(''); setDue(''); load() }
  }

  async function toggleDone(task, el) {
    if (!task.done) lumiEmit('task-done', { el })
    setTasks(list => list.map(t => (t.id === task.id ? { ...t, done: !t.done } : t)))
    await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id)
    load()
  }

  async function removeTask(id) {
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  const goalById = Object.fromEntries(goals.map(g => [g.id, g]))
  const openCount = tasks.filter(t => !t.done).length

  return (
    <section className="card card-tasks">
      <div className="card-head">
        <h2>Aufgaben</h2>
        <span className="eyebrow">{openCount} offen</span>
      </div>

      <form className="inline-form" onSubmit={addTask}>
        <input type="text" placeholder="Neue Aufgabe…" value={title} onChange={e => setTitle(e.target.value)} required aria-label="Aufgabe" />
        <select value={goalId} onChange={e => setGoalId(e.target.value)} aria-label="Ziel">
          <option value="">Allgemein</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Fällig am" />
        <button className="btn btn-sm btn-primary" type="submit" aria-label="Aufgabe hinzufügen">+</button>
      </form>

      <ul className="task-list">
        {tasks.map(t => {
          const goal = goalById[t.goal_id]
          return (
            <li key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
              <input type="checkbox" checked={t.done} onChange={e => toggleDone(t, e.currentTarget)} aria-label={`${t.title} erledigt`} />
              <span className="task-title">{t.title}</span>
              {goal && <span className="task-tag" style={{ '--tag': goalColor(goal) }}>{goal.name}</span>}
              {t.due_date && <span className="task-due">{fmtDate(t.due_date)}</span>}
              <button className="task-del" onClick={() => removeTask(t.id)} aria-label="Aufgabe löschen">✕</button>
            </li>
          )
        })}
        {tasks.length === 0 && <li className="task-item">Keine Aufgaben — leg los.</li>}
      </ul>
    </section>
  )
}
