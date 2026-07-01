# SemBan (unikanban)

Kostenloser Semesterplaner für Studierende (React + Vite PWA, local-first mit
Dexie/IndexedDB, optionaler Cloud-Sync über Supabase). Sprache in UI, Commits
und Doku: **Deutsch**.

## Befehle

- `npm run build` – Typecheck (`tsc --noEmit`) + Production-Build (muss vor jedem Push grün sein)
- `npm run lint` – nur Typecheck
- Es gibt keine Unit-Tests; Verifikation läuft über Build + manuelles/Playwright-Durchspielen.

## Arbeitsweise / Deployment (Wunsch des Owners, 2026-07)

- **Getestete Änderungen direkt auf `main` pushen** – kein PR, kein Warten auf
  Freigabe. Vercel deployt `main` automatisch in Produktion.
- Voraussetzung vor jedem Push: `npm run build` grün; bei nicht-trivialen
  Änderungen das betroffene Feature real durchspielen (Playwright/Preview).
- Ausnahme: Bei riskanten/destruktiven Änderungen (Datenmodell-Migrationen,
  Auth-Flows, Löschlogik) vorher kurz beim Owner rückfragen.

## Architektur-Notizen

- **Datenmodell:** Programm → Semester → Kurse → Aufgaben (`src/db/types.ts`).
  Dexie-Schema-Versionen in `src/db/db.ts` – bei neuen Tabellen auch
  `src/lib/backup.ts` (Export/Import/Reset) und die Hook-Liste in
  `src/lib/sync.ts` erweitern.
- **Cloud-Sync:** gesamter Datenbestand als ein JSON-Blob in `user_data`
  (Supabase, RLS „nur eigene Zeile"). Konfliktlogik in `src/lib/sync.ts`.
- **Edge Functions** (`supabase/functions/`): `parse-timetable` (Claude-Vision),
  `calendar-feed` (ICS-Abo per Geheim-Token, ohne JWT), `send-reminders`
  (Cron + Web-Push, verlangt Service-Role-Key/CRON_SECRET), `delete-account`,
  `fetch-ics` (CORS-Proxy für Uni-Feeds, SSRF-geschützt). JWT immer serverseitig
  via `auth.getUser()` verifizieren, nie nur dekodieren.
- Nach Änderungen an Edge Functions daran erinnern, dass der Owner sie manuell
  deployt (`supabase functions deploy <name>`); SQL-Dateien in `supabase/`
  führt er im SQL-Editor aus (idempotent halten).
- **Security-Header/CSP** stehen in `vercel.json` (`script-src 'self'` –
  keine Inline-Skripte in statischen HTML-Seiten unter `public/`; JS dort in
  eigene Dateien auslagern).
