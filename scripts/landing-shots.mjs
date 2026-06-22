// Erzeugt frische Landing-Screenshots aus der echten App (Demo-Daten).
// Nutzung: vite dev starten, dann `node scripts/landing-shots.mjs`.
import { chromium } from 'playwright-core'

const URL = process.env.URL || 'http://localhost:5179'
const EXE =
  process.env.CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const shots = [
  ['Aufgaben', 'board'],
  ['Stundenplan', 'schedule'],
  ['Studium', 'study'],
  ['Lernpläne', 'plans'],
]

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
})
const ctx = await browser.newContext({
  viewport: { width: 1320, height: 880 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()

// Tour-Overlay unterdrücken (würde Klicks abfangen).
await page.addInitScript(() => localStorage.setItem('semban:tourSeen:local', '1'))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

// Onboarding → Beispieldaten laden
await page.getByText('Erst mal mit Beispieldaten erkunden').click()
await page.waitForTimeout(3000) // seed + render

// Demo-Banner ausblenden (Daten bleiben in IndexedDB) und neu laden
await page.evaluate(() => localStorage.setItem('semban:demo', '0'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const nav = page.locator('nav[data-tour="nav"]')

for (const [label, file] of shots) {
  await nav.getByRole('button', { name: label }).first().click()
  await page.waitForTimeout(1400)

  if (file === 'plans') {
    // ANA2 hat den Demo-Lernplan – auswählen statt Default-Kurs.
    await page.getByRole('button', { name: 'ANA2' }).first().click()
    await page.waitForTimeout(900)
    // Zur Materialverteilung scrollen, damit Varianten + Diagramm im Bild sind.
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h2, h3, p, span, div')].find((n) =>
        n.textContent?.trim().startsWith('Welcher Plan passt'),
      )
      heading?.scrollIntoView({ block: 'start' })
    })
    await page.waitForTimeout(700)
  }

  await page.screenshot({ path: `public/landing/${file}.png` })
  console.log('shot:', file)
}

await browser.close()
console.log('done')
