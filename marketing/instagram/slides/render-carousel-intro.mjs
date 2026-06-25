// Rendert das Feed-Karussell "Was ist SemBan?" (4:5, 1080x1350) als PNG.
// Angepinnter Erst-Post: Cover → Problem → Lösung → kostenlos → CTA.
//   node marketing/instagram/slides/render-carousel-intro.mjs
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

const SLIDES = [
  { file: 'carousel-intro-1', theme: 'indigo', hero: true, kicker: 'Lernplaner für Studis',
    title: 'Was ist\nSemBan?',
    sub: 'Swipe — und versteh es in 30 Sekunden.', note: 'Swipe →' },

  { file: 'carousel-intro-2', theme: 'paper', kicker: 'Das Problem',
    title: '5 Kurse.\n100 Deadlines.',
    sub: 'Übungsblätter, Hausarbeiten, Referate, Klausuren — alles parallel. Dein Kalender? Überfordert.' },

  { file: 'carousel-intro-3', theme: 'paper', kicker: 'Die Lösung',
    title: 'Alles, was dein\nSemester braucht.',
    list: [
      { label: 'Fristen-Board', desc: 'farbcodiert nach Kurs, »Diese Woche« zuerst' },
      { label: 'Lernplan', desc: 'verteilt auf Lern-Sessions, auf Knopfdruck' },
      { label: 'Noten & ECTS', desc: 'dein Fortschritt übers ganze Studium' },
    ] },

  { file: 'carousel-intro-4', theme: 'paper', kicker: 'Und das Beste',
    title: 'Kostenlos.\nWerbefrei. Offline.',
    sub: 'Kein Account nötig zum Start. Deine Daten bleiben auf deinem Gerät.' },

  { file: 'carousel-intro-5', theme: 'indigo', kicker: 'Bereit?',
    title: 'Hol dir den\nÜberblick.',
    sub: 'In unter einer Minute startklar.',
    button: 'SemBan öffnen', note: 'Link in Bio ↑' },
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
for (const s of SLIDES) {
  await page.setContent(pageHtml(s), { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(OUT, `${s.file}.png`), clip: { x: 0, y: 0, width: W, height: H } })
  console.log('✓', s.file)
}
await browser.close()
console.log(`\nFertig: ${SLIDES.length} Karussell-Slides (4:5) → ${OUT}`)
