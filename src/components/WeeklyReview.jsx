import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { formatDuration } from '../lib/dates.js'

export default function WeeklyReview({ userId }) {
  const [stats, setStats] = useState(null)

  useEffect(() => { load() }, [userId])

  async function load() {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const [{ data: sessions }, { count: topicsDone }, { count: subtasksDone }, { count: tasksDone }] = await Promise.all([
      supabase.from('study_sessions').select('duration_seconds, created_at').eq('user_id', userId).gte('created_at', weekAgo),
      supabase.from('plan_topics').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('done', true).gte('completed_at', weekAgo),
      supabase.from('plan_subtasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_done', true).gte('done_at', weekAgo),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('done', true).gte('updated_at', weekAgo),
    ])
    const list = sessions || []
    const studyDays = new Set(list.map(s => new Date(s.created_at).toDateString())).size
    setStats({
      studyTime: formatDuration(list.reduce((sum, s) => sum + s.duration_seconds, 0)),
      studyDays,
      topicsDone: topicsDone ?? 0,
      subtasksDone: subtasksDone ?? 0,
      tasksDone: tasksDone ?? 0,
    })
  }

  if (!stats) return null

  const items = [
    [stats.studyTime, 'Lernzeit'],
    [`${stats.studyDays}/7`, 'Lerntage'],
    [stats.topicsDone, 'Themen erledigt'],
    [stats.subtasksDone, 'Unterthemen erledigt'],
    [stats.tasksDone, 'Aufgaben erledigt'],
  ]

  return (
    <section className="weekly-review">
      <div className="weekly-review-head">
        <h2>Wochenrückblick <span className="weekly-review-period">· Letzte 7 Tage</span></h2>
      </div>
      <div className="weekly-stats">
        {items.map(([value, label]) => (
          <div key={label} className="weekly-stat">
            <span className="weekly-stat-value">{value}</span>
            <span className="weekly-stat-label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
