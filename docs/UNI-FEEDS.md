# Uni-Kalender verbinden (Moodle/StudIP/ILIAS-Feeds)

SemBan kann persönliche ICS-Export-Links von Uni-Plattformen **abonnieren**:
Der Feed wird regelmäßig abgerufen, neue Einzeltermine (Abgaben, Klausuren …)
landen automatisch als Aufgaben im aktiven Semester. Wöchentliche Termine
(Stundenplan) werden bewusst nicht automatisch angelegt – das passiert einmalig
über den manuellen Import im Kalender-Modal.

## Wie es funktioniert

1. Nutzer holt sich in Moodle/StudIP/ILIAS den persönlichen Kalender-Link
   (z. B. Moodle: Kalender → „Kalender exportieren" → URL).
2. In SemBan: **Kalender → Importieren → Per Link** laden. Beim Import ist
   „Kalender verbinden" angehakt → der Link wird als Feed gespeichert.
3. Ab dann gleicht die App beim Start und bei Rückkehr ab (max. alle 6 Std.
   pro Feed). Neue **zukünftige** Termine werden als Aufgaben angelegt.

Details der Duplikat-Vermeidung:

- Jeder jemals im Feed gesehene Termin wird als Schlüssel (`Titel|Tag`) am
  Feed gespeichert (`icsFeeds.importedKeys`). Löscht der Nutzer eine daraus
  entstandene Aufgabe, kommt sie beim nächsten Abgleich **nicht** wieder.
- Feeds (inkl. dieser Liste und `lastSyncAt`) syncen über den normalen
  Cloud-Sync mit – zwei Geräte importieren dadurch nicht doppelt.

## Edge-Function `fetch-ics` (CORS-Proxy)

Browser dürfen fremde Kalender-Server wegen CORS meist nicht direkt abrufen.
Die Edge-Function `fetch-ics` holt den Feed serverseitig und reicht den Text
durch. Ohne deployte Function versucht die App einen direkten Fetch – der
klappt nur bei CORS-freundlichen Servern.

```bash
supabase functions deploy fetch-ics
```

- **Mit JWT-Prüfung deployen** (Default, kein `--no-verify-jwt`) – zusätzlich
  verifiziert die Function das JWT selbst via `auth.getUser()`. Sie darf kein
  anonym nutzbarer Proxy sein.
- Keine zusätzlichen Secrets nötig (`SUPABASE_URL`/`SERVICE_ROLE_KEY` sind
  automatisch gesetzt).
- SSRF-Schutz: nur `http(s)`, private/lokale/Metadata-Adressen sind gesperrt,
  Redirects werden einzeln geprüft. Limits: 5 MB, 15 s Timeout.

## Grenzen (bewusst)

- Auto-Import nur für **zukünftige Einzel-/Ganztags-Termine** – vergangene
  Fristen und Stundenplan-Serien wären Rauschen.
- Kein Hintergrund-Abgleich bei geschlossener App (die App ist local-first;
  der Abgleich läuft im Client). Beim nächsten Öffnen wird nachgeholt.
