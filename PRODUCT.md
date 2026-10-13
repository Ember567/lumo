# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lernende, die sich über einen längeren Zeitraum (Wochen bis Monate) auf eine oder
mehrere Prüfungen vorbereiten — Matura, Passerelle, Aufnahmetests, Semesterprüfungen,
Zertifikate. Sie arbeiten oft neben Job oder Schule, öffnen die App täglich kurz und
wollen wissen: Wo stehe ich, was ist als Nächstes dran?

## Product Purpose

Lumo macht einen langen Lernplan sichtbar und ehrlich. Erfolg heisst: Nutzende richten
ihren Plan in Minuten ein (eigener Plan oder Vorlage), haken täglich ab, und vertrauen
den Zahlen.

Drei Aufgaben:

- **Plan-Engine.** Ziele → Fächer → Themen → Unterthemen, dazu Phasen, Wochenfokus und
  Fristen. Fortschritt pro Ziel wird automatisch berechnet (Themen oder Stunden).
- **Tagesbegleiter.** Übersicht, Lern-Timer und Checkliste beantworten „was jetzt?“.
- **Ehrliche Rückschau.** Soll/Ist pro Phase, Meilenstein-Verlauf, Wochenrückblick —
  auch wenn man hinterherhinkt.

## Positioning

Ein To-do-Tool oder Notion kann Notizen halten; Lumo versteht Lernpläne: Fortschritt
rollt automatisch von Unterthemen über Fächer zu Zielen hoch, Phasen ergeben einen
Soll-Verlauf, und Vorlagen bringen einen vollständigen, terminierten Plan auf Knopfdruck.

## Operating Context

- Täglich geöffnet, oft am Handy; Seitenleiste klappt unter 820px ein.
- Deutsch, Schweizer Konventionen (de-CH-Daten, „ss“ statt „ß“).
- Sektionen: Übersicht, Lernen, Planer, Organisation, Links, Einstellungen.

## Capabilities and Constraints

- Statische Vite + React SPA, Supabase für Auth und Postgres, kein eigener Server.
- Sicherheit über Row Level Security und zusammengesetzte Fremdschlüssel.
- Schema in einer Datei (`supabase/schema.sql`).

## Brand Commitments

- **Name:** Lumo (Esperanto „Licht“). **Marke:** Sonnen-Glyph (lucide `Sun`).
- **Stimme:** Deutsch, direkt, Du-Form, ruhig.
- **Look:** „warm Notion“ — warmer, fast weisser Grund, warmgraue Haarlinien statt Schatten,
  Hierarchie über Schriftgrösse und -gewicht, Farbe nur für Status (Countdowns,
  Fortschritt, Ziel-Farben). Inter für Text, Caveat als handschriftliche Überschriften.

## Product Principles

1. **Signal statt Erklärung.** Jeder Screen soll mit einem Blick lesbar sein.
2. **Der Plan ist das Rückgrat.** Alles andere kreist um Ziele und Themen.
3. **Ehrlich statt motivierend.** Rückstand wird gezeigt.
4. **Robust bei wechselnden Zielen.** Daten, Phasen und Stundenziele ändern sich — die App
   muss damit umgehen.
5. **Deine Daten.** Export und vollständiges Löschen sind jederzeit möglich.

## Accessibility & Inclusion

Lesbare Schrift auch klein, ausreichender Kontrast, Tastaturbedienung für Navigation und
Formulare, beschriftete Steuerelemente, Touch-Ziele für einhändige Bedienung.
