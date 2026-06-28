// Rendert Instagram-Profilbilder (1:1, 1080x1080) mit dem ECHTEN SemBan-Logo
// (Balken-Kachel, 1:1 wie src/components/Logo.tsx). Kreis-sicher: Motiv mittig,
// gut im Instagram-Kreis-Zuschnitt. Drei Varianten zur Auswahl.
//   node marketing/instagram/visuals/render-profil.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const S = 1080
const CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
].find(existsSync)

// Die vier Icon-Formen aus icon.svg (Koordinaten im 512er-Raster).
const iconShapes = (whiteBars = true) => `
  <rect x="120" y="220" width="64" height="172" rx="32" fill="${whiteBars ? '#ffffff' : '#ffffff'}"/>
  <rect x="216" y="150" width="64" height="242" rx="32" fill="#ffffff"/>
  <rect x="316" y="178" width="76" height="76" rx="20" fill="#f5c645"/>
  <path d="M340 202 L368 230 M368 202 L340 230" stroke="#16161d" stroke-width="18" stroke-linecap="round"/>
  <rect x="316" y="272" width="76" height="120" rx="38" fill="#e9633c"/>`

// Variante A — Navy randlos: Balken groß & mittig auf navy Grund (ikonisch).
const navy = `<!doctype html><meta charset="utf-8"><div style="width:${S}px;height:${S}px">
<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><radialGradient id="g" cx="38%" cy="32%" r="80%">
    <stop offset="0%" stop-color="#34336f"/><stop offset="100%" stop-color="#23234f"/>
  </radialGradient></defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
  <g transform="translate(2.4,-29.1) scale(2.1)">${iconShapes()}</g>
</svg></div>`

// Variante B — Cream-Badge: navy Logo-Kachel mittig mit weichem Schatten.
const cream = `<!doctype html><meta charset="utf-8"><div style="width:${S}px;height:${S}px">
<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="26" stdDeviation="34" flood-color="#2a2a6e" flood-opacity="0.28"/>
  </filter></defs>
  <rect width="${S}" height="${S}" fill="#FAF7F2"/>
  <g filter="url(#sh)">
    <g transform="translate(220,220) scale(1.25)">
      <rect width="512" height="512" rx="112" fill="#2a2a6e"/>${iconShapes()}
    </g>
  </g>
</svg></div>`

// Variante C — Indigo randlos: Balken auf Marken-Indigo (lebendig).
const indigo = `<!doctype html><meta charset="utf-8"><div style="width:${S}px;height:${S}px">
<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><radialGradient id="gi" cx="36%" cy="30%" r="82%">
    <stop offset="0%" stop-color="#7C7FF2"/><stop offset="100%" stop-color="#5B5EE0"/>
  </radialGradient></defs>
  <rect width="${S}" height="${S}" fill="url(#gi)"/>
  <g transform="translate(2.4,-29.1) scale(2.1)">${iconShapes()}</g>
</svg></div>`

const VARIANTS = [
  { file: 'profil-navy.png', html: navy },
  { file: 'profil-cream.png', html: cream },
  { file: 'profil-indigo.png', html: indigo },
]

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: S, height: S }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
for (const v of VARIANTS) {
  await page.setContent(v.html, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(OUT, v.file), clip: { x: 0, y: 0, width: S, height: S } })
  console.log('✓', v.file)
}
await browser.close()
console.log(`\nFertig: ${VARIANTS.length} Profilbild-Varianten (1080x1080) → ${OUT}`)
