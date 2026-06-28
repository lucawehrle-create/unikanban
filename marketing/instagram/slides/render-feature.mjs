// Rendert den Feature-Story-Slider (9:16, 1080x1920) als PNG.
// Eigenständige Feature-Tour: Cover -> 6 Features (Nutzen vor Feature) -> CTA.
//   node marketing/instagram/slides/render-feature.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
]
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))

// Echte App-Screenshots (wie auf der Landing-Page) als Base64-Data-URI einbetten,
// damit der Headless-Browser sie ohne lokalen Server laden kann.
const SHOT_DIR = join(__dirname, '../../../public/landing')
const shotCache = {}
const shotUri = (file) =>
  (shotCache[file] ??= `data:image/png;base64,${readFileSync(join(SHOT_DIR, file)).toString('base64')}`)

// ----------------------------------------------------------------- Slides
const SLIDES = [
  { file: 'feat-1', theme: 'indigo', hero: true, kicker: 'Feature-Tour',
    title: 'Sechs Features.\nNull Chaos.',
    sub: 'Swipe durch alles, was dein Semester sortiert.',
    note: 'Swipe →' },

  { file: 'feat-2', theme: 'paper', kicker: 'Feature 1 · Schnell-Erfassen',
    title: 'Aufgaben in\n5 Sekunden.',
    code: true,
    sub: 'Eine Taste, ein Satz — Kurs, Typ und Frist werden automatisch erkannt. Keine Formulare, kein Klicken durch Menüs.' },

  { file: 'feat-3', theme: 'paper', kicker: 'Feature 2 · Auto-Wochenblätter',
    title: 'Einmal einstellen.\nGanzes Semester.',
    flow: ['Kurs einmal definieren', 'Rhythmus: wöchentlich', 'Alle Blätter stehen automatisch'],
    sub: 'Wiederkehrende Abgaben legst du nie wieder von Hand an.' },

  { file: 'feat-4', theme: 'paper', kicker: 'Feature 3 · Fristen-Board',
    title: 'Drei Farben.\nVoller Überblick.',
    shot: 'board.png',
    sub: 'Farbcodiert nach Kurs, »Diese Woche« zuerst.' },

  { file: 'feat-5', theme: 'paper', kicker: 'Feature 4 · Lernplan',
    title: 'Lernplan auf\nKnopfdruck.',
    shot: 'plans.png',
    sub: 'Klausurdatum rein → verteilter Plan über mehrere Tage.' },

  { file: 'feat-6', theme: 'paper', kicker: 'Feature 5 · Stundenplan',
    title: 'Wo du gerade\nsein solltest.',
    shot: 'schedule.png',
    sub: 'Wochenraster mit Jetzt-Linie und Anwesenheit.' },

  { file: 'feat-7', theme: 'paper', kicker: 'Feature 6 · Noten & ECTS',
    title: 'Sieh, wie weit\ndu bist.',
    shot: 'study.png',
    sub: 'Notenschnitt & ECTS — live berechnet, pro Semester.' },

  { file: 'feat-8', theme: 'indigo', kicker: 'Alles drin?',
    title: 'Und alles\nan einem Ort.',
    sub: 'Kostenlos, werbefrei, offline. In unter einer Minute startklar.',
    button: 'SemBan öffnen', note: 'Link in Bio ↑' },
]

// ---------------------------------------------------------------- Template
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nl2br = (s) => esc(s).replace(/\n/g, '<br>')

function logoMark() {
  // Echtes SemBan-Markenzeichen (1:1 wie src/components/Logo.tsx / public/icon.svg).
  return `<svg class="mark" width="60" height="60" viewBox="0 0 512 512" role="img" aria-label="SemBan">
    <rect width="512" height="512" rx="112" fill="#2a2a6e"/>
    <rect x="120" y="220" width="64" height="172" rx="32" fill="#ffffff"/>
    <rect x="216" y="150" width="64" height="242" rx="32" fill="#ffffff"/>
    <rect x="316" y="178" width="76" height="76" rx="20" fill="#f5c645"/>
    <path d="M340 202 L368 230 M368 202 L340 230" stroke="#16161d" stroke-width="18" stroke-linecap="round"/>
    <rect x="316" y="272" width="76" height="120" rx="38" fill="#e9633c"/>
  </svg>`
}

function body(s) {
  let html = ''
  if (s.kicker) html += `<div class="kicker">${esc(s.kicker)}</div>`
  html += `<h1 class="title${s.hero ? ' hero' : ''}">${nl2br(s.title)}</h1>`
  if (s.flow) {
    html += `<div class="flow">${s.flow
      .map((f, i) => `${i ? '<span class="arrow">↓</span>' : ''}<span class="step">${esc(f)}</span>`)
      .join('')}</div>`
  }
  if (s.badges) {
    html += `<div class="badges">${s.badges
      .map((b) => `<div class="badge"><span class="dot" style="background:${b.dot}"></span>
        <span class="b-text"><b>${esc(b.label)}</b><span>${esc(b.desc)}</span></span></div>`)
      .join('')}</div>`
  }
  if (s.code) {
    html += `<div class="capture">
      <span class="kbd">n</span><span class="plus">+</span>
      <span class="chip"><span>Blatt&nbsp;3</span> <span class="t-course">#ana2</span> <span class="t-type">@übung</span> <span class="t-due">!fr</span></span>
    </div>`
  }
  if (s.shot) {
    html += `<div class="frame">
      <div class="bar"><span class="d" style="background:#FCA5A5"></span><span class="d" style="background:#FCD34D"></span><span class="d" style="background:#6EE7B7"></span><span class="url">semban.de</span></div>
      <img src="${shotUri(s.shot)}" alt="">
    </div>`
  }
  if (s.sub) html += `<p class="sub">${nl2br(s.sub)}</p>`
  if (s.button) html += `<div class="btn">${esc(s.button)}</div>`
  return html
}

function pageHtml(s) {
  const white = s.theme === 'indigo'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1920px; overflow:hidden; }
  body { font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;
    background:${white ? '#6366F1' : '#FAF7F2'}; color:${white ? '#fff' : '#1E1B2E'};
    position:relative; -webkit-font-smoothing:antialiased; }
  .bg1,.bg2 { position:absolute; border-radius:64px; opacity:${white ? '0.10' : '0.05'};
    background:${white ? '#fff' : '#6366F1'}; }
  .bg1 { width:520px; height:520px; top:-160px; right:-150px; transform:rotate(18deg); }
  .bg2 { width:420px; height:420px; bottom:-140px; left:-150px; transform:rotate(12deg); }
  .header { position:absolute; top:150px; left:0; right:0; display:flex; align-items:center;
    justify-content:center; gap:18px; }
  .mark { width:60px; height:60px; border-radius:14px; box-shadow:0 6px 18px rgba(42,42,110,.28); }
  .wordmark { font-size:42px; font-weight:700; letter-spacing:-0.01em; color:${white ? '#fff' : '#2a2a6e'}; }
  .stage { position:absolute; inset:0; padding:330px 96px; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; }
  body.has-shot .stage { padding:250px 80px; }
  body.has-shot .title { font-size:82px; }
  body.has-shot .kicker { margin-bottom:36px; }
  .kicker { font-size:27px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:${white ? '#fff' : '#6366F1'};
    background:${white ? 'rgba(255,255,255,.16)' : 'rgba(99,102,241,.10)'};
    padding:16px 30px; border-radius:999px; margin-bottom:46px; }
  .title { font-size:104px; font-weight:700; line-height:1.04; letter-spacing:-0.025em; }
  .title.hero { font-size:132px; }
  .sub { font-size:43px; line-height:1.4; margin-top:48px; max-width:840px; font-weight:400;
    color:${white ? 'rgba(255,255,255,.92)' : '#5A5668'}; }
  .flow { margin-top:56px; display:flex; flex-direction:column; align-items:center; gap:18px; }
  .step { background:#fff; border:2px solid rgba(99,102,241,.18); color:#1E1B2E; font-size:40px;
    font-weight:700; padding:22px 44px; border-radius:22px; box-shadow:0 8px 22px rgba(30,27,46,.05); }
  .arrow { font-size:40px; color:#6366F1; line-height:1; }
  .badges { margin-top:56px; display:flex; flex-direction:column; gap:28px; width:100%; max-width:760px; }
  .badge { display:flex; align-items:center; gap:30px; text-align:left; background:#fff;
    border:2px solid rgba(99,102,241,.12); border-radius:26px; padding:30px 38px;
    box-shadow:0 8px 22px rgba(30,27,46,.05); }
  .dot { flex:0 0 auto; width:40px; height:40px; border-radius:999px; }
  .b-text { display:flex; flex-direction:column; gap:4px; }
  .b-text b { font-size:44px; font-weight:700; color:#1E1B2E; }
  .b-text span { font-size:32px; color:#6E6A7C; }
  .frame { margin-top:50px; width:912px; border-radius:34px; overflow:hidden; background:#fff;
    box-shadow:0 34px 80px rgba(30,27,46,.20); border:1px solid rgba(0,0,0,.06); }
  .bar { display:flex; align-items:center; gap:14px; padding:24px 32px; background:#F3F1EC;
    border-bottom:1px solid rgba(0,0,0,.06); }
  .bar .d { width:22px; height:22px; border-radius:50%; }
  .bar .url { margin-left:18px; font-size:28px; color:#9A95A6; background:#fff; padding:10px 28px;
    border-radius:999px; border:1px solid rgba(0,0,0,.08); }
  .frame img { display:block; width:100%; }
  .capture { margin-top:60px; display:flex; flex-direction:column; align-items:center; gap:26px; }
  .kbd { font-size:46px; font-weight:700; color:#1E1B2E; background:#fff; border:2px solid #E4E0D8;
    border-bottom-width:6px; border-radius:18px; padding:12px 34px; }
  .plus { font-size:40px; color:#9A95A6; }
  .chip { font-family:'DejaVu Sans Mono',monospace; font-size:40px; background:#fff;
    border:2px solid rgba(99,102,241,.18); border-radius:22px; padding:26px 38px; color:#1E1B2E;
    box-shadow:0 10px 26px rgba(30,27,46,.06); }
  .chip .t-course { color:#6366F1; font-weight:700; }
  .chip .t-type { color:#D97706; font-weight:700; }
  .chip .t-due { color:#EF4444; font-weight:700; }
  .btn { margin-top:64px; background:#fff; color:#4F46E5; font-size:46px; font-weight:700;
    padding:30px 64px; border-radius:999px; box-shadow:0 14px 34px rgba(0,0,0,.18); }
  .footer { position:absolute; bottom:188px; left:0; right:0; text-align:center; font-size:34px;
    font-weight:700; color:${white ? 'rgba(255,255,255,.95)' : '#9A95A6'}; }
  </style></head><body class="${s.shot ? 'has-shot' : ''}">
    <div class="bg1"></div><div class="bg2"></div>
    <div class="header">${logoMark()}<span class="wordmark">SemBan</span></div>
    <div class="stage">${body(s)}</div>
    ${s.note ? `<div class="footer">${esc(s.note)}</div>` : ''}
  </body></html>`
}

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
})
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
for (const s of SLIDES) {
  await page.setContent(pageHtml(s), { waitUntil: 'networkidle' })
  const path = join(OUT, `story-${s.file}.png`)
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  console.log('✓', path)
}
await browser.close()
console.log(`\nFertig: ${SLIDES.length} Feature-Story-Slides → ${OUT}`)
