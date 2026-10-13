import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const DT_FMT = new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function CalendarCard({ userId }) {
  const [events, setEvents] = useState([])
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')

  useEffect(() => { load() }, [userId])

  async function load() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('event_date', { ascending: true })
    setEvents(data || [])
  }

  async function addEvent(e) {
    e.preventDefault()
    if (!title.trim() || !when) return
    const { error } = await supabase.from('events').insert({
      user_id: userId, title: title.trim(), event_date: new Date(when).toISOString(),
    })
    if (!error) { setTitle(''); setWhen(''); load() }
  }

  async function removeEvent(id) {
    await supabase.from('events').delete().eq('id', id)
    load()
  }

  return (
    <section className="card card-calendar">
      <div className="card-head">
        <h2>Kalender</h2>
        <span className="eyebrow">Nächste Termine</span>
      </div>

      <form className="inline-form" onSubmit={addEvent}>
        <input type="text" placeholder="Termin…" value={title} onChange={e => setTitle(e.target.value)} required aria-label="Termin" />
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} required aria-label="Datum und Zeit" />
        <button className="btn btn-sm btn-primary" type="submit">+</button>
      </form>

      <ul className="event-list">
        {events.map(ev => (
          <li key={ev.id} className="event-item">
            <div>
              <span className="event-when">{DT_FMT.format(new Date(ev.event_date))}</span>
              {ev.title}
            </div>
            <button className="event-del" onClick={() => removeEvent(ev.id)} aria-label="Termin löschen">✕</button>
          </li>
        ))}
        {events.length === 0 && <li className="event-item">Keine Termine geplant.</li>}
      </ul>
    </section>
  )
}
