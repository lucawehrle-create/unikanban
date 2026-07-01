import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Instagram, Link2, Loader2, MessageCircle, Share2, X } from 'lucide-react'
import type { RingStat } from '@/lib/studyPlans'

/**
 * Lesbare Text-Variante einer Ringfarbe: helle Farben (z.B. Gelb) werden
 * abgedunkelt, damit die Prozentzahl auf Weiß immer gut lesbar ist.
 */
export function readable(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const f = lum > 0.62 ? 0.58 : lum > 0.5 ? 0.4 : lum > 0.42 ? 0.22 : 0
  const d = (v: number) => Math.round(v * (1 - f))
  return `rgb(${d(r)}, ${d(g)}, ${d(b)})`
}

/**
 * Konzentrische Fortschritts-Ringe im Apple-Activity-Stil. Jeder Ring = eine
 * Vorbereitungsart; gefüllt nach Prozent. Ring/Legende teilen sich den aktiven
 * Index, damit Drüberfahren die Prozente hervorhebt.
 */
export function ActivityRings({
  rings,
  size = 220,
  active,
  onActive,
}: {
  rings: RingStat[]
  size?: number
  active: number | null
  onActive: (i: number | null) => void
}) {
  const c = size / 2
  // Ringgrößen adaptiv aus der Anzahl: so passen ALLE Ringe (auch der innerste,
  // z.B. Karteikarten) mit einem klaren Loch in der Mitte hinein. gap = 0.4·stroke.
  const n = rings.length || 1
  const hole = size * 0.15
  const stroke = (c - 2 - hole) / (n + 0.4 * (n - 1))
  const gap = stroke * 0.4
  const outerR = c - 2 - stroke / 2
  const withMaterial = rings.filter((r) => r.total > 0)
  const overall = withMaterial.length
    ? Math.round(withMaterial.reduce((s, r) => s + r.pct, 0) / withMaterial.length)
    : 0
  const shown = active != null ? rings[active] : null

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((r, i) => {
          const radius = outerR - i * (stroke + gap)
          if (radius <= 0) return null
          const circ = 2 * Math.PI * radius
          const off = circ * (1 - Math.min(100, r.pct) / 100)
          const dim = active != null && active !== i
          return (
            <g
              key={r.kind}
              onMouseEnter={() => onActive(i)}
              onMouseLeave={() => onActive(null)}
              onClick={() => onActive(active === i ? null : i)}
              style={{ cursor: 'pointer' }}
            >
              {/* Breites, unsichtbares Trefferband für bequemes Hovern. */}
              <circle
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                stroke="#000"
                strokeOpacity={0.001}
                strokeWidth={stroke + gap}
                style={{ pointerEvents: 'stroke' }}
              />
              {/* Track (dezente, aber sichtbare Färbung – auch bei hellem Gelb). */}
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color + '33'} strokeWidth={stroke} />
              {/* Fortschritt. */}
              {r.total > 0 && r.pct > 0 && (
                <circle
                  cx={c}
                  cy={c}
                  r={radius}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={off}
                  transform={`rotate(-90 ${c} ${c})`}
                  style={{
                    opacity: dim ? 0.28 : 1,
                    transition: 'stroke-dashoffset .6s ease, opacity .2s',
                  }}
                />
              )}
            </g>
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {shown ? (
          <>
            <span
              className="text-[28px] font-bold leading-none tabular-nums"
              style={{ color: shown.total ? readable(shown.color) : '#a8a29e' }}
            >
              {shown.total ? `${shown.pct}%` : '–'}
            </span>
            <span className="mt-1 max-w-[78%] text-[11px] font-medium leading-tight text-stone-500">
              {shown.label}
            </span>
          </>
        ) : (
          <>
            <span className="text-[30px] font-bold leading-none tabular-nums text-stone-800">
              {overall}%
            </span>
            <span className="mt-1 text-[11px] font-medium text-stone-500">gesamt</span>
          </>
        )}
      </div>
    </div>
  )
}

const SHARE_FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Inter (Latin-Subset) einmal laden und als @font-face-CSS (base64) cachen, damit
// das gerenderte PNG überall dieselbe hochwertige Schrift nutzt – nicht den
// System-Font. Fällt bei Fehler still auf die System-Schrift zurück.
let _fontCss: string | null = null
async function interFontCss(): Promise<string> {
  if (_fontCss != null) return _fontCss
  const weights = [500, 600, 700, 800, 900]
  try {
    const faces = await Promise.all(
      weights.map(async (w) => {
        const res = await fetch(`/fonts/inter-${w}.woff2`)
        if (!res.ok) throw new Error('font')
        const buf = new Uint8Array(await res.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
        return `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`
      }),
    )
    _fontCss = faces.join('')
  } catch {
    _fontCss = ''
  }
  return _fontCss
}

// Sem (Maskottchen) als base64-Data-URL laden und cachen, damit er ins Story-SVG
// eingebettet werden kann (externe URLs lädt der SVG-<img>-Rasterizer nicht).
// Die Pose richtet sich nach dem Gesamt-Fortschritt: enttäuscht → Daumen hoch →
// feiert. Fehlt eine Pose, wird auf die Winke-Pose zurückgegriffen.
const SHARE_POSES: Record<'sad' | 'ok' | 'win', string> = {
  sad: '/mascot/sem-sad.webp',
  ok: '/mascot/sem-happy.webp',
  win: '/mascot/sem-cheer.webp',
}
function sharePoseKey(overall: number): 'sad' | 'ok' | 'win' {
  if (overall <= 24) return 'sad'
  if (overall <= 74) return 'ok'
  return 'win'
}
async function fetchAsDataUrl(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error('asset')
  const buf = new Uint8Array(await res.arrayBuffer())
  // Echtes WebP? (RIFF…WEBP). Fehlt die Datei, liefern SPA-Server oft index.html
  // mit Status 200 – das würde sonst als kaputtes Bild eingebettet.
  const isWebp =
    buf.length > 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  if (!isWebp) throw new Error('not-webp')
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return `data:image/webp;base64,${btoa(bin)}`
}
const _poseCache: Record<string, string> = {}
async function semShareDataUrl(overall: number): Promise<string> {
  const key = sharePoseKey(overall)
  if (_poseCache[key] != null) return _poseCache[key]
  try {
    _poseCache[key] = await fetchAsDataUrl(SHARE_POSES[key])
  } catch {
    try {
      _poseCache[key] = await fetchAsDataUrl('/mascot/sem-wave.webp')
    } catch {
      _poseCache[key] = ''
    }
  }
  return _poseCache[key]
}

// Story-Format (9:16) – teilbar für Instagram/Facebook Stories.
const STORY_W = 1080
const STORY_H = 1920

/** Dynamische Überschrift je nach Gesamt-Fortschritt – rahmt auch niedrige Werte
 *  positiv, damit man früh im Semester genauso gern teilt. */
function headlineFor(pct: number): string {
  if (pct <= 24) return 'Der Anfang ist gemacht'
  if (pct <= 49) return 'Warmgelaufen'
  if (pct <= 74) return 'Über die Hälfte. Läuft.'
  if (pct <= 94) return 'Fast klausurbereit'
  return 'Semester im Griff'
}

/** „Brag"-Zeile: hebt die stärkste Vorbereitung hervor (nie die schwächste). */
function bragFor(rings: RingStat[], overall: number): string {
  const full = rings.find((r) => r.pct >= 100)
  if (full) return `${full.label}: durch.`
  if (overall >= 80) return 'Klausurbereit.'
  const best = rings.reduce((b, r) => (r.pct > b.pct ? r : b), rings[0])
  return best && best.pct > 0 ? `Stärkste Vorbereitung: ${best.label}` : 'Auf geht’s.'
}

/** SemBan-Logo (aus Logo.tsx) als SVG-Gruppe, skaliert auf px. */
function logoSvg(x: number, y: number, px: number, hairline: boolean): string {
  const s = px / 512
  const hair = hairline
    ? `<rect width='512' height='512' rx='112' fill='none' stroke='#fdfcf7' stroke-opacity='0.18' stroke-width='10'/>`
    : ''
  return (
    `<g transform='translate(${x},${y}) scale(${s})'>` +
    `<rect width='512' height='512' rx='112' fill='#2a2a6e'/>${hair}` +
    `<rect x='120' y='220' width='64' height='172' rx='32' fill='#ffffff'/>` +
    `<rect x='216' y='150' width='64' height='242' rx='32' fill='#ffffff'/>` +
    `<rect x='316' y='178' width='76' height='76' rx='20' fill='#f5c645'/>` +
    `<path d='M340 202 L368 230 M368 202 L340 230' stroke='#16161d' stroke-width='18' stroke-linecap='round'/>` +
    `<rect x='316' y='272' width='76' height='120' rx='38' fill='#e9633c'/>` +
    `</g>`
  )
}

type ShareVariant = 'dark' | 'cream'

/** Teilbares Story-SVG (1080×1920) im Apple-Wrapped-Stil, mit SemBan-Logo. */
function buildShareSVG(
  rings: RingStat[],
  overall: number,
  scopeLabel: string,
  variant: ShareVariant,
  fontCss: string,
  semUrl: string,
  pill?: string,
): string {
  const dark = variant !== 'cream'
  const cx = STORY_W / 2
  const cy = 838 // Ring-Mittelpunkt

  // Ring-Geometrie (Hero): feste Größen, damit jede Karte gleich aussieht.
  const stroke = 38
  const gap = 13
  const outerR = 246
  const glowStd = dark ? 10 : 6

  const pal = dark
    ? {
        text: '#f7f7fb',
        sub: '#a9a7c4',
        hero: '#ffffff',
        legendLabel: '#e9e8f4',
        handle: '#8f8dab',
        trackAlpha: '38',
      }
    : {
        text: '#211d1a',
        sub: '#6f675c',
        hero: '#211d1a',
        legendLabel: '#2a2621',
        handle: '#6f675c',
        trackAlpha: '38',
      }

  const ringSVG = rings
    .map((r, i) => {
      const radius = outerR - i * (stroke + gap)
      if (radius <= 0) return ''
      const circ = 2 * Math.PI * radius
      const off = circ * (1 - Math.min(100, r.pct) / 100)
      const track = `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}${pal.trackAlpha}' stroke-width='${stroke}'/>`
      if (!(r.total > 0 && r.pct > 0)) return track
      const arc = (extra: string) =>
        `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}' stroke-width='${stroke}' stroke-linecap='round' stroke-dasharray='${circ}' stroke-dashoffset='${off}' transform='rotate(-90 ${cx} ${cy})'${extra}/>`
      const glow = arc(` filter='url(#glow)' stroke-opacity='${dark ? 0.95 : 0.55}'`)
      return track + glow + arc('')
    })
    .join('')

  // Legende: kompakter Block LINKS (Punkt + Label + %-Zahl), damit rechts Platz
  // für Sem bleibt.
  const legendStartY = 1300
  const rowH = 74
  const legend = rings
    .map((r, i) => {
      const y = legendStartY + i * rowH
      const pctCol = dark ? r.color : readable(r.color)
      return (
        `<circle cx='150' cy='${y - 14}' r='14' fill='${r.color}'/>` +
        `<text x='186' y='${y}' font-size='40' font-weight='600' letter-spacing='-0.5' fill='${pal.legendLabel}'>${esc(r.label)}</text>` +
        `<text x='566' y='${y}' text-anchor='end' font-size='46' font-weight='800' letter-spacing='-1' fill='${pctCol}'>${r.pct}%</text>`
      )
    })
    .join('')

  // Dezente, riesige Ring-Echo-Kreise als Hintergrund-Motiv (bluten aus dem Bild).
  const echoStroke = dark ? "stroke='#ffffff' stroke-opacity='0.05'" : "stroke='#ffffff' stroke-opacity='0.4'"
  const echoRings =
    `<g fill='none' ${echoStroke} stroke-width='2'>` +
    `<circle cx='${cx}' cy='${cy}' r='440'/>` +
    `<circle cx='${cx}' cy='${cy}' r='585'/>` +
    `<circle cx='${cx}' cy='${cy}' r='740'/>` +
    `</g>`

  const filters =
    `<filter id='glow' x='-45%' y='-45%' width='190%' height='190%'><feGaussianBlur stdDeviation='${glowStd}'/></filter>` +
    `<filter id='soft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='14'/></filter>` +
    (dark
      ? `<filter id='heroShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='0' stdDeviation='8' flood-color='#07071c' flood-opacity='0.5'/></filter>` +
        `<filter id='footShadow' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0' dy='4' stdDeviation='12' flood-color='#000000' flood-opacity='0.35'/></filter>`
      : `<filter id='heroShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='2' stdDeviation='7' flood-color='#8a6a12' flood-opacity='0.15'/></filter>` +
        `<filter id='footShadow' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0' dy='3' stdDeviation='9' flood-color='#8a6a12' flood-opacity='0.18'/></filter>`)

  const bg = dark
    ? `<defs>` +
      `<style>${fontCss}</style>` +
      `<linearGradient id='bg' x1='0' y1='0' x2='0.25' y2='1'><stop offset='0' stop-color='#26265f'/><stop offset='0.5' stop-color='#1a1a47'/><stop offset='1' stop-color='#0f0f2b'/></linearGradient>` +
      `<radialGradient id='aur1' cx='0.24' cy='0.14' r='0.55'><stop offset='0' stop-color='#6a6ae0' stop-opacity='0.4'/><stop offset='1' stop-color='#6a6ae0' stop-opacity='0'/></radialGradient>` +
      `<radialGradient id='aur2' cx='0.86' cy='0.82' r='0.5'><stop offset='0' stop-color='#e9633c' stop-opacity='0.16'/><stop offset='1' stop-color='#e9633c' stop-opacity='0'/></radialGradient>` +
      `<radialGradient id='spot' cx='0.5' cy='0.44' r='0.5'><stop offset='0' stop-color='#4444a2' stop-opacity='0.55'/><stop offset='1' stop-color='#4444a2' stop-opacity='0'/></radialGradient>` +
      `<radialGradient id='vig' cx='0.5' cy='0.46' r='0.82'><stop offset='0.58' stop-color='#08081e' stop-opacity='0'/><stop offset='1' stop-color='#07071a' stop-opacity='0.72'/></radialGradient>` +
      filters +
      `</defs>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#bg)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#aur1)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#aur2)'/>` +
      echoRings +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#spot)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#vig)'/>`
    : `<defs>` +
      `<style>${fontCss}</style>` +
      `<linearGradient id='bg' x1='0' y1='0' x2='0.35' y2='1'><stop offset='0' stop-color='#fffdf8'/><stop offset='0.5' stop-color='#fdf5e4'/><stop offset='1' stop-color='#f6c341'/></linearGradient>` +
      `<radialGradient id='aur1' cx='0.22' cy='0.13' r='0.55'><stop offset='0' stop-color='#ffffff' stop-opacity='0.7'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></radialGradient>` +
      `<radialGradient id='spot' cx='0.5' cy='0.44' r='0.5'><stop offset='0' stop-color='#ffffff' stop-opacity='0.55'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></radialGradient>` +
      filters +
      `</defs>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#bg)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#aur1)'/>` +
      echoRings +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#spot)'/>`

  const headline = headlineFor(overall)
  const sub = `${scopeLabel} · Klausur-Vorbereitung`
  const brag = bragFor(rings, overall)

  // „Klausur in N Tagen"-Pill oben rechts (nur wenn ein Klausurdatum vorliegt).
  const pillSvg = pill
    ? (() => {
        const pw = Math.round(pill.length * 15.5 + 62)
        const px = 964 - pw
        const fill = dark ? '#f5c645' : '#2a2a6e'
        const tcol = dark ? '#20204e' : '#fdfcf7'
        return (
          `<rect x='${px}' y='300' width='${pw}' height='60' rx='30' fill='${fill}'/>` +
          `<text x='${px + pw / 2}' y='340' text-anchor='middle' font-size='29' font-weight='700' letter-spacing='-0.3' fill='${tcol}'>${esc(pill)}</text>`
        )
      })()
    : ''

  // Sem (Maskottchen): eigene Zone unten RECHTS, auf einem Bodenschatten „stehend"
  // – wirkt komponiert statt in die Ecke geklebt. Pose kommt via semUrl (nach %).
  const semSize = 470
  const semCX = 842
  const semBaseY = 1818 // Fuß-Grundlinie
  const semX = semCX - semSize / 2
  const semY = semBaseY - semSize
  const groundCol = dark ? '#050518' : '#7a5c10'
  const groundOp = dark ? 0.55 : 0.2
  const semSvg = semUrl
    ? `<ellipse cx='${semCX}' cy='${semBaseY - 4}' rx='168' ry='30' fill='${groundCol}' opacity='${groundOp}' filter='url(#soft)'/>` +
      `<g filter='url(#footShadow)'><image href='${semUrl}' xlink:href='${semUrl}' x='${semX}' y='${semY}' width='${semSize}' height='${semSize}' preserveAspectRatio='xMidYMax meet'/></g>`
    : ''

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='${STORY_W}' height='${STORY_H}' viewBox='0 0 ${STORY_W} ${STORY_H}' font-family="${SHARE_FONT}">` +
    bg +
    // Oben: nur das Logo-Zeichen (kein Wortmark – kollidiert nicht mit der Headline) + Pill
    logoSvg(116, 300, 60, dark) +
    pillSvg +
    // Headline + Sub
    `<text x='${cx}' y='498' text-anchor='middle' font-size='66' font-weight='800' letter-spacing='-1.5' fill='${pal.text}'>${esc(headline)}</text>` +
    `<text x='${cx}' y='556' text-anchor='middle' font-size='32' font-weight='500' letter-spacing='-0.2' fill='${pal.sub}'>${esc(sub)}</text>` +
    // Ringe + Hero-Zahl
    ringSVG +
    `<g filter='url(#heroShadow)'><text x='${cx}' y='${cy + 60}' text-anchor='middle' font-size='186' font-weight='900' letter-spacing='-8' fill='${pal.hero}' style='font-variant-numeric:tabular-nums'>${overall}%</text></g>` +
    // Brag-Zeile (dezent)
    `<text x='${cx}' y='1214' text-anchor='middle' font-size='36' font-weight='600' letter-spacing='-0.5' fill='${pal.sub}'>${esc(brag)}</text>` +
    // Legende
    legend +
    // Sem als Signatur (vor dem Footer, damit der Footer nicht verdeckt wird)
    semSvg +
    // Footer-Lockup unten LINKS (Logo + Wortmarke/Adresse) – bildet mit Sem
    // rechts eine ausbalancierte Grundlinie.
    `<g filter='url(#footShadow)'>${logoSvg(150, 1712, 54, dark)}</g>` +
    `<text x='222' y='1748' font-size='40' font-weight='800' letter-spacing='-1' fill='${pal.text}'>SemBan</text>` +
    `<text x='222' y='1790' font-size='24' font-weight='600' letter-spacing='0.2' fill='${pal.handle}'>semban.de</text>` +
    `</svg>`
  )
}

/** Rastert ein SVG als PNG-Blob. Liefert null, statt zu werfen (nie hängen). */
function rasterize(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
    const img = new Image()
    // Sicherheitsnetz: Falls onload/onerror nie feuern (manche Browser hängen bei
    // großen SVG-<img>), nach 6 s aufgeben statt die Vorschau ewig zu blockieren.
    const timer = setTimeout(() => resolve(null), 6000)
    img.onload = () => {
      clearTimeout(timer)
      try {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = STORY_W * scale
        canvas.height = STORY_H * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((b) => resolve(b), 'image/png')
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

/** Rendert die Story (9:16) als PNG-Blob. */
export async function renderSharePng(
  rings: RingStat[],
  overall: number,
  opts: { scopeLabel?: string; variant?: ShareVariant; pill?: string } = {},
): Promise<Blob | null> {
  const [fontCss, semUrl] = await Promise.all([interFontCss(), semShareDataUrl(overall)])
  const make = (css: string) =>
    buildShareSVG(
      rings,
      overall,
      opts.scopeLabel ?? 'Alle Lernpläne',
      opts.variant ?? 'dark',
      css,
      semUrl,
      opts.pill,
    )
  // Erst mit eingebetteter Schrift. Manche Browser (z.B. iOS Safari) rastern ein
  // SVG-<img> mit großen Font-Daten nicht – dann ohne Schrift erneut versuchen,
  // damit immer eine Vorschau/PNG entsteht (System-Schrift statt gar nichts).
  const withFont = await rasterize(make(fontCss))
  if (withFont) return withFont
  if (fontCss === '') return null
  return await rasterize(make(''))
}

const SHARE_URL = 'https://semban.de'
const SHARE_TEXT = 'Meine Klausur-Vorbereitung mit SemBan 📚'

/**
 * Kann der Browser Dateien über die native Teilen-Funktion teilen?
 *
 * Wichtig: Desktop-Chrome meldet oft canShare({files}) = true, doch
 * navigator.share() öffnet dann nichts (der Button wirkt „tot"). Darum die
 * native Funktion nur auf echten Touch-Geräten (Handy/Tablet) nutzen – am
 * Desktop ist der Download der verlässliche Weg.
 */
export function canShareImage(): boolean {
  try {
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: unknown) => Promise<void>
      maxTouchPoints?: number
    }
    if (!nav.canShare || !nav.share) return false
    const touch =
      (nav.maxTouchPoints ?? 0) > 0 ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    if (!touch) return false
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return nav.canShare({ files: [probe] })
  } catch {
    return false
  }
}

function download(blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'semban-lernaktivitaet.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

/**
 * Teilen-Dialog: Bild-Stil (Hell/Dunkel) live vorschauen und gezielt teilen –
 * native Teilen-Funktion (WhatsApp, Instagram, Stories …), Bild speichern,
 * WhatsApp-Einladung oder Link kopieren. Ersetzt den früheren Dark/Bright-
 * Umschalter, der wie ein App-Theme-Schalter aussah.
 */
export function SharePanel({
  rings,
  overall,
  scopeLabel,
  pill,
  onClose,
}: {
  rings: RingStat[]
  overall: number
  scopeLabel: string
  pill?: string
  onClose: () => void
}) {
  const [variant, setVariant] = useState<ShareVariant>('dark')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState('')
  const blobRef = useRef<Blob | null>(null)
  const native = canShareImage()

  // Vorschau (und der zu teilende Blob) bei jedem Stil-Wechsel neu rendern.
  useEffect(() => {
    let alive = true
    let objUrl: string | null = null
    blobRef.current = null
    setPreview(null)
    renderSharePng(rings, overall, { scopeLabel, variant, pill }).then((blob) => {
      if (!alive || !blob) return
      blobRef.current = blob
      objUrl = URL.createObjectURL(blob)
      setPreview(objUrl)
    })
    return () => {
      alive = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [rings, overall, scopeLabel, variant, pill])

  const flash = (msg: string) => {
    setHint(msg)
    setTimeout(() => setHint(''), 6000)
  }

  // Öffnet die native Teilen-Funktion mit dem Bild (mobil: WhatsApp, Instagram,
  // Stories …). Bricht der Nutzer ab, passiert nichts. Schlägt der Share aus
  // einem anderen Grund fehl (z.B. Desktop meldet canShare=true, kann Dateien
  // aber nicht teilen), wird auf Download zurückgefallen – so passiert IMMER
  // etwas und der Button wirkt nie „tot".
  const shareFile = async (): Promise<boolean> => {
    const blob = blobRef.current
    if (!blob) return false
    setBusy(true)
    try {
      if (!native) throw new Error('no-native-share')
      const file = new File([blob], 'semban-lernaktivitaet.png', { type: 'image/png' })
      await navigator.share({ files: [file], title: 'Meine Lern-Aktivität', text: SHARE_TEXT })
      return true
    } catch (e) {
      // Vom Nutzer abgebrochen → bewusst nichts tun.
      if (e instanceof Error && e.name === 'AbortError') return false
      // Echter Fehler / kein natives Teilen → Bild speichern als Fallback.
      download(blob)
      flash('Bild gespeichert.')
      return true
    } finally {
      setBusy(false)
    }
  }

  const shareImage = () => void shareFile()

  const saveImage = () => {
    if (blobRef.current) download(blobRef.current)
  }

  // WhatsApp: mobil das Bild über die native Teilen-Funktion (dort WhatsApp
  // wählen), am Desktop die WhatsApp-Web-Einladung mit unserem Link.
  const whatsapp = async () => {
    if (native) {
      await shareFile()
      return
    }
    const text = encodeURIComponent(`${SHARE_TEXT}\n${SHARE_URL}`)
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener')
  }

  // Instagram nimmt vom Web aus kein Bild entgegen. Mobil: native Teilen-Funktion
  // (dort „Story"/Instagram wählen). Desktop: Bild speichern UND Instagram öffnen,
  // damit man es direkt in der Story posten kann.
  const instagram = async () => {
    if (native) {
      await shareFile()
      return
    }
    // Fenster im selben Klick öffnen (sonst Popup-Blocker), dann speichern.
    window.open('https://www.instagram.com/', '_blank', 'noopener')
    saveImage()
    flash('Bild gespeichert – füge es in deiner Instagram-Story ein ✨')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* Clipboard nicht verfügbar */
    }
  }

  const styleBtn = (v: ShareVariant) =>
    `flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
      variant === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
    }`

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-stone-900">Teilen</h3>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Vorschau (9:16) */}
        <div className="mx-auto mb-3 aspect-[9/16] w-40 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200">
          {preview ? (
            <img src={preview} alt="Vorschau" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-stone-300" />
            </div>
          )}
        </div>

        {/* Stil-Umschalter (nur fürs Bild) */}
        <div className="mb-4 flex items-center gap-1 rounded-xl bg-stone-100 p-1">
          <button onClick={() => setVariant('dark')} className={styleBtn('dark')}>
            Dunkel
          </button>
          <button onClick={() => setVariant('cream')} className={styleBtn('cream')}>
            Hell
          </button>
        </div>

        {/* Primär: garantiert funktionierende Aktion je Plattform. Mobil das
            native Teilen-Menü (WhatsApp/Instagram/Stories), am Desktop ein
            verlässlicher Download. */}
        <button
          onClick={native ? shareImage : saveImage}
          disabled={!preview || busy}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {native ? (
            <>
              <Share2 size={16} /> Teilen
            </>
          ) : (
            <>
              <Download size={16} /> Bild herunterladen
            </>
          )}
        </button>

        {/* Schnellziele */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={whatsapp}
            disabled={!preview}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366]/10 py-2.5 text-xs font-semibold text-[#128C4B] transition hover:bg-[#25D366]/20 disabled:opacity-50"
          >
            <MessageCircle size={15} /> WhatsApp
          </button>
          <button
            onClick={instagram}
            disabled={!preview}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#d62976]/10 py-2.5 text-xs font-semibold text-[#c13584] transition hover:bg-[#d62976]/20 disabled:opacity-50"
          >
            <Instagram size={15} /> Instagram
          </button>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-stone-100 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-200"
          >
            {copied ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
            {copied ? 'Kopiert' : 'Link'}
          </button>
        </div>

        {/* Hinweis: was Instagram/Stories vom Web aus (nicht) können. */}
        <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
          {native
            ? 'Für die Instagram-Story: „Teilen" → Instagram wählen.'
            : 'Instagram/Stories brauchen die App: Bild herunterladen und dort posten.'}
        </p>

        {hint && (
          <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-center text-[12px] font-medium text-stone-600">
            {hint}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
