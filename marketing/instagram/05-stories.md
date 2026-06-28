# Story-Skript · Tipps & Updates (Highlights)

Selbst gerendert (kein KI-Bildgenerator), Format **1080×1920**. Liegen in
`slides/` als `story-tipp-*` und `story-update-*`. Copy/Design in
`slides/render-stories.mjs` (`node marketing/instagram/slides/render-stories.mjs`).
Markenzeichen oben ist das **echte SemBan-Logo** (Balken-Kachel, identisch zur App).

> **Hinweis:** Die früheren Blöcke „Start hier", „Features" und „Ihr fragt"
> wurden durch eigenständige, stärkere Story-Slider ersetzt:
> - **Intro / Start** → `06-intro-story.md` (`story-intro-*`)
> - **Features** → `09-feature-story.md` (`story-feat-*`, mit echten Screenshots)
> - **FAQ** → `10-faq-story.md` (`story-faqx-*`, faktentreu korrigiert)
>
> **Sticker** (Umfrage/Quiz/Frage/Link) sind bewusst NICHT ins Bild gebrannt —
> die legst du beim Posten in der Instagram-App darüber.

---

## Tipps  (6 Slides — zusammenhängender Slider)

Gebaut als echter Mini-Guide: **Cover-Hook → 4 nummerierte Tipps (01–04)
mit Fortschrittsanzeige & eigener Mini-Visualisierung → CTA-Abschluss.**

| Datei | Aussage | Visual | Sticker live |
|---|---|---|---|
| `story-tipp-1` | Cover: „4 Lerntipps fürs Semester." | — | **Quiz**: „Wann lernst du?" |
| `story-tipp-2` | 01 · „Fang früher an. Nicht härter." | verteilt vs. Nachtschicht (Balken) | — |
| `story-tipp-3` | 02 · „Plane die Woche, nicht den Tag." | Wochenstreifen Mo–So | — |
| `story-tipp-4` | 03 · „Folge der Ampel." (rot/orange/gelb) | Ampel-Legende | — |
| `story-tipp-5` | 04 · „Teile Großes in Kleines." | Berg → abhakbare Schritte | — |
| `story-tipp-6` | CTA: „SemBan macht das Planen." | — | — |

## Updates  (2 Slides — Build in Public)

| Datei | Aussage | Sticker live |
|---|---|---|
| `story-update-1` | „Wir bauen offen weiter." | — |
| `story-update-2` | „Dein KI-Lerncoach." (Nachfrage-Test) | **Umfrage**: Ja / Vielleicht / Nein |

---

### Posten & Highlight anlegen
1. Slides eines Blocks in Reihenfolge als Story posten (Sticker dort live setzen).
2. Ins passende Highlight legen (Cover aus `visuals/highlight-*`), Titel vergeben.
3. Sticker bleiben im Highlight als Ergebnis sichtbar → „konserviertes" Engagement.
4. **Für den Upload** die Versionen aus `slides/ig/` nehmen (1080-px-nativ, schärfer
   auf Instagram) — siehe `slides/ig/README.md`.
