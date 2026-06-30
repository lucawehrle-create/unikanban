# Stundenplan-Upload (Foto/PDF → Kurse)

Im Onboarding kann man seinen Stundenplan als **Foto (PNG/JPG)** oder **PDF**
hochladen. Eine Supabase Edge Function (`parse-timetable`) lässt das Bild/PDF
von einem Claude-Vision-Modell auslesen und gibt Kurse + wöchentliche Zeiten +
Räume strukturiert zurück. Die erkannten Kurse landen direkt in der
Onboarding-Vorschau und sind dort editierbar.

Optional: Ohne konfigurierte Cloud (kein Supabase) wird der Upload-Button
ausgeblendet – Tippen/Einfügen von Kursen funktioniert weiterhin.

## Einrichtung

Die Function braucht einen Anthropic-API-Key, der **nur serverseitig** als
Supabase-Secret liegt (nie im Client-Bundle):

```bash
# 1) Secret setzen (Key aus console.anthropic.com)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…

# 2) Function deployen (JWT-Prüfung an – nur eingeloggte Nutzer)
supabase functions deploy parse-timetable
```

Damit ist sichergestellt, dass nur angemeldete Nutzer die Function – und damit
den kostenpflichtigen Key – aufrufen können.

## Modell & Kosten

- Standardmodell: **`claude-sonnet-4-6`** – guter Kompromiss aus Genauigkeit
  und Kosten. Dichte Stundenplan-Raster (kleine Raumkürzel, verbundene Zellen)
  liest Sonnet deutlich zuverlässiger als Haiku.
- Überschreibbar per Secret `TIMETABLE_MODEL`:

  ```bash
  # Maximale Genauigkeit (teurer):
  supabase secrets set TIMETABLE_MODEL=claude-opus-4-8

  # Minimale Kosten (ungenauer bei dichten Plänen):
  supabase secrets set TIMETABLE_MODEL=claude-haiku-4-5-20251001
  ```

- Zusätzlich läuft die Extraktion mit `temperature: 0` (deterministisch) und
  einem Spalte-für-Spalte-Prompt, damit Tage nicht vertauscht und Räume
  zeichengenau übernommen werden.

## Rate-Limit (optional, empfohlen)

Schützt den bezahlten Key vor Spam: max. 8 Uploads pro Nutzer & Minute. Dafür
einmalig die Tabelle anlegen (Code läuft auch ohne sie weiter – dann ohne
Limit):

```bash
# supabase/parse-timetable-rate.sql im Supabase SQL-Editor ausführen
```

Die Function nutzt zusätzlich ein 45-Sekunden-Timeout für den Anthropic-Aufruf,
damit hängende Anfragen keine Kosten/Latenz verursachen.

## Grenzen

- Max. 8 MB pro Datei.
- Unterstützte Formate: PNG, JPG, WebP, GIF, PDF.
- Bei sehr unscharfen Fotos kann die Erkennung lückenhaft sein – die Kurse
  lassen sich danach im Onboarding manuell ergänzen/korrigieren.
