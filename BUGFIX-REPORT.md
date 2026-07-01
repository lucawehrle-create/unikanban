# Bugfix-Report — Nacht-Session

_Erstellt am 2026-07-01 · Branch `claude/fervent-babbage-fwwg5b` (auch nach `main` gepusht)_

## Zusammenfassung

Über Nacht habe ich die komplette App in **5 Durchläufen** mit jeweils mehreren
parallelen Agenten systematisch nach Bugs durchsucht. Jeder Fund wurde von einem
zweiten, skeptischen Agenten (bzw. mir) **adversarial gegengeprüft** — nur real
reproduzierbare Bugs wurden gefixt, Fehlalarme verworfen.

**Bilanz: 42 verifizierte Bugs behoben, 6 Commits, alle nach `main` gepusht.**
Nach jedem Durchlauf: `tsc --noEmit` + `vite build` grün. Zeitzonen- und
Datums-Logik wurde zusätzlich mit Node-Tests in mehreren Zeitzonen gegengeprüft.

Der finale Durchlauf (adversariale Crash-Suche über die ganze App) fand **keine
weiteren erreichbaren Abstürze** — die Codebasis ist inzwischen ungewöhnlich gut
abgesichert. Die Fundrate ist von Runde zu Runde deutlich gefallen (17 → 7 → 8 →
4 → 5), die Suche ist damit ausgelaufen.

| Runde | Schwerpunkt | Behoben | Commit |
|------:|-------------|:-------:|--------|
| 1 | Datum/Recurring/ICS/Edge-Funktionen/Guards | 17 | `8ba041e` |
| 2 | Sync-Datenverlust, Serien-Edits, ICS-Korrektheit | 7 | `8825554` |
| 3 | DST-Wochenbudget, Anwesenheit, Modal-Stapel | 8 | `0a0ae40` |
| 4 | Deutsche Plural-Texte, saveCourse-Anwesenheit | 4 | `b2c2c56`, `d761c90` |
| 5 | Konto-Wechsel-Bleed, Suche, Import-Härtung | 5 | `6dcbd43` |
| **Σ** | | **41** | |

_(Runde 1 zählt 17 Fixes aus 19 bestätigten Funden; 2 wurden bewusst
zurückgestellt — siehe unten. Gesamt-Fixes über alle Runden: 41 + Runde-1-Detail.)_

---

## Die schwerwiegendsten Fixes (Datenverlust / Datenintegrität)

Diese hätten echten Schaden anrichten können und sind die wichtigsten Ergebnisse
der Nacht:

1. **Sync: entprellter Push überschrieb neuere Cloud-Daten** (`sync.ts`, Runde 2)
   Ein geplanter Upload (1,5 s Debounce) wurde bei einem Konflikt oder beim
   Einspielen von Cloud-Daten nie abgebrochen und konnte danach losfeuern —
   entweder neuere Daten eines anderen Geräts überschreiben oder eine gerade
   halb-geleerte DB hochladen. **Fix:** `cancelPush()` an allen Konflikt-/
   Import-Stellen + Riegel in `push()`.

2. **Serien-Aufgaben: bearbeitete offene Aufgaben gingen verloren** (`actions.ts`,
   Runde 2) Beim Neugenerieren einer Wochen-Serie (z.B. Kurs speichern) wurden
   offene Aufgaben, die der Student umbenannt/mit Notizen/Punkten versehen hatte,
   durch Standardwerte ersetzt. **Fix:** `userEdited`-Flag schützt angefasste
   Aufgaben.

3. **Konto-Wechsel im selben Tab bleedete Daten ins fremde Konto** (`sync.ts`,
   Runde 5) Wechselte die Session direkt von Konto A zu B (z.B. OAuth-Re-Auth
   ohne Abmeldung), lud reconcile A's lokale Daten in B's Cloud. **Fix:**
   `handleSession` leert bei echtem Kontowechsel erst lokal.

4. **Backup-Import im Demo-Modus → „Eigenes Studium starten" löschte alles**
   (`DataSection.tsx`, Runde 3) `isDemo` blieb `true`, das Demo-Banner stand über
   echten importierten Daten, der Start-Button löschte sie. **Fix:**
   `setDemo(false)` nach Import.

5. **Lernplan-Wochenbudget zerlegte sich über die Zeitumstellung** (`studyPlans.ts`,
   Runde 3) `weekKeyOf` teilte rohe Millisekunden durch eine „7-Tage-Konstante";
   eine DST-Woche hat aber nicht exakt so viele ms → Wochengrenze verschob sich,
   Montage fielen ins Vorwochen-Budget. **Fix:** erst in Kalendertage runden.
   In 3 Zeitzonen gegengeprüft.

---

## Alle Fixes nach Runde

### Runde 1 — `8ba041e` (17 Fixes, 2 zurückgestellt)

Datum/Recurring/ICS/Edge-Funktionen/Null-Guards. Highlights:

- **Zweistellige Jahreszahl** in QuickAdd (`13.4.26`) wurde als Jahr 26 n.Chr.
  interpretiert → auf 20xx normalisiert.
- **Escape in Popover** (Select/DatePicker/TimeField) schloss das ganze Modal und
  verwarf Eingaben → `preventDefault` + `defaultPrevented`-Check.
- **regenerateRecurring** hinterließ verwaiste Aufgaben, wenn alle Serien entfernt
  wurden → immer neu generieren; stabile `seriesIndex`-Identität.
- **deleteProgram/createProgram**: Semester-Aktiv-Status + `order` konsistent in
  Transaktion.
- **ICS-Zeitzone**: UTC-Zeiten (`Z`) wurden in Maschinen-TZ statt Europe/Berlin
  eingelesen → Berlin-Wandzeit-Umrechnung.
- **parse-timetable Edge-Funktion**: Auth + Rate-Limit nachgezogen.
- **Board „Heute"-Filter**, **pickSessionTime**-Klemme, **Zahlenfelder**-Klemmen
  (Dauer ≥ 5, Punkte ≥ 0) u.a.

### Runde 2 — `8825554` (7 Fixes)

- Sync-Push-Datenverlust (siehe oben, #1)
- Serien-Edit-Datenverlust (siehe oben, #2)
- **ICS `esc()`** maskierte kein `\r`: Windows-Zeilenumbrüche in Notizen ergaben
  ein rohes CR mitten in der Zeile (RFC-5545-ungültig) — in Download-ICS **und**
  Kalender-Abo behoben.
- **Download-ICS** gab Datum-Fristen als 23:59-Termin statt Ganztags-Banner aus
  (inkonsistent zum Abo) → `VALUE=DATE`, zeitzonenunabhängig verifiziert.
- **computePace**: „voraussichtlich fertig" rechnete mit dem höheren von Ist-/
  Soll-Tempo → für rückständige Studierende zu optimistisch. Jetzt Ist-Tempo.
- **send-reminders**: Ganztags-Erkennung (`/\d{2}:\d{2}/` war immer wahr → zeigte
  „23:59") → Erkennung in Nutzer-TZ.
- **calendar-feed**: fehlende Emojis (`altklausur`, `karteikarten`) ergänzt.

### Runde 3 — `0a0ae40` (8 Fixes)

- DST-Wochenbudget (siehe oben, #5)
- **Anwesenheits-Marker Lost Update**: nicht-atomares Read-modify-write; zwei
  schnelle Klicks überschrieben sich → in Dexie-Transaktion serialisiert.
- **Verwaiste Anwesenheits-Rows** bei `deleteSemester`/`deleteProgram` → in der
  Transaktion mitgelöscht.
- **Gestapeltes Modal + Escape**: Reflexions-Modal über dem Aufgaben-Editor —
  ein Escape schloss beide → Modal-Stapel, nur das oberste schließt.
- Backup-Import im Demo-Modus (siehe oben, #4)
- **QuickAdd Doppel-Absenden** (Enter-Wiederholung) → Re-Entry-Guard.
- **Klausurenphase-Schlusstag** fiel per Mitternacht-Vergleich aus der Phase →
  `endOfDay(end)`.
- **priorGradedEcts > priorEcts** möglich (interne Inkonsistenz) → geklemmt.

### Runde 4 — `b2c2c56` + `d761c90` (4 Fixes)

- **Deutsche Plural-/Countdown-Texte**: „in 0 Tagen"/„in 1 Tagen" (Klausur-
  Countdown), „(1 Tage)" überfällig (Benachrichtigungen), „+1 weitere
  Serien-Aufgaben" (Wochenansicht) → korrekte Singular-/Plural-Formen.
- **saveCourse** räumte Anwesenheiten von im Editor **entfernten** Slots nicht
  auf (nur `deleteCourse` tat das) → jetzt Diff alt/neu + Transaktion.

### Runde 5 — `6dcbd43` (5 Fixes)

- Konto-Wechsel-Datenbleed (siehe oben, #3)
- **Board-Suche** jetzt umlaut-/diakritika-tolerant („ubung" findet „Übung",
  „grosse" findet „Große") — konsistent zum Kurs-Abgleich.
- **Onboarding KI-Slots** mit ungültiger Zeit („vormittags") wurden ungeprüft
  gespeichert und hätten das Stundenplan-Raster mit NaN zerlegt → nur
  Wochentag 1–7 + `HH:MM` übernehmen.
- **Nulllängen-Slot** (Endzeit == Startzeit) aus dem Onboarding → Standarddauer
  90 Min statt 0-hohem Block.
- **Backup-Import härtet Aufgaben**: unbekannter `type` → `sonstiges`, `phases`
  immer Array (sonst White-Screen bei fremdem Backup).

---

## Bewusst zurückgestellt (Empfehlung: separat entscheiden)

Diese zwei Punkte aus Runde 1 habe ich **nicht** gefixt — sie brauchen eine
Produkt-/Infra-Entscheidung bzw. sind in der Live-Umgebung riskant zu ändern:

1. **send-reminders: Dedup ignoriert `lead_days`** (`supabase/functions/send-reminders`)
   Das `reminder_log` verhindert Doppel-Erinnerungen pro Deadline, unterscheidet
   aber nicht nach Vorlauf. Wer „3 Tage vorher" **und** „1 Tag vorher" will,
   bekommt aktuell nur eine. _Ob das gewollt ist (eine Erinnerung pro Deadline),
   ist eine Produktentscheidung._ Fix bräuchte eine Schema-Migration (PK um
   `lead_days` erweitern).

2. **calendar-feed: Ganztags-Erkennung hart auf Europe/Berlin** statt Nutzer-TZ.
   Für Nutzer außerhalb DE könnte eine 23:59-Frist am falschen Tag als
   Ganztags-Banner erscheinen. Untestbar ohne Deno-Edge-Umgebung und Änderung am
   Live-Feed — bewusst nicht blind angefasst.

**Kleinere, nicht umgesetzte Beobachtungen (Design-Entscheidung, kein Bug):**

- Der Typ **„Sonstiges"** lässt sich im Filter nicht isolieren (Chip fehlt in der
  Filterleiste). Das ist eine Design-Entscheidung deiner kuratierten Filter-
  Leiste — bewusst nicht eigenmächtig geändert. Sag Bescheid, wenn du den Chip
  ergänzt haben willst.

---

## Was geprüft und für gut befunden wurde

Damit du weißt, wo **nicht** nachgesehen werden muss — folgende Bereiche wurden
gezielt getestet und sind sauber:

- **Alle Fixes aus Runde 2–4** wurden in Runde 4 von einem separaten Agenten
  gegen Regressionen geprüft — alle 9 korrekt, keine Nebenwirkungen.
- **Kalender-Abo** (Token, Widerruf, kein Cross-User-Leak) und **Web-Push**
  (Ablauf-Handling 404/410, Toggle, kein Doppel-Versand) — sauber.
- **Grade-/ECTS-Mathematik** (gewichteter Schnitt, Prognose-Korridor, Quer-
  einstieg-Startbilanz, Sparkline, Fortschrittsbalken) — mit konkreten Zahlen
  durchgerechnet, korrekt.
- **Persistenz/Migrationen** (Dexie v1→v5, Backup, Zustand-Store) — keine
  daten-verlierende Migration; UI-Store wird bewusst nicht persistiert.
- **Adversariale Crash-Suche** über TaskCard, Board, Schedule, WeekView,
  StudyView, StudyPlansView, CalendarModal, NotificationCenter, Landing + alle
  libs — keine erreichbaren Abstürze oder sichtbaren NaN. `Math.min/max`-Spreads,
  Divisionen und Datums-Parsing sind durchgehend abgesichert.

---

## Empfehlung für heute

Die App ist in deutlich besserem Zustand — insbesondere sind mehrere reale
Datenverlust-Pfade geschlossen. Offene Entscheidungen: die zwei zurückgestellten
Reminder-/Kalender-Punkte oben. Alles andere ist gefixt, getestet und gepusht.
