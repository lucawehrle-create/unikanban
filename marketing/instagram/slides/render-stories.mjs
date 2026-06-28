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
// Der Tipp-Block ist als zusammenhängender Slider gebaut: Cover-Hook →
// 4 nummerierte Tipps (je mit eigener Mini-Visualisierung) → CTA-Abschluss.
const SLIDES = [
  // 1 · TIPPS  (Slider: Cover · 01–04 · CTA) --------------------------------
  { file: 'tipp-1', kind: 'cover', theme: 'indigo', kicker: 'Mini-Guide',
    title: '4 Lerntipps\nfürs Semester.',
    sub: 'Die uns selbst durch jede Klausurenphase getragen haben.',
    note: 'Swipe → · Quiz: Wann lernst du?' },

  { file: 'tipp-2', kind: 'tip', theme: 'paper', step: 1, num: '01', kicker: 'Lerntipp',
    title: 'Fang früher an.\nNicht härter.',
    visual: 'bars',
    sub: 'Verteiltes Lernen schlägt jede Nachtschicht. Jedes Mal.' },

  { file: 'tipp-3', kind: 'tip', theme: 'paper', step: 2, num: '02', kicker: 'Lerntipp',
    title: 'Plane die Woche,\nnicht den Tag.',
    visual: 'week',
    sub: '10 Minuten am Sonntag: Was steht an? Was zuerst?' },

  { file: 'tipp-4', kind: 'tip', theme: 'paper', step: 3, num: '03', kicker: 'Überblick',
    title: 'Folge der Ampel.',
    visual: 'ampel',
    dots: [
      { c: '#EF4444', label: 'überfällig', hint: 'sofort ran' },
      { c: '#F59E0B', label: 'heute fällig', hint: 'heute erledigen' },
      { c: '#EAB308', label: 'diese Woche', hint: 'einplanen' },
    ] },

  { file: 'tipp-5', kind: 'tip', theme: 'paper', step: 4, num: '04', kicker: 'Dranbleiben',
    title: 'Teile Großes\nin Kleines.',
    visual: 'split',
    sub: 'Eine Hausarbeit sind acht kleine Schritte — kein einziger Berg.' },

  { file: 'tipp-6', kind: 'cta', theme: 'indigo', kicker: 'Und das Tool dafür?',
    title: 'SemBan macht\ndas Planen.',
    sub: 'Wochenplan, Ampel-Board und Lernplan auf Knopfdruck — alles eingebaut.',
    button: 'SemBan öffnen', note: 'Link in Bio ↑' },

  // 2 · UPDATES -------------------------------------------------------------
  { file: 'update-1', kind: 'plain', theme: 'paper', kicker: 'Build in Public',
    title: 'Wir bauen\noffen weiter.',
    sub: 'Neue Features landen hier zuerst — und euer Feedback formt sie mit.' },
  { file: 'update-2', kind: 'plain', theme: 'indigo', kicker: 'Bald?',
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

// Fortschrittsanzeige der 4er-Serie (aktiver Schritt = Pille).
function progress(step) {
  let html = '<div class="progress">'
  for (let i = 1; i <= 4; i++) html += `<span class="pdot${i === step ? ' on' : ''}"></span>`
  html += '</div>'
  return html
}

// ----- Mini-Visualisierungen je Tipp -----
function visualBars() {
  // Verteilt (5 kleine grüne Sessions) vs. eine rote Nachtschicht.
  const small = [86, 64, 92, 70, 80].map((h) => `<span class="bar g" style="height:${h}px"></span>`).join('')
  return `<div class="vcard barscard">
    <div class="barcol">
      <div class="bars">${small}</div>
      <div class="blabel">5× 20 Min · verteilt</div>
    </div>
    <div class="vsep">statt</div>
    <div class="barcol">
      <div class="bars"><span class="bar r" style="height:240px"></span></div>
      <div class="blabel red">1 Nachtschicht</div>
    </div>
  </div>`
}

function visualWeek() {
  // Wochenstreifen Mo–So; ein paar Tage mit Aufgaben-Punkten, Sonntag = Planungstag.
  const days = [
    { d: 'Mo', t: ['#6366F1'] },
    { d: 'Di', t: [] },
    { d: 'Mi', t: ['#F59E0B'] },
    { d: 'Do', t: [] },
    { d: 'Fr', t: ['#6366F1', '#EF4444'] },
    { d: 'Sa', t: [] },
    { d: 'So', plan: true },
  ]
  const cells = days
    .map((x) => {
      const dots = (x.t || []).map((c) => `<i style="background:${c}"></i>`).join('')
      return `<div class="day${x.plan ? ' plan' : ''}"><span class="dname">${x.d}</span>
        <div class="dtasks">${x.plan ? '★' : dots}</div></div>`
    })
    .join('')
  return `<div class="vcard weekcard">${cells}</div>`
}

function visualAmpel(dots) {
  const rows = dots
    .map(
      (d) => `<div class="arow"><span class="adot" style="background:${d.c}"></span>
        <span class="alabel">${esc(d.label)}</span>
        <span class="ahint">${esc(d.hint)}</span></div>`,
    )
    .join('')
  return `<div class="vcard ampelcard">${rows}</div>`
}

function visualSplit() {
  // Ein Berg (Hausarbeit) zerfällt in kleine, abhakbare Schritte.
  const steps = [
    { t: 'Thema eingrenzen', done: true },
    { t: 'Quellen sammeln', done: false },
    { t: 'Gliederung', done: false },
    { t: '… 5 weitere', done: false },
  ]
  const items = steps
    .map(
      (s) => `<div class="sstep${s.done ? ' done' : ''}"><span class="sbox">${s.done ? '✓' : ''}</span>${esc(s.t)}</div>`,
    )
    .join('')
  return `<div class="vcard splitcard">
    <div class="bigblock">Hausarbeit</div>
    <div class="sarrow">↓</div>
    <div class="ssteps">${items}</div>
  </div>`
}

function tipVisual(s) {
  if (s.visual === 'bars') return visualBars()
  if (s.visual === 'week') return visualWeek()
  if (s.visual === 'ampel') return visualAmpel(s.dots)
  if (s.visual === 'split') return visualSplit()
  return ''
}

// ----- Stage-Inhalte je Slide-Typ -----
function tipStage(s) {
  return `${progress(s.step)}
    <div class="numrow"><span class="num">${esc(s.num)}</span>
      <span class="kicker pill">${esc(s.kicker)}</span></div>
    <h1 class="title tiptitle">${nl2br(s.title)}</h1>
    ${tipVisual(s)}
    ${s.sub ? `<p class="sub">${nl2br(s.sub)}</p>` : ''}`
}

function genericStage(s) {
  let html = ''
  if (s.kicker) html += `<div class="kicker pill">${esc(s.kicker)}</div>`
  html += `<h1 class="title${s.kind === 'cover' ? ' hero' : ''}">${nl2br(s.title)}</h1>`
  if (s.sub) html += `<p class="sub">${nl2br(s.sub)}</p>`
  if (s.button) html += `<div class="btn">${esc(s.button)}</div>`
  return html
}

function pageHtml(s) {
  const white = s.theme === 'indigo'
  const stage = s.kind === 'tip' ? tipStage(s) : genericStage(s)
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

  .stage { position:absolute; inset:0; padding:300px 96px 300px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; }

  .kicker { font-size:27px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:${white ? '#ffffff' : '#6366F1'};
    background:${white ? 'rgba(255,255,255,.16)' : 'rgba(99,102,241,.10)'};
    padding:16px 30px; border-radius:999px; }
  .pill { display:inline-block; }
  .stage > .kicker { margin-bottom:46px; }

  .title { font-size:104px; font-weight:700; line-height:1.04; letter-spacing:-0.025em; }
  .title.hero { font-size:124px; }
  .tiptitle { font-size:92px; }

  .sub { font-size:43px; line-height:1.4; margin-top:48px; max-width:840px;
    color:${white ? 'rgba(255,255,255,.92)' : '#5A5668'}; font-weight:400; }
  .tip-sub, .stage .sub { }

  /* ---- Tipp-Slider: Fortschritt + Nummer ---- */
  .progress { display:flex; gap:16px; align-items:center; margin-bottom:44px; }
  .pdot { width:18px; height:18px; border-radius:999px; background:rgba(99,102,241,.22); }
  .pdot.on { width:56px; background:#6366F1; }
  .numrow { display:flex; align-items:center; gap:26px; margin-bottom:40px; }
  .num { font-size:60px; font-weight:800; line-height:1; color:#fff; background:#6366F1;
    width:108px; height:108px; border-radius:28px; display:flex; align-items:center;
    justify-content:center; letter-spacing:-0.02em; box-shadow:0 14px 30px rgba(99,102,241,.32); }
  .numrow .kicker { margin:0; }

  /* ---- Visualisierungs-Karten ---- */
  .vcard { margin-top:56px; background:#fff; border:2px solid rgba(99,102,241,.16);
    border-radius:36px; box-shadow:0 18px 44px rgba(30,27,46,.07); }

  /* verteilt vs. Nachtschicht */
  .barscard { display:flex; align-items:flex-end; justify-content:center; gap:44px;
    padding:52px 56px 44px; }
  .barcol { display:flex; flex-direction:column; align-items:center; gap:24px; }
  .bars { display:flex; align-items:flex-end; gap:14px; height:248px; }
  .bar { width:34px; border-radius:12px; display:block; }
  .bar.g { background:linear-gradient(#34D399,#10B981); }
  .bar.r { width:72px; background:linear-gradient(#F87171,#EF4444); }
  .blabel { font-size:31px; font-weight:700; color:#5A5668; }
  .blabel.red { color:#EF4444; }
  .vsep { align-self:center; font-size:30px; font-weight:700; color:#9A95A6;
    text-transform:uppercase; letter-spacing:.12em; padding-bottom:120px; }

  /* Wochenstreifen */
  .weekcard { display:flex; gap:14px; padding:40px 36px; }
  .day { width:104px; height:150px; border-radius:24px; background:#FAF7F2;
    border:2px solid rgba(99,102,241,.12); display:flex; flex-direction:column;
    align-items:center; justify-content:space-between; padding:22px 0 20px; }
  .day .dname { font-size:34px; font-weight:700; color:#1E1B2E; }
  .day .dtasks { display:flex; gap:8px; align-items:center; min-height:24px; }
  .day .dtasks i { width:20px; height:20px; border-radius:50%; display:block; }
  .day.plan { background:#6366F1; border-color:#6366F1; }
  .day.plan .dname { color:#fff; }
  .day.plan .dtasks { color:#f5c645; font-size:34px; line-height:1; }

  /* Ampel-Legende */
  .ampelcard { display:flex; flex-direction:column; padding:20px 52px; min-width:760px; }
  .arow { display:flex; align-items:center; gap:32px; padding:34px 0;
    border-bottom:2px solid rgba(30,27,46,.06); }
  .arow:last-child { border-bottom:none; }
  .adot { width:48px; height:48px; border-radius:50%; flex:none;
    box-shadow:0 6px 16px rgba(0,0,0,.14); }
  .alabel { font-size:48px; font-weight:700; color:#1E1B2E; }
  .ahint { margin-left:auto; font-size:33px; font-weight:600; color:#9A95A6; }

  /* Großes → Kleines */
  .splitcard { display:flex; flex-direction:column; align-items:center;
    padding:46px 56px 50px; gap:20px; min-width:720px; }
  .bigblock { background:linear-gradient(#6366F1,#4F46E5); color:#fff; font-size:46px;
    font-weight:700; padding:34px 76px; border-radius:24px;
    box-shadow:0 14px 30px rgba(99,102,241,.30); }
  .sarrow { font-size:46px; color:#6366F1; line-height:1; }
  .ssteps { display:flex; flex-direction:column; gap:18px; width:100%; }
  .sstep { display:flex; align-items:center; gap:24px; font-size:38px; font-weight:600;
    color:#1E1B2E; background:#FAF7F2; border:2px solid rgba(99,102,241,.12);
    border-radius:20px; padding:22px 30px; text-align:left; }
  .sstep .sbox { width:44px; height:44px; border-radius:12px; flex:none;
    border:3px solid rgba(99,102,241,.30); display:flex; align-items:center;
    justify-content:center; font-size:30px; color:transparent; }
  .sstep.done { color:#5A5668; }
  .sstep.done .sbox { background:#10B981; border-color:#10B981; color:#fff; }

  .btn { margin-top:64px; background:#fff; color:#4F46E5; font-size:46px; font-weight:700;
    padding:30px 64px; border-radius:999px; box-shadow:0 14px 34px rgba(0,0,0,.18); }

  .footer { position:absolute; bottom:170px; left:0; right:0; text-align:center;
    font-size:34px; font-weight:700; letter-spacing:.01em;
    color:${white ? 'rgba(255,255,255,.95)' : '#9A95A6'}; }
  </style></head><body>
    <div class="bg1"></div><div class="bg2"></div>
    <div class="header">${logoMark()}<span class="wordmark">SemBan</span></div>
    <div class="stage">${stage}</div>
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
