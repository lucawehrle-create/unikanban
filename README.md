# 🎓 UniKanban — Der Semesterbegleiter

Ein Kanban-Board, das den **Uni-Rhythmus** kennt: viele Kurse parallel, wöchentliche
Übungsblätter mit harten Abgabefristen, Hausarbeiten, Referate, Lektüre — alles
gleichzeitig. Kein generisches Trello, sondern ein uni-natives Werkzeug, gebaut um
den Semester-Takt herum.

## Idee

Kein reines Tag-System, sondern ein echtes akademisches Modell:

```
Semester → Kurse (Stundenplan, ECTS, Note) → Aufgaben mit typ-spezifischem Lebenszyklus
```

## Was V1 kann

- **Mehrere Arbeitstypen** mit eingebautem Lebenszyklus (als Karten-Checkliste):
  📄 Übungsblatt · 📝 Hausarbeit · 🎤 Referat · 📖 Lektüre · 🎓 Klausur
- **Auto-generierte Wochenblätter** — Kurs einmal definieren (`Übungsblatt jede Woche,
  Abgabe Fr 12:00`), das ganze Semester an Aufgaben entsteht automatisch mit Deadlines.
- **Schnell-Erfassen** — Taste `n`, dann z.B. `Blatt 3 #ana2 @übung !fr`
  → Titel, Kurs, Typ und Fälligkeit werden automatisch geparst.
- **Kurs-Tags + Farben** — jede Karte farbcodiert, Kurs auf einen Blick.
- **Filter & Suche** — nach Kurs, Typ, Volltext (`/` zum Suchen).
- **Board mit Gruppierung** — nach Status / Deadline / Kurs / Typ umschaltbar; Drag & Drop.
- **„Diese Woche"-Ansicht** — die Studi-Signaturansicht: Überfälliges + nach Wochentag.
- **Deadline-Badges** — 🔴 überfällig · 🟠 heute · 🟡 diese Woche.
- **Semesterwoche-Anzeige** — „Woche 7 / 14".

## Tech-Stack

- **React + TypeScript + Vite**
- **Tailwind CSS v4**
- **Dexie / IndexedDB** — lokal-first, kein Login, offline. Sync (Dexie Cloud) später als Drop-in nachrüstbar.
- **dnd-kit** — Drag & Drop
- **date-fns**, **zustand**, **lucide-react**

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server
npm run build    # Typecheck + Produktions-Build
npm run preview  # Build lokal ansehen
```

Beim ersten Start wird ein **Demo-Semester** (SoSe 2026, 3 Kurse) angelegt, damit das
Board nicht leer ist. Über **Kurse** lässt sich alles anpassen.

## Roadmap

- ⏰ Stundenplan-Ansicht + Semester-Timeline
- 📈 Noten- & ECTS-Fortschritt
- 🔁 Wiederkehrende Aufgaben automatisch nachfüllen
- 📲 Geräte-Sync (Dexie Cloud) + PWA/Offline-Installation
- 🗓️ Google-Calendar-Sync (Abgaben → Kalender)
