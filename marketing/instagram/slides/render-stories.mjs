// Rendert alle Story-Slides (9:16, 1080x1920) als PNG – mit dem in node_modules
// vorhandenen playwright-core + lokalem Chromium. Kein externer Bilddienst.
//
//   node marketing/instagram/slides/render-stories.mjs
//
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
]
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))

// ---------------------------------------------------------------- Slide-Daten
// Copy aus Studi-Sicht: erst Schmerz, dann Lösung, Nutzen vor Feature.
const SLIDES = [
  // 1 · TIPPS ---------------------------------------------------------------
  { file: 'tipp-1', theme: 'paper', kicker: 'Lerntipp',
    title: 'Fang früher an.\nNicht härter.',
    sub: 'Verteiltes Lernen schlägt jede Nachtschicht. Jedes Mal.' },
  { file: 'tipp-2', theme: 'paper', kicker: 'Lerntipp',
    title: 'Plane die Woche,\nnicht den Tag.',
    sub: '10 Minuten am Sonntag: Was steht an? Was zuerst?' },
  { file: 'tipp-3', theme: 'paper', kicker: 'Überblick',
    title: 'Folge der Ampel.',
    dots: [
      { c: '#EF4444', label: 'überfällig' },
      { c: '#F59E0B', label: 'heute fällig' },
      { c: '#EAB308', label: 'diese Woche' },
    ] },
  { file: 'tipp-4', theme: 'paper', kicker: 'Dranbleiben',
    title: 'Teile Großes\nin Kleines.',
    sub: 'Eine Hausarbeit sind acht kleine Schritte — kein einziger Berg.' },

  // 2 · UPDATES -------------------------------------------------------------
  { file: 'update-1', theme: 'paper', kicker: 'Build in Public',
    title: 'Wir bauen\noffen weiter.',
    sub: 'Neue Features landen hier zuerst — und euer Feedback formt sie mit.' },
  { file: 'update-2', theme: 'indigo', kicker: 'Bald?',
    title: 'Dein\nKI-Lerncoach.',
    sub: 'Kennt deinen Plan, deine Fristen und Noten — und sagt dir, was heute dran ist.',
    note: 'Würdest du ihn nutzen? Stimm ab ↑' },
]

// ----------------------------------------------------------------- Template
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
  const white = s.theme === 'indigo'
  let html = ''
  if (s.kicker) html += `<div class="kicker">${esc(s.kicker)}</div>`
  html += `<h1 class="title${s.hero ? ' hero' : ''}">${nl2br(s.title)}</h1>`

  if (s.code) {
    html += `<div class="capture">
      <span class="kbd">n</span>
      <span class="plus">+</span>
      <span class="chip"><span>Blatt&nbsp;3</span> <span class="t-course">#ana2</span> <span class="t-type">@übung</span> <span class="t-due">!fr</span></span>
    </div>`
  }
  if (s.pills) {
    html += `<div class="pills">${s.pills
      .map((p) => `<span class="pill"><i></i>${esc(p)}</span>`)
      .join('')}</div>`
  }
  if (s.dots) {
    html += `<div class="dots">${s.dots
      .map((d) => `<div class="dot-row"><span class="dot" style="background:${d.c}"></span><span class="dot-label">${esc(d.label)}</span></div>`)
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
  html,body { width:1080px; height:1920px; overflow:hidden; }
  body {
    font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;
    background:${white ? '#6366F1' : '#FAF7F2'};
    color:${white ? '#ffffff' : '#1E1B2E'};
    position:relative; -webkit-font-smoothing:antialiased;
  }
  /* dezente Hintergrund-Textur */
  .bg1,.bg2 { position:absolute; border-radius:64px; opacity:${white ? '0.10' : '0.05'};
    background:${white ? '#ffffff' : '#6366F1'}; }
  .bg1 { width:520px; height:520px; top:-160px; right:-150px; transform:rotate(18deg); }
  .bg2 { width:420px; height:420px; bottom:-140px; left:-150px; transform:rotate(12deg); border-radius:56px; }

  .header { position:absolute; top:150px; left:0; right:0;
    display:flex; align-items:center; justify-content:center; gap:18px; }
  .mark { width:60px; height:60px; border-radius:14px; box-shadow:0 6px 18px rgba(42,42,110,.28); }
  .wordmark { font-size:42px; font-weight:700; letter-spacing:-0.01em;
    color:${white ? '#ffffff' : '#2a2a6e'}; }

  .stage { position:absolute; inset:0; padding:330px 96px 330px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; }

  .kicker { font-size:27px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:${white ? '#ffffff' : '#6366F1'};
    background:${white ? 'rgba(255,255,255,.16)' : 'rgba(99,102,241,.10)'};
    padding:16px 30px; border-radius:999px; margin-bottom:46px; }

  .title { font-size:104px; font-weight:700; line-height:1.04; letter-spacing:-0.025em; }
  .title.hero { font-size:118px; }

  .sub { font-size:43px; line-height:1.4; margin-top:48px; max-width:840px;
    color:${white ? 'rgba(255,255,255,.92)' : '#5A5668'}; font-weight:400; }

  .pills { display:flex; flex-wrap:wrap; gap:24px; justify-content:center;
    margin-top:60px; max-width:920px; }
  .pill { display:inline-flex; align-items:center; gap:18px; background:#fff;
    border:2px solid rgba(99,102,241,.18); color:#1E1B2E; font-size:42px; font-weight:700;
    padding:22px 40px; border-radius:999px; box-shadow:0 8px 22px rgba(30,27,46,.05); }
  .pill i { width:18px; height:18px; border-radius:50%; background:#6366F1; display:block; }

  .dots { margin-top:64px; display:flex; flex-direction:column; gap:36px; align-items:flex-start; }
  .dot-row { display:flex; align-items:center; gap:34px; }
  .dot { width:46px; height:46px; border-radius:50%; box-shadow:0 6px 16px rgba(0,0,0,.12); }
  .dot-label { font-size:52px; font-weight:700; color:#1E1B2E; }

  .capture { margin-top:60px; display:flex; flex-direction:column; align-items:center; gap:26px; }
  .kbd { font-size:46px; font-weight:700; color:#1E1B2E; background:#fff; border:2px solid #E4E0D8;
    border-bottom-width:6px; border-radius:18px; padding:12px 34px; }
  .plus { font-size:40px; color:#9A95A6; }
  .chip { font-family:'DejaVu Sans Mono',monospace; font-size:40px; background:#fff;
    border:2px solid rgba(99,102,241,.18); border-radius:22px; padding:26px 38px;
    color:#1E1B2E; box-shadow:0 10px 26px rgba(30,27,46,.06); }
  .chip .t-course { color:#6366F1; font-weight:700; }
  .chip .t-type { color:#D97706; font-weight:700; }
  .chip .t-due { color:#EF4444; font-weight:700; }

  .btn { margin-top:64px; background:#fff; color:#4F46E5; font-size:46px; font-weight:700;
    padding:30px 64px; border-radius:999px; box-shadow:0 14px 34px rgba(0,0,0,.18); }

  .footer { position:absolute; bottom:188px; left:0; right:0; text-align:center;
    font-size:34px; font-weight:700; letter-spacing:.01em;
    color:${white ? 'rgba(255,255,255,.95)' : '#9A95A6'}; }
  </style></head><body>
    <div class="bg1"></div><div class="bg2"></div>
    <div class="header">${logoMark()}<span class="wordmark">SemBan</span></div>
    <div class="stage">${body(s)}</div>
    ${s.note ? `<div class="footer">${esc(s.note)}</div>` : ''}
  </body></html>`
}

// --------------------------------------------------------------------- Render
const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
})
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
for (const s of SLIDES) {
  await page.setContent(pageHtml(s), { waitUntil: 'networkidle' })
  const path = join(OUT, `story-${s.file}.png`)
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  console.log('✓', path)
}
await browser.close()
console.log(`\nFertig: ${SLIDES.length} Slides → ${OUT}`)
