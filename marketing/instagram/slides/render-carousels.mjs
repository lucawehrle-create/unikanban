// Rendert die geplanten Feed-Karussells (4:5, 1080x1350) als PNG.
// Vier Sets aus dem Content-Plan:
//   spaced  -> Spaced Repetition (Study-Hack)
//   fehler  -> 5 Fehler in der Klausurvorbereitung
//   woche   -> Der ideale Wochenplan eines Studis
//   noten   -> Noten & ECTS tracken
// Design identisch zu render-carousel-intro.mjs (gleicher Marken-Look).
//   node marketing/instagram/slides/render-carousels.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const W = 1080, H = 1350
const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
]
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))

// ─── Set 1: Spaced Repetition ────────────────────────────────────────────────
const SPACED = [
  { file: 'carousel-spaced-1', theme: 'indigo', hero: true, kicker: 'Study-Hack',
    title: 'Du lernst nicht\nzu wenig.',
    sub: 'Du lernst zu spät.', note: 'Swipe →' },

  { file: 'carousel-spaced-2', theme: 'paper', kicker: 'Der Denkfehler',
    title: 'Die Nacht-\nschicht-Lüge.',
    sub: 'Alles am Tag vor der Klausur reinpauken fühlt sich produktiv an. Hängen bleibt davon das Wenigste.' },

  { file: 'carousel-spaced-3', theme: 'paper', kicker: 'So funktioniert Lernen',
    title: 'Lernen. Pause.\nWiederholen.',
    list: [
      { label: 'Tag 1 — lernen', desc: 'neuer Stoff, frisch im Kopf' },
      { label: 'Tag 3 — kurz wiederholen', desc: 'kurz bevor du es vergisst: perfekt' },
      { label: 'Tag 7 — nochmal', desc: 'jetzt sitzt es im Langzeitgedächtnis' },
    ] },

  { file: 'carousel-spaced-4', theme: 'paper', kicker: 'Und so machst du es',
    title: 'Plan statt\nPanik.',
    sub: 'SemBan baut dir den verteilten Lernplan automatisch aus deinem Klausurdatum — aufgeteilt in Sessions, mit Erinnerungen.' },

  { file: 'carousel-spaced-5', theme: 'indigo', kicker: 'Bereit?',
    title: 'Fang heute an.\nNicht morgen.',
    sub: 'Klausurdatum rein — den Rest plant die App.',
    button: 'Lernplan starten', note: 'Link in Bio ↑' },
]

// ─── Set 2: 5 Fehler in der Klausurvorbereitung ──────────────────────────────
const FEHLER = [
  { file: 'carousel-fehler-1', theme: 'indigo', hero: true, kicker: 'Klausurphase',
    title: '5 Fehler in der\nVorbereitung.',
    sub: '…und wie du sie vermeidest.', note: 'Swipe →' },

  { file: 'carousel-fehler-2', theme: 'paper', kicker: 'Fehler 1',
    title: 'Du fängst zu\nspät an.',
    sub: 'Wenn die Panik kommt, bleibt nur noch Auswendiglernen statt Verstehen. Plane rückwärts vom Klausurdatum.' },

  { file: 'carousel-fehler-3', theme: 'paper', kicker: 'Fehler 2',
    title: 'Alles auf\neinmal.',
    sub: 'Fünf Fächer gleichzeitig im Kopf heißt: keins richtig. Nimm sie dir nacheinander vor, in festen Blöcken.' },

  { file: 'carousel-fehler-4', theme: 'paper', kicker: 'Fehler 3',
    title: 'Nur lesen,\nnie testen.',
    sub: 'Markieren fühlt sich nach Lernen an — ist es aber nicht. Frag dich selbst ab: aktives Abrufen schlägt passives Lesen.' },

  { file: 'carousel-fehler-5', theme: 'paper', kicker: 'Fehler 4',
    title: 'Keine Alt-\nklausuren.',
    sub: 'Sonst übst du den falschen Stoff in der falschen Form. Alte Klausuren zeigen dir, was wirklich drankommt.' },

  { file: 'carousel-fehler-6', theme: 'paper', kicker: 'Fehler 5',
    title: 'Pausen?\nFehlanzeige.',
    sub: 'Durchlernen bis 3 Uhr ruiniert den nächsten Tag. Schlaf und Pausen sind Teil des Lernens, kein Luxus.' },

  { file: 'carousel-fehler-7', theme: 'indigo', kicker: 'Der rote Faden',
    title: 'Früh. Verteilt.\nGetestet.',
    sub: 'Genau so plant SemBan — vom Klausurdatum rückwärts.',
    button: 'SemBan öffnen', note: 'Speicher dir das 🔖' },
]

// ─── Set 3: Der ideale Wochenplan ────────────────────────────────────────────
const WOCHE = [
  { file: 'carousel-woche-1', theme: 'indigo', hero: true, kicker: 'Wochenplan',
    title: 'So sieht eine\ngute Woche aus.',
    sub: 'Eine Woche, in der nichts hinten runterfällt.', note: 'Swipe →' },

  { file: 'carousel-woche-2', theme: 'paper', kicker: 'Montag',
    title: 'Der Wochen-\nstart.',
    sub: '5 Minuten Planung: Was steht diese Woche an? Abgaben, Termine, ein großes Ziel. »Diese Woche« zeigt es dir.' },

  { file: 'carousel-woche-3', theme: 'paper', kicker: 'Dienstag – Donnerstag',
    title: 'Tiefe Blöcke,\nfeste Zeiten.',
    sub: 'Ein bis zwei fokussierte Lern-Blöcke pro Tag — immer zur gleichen Zeit. Routine schlägt Motivation.' },

  { file: 'carousel-woche-4', theme: 'paper', kicker: 'Freitag',
    title: 'Aufholen &\nabschließen.',
    sub: 'Puffer für alles, was liegen blieb. Häkchen setzen, kurz zurückblicken — und mit klarem Kopf ins Wochenende.' },

  { file: 'carousel-woche-5', theme: 'paper', kicker: 'Wochenende',
    title: 'Echte Pause.\nOhne schlechtes Gewissen.',
    sub: 'Ein bewusst freier Tag macht dich produktiver, nicht fauler. Dein Plan sagt dir: Es brennt gerade nichts.' },

  { file: 'carousel-woche-6', theme: 'indigo', kicker: 'Nachbauen?',
    title: 'Deine Woche,\nim Griff.',
    sub: 'Trag deine Kurse ein — SemBan verteilt den Rest.',
    button: 'Woche planen', note: 'Speicher dir die Vorlage 🔖' },
]

// ─── Set 4: Noten & ECTS tracken ─────────────────────────────────────────────
const NOTEN = [
  { file: 'carousel-noten-1', theme: 'indigo', hero: true, kicker: 'Fortschritt',
    title: 'Wie weit bist\ndu wirklich?',
    sub: 'Nicht raten — sehen.', note: 'Swipe →' },

  { file: 'carousel-noten-2', theme: 'paper', kicker: 'Das Problem',
    title: 'ECTS im Kopf\nrechnen?',
    sub: 'Wie viele Credits fehlen noch? Welcher Schnitt steht gerade? Im Kopf wird das nie genau — und nie beruhigend.' },

  { file: 'carousel-noten-3', theme: 'paper', kicker: 'Die Lösung',
    title: 'Alles auf\neinen Blick.',
    list: [
      { label: 'Notenschnitt', desc: 'live berechnet, nicht geschätzt' },
      { label: 'ECTS-Fortschritt', desc: 'wie viel vom Studium geschafft ist' },
      { label: 'Pro Semester', desc: 'aufgeschlüsselt, Modul für Modul' },
    ] },

  { file: 'carousel-noten-4', theme: 'paper', kicker: 'Der Effekt',
    title: 'Sehen, wie\nweit du bist.',
    sub: 'Fortschritt sichtbar zu machen motiviert — und nimmt die diffuse Angst, »nicht genug« geschafft zu haben.' },

  { file: 'carousel-noten-5', theme: 'indigo', kicker: 'Bereit?',
    title: 'Trag deine\nNoten ein.',
    sub: 'Schnitt & ECTS rechnet SemBan automatisch.',
    button: 'Noten öffnen', note: 'Link in Bio ↑' },
]

const SETS = [
  { name: 'Spaced Repetition', slides: SPACED },
  { name: '5 Fehler', slides: FEHLER },
  { name: 'Wochenplan', slides: WOCHE },
  { name: 'Noten & ECTS', slides: NOTEN },
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nl2br = (s) => esc(s).replace(/\n/g, '<br>')

function logoMark(white) {
  const bg = white ? '#ffffff' : '#6366F1', tick = white ? '#6366F1' : '#ffffff'
  return `<span class="mark" style="background:${bg}">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="${tick}" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
}
const checkIcon = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none">
  <path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="2.8"
    stroke-linecap="round" stroke-linejoin="round"/></svg>`

function bodyHtml(s) {
  let html = ''
  if (s.kicker) html += `<div class="kicker">${esc(s.kicker)}</div>`
  html += `<h1 class="title${s.hero ? ' hero' : ''}">${nl2br(s.title)}</h1>`
  if (s.list) {
    html += `<div class="list">${s.list
      .map((it) => `<div class="li"><span class="check">${checkIcon}</span>
        <span class="li-text"><b>${esc(it.label)}</b><span>${esc(it.desc)}</span></span></div>`)
      .join('')}</div>`
  }
  if (s.sub) html += `<p class="sub">${nl2br(s.sub)}</p>`
  if (s.button) html += `<div class="btn">${esc(s.button)}</div>`
  return html
}

function pageHtml(s) {
  const white = s.theme === 'indigo'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body { font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;
    background:${white ? '#6366F1' : '#FAF7F2'}; color:${white ? '#fff' : '#1E1B2E'};
    position:relative; -webkit-font-smoothing:antialiased; }
  .bg1,.bg2 { position:absolute; border-radius:56px; opacity:${white ? '0.10' : '0.05'};
    background:${white ? '#fff' : '#6366F1'}; }
  .bg1 { width:440px; height:440px; top:-130px; right:-120px; transform:rotate(18deg); }
  .bg2 { width:360px; height:360px; bottom:-120px; left:-120px; transform:rotate(12deg); }
  .header { position:absolute; top:96px; left:0; right:0; display:flex; align-items:center;
    justify-content:center; gap:16px; }
  .mark { width:52px; height:52px; border-radius:14px; display:flex; align-items:center;
    justify-content:center; box-shadow:0 6px 18px rgba(79,70,229,.25); }
  .wordmark { font-size:38px; font-weight:700; letter-spacing:-0.01em; color:${white ? '#fff' : '#1E1B2E'}; }
  .stage { position:absolute; inset:0; padding:210px 90px 200px; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; }
  .kicker { font-size:25px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:${white ? '#fff' : '#6366F1'};
    background:${white ? 'rgba(255,255,255,.16)' : 'rgba(99,102,241,.10)'};
    padding:14px 28px; border-radius:999px; margin-bottom:38px; }
  .title { font-size:92px; font-weight:700; line-height:1.04; letter-spacing:-0.025em; }
  .title.hero { font-size:116px; }
  .sub { font-size:40px; line-height:1.4; margin-top:40px; max-width:780px; font-weight:400;
    color:${white ? 'rgba(255,255,255,.92)' : '#5A5668'}; }
  .list { margin-top:52px; display:flex; flex-direction:column; gap:34px; align-items:stretch;
    width:100%; max-width:820px; }
  .li { display:flex; align-items:center; gap:28px; text-align:left; }
  .check { flex:0 0 auto; width:58px; height:58px; border-radius:16px; background:#6366F1;
    display:flex; align-items:center; justify-content:center; box-shadow:0 8px 20px rgba(79,70,229,.25); }
  .li-text { display:flex; flex-direction:column; gap:6px; }
  .li-text b { font-size:42px; font-weight:700; color:#1E1B2E; }
  .li-text span { font-size:32px; color:#6E6A7C; }
  .btn { margin-top:52px; background:#fff; color:#4F46E5; font-size:44px; font-weight:700;
    padding:28px 60px; border-radius:999px; box-shadow:0 14px 34px rgba(0,0,0,.18); }
  .footer { position:absolute; bottom:120px; left:0; right:0; text-align:center; font-size:32px;
    font-weight:700; color:${white ? 'rgba(255,255,255,.95)' : '#9A95A6'}; }
  </style></head><body>
    <div class="bg1"></div><div class="bg2"></div>
    <div class="header">${logoMark(white)}<span class="wordmark">SemBan</span></div>
    <div class="stage">${bodyHtml(s)}</div>
    ${s.note ? `<div class="footer">${esc(s.note)}</div>` : ''}
  </body></html>`
}

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
})
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
let total = 0
for (const set of SETS) {
  for (const s of set.slides) {
    await page.setContent(pageHtml(s), { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(OUT, `${s.file}.png`), clip: { x: 0, y: 0, width: W, height: H } })
    console.log('✓', s.file)
    total++
  }
}
await browser.close()
console.log(`\nFertig: ${total} Karussell-Slides (4:5) in ${SETS.length} Sets → ${OUT}`)
