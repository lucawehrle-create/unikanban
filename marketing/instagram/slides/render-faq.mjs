// Rendert den FAQ-Story-Slider (9:16, 1080x1920) als PNG.
// Reframte FAQ: nicht generisch, sondern die echten Fragen/Einwände, die sich
// ein:e Studi VOR dem Start stellt. Antworten faktentreu zur App (Konto nötig,
// kostenlos, privat, Offline-Kopie) — abgeglichen mit der Landing-Page.
//   node marketing/instagram/slides/render-faq.mjs
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

// ----------------------------------------------------------------- Slides
const SLIDES = [
  { file: 'faqx-1', theme: 'indigo', hero: true, kicker: 'Bevor du startest',
    title: 'Ehrliche\nAntworten.',
    sub: 'Die sechs Fragen, die sich vor dem Start wirklich jede:r stellt.',
    note: 'Swipe →' },

  { file: 'faqx-2', theme: 'paper', kicker: 'Frage 1', faq: true,
    title: 'Reicht dafür\nnicht Notion?',
    sub: 'Notion ist ein leeres Blatt — du baust und pflegst alles selbst. SemBan kennt Übungsblätter, Fristen und Klausurphasen von Haus aus. Kein Bastel-Projekt.' },

  { file: 'faqx-3', theme: 'paper', kicker: 'Frage 2', faq: true,
    title: 'Wie schnell bin\nich startklar?',
    sub: 'Konto in Sekunden, Grundgerüst in ein paar Minuten: Studiengang und Kurse anlegen — den Rest füllst du nach und nach. Kein Einrichtungs-Marathon.' },

  { file: 'faqx-4', theme: 'paper', kicker: 'Frage 3', faq: true,
    title: 'Muss ich alles\nvon Hand eintragen?',
    sub: 'Nein. Wiederkehrende Übungsblätter legst du einmal an — sie stehen automatisch fürs ganze Semester. Einzelnes erfasst du in Sekunden per Schnell-Eingabe.' },

  { file: 'faqx-5', theme: 'paper', kicker: 'Frage 4', faq: true,
    title: 'Mitten im Semester\nzu spät?',
    sub: 'Nie. Trag ab heute ein, was ansteht — Board und Lernplan richten sich nach deinem echten Datum, nicht nach dem Semesterstart.' },

  { file: 'faqx-6', theme: 'paper', kicker: 'Frage 5', faq: true,
    title: 'Was kostet das\n— wirklich?',
    sub: 'Nichts. Komplett kostenlos und werbefrei: kein Abo, keine Testphase, die später Geld kostet, kein »Premium« hinter der nächsten Tür.' },

  { file: 'faqx-7', theme: 'paper', kicker: 'Frage 6', faq: true,
    title: 'Konto — und was\nist mit meinen Daten?',
    sub: 'Ja, ein kostenloses Konto, damit Handy und Laptop synchron sind. Deine Daten bleiben privat: Zugriff hast nur du, eine Kopie liegt offline auf dem Gerät, alles jederzeit löschbar.' },

  { file: 'faqx-8', theme: 'indigo', kicker: 'Noch was offen?',
    title: 'Frag uns\nalles.',
    sub: 'Per DM oder Frage-Sticker — wir antworten ehrlich.',
    button: 'SemBan öffnen', note: 'Frage-Sticker ↑' },
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
  if (s.faq) html += `<div class="qmark">?</div>`
  html += `<h1 class="title${s.hero ? ' hero' : ''}">${nl2br(s.title)}</h1>`
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
  .kicker { font-size:27px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:${white ? '#fff' : '#6366F1'};
    background:${white ? 'rgba(255,255,255,.16)' : 'rgba(99,102,241,.10)'};
    padding:16px 30px; border-radius:999px; margin-bottom:40px; }
  .qmark { width:104px; height:104px; border-radius:28px; background:#6366F1; color:#fff;
    font-size:68px; font-weight:700; display:flex; align-items:center; justify-content:center;
    margin-bottom:42px; box-shadow:0 12px 30px rgba(79,70,229,.28); }
  .title { font-size:94px; font-weight:700; line-height:1.05; letter-spacing:-0.025em; }
  .title.hero { font-size:132px; }
  .sub { font-size:43px; line-height:1.42; margin-top:44px; max-width:850px; font-weight:400;
    color:${white ? 'rgba(255,255,255,.92)' : '#5A5668'}; }
  .btn { margin-top:64px; background:#fff; color:#4F46E5; font-size:46px; font-weight:700;
    padding:30px 64px; border-radius:999px; box-shadow:0 14px 34px rgba(0,0,0,.18); }
  .footer { position:absolute; bottom:188px; left:0; right:0; text-align:center; font-size:34px;
    font-weight:700; color:${white ? 'rgba(255,255,255,.95)' : '#9A95A6'}; }
  </style></head><body>
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
console.log(`\nFertig: ${SLIDES.length} FAQ-Slides → ${OUT}`)
