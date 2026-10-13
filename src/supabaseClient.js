import { createClient } from '@supabase/supabase-js'

// Diese Werte kommen aus deiner .env-Datei (siehe .env.example).
// Trage dort deine echte Supabase-URL und den anon-Key ein.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
