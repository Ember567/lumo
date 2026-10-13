import { createClient } from '@supabase/supabase-js'

// Werte aus .env bzw. den Vercel Environment Variables (siehe .env.example).
// Beim Kopieren aus Dashboards rutschen leicht Leerzeichen, Zeilenumbrüche
// oder unsichtbare Zeichen mit — die würden später jeden Request mit einem
// kryptischen Header-Fehler abbrechen. Darum hier säubern und prüfen.
function clean(value) {
  return String(value || '').replace(/[\s​-‍﻿]/g, '')
}

const supabaseUrl = clean(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

// Header dürfen nur ASCII enthalten; ein Key mit z.B. "•" ist sicher falsch.
const isAscii = s => /^[\x21-\x7E]+$/.test(s)

export const supabaseConfigError = !supabaseUrl || !supabaseAnonKey
  ? 'Supabase ist noch nicht konfiguriert. Trage VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ein (siehe README.md).'
  : !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) && !supabaseUrl.startsWith('http://localhost')
    ? 'VITE_SUPABASE_URL sieht ungültig aus. Erwartet: https://<projekt>.supabase.co'
    : !isAscii(supabaseAnonKey)
      ? 'VITE_SUPABASE_ANON_KEY enthält ungültige Zeichen. Bitte den Key im Supabase-Dashboard mit dem Copy-Button neu kopieren und erneut eintragen.'
      : ''

export const supabaseConfigured = !supabaseConfigError

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
