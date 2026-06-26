// Erzeugt Instagram-native Größen (Breite 1080) aus den hochauflösenden Slides.
// Grund: Instagram skaliert alles auf max. 1080px Breite herunter UND komprimiert
// neu. Wenn wir lokal sauber (supersampled) auf 1080 runterrechnen, muss IG nicht
// mehr skalieren -> schärfere Schrift. 9:16 -> 1080x1920, 4:5 -> 1080x1350.
//   node marketing/instagram/slides/render-ig-native.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'ig')
mkdirSync(OUT, { recursive: true })

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
]
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))

const pngDims = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })
const TARGET_W = 1080

// Alle gerenderten Slides (story-*, carousel-*) — keine Skripte/Unterordner.
const files = readdirSync(__dirname).filter(
  (f) => f.endsWith('.png') && (f.startsWith('story-') || f.startsWith('carousel-')),
)

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
let n = 0
for (const f of files) {
  const buf = readFileSync(join(__dirname, f))
  const { w, h } = pngDims(buf)
  const tw = TARGET_W
  const th = Math.round((h / w) * TARGET_W)
  const uri = `data:image/png;base64,${buf.toString('base64')}`
  // Supersampling per Canvas mit höchster Glättung -> schärfer als IGs Downscale.
  const out = await page.evaluate(
    async ({ uri, tw, th }) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const c = document.createElement('canvas')
      c.width = tw
      c.height = th
      const ctx = c.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, tw, th)
      return c.toDataURL('image/png')
    },
    { uri, tw, th },
  )
  writeFileSync(join(OUT, f), Buffer.from(out.split(',')[1], 'base64'))
  console.log('✓', f, `${tw}x${th}`)
  n++
}
await browser.close()
console.log(`\nFertig: ${n} Instagram-native Slides (Breite ${TARGET_W}) -> ${OUT}`)
