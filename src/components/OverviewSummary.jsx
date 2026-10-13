import React, { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { onPlanChanged } from '../lib/progress.js'
import { formatDuration, today } from '../lib/dates.js'

const EVENT_FMT = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function OverviewSummary({ userId, onNavigate }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    load()
    return onPlanChanged(load)
  }, [userId])

  async function load() {
    const [{ count: openTasks }, { data: eventRows }, { count: openTopics }, { data: sessions }] = await Promise.all([
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('done', false),
      supabase.from('events').select('title, event_date').eq('user_id', userId)
        .gte('event_date', new Date().toISOString()).order('event_date').limit(1),
      supabase.from('plan_topics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('done', false),
      supabase.from('study_sessions').select('duration_seconds').eq('user_id', userId).gte('created_at', today().toISOString()),
    ])
    setState({
      openTasks: openTasks ?? 0,
      nextEvent: eventRows?.[0] ?? null,
      openTopics: openTopics ?? 0,
      todaySeconds: (sessions || []).reduce((s, r) => s + r.duration_seconds, 0),
    })
  }

  if (!state) return null

  const rows = [
    { section: 'learning', label: 'Heute gelernt', value: formatDuration(state.todaySeconds) },
    { section: 'learning', label: 'Themen offen', value: String(state.openTopics) },
    { section: 'organisation', label: 'Aufgaben offen', value: String(state.openTasks) },
    {
      section: 'organisation',
      label: state.nextEvent ? `Nächster Termin: ${state.nextEvent.title}` : 'Kein Termin geplant',
      value: state.nextEvent ? EVENT_FMT.format(new Date(state.nextEvent.event_date)) : '—',
    },
  ]

  return (
    <div className="overview-tiles">
      {rows.map((row, i) => (
        <button key={i} type="button" className="overview-tile" onClick={() => onNavigate(row.section)}>
          <span className="overview-tile-label">{row.label}</span>
          <span className="overview-tile-value">
            {row.value}
            <ChevronRight className="overview-tile-chevron" size={15} strokeWidth={2} />
          </span>
        </button>
      ))}
    </div>
  )
}
