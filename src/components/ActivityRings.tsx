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

const SHARE_FONT = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
): string {
  const dark = variant !== 'cream'
  const cx = STORY_W / 2
  const cy = 830 // Ring-Mittelpunkt

  // Ring-Geometrie (Hero): feste Größen, damit jede Karte gleich aussieht.
  const stroke = 36
  const gap = 12
  const outerR = 250
  const glowStd = dark ? 9 : 5

  const pal = dark
    ? {
        text: '#fdfcf7',
        sub: '#b8b6c8',
        hero: '#ffffff',
        legendLabel: '#e7e5f0',
        count: '#9a98b0',
        handle: '#9a98b0',
        trackAlpha: '30',
      }
    : {
        text: '#292524',
        sub: '#78716c',
        hero: '#292524',
        legendLabel: '#292524',
        count: '#a8a29e',
        handle: '#57534e',
        trackAlpha: '33',
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
      const glow = arc(` filter='url(#glow)' stroke-opacity='${dark ? 0.9 : 0.5}'`)
      return track + glow + arc('')
    })
    .join('')

  // Legende (max 5 Zeilen): Punkt + Label + Anzahl + %.
  const legendStartY = 1250
  const rowH = 78
  const legend = rings
    .map((r, i) => {
      const y = legendStartY + i * rowH
      const pctCol = dark ? r.color : readable(r.color)
      const cnt = `${r.done}/${r.total}`
      return (
        `<circle cx='158' cy='${y - 14}' r='17' fill='${r.color}'/>` +
        `<text x='198' y='${y}' font-size='42' font-weight='600' fill='${pal.legendLabel}'>${esc(r.label)}</text>` +
        `<text x='790' y='${y}' text-anchor='end' font-size='30' fill='${pal.count}'>${esc(cnt)}</text>` +
        `<text x='922' y='${y}' text-anchor='end' font-size='52' font-weight='800' fill='${pctCol}'>${r.pct}%</text>`
      )
    })
    .join('')

  const bg = dark
    ? `<defs>` +
      `<linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#20205a'/><stop offset='1' stop-color='#15153f'/></linearGradient>` +
      `<radialGradient id='spot' cx='0.5' cy='0.43' r='0.6'><stop offset='0' stop-color='#3a3a86' stop-opacity='0.55'/><stop offset='1' stop-color='#15153f' stop-opacity='0'/></radialGradient>` +
      `<filter id='glow' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='${glowStd}'/></filter>` +
      `<filter id='heroShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='0' stdDeviation='7' flood-color='#0b0b24' flood-opacity='0.45'/></filter>` +
      `<filter id='footShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='4' stdDeviation='10' flood-color='#000000' flood-opacity='0.3'/></filter>` +
      `</defs>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#bg)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#spot)'/>`
    : `<defs>` +
      `<linearGradient id='bg' x1='0' y1='0' x2='0.4' y2='1'><stop offset='0' stop-color='#fdfcf7'/><stop offset='0.55' stop-color='#faf7ee'/><stop offset='0.92' stop-color='#f7c948'/></linearGradient>` +
      `<radialGradient id='spot' cx='0.5' cy='0.43' r='0.55'><stop offset='0' stop-color='#f7c948' stop-opacity='0.35'/><stop offset='1' stop-color='#f7c948' stop-opacity='0'/></radialGradient>` +
      `<filter id='glow' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='${glowStd}'/></filter>` +
      `<filter id='heroShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='2' stdDeviation='6' flood-color='#1c1917' flood-opacity='0.1'/></filter>` +
      `<filter id='footShadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='3' stdDeviation='8' flood-color='#1c1917' flood-opacity='0.12'/></filter>` +
      `</defs>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#bg)'/>` +
      `<rect width='${STORY_W}' height='${STORY_H}' fill='url(#spot)'/>`

  const headline = headlineFor(overall)
  const sub = `${scopeLabel} · Klausur-Vorbereitung`
  const brag = bragFor(rings, overall)

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${STORY_W}' height='${STORY_H}' viewBox='0 0 ${STORY_W} ${STORY_H}' font-family='${SHARE_FONT}'>` +
    bg +
    // Top-Lockup (unter dem Plattform-Namensband)
    logoSvg(120, 292, 60, dark) +
    `<text x='196' y='340' font-size='44' font-weight='800' fill='${pal.text}'>SemBan</text>` +
    // Headline + Sub
    `<text x='${cx}' y='474' text-anchor='middle' font-size='64' font-weight='800' fill='${pal.text}'>${esc(headline)}</text>` +
    `<text x='${cx}' y='532' text-anchor='middle' font-size='32' font-weight='500' fill='${pal.sub}'>${esc(sub)}</text>` +
    // Ringe + Hero-Zahl
    ringSVG +
    `<g filter='url(#heroShadow)'><text x='${cx}' y='${cy + 66}' text-anchor='middle' font-size='196' font-weight='800' letter-spacing='-6' fill='${pal.hero}' style='font-variant-numeric:tabular-nums'>${overall}%</text></g>` +
    // Brag-Zeile
    `<text x='${cx}' y='1178' text-anchor='middle' font-size='40' font-weight='700' fill='${pal.text}'>${esc(brag)}</text>` +
    // Legende
    legend +
    // Footer-Lockup (die „Werbung", dezent) – über der Story-Antwortleiste
    `<g filter='url(#footShadow)'>${logoSvg(cx - 200, 1662, 76, dark)}</g>` +
    `<text x='${cx - 108}' y='1714' font-size='50' font-weight='800' fill='${pal.text}'>SemBan</text>` +
    `<text x='${cx - 108}' y='1754' font-size='27' font-weight='600' fill='${pal.handle}'>@semban · unikanban.vercel.app</text>` +
    `</svg>`
  )
}

/** Rendert die Story (9:16) als PNG und teilt sie (Web Share API) bzw. lädt sie herunter. */
export async function shareRings(
  rings: RingStat[],
  overall: number,
  opts: { scopeLabel?: string; variant?: ShareVariant } = {},
): Promise<void> {
  const svg = buildShareSVG(rings, overall, opts.scopeLabel ?? 'Alle Lernpläne', opts.variant ?? 'dark')
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG konnte nicht geladen werden'))
    img.src = url
  })
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = STORY_W * scale
  canvas.height = STORY_H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'))
  if (!blob) return
  const file = new File([blob], 'semban-lernaktivitaet.png', { type: 'image/png' })
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Meine Lern-Aktivität',
        text: 'Meine Klausur-Vorbereitung in SemBan 📚',
      })
      return
    }
  } catch {
    /* Nutzer hat abgebrochen oder Teilen nicht erlaubt → Download-Fallback */
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
