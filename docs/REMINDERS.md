# SemBan – Deadline-Erinnerungen (Web Push)

Dieses Feature erinnert an demnächst fällige, offene Aufgaben – sowohl in der
App als auch per **Web Push, wenn die App geschlossen ist**. Ein stündlicher
Cron-Job prüft pro Nutzer dessen eingestellte Uhrzeit/Zeitzone und schickt einmal
täglich eine Push-Nachricht für die am Zieltag (heute + Vorlauf) fälligen
Aufgaben. Jede Aufgabe/Fälligkeit wird nur einmal verschickt.

## Voraussetzungen

- Ein Supabase-Projekt (dasselbe wie für die Cloud-Sync).
- `supabase` CLI installiert und mit dem Projekt verknüpft (`supabase login`,
  `supabase link`).

## Schritt 1 – VAPID-Schlüssel erzeugen

Web Push benötigt ein VAPID-Schlüsselpaar:

```bash
npx web-push generate-vapid-keys
```

Notiere dir `Public Key` und `Private Key`.

## Schritt 2 – Public Key für den Client setzen

Der Client braucht den **öffentlichen** Schlüssel, um das Gerät beim Browser-Push
anzumelden (`pushManager.subscribe`). Als Build-/Umgebungsvariable setzen:

- Lokal in `.env`:

  ```bash
  VITE_VAPID_PUBLIC_KEY=<public-key>
  ```

- In Vercel: Projekt → Settings → Environment Variables → `VITE_VAPID_PUBLIC_KEY`
  mit demselben Wert anlegen und neu deployen.

Der **private** Schlüssel kommt NICHT in den Client (siehe Schritt 4).

## Schritt 3 – Tabellen anlegen

`supabase/reminders.sql` im Supabase **SQL-Editor** ausführen. Das legt drei
Tabellen an:

- `push_subscriptions` – die Web-Push-Endpunkte je Gerät/Nutzer.
- `reminder_settings` – pro Nutzer: an/aus, Vorlauf, Uhrzeit, Zeitzone.
- `reminder_log` – verhindert doppeltes Senden (nur Service-Role).

Die Datei ist gefahrlos mehrfach ausführbar.

## Schritt 4 – Edge-Function-Secrets setzen

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<public-key> \
  VAPID_PRIVATE_KEY=<private-key> \
  VAPID_SUBJECT=mailto:du@example.com
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase in
Edge-Functions automatisch bereitgestellt – nicht manuell setzen.

## Schritt 5 – Function deployen

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt`, weil die Function vom Cron-Job (ohne Nutzer-JWT) aufgerufen
wird. Das ist unkritisch: Die Function nutzt intern nur die Service-Role und
sendet ausschließlich an die bereits gespeicherten Abos – sie nimmt keine
nutzergesteuerten Eingaben entgegen und liefert nur eine anonyme Zusammenfassung.

## Schritt 6 – Stündlich per Cron planen

Im Supabase-Dashboard zuerst die Extensions **`pg_cron`** und **`pg_net`**
aktivieren (Database → Extensions). Danach im SQL-Editor (`<PROJECT_REF>`
ersetzen):

```sql
select cron.schedule(
  'send-reminders-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_OR_ANON>',
      'Content-Type', 'application/json'
    )
  )
  $$
);
```

Läuft jede Stunde um Minute 5. Jeder Nutzer wird intern nur zu seiner
`notify_hour` (in seiner Zeitzone) tatsächlich benachrichtigt.

Job wieder entfernen:

```sql
select cron.unschedule('send-reminders-hourly');
```

## Payload (für den Client-Service-Worker)

Die Function sendet folgendes JSON; der Service Worker muss es in `push` parsen:

```json
{
  "title": "Morgen fällig: <Aufgaben-Titel>",
  "body": "<Kurs> · <Fälligkeit de-DE>",
  "url": "/",
  "tag": "semban-<taskId>",
  "taskId": "<taskId>"
}
```

`title` variiert mit `lead_days`: `Heute fällig` (0), `Morgen fällig` (1),
`In N Tagen fällig` (>1).

## Troubleshooting

- **Keine Push-Nachricht:** Stimmt die lokale Stunde mit `notify_hour` überein?
  Der Job feuert pro Nutzer nur in dieser Stunde (Zeitzone aus `reminder_settings.tz`).
- **`reminder_settings`-Zeile fehlt/`enabled = false`:** Dann wird der Nutzer
  übersprungen. Der Client muss beim Aktivieren eine Zeile anlegen.
- **Kein Push-Abo:** `push_subscriptions` für den Nutzer prüfen. Der Client muss
  nach Erlaubnis das Abo dort speichern.
- **Wird nicht erneut gesendet:** Beabsichtigt – `reminder_log` verhindert das.
  Zum Testen die passende Zeile löschen.
- **404/410 beim Senden:** Das Abo ist ungültig und wird automatisch aus
  `push_subscriptions` gelöscht (Gerät muss sich neu anmelden).
- **Cron-Logs:** `select * from cron.job_run_details order by start_time desc;`
- **Function-Logs:** im Supabase-Dashboard unter Edge Functions → Logs.
- **`VAPID`-Fehler:** Public Key im Client (`VITE_VAPID_PUBLIC_KEY`) muss zum
  Secret `VAPID_PUBLIC_KEY` der Function passen.
```
