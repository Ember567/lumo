# Lumo

**Lumo** (Esperanto für „Licht“) ist eine anpassbare Lernplattform für alle, die
sich über Wochen oder Monate auf eine Prüfung vorbereiten. Du legst deine Ziele
fest, gliederst den Stoff in Fächer, Themen und Unterthemen, planst Phasen und
Wochenschwerpunkte — und siehst jederzeit ehrlich, ob du im Plan bist.

Live: **https://lumo.berendak.ch**

---

## Was Lumo kann

| Bereich | Funktionen |
| --- | --- |
| **Ziele** | Beliebig viele Lernziele (z.B. „Matura“, „Führerschein Theorie“) mit Prüfungsdatum und Countdown. Fortschritt wahlweise über erledigte Themen oder über Lernstunden. |
| **Planer** | Fächer mit Priorität, Themen mit Kategorien, Unterthemen, Phasen, Wochenplan mit Haupt-/Nebenfokus, Fristen. Mehrere Themen auf einmal einfügen (eine Zeile pro Thema), umsortieren, alles inline bearbeiten. |
| **Lernen** | Themen-Checkliste, Lern-Timer (läuft auch nach Neuladen weiter, ordnet Sessions automatisch dem richtigen Ziel zu), Soll/Ist-Vergleich pro Phase, Fortschrittsverlauf in 10%-Meilensteinen. |
| **Übersicht** | Status aller Ziele, nächste Themen nach Priorität, nächste Frist, empfohlenes Lerntempo, Wochenrückblick. |
| **Organisation** | Aufgaben, Termine und ein Zeitstrahl mit Phasen, Fristen und Terminen. |
| **Vorlagen** | Startklare Lernpläne beim Onboarding oder später dazuladen. Alle Daten werden auf ein frei wählbares Startdatum verschoben. Mitgeliefert: *Passerelle + EMS (Schweiz)* mit 110 Themen nach den SBFI-Richtlinien 2023, und ein kleiner Beispielplan. |
| **Abfragen (KI)** | Eigener Bereich zum Ausfragen: Thema oder ganzes Fach wählen, die KI erstellt Multiple-Choice-Fragen. Frage für Frage mit sofortigem Feedback und Erklärung, danach Auswertung. Vorschläge (schwache, erledigte aber nie abgefragte, lange nicht geübte Themen), Stand pro Fach, Verlauf und ein Fehlerheft, dessen Fragen sich ohne KI erneut üben lassen. |
| **Datenschutz** | Jede Person sieht nur ihre eigenen Daten. Export aller Daten als JSON, Plan zurücksetzen, Konto inkl. aller Daten löschen. |

## Technik

- **Frontend:** React 18 + Vite, Recharts für Diagramme, lucide-react für Icons
- **Backend:** Supabase (Postgres, Auth, auto-generierte REST-API) — kein eigener Server
- **Hosting:** Vercel, Domain über Hostpoint

### Sicherheitsmodell

Die App spricht direkt mit der Datenbank; geschützt wird auf Datenbankebene:

- **Row Level Security** auf jeder Tabelle: `auth.uid() = user_id` für Lesen *und* Schreiben.
- **Zusammengesetzte Fremdschlüssel** `(id, user_id)`: Eine Zeile kann nur auf
  Zeilen derselben Person verweisen — man kann z.B. kein Thema an ein fremdes Fach hängen.
- **Kaskadierendes Löschen**: Wird ein Konto gelöscht, verschwinden alle Daten.
- Vorlagen-Import (`import_template`) und Zurücksetzen (`reset_my_data`) laufen als
  Datenbankfunktionen in **einer Transaktion** mit den Rechten der aufrufenden Person.

### Fortschrittslogik (`src/lib/progress.js`)

- Kleinste Einheit ist ein Unterthema, oder das Thema selbst, wenn es keine Unterthemen hat.
- Ziel mit Themen-Messung: Durchschnitt der Fächer — jedes Fach zählt gleich viel,
  unabhängig davon, wie viele Themen es hat.
- Ziel mit Stunden-Messung: geloggte Timer-Stunden ÷ Stundenziel.
- Der Verlauf speichert nur Meilensteine (alle 10 %), damit er lesbar bleibt.

### KI-Quiz (`supabase/functions/quiz`)

- Läuft als **Supabase Edge Function** — der API-Key des KI-Anbieters liegt als Secret
  auf dem Server und kommt nie in den Browser.
- Anbieter austauschbar: jede OpenAI-kompatible API. Standard ist **Groq** mit
  `openai/gpt-oss-120b` und strikt validiertem JSON-Schema.
- An die KI gehen nur Fach-, Themen- und Lernziel-Titel, keine persönlichen Daten.
- Die Antwort wird geprüft (genau 4 eindeutige Optionen, gültiger Index), die
  Antwortreihenfolge serverseitig gemischt; bei unbrauchbarer Antwort ein zweiter Versuch.
- **Tageslimits** (pro Nutzer und global) werden atomar in der Datenbank verbucht
  (`consume_ai_quota`, nur für den Server aufrufbar), damit das Gratis-Kontingent reicht.

---

## Einrichtung

Reihenfolge: **1. Supabase → 2. Lokal testen → 3. Vercel → 4. Domain bei Hostpoint**

### 1. Supabase (eigene Datenbank für Lumo)

1. Auf [supabase.com](https://supabase.com) → **New project**
   - Name: `lumo`, Region: **Central EU (Frankfurt)**, starkes DB-Passwort notieren
2. **SQL Editor → New query** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**.
   Das legt alle Tabellen, Sicherheitsregeln und Funktionen an.
3. **Authentication → URL Configuration**
   - *Site URL:* `https://lumo.berendak.ch`
   - *Redirect URLs:* `https://lumo.berendak.ch/**` und `http://localhost:5173/**`
4. **Project Settings → API**: `Project URL` und `anon public` Key kopieren.

### 1b. KI-Quiz einrichten

1. Bei [console.groq.com](https://console.groq.com) einen API-Key erstellen (gratis).
2. Bestehende Datenbank: [`supabase/migrations/002_quiz.sql`](supabase/migrations/002_quiz.sql)
   im SQL-Editor ausführen (bei neuer DB ist es in `schema.sql` schon enthalten).
3. **Edge Functions → Deploy a new function → Via Editor**, Name `quiz`, Inhalt von
   [`supabase/functions/quiz/index.ts`](supabase/functions/quiz/index.ts) einfügen, deployen.
   Alternativ mit der Supabase CLI: `supabase functions deploy quiz`.
4. **Edge Functions → Secrets:** `AI_API_KEY` = dein Groq-Key.
   Optional: `AI_MODEL`, `AI_BASE_URL` (anderer Anbieter), `AI_DAILY_LIMIT_USER` (Standard 20),
   `AI_DAILY_LIMIT_GLOBAL` (Standard 800).

### 2. Lokal starten

```bash
cp .env.example .env      # Werte aus Schritt 1.4 eintragen
npm install
npm run dev               # http://localhost:5173
```

### 3. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub-Repo `Lumo` importieren
   (Framework wird als Vite erkannt).
2. **Environment Variables:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` eintragen.
3. **Deploy.**

### 4. Domain `lumo.berendak.ch` (Hostpoint)

1. In Vercel: Projekt → **Settings → Domains → Add** → `lumo.berendak.ch`.
   Vercel zeigt einen **CNAME-Wert an, der pro Projekt verschieden ist**
   (Form: `xxxxxxxx.vercel-dns-0xx.com`). Diesen Wert kopieren.
2. Im [Hostpoint Control Panel](https://admin.hostpoint.ch) → **Domains** → `berendak.ch` → **DNS-Zone bearbeiten**:
   neuen Eintrag anlegen

   | Typ | Name | Wert |
   | --- | --- | --- |
   | CNAME | `lumo` | *Wert aus Vercel* (mit Punkt am Ende, falls Hostpoint das verlangt) |

   Falls für `lumo` schon ein A- oder CNAME-Eintrag existiert, diesen entfernen.
3. Speichern. Nach einigen Minuten (selten bis zu ein paar Stunden) zeigt Vercel
   die Domain als gültig an und stellt automatisch ein HTTPS-Zertifikat aus.

---

## Projektstruktur

```
├── supabase/
│   ├── schema.sql               Komplettes Datenbankschema (Tabellen, RLS, Funktionen)
│   ├── migrations/002_quiz.sql  KI-Quiz für bestehende Datenbanken
│   └── functions/quiz/index.ts  Edge Function: Fragen per KI erzeugen
├── src/
│   ├── App.jsx                  Login-Weiche, Onboarding, Navigation
│   ├── config.js                App-Name und Claim
│   ├── lib/
│   │   ├── progress.js          Alle Fortschrittsformeln + Meilenstein-Log
│   │   ├── dates.js             Zeitzonen-sichere Datums-Helfer
│   │   ├── plan.js              Prioritäten, Ziel-Farben, Messarten
│   │   └── useTable.js          CRUD-Hook für die Planer-Editoren
│   ├── templates/               Lernplan-Vorlagen (JSON) + Register
│   └── components/
│       ├── Auth.jsx             Login, Registrierung, Passwort zurücksetzen
│       ├── Onboarding.jsx       Einrichtung: eigener Plan oder Vorlage
│       ├── StatusBar.jsx        Status & Countdowns aller Ziele
│       ├── NextUp.jsx           Was steht an
│       ├── StudyTimer.jsx       Lern-Timer
│       ├── StudyPlanTopics.jsx  Themen-Checkliste
│       ├── StudyBurndown.jsx    Soll/Ist pro Phase
│       ├── Progress.jsx         Fortschritt + Verlauf pro Ziel
│       ├── quiz/                Abfragen-Bereich: Start, Statistik, Fehlerheft, laufende Abfrage
│       ├── planner/             Editoren: Ziele, Fächer & Themen, Phasen, Wochen, Fristen
│       ├── Settings.jsx         Profil, Vorlagen, Export, Reset, Konto löschen
│       └── …                    Aufgaben, Kalender, Zeitstrahl, Links, Übersicht
└── vercel.json
```

## Eigene Vorlage hinzufügen

Eine JSON-Datei nach dem Muster von `src/templates/semester.json` anlegen und in
`src/templates/index.js` eintragen. Verweise innerhalb der Vorlage laufen über kurze
Schlüssel (`g1`, `su1`, `t1` …); `anchorDate` ist das Datum, auf das sich das vom
Nutzer gewählte Startdatum bezieht.
