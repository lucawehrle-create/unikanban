# Feature-Story-Slider · „Sechs Features. Null Chaos." (9:16)

Eigenständige **8-Slide-Story-Sequenz** (1080×1920) — die Feature-Tour, die in
einem Durchwischen jeden Kern-Nutzen zeigt. Liegt in `slides/` als
`story-feat-1 … 8.png`. Copy/Design in `slides/render-feature.mjs`
(`node marketing/instagram/slides/render-feature.mjs` zum Neu-Rendern).

Prinzip: **Nutzen vor Feature** — jede Überschrift sagt, was du *davon hast*,
nicht wie das Feature heißt. Indigo-Klammer (Cover + CTA), Paper-Mitte fürs Lesen.

| # | Datei | Feature | Nutzen-Headline | Sticker live |
|---|---|---|---|---|
| 1 | `story-feat-1` | Cover | „Sechs Features. Null Chaos." | — |
| 2 | `story-feat-2` | Schnell-Erfassen | „Aufgaben in 5 Sekunden." (Syntax-Chip) | Screen-Recording drüberlegen |
| 3 | `story-feat-3` | Auto-Wochenblätter | „Einmal einstellen. Ganzes Semester." | — |
| 4 | `story-feat-4` | Fristen-Board | „Drei Farben. Voller Überblick." (Screenshot `board`) | — |
| 5 | `story-feat-5` | Lernplan | „Lernplan auf Knopfdruck." (Screenshot `plans`) | — |
| 6 | `story-feat-6` | Stundenplan | „Wo du gerade sein solltest." (Screenshot `schedule`) | — |
| 7 | `story-feat-7` | Noten & ECTS | „Sieh, wie weit du bist." (Screenshot `study`) | — |
| 8 | `story-feat-8` | CTA | „Und alles an einem Ort." | **Link-Sticker** zur App |

### Screenshots
Die Beweis-Slides 4–7 zeigen **echte App-Screenshots** im Browser-Frame
(`semban.de`), identisch zur Landing-Page. Quelle: `public/landing/*.png`
(`board`, `plans`, `schedule`, `study`) — beim Rendern als Base64 eingebettet,
also kein Server nötig. Neuen Screenshot tauschen = Datei in `public/landing/`
ersetzen und neu rendern.

### Einsatz
- Als **Live-Story** posten (Link-Sticker auf Slide 8), danach ins Highlight
  **„Features"** legen (Cover: `visuals/highlight-2-features.png`).
- Noch stärker: über die Screenshot-Slides ein echtes **Screen-Recording** legen
  (Schnell-Erfassen tippen, Lernplan generieren, Stundenplan scrollen).
- Tempo: Cover & CTA indigo (Klammer), Feature-Slides cream für ruhiges Lesen.

### Caption (falls als Reel/Beitrag recycelt)
```
Sechs Features. Null Chaos.

Kein leeres Notion-Blatt, kein generisches Trello: SemBan kennt den
Uni-Rhythmus. Abgaben in 5 Sekunden erfassen, wiederkehrende Blätter
automatisch, Fristen farbcodiert, Lernplan auf Knopfdruck, Stundenplan mit
Jetzt-Linie, Noten & ECTS im Blick — an einem Ort. Kostenlos, werbefrei, offline.

Welches dieser Features fehlt dir gerade am meisten? 👇

#studium #studyhacks #unileben #lernplan #produktivität #studienorganisation
```
