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

/** Eigenständiges SVG (Karte mit Ringen, Legende & Branding) für ein teilbares Bild. */
function buildShareSVG(rings: RingStat[], overall: number, dateStr: string, title: string): string {
  const W = 1000
  const H = 1300
  const cx = 500
  const cy = 452
  const S = 520
  const n = rings.length || 1
  const hole = S * 0.16
  const stroke = (S / 2 - hole) / (n + 0.4 * (n - 1))
  const gap = stroke * 0.4
  const outerR = S / 2 - stroke / 2

  const ringSVG = rings
    .map((r, i) => {
      const radius = outerR - i * (stroke + gap)
      if (radius <= 0) return ''
      const circ = 2 * Math.PI * radius
      const off = circ * (1 - Math.min(100, r.pct) / 100)
      const track = `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}' stroke-opacity='0.2' stroke-width='${stroke}'/>`
      const prog =
        r.total > 0 && r.pct > 0
          ? `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}' stroke-width='${stroke}' stroke-linecap='round' stroke-dasharray='${circ}' stroke-dashoffset='${off}' transform='rotate(-90 ${cx} ${cy})'/>`
          : ''
      return track + prog
    })
    .join('')

  const legend = rings
    .map((r, i) => {
      const y = 800 + i * 74
      const pct = r.total ? `${r.pct}%` : '–'
      const cnt = r.total ? `${r.done}/${r.total}` : 'kein Material'
      const col = r.total ? readable(r.color) : '#a8a29e'
      return (
        `<circle cx='130' cy='${y - 11}' r='13' fill='${r.color}'/>` +
        `<text x='170' y='${y}' font-size='36' fill='#44403c'>${esc(r.label)}</text>` +
        `<text x='740' y='${y}' text-anchor='end' font-size='29' fill='#a8a29e'>${esc(cnt)}</text>` +
        `<text x='872' y='${y}' text-anchor='end' font-size='38' font-weight='700' fill='${col}'>${pct}</text>`
      )
    })
    .join('')

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' font-family='${SHARE_FONT}'>` +
    `<defs><filter id='cardShadow' x='-20%' y='-20%' width='140%' height='140%'>` +
    `<feDropShadow dx='0' dy='10' stdDeviation='20' flood-color='#1c1917' flood-opacity='0.07'/></filter></defs>` +
    `<rect width='${W}' height='${H}' fill='#edece7'/>` +
    `<rect x='44' y='44' width='912' height='${H - 88}' rx='48' fill='#ffffff' filter='url(#cardShadow)'/>` +
    `<text x='${cx}' y='138' text-anchor='middle' font-size='48' font-weight='700' fill='#292524'>${esc(title)}</text>` +
    `<text x='${cx}' y='186' text-anchor='middle' font-size='28' fill='#78716c'>Klausur-Vorbereitung · Stand ${esc(dateStr)}</text>` +
    ringSVG +
    `<text x='${cx}' y='${cy + 16}' text-anchor='middle' font-size='100' font-weight='800' fill='#292524'>${overall}%</text>` +
    `<text x='${cx}' y='${cy + 62}' text-anchor='middle' font-size='30' fill='#a8a29e'>gesamt bereit</text>` +
    legend +
    `<text x='${cx}' y='${H - 108}' text-anchor='middle' font-size='31' font-weight='700' fill='#57534e'>SemBan</text>` +
    `<text x='${cx}' y='${H - 72}' text-anchor='middle' font-size='24' fill='#a8a29e'>Semester im Griff</text>` +
    `</svg>`
  )
}

/** Rendert die Ringe als PNG und teilt sie (Web Share API) bzw. lädt sie herunter. */
export async function shareRings(
  rings: RingStat[],
  overall: number,
  title = 'Meine Lern-Aktivität',
): Promise<void> {
  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const svg = buildShareSVG(rings, overall, dateStr, title)
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG konnte nicht geladen werden'))
    img.src = url
  })
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = 1000 * scale
  canvas.height = 1300 * scale
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
