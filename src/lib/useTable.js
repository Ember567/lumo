import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

// Kleiner CRUD-Hook für die Planer-Editoren: lädt alle Zeilen einer Tabelle
// des Nutzers und hält sie bei Änderungen lokal aktuell (optimistisch).
// order: Liste von [spalte, aufsteigend]
export function useTable(table, userId, { order = [['created_at', true]] } = {}) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    let q = supabase.from(table).select('*').eq('user_id', userId)
    for (const [col, asc] of order) q = q.order(col, { ascending: asc })
    const { data, error: err } = await q
    if (err) setError(err.message)
    setRows(data || [])
  }, [table, userId])

  useEffect(() => { load() }, [load])

  async function create(values) {
    setError('')
    const { data, error: err } = await supabase.from(table).insert({ user_id: userId, ...values }).select().single()
    if (err) { setError(err.message); return null }
    setRows(list => [...(list || []), data])
    return data
  }

  async function createMany(list) {
    setError('')
    if (list.length === 0) return []
    const { data, error: err } = await supabase.from(table).insert(list.map(v => ({ user_id: userId, ...v }))).select()
    if (err) { setError(err.message); return [] }
    setRows(cur => [...(cur || []), ...data])
    return data
  }

  async function update(id, patch) {
    setError('')
    setRows(list => list.map(r => (r.id === id ? { ...r, ...patch } : r)))
    const { error: err } = await supabase.from(table).update(patch).eq('id', id)
    if (err) { setError(err.message); load(); return false }
    return true
  }

  async function remove(id) {
    setError('')
    setRows(list => list.filter(r => r.id !== id))
    const { error: err } = await supabase.from(table).delete().eq('id', id)
    if (err) { setError(err.message); load(); return false }
    return true
  }

  return { rows, setRows, load, create, createMany, update, remove, error, setError }
}

// Übersetzt die häufigsten Datenbank-Fehler in verständliche Hinweise.
export function friendlyError(message) {
  if (!message) return ''
  if (message.includes('end_date') || message.includes('check constraint')) return 'Bitte prüfe die Eingaben (z.B. Enddatum nach Startdatum, Pflichtfelder ausgefüllt).'
  if (message.includes('url')) return 'Die Adresse muss mit http:// oder https:// beginnen.'
  return message
}
