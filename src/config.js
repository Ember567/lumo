// Zentrale Produktangaben — Name und Claim nur hier ändern.
export const APP_NAME = 'Lumo'
export const APP_TAGLINE = 'Dein Lernplan, klar vor Augen.'
export const APP_DESCRIPTION =
  'Ziele setzen, Stoff in Fächer und Themen gliedern, Wochen planen und sehen, ob du im Plan bist.'

// Präfix für localStorage-Schlüssel und Window-Events
export const STORAGE_PREFIX = 'lumo'

// Registrierung in der App anzeigen? Standard: aus (Konten legt man im
// Supabase-Dashboard an). Für lokale Tests: VITE_ALLOW_SIGNUP=true
export const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === 'true'

// Anmeldung mit Benutzernamen: "testuser" wird zu testuser@<USERNAME_DOMAIN>.
// Solche Konten legt man im Dashboard mit genau dieser Adresse an
// ("Auto Confirm User" an, dann braucht es keine echte E-Mail).
export const USERNAME_DOMAIN = import.meta.env.VITE_USERNAME_DOMAIN || 'user.lumo.berendak.ch'

export function loginEmail(input) {
  const v = input.trim()
  return v.includes('@') ? v : `${v.toLowerCase()}@${USERNAME_DOMAIN}`
}

// Für die Anzeige: Benutzer-Konten mit ihrem Namen statt der Platzhalter-Adresse
export function accountLabel(email = '') {
  const suffix = `@${USERNAME_DOMAIN}`
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email
}
