import type { RingStat } from '@/lib/studyPlans'

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
  const stroke = Math.round(size / 15)
  const gap = Math.round(stroke * 0.5)
  const outerR = c - stroke / 2 - 2
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
          if (radius <= stroke) return null
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
              {/* Track (blasse Farbe). */}
              <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color + '2b'} strokeWidth={stroke} />
              {/* Fortschritt. */}
              {r.total > 0 && (
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
                    opacity: dim ? 0.3 : 1,
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
            <span className="text-3xl font-bold tabular-nums" style={{ color: shown.color }}>
              {shown.total ? `${shown.pct}%` : '–'}
            </span>
            <span className="mt-0.5 max-w-[80%] text-xs font-medium leading-tight text-stone-500">
              {shown.label}
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-bold tabular-nums text-stone-800">{overall}%</span>
            <span className="mt-0.5 text-[11px] font-medium text-stone-400">gesamt</span>
          </>
        )}
      </div>
    </div>
  )
}

/** Eigenständiges SVG (mit Legende & Branding) für ein teilbares Bild. */
function buildShareSVG(rings: RingStat[], overall: number): string {
  const W = 1000
  const H = 1220
  const cx = 500
  const cy = 400
  const S = 620
  const stroke = 44
  const gap = 20
  const outerR = S / 2 - stroke / 2
  const font = "font-family='-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'"

  const ringSVG = rings
    .map((r, i) => {
      const radius = outerR - i * (stroke + gap)
      if (radius <= stroke) return ''
      const circ = 2 * Math.PI * radius
      const off = circ * (1 - Math.min(100, r.pct) / 100)
      const track = `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}' stroke-opacity='0.17' stroke-width='${stroke}'/>`
      const prog =
        r.total > 0
          ? `<circle cx='${cx}' cy='${cy}' r='${radius}' fill='none' stroke='${r.color}' stroke-width='${stroke}' stroke-linecap='round' stroke-dasharray='${circ}' stroke-dashoffset='${off}' transform='rotate(-90 ${cx} ${cy})'/>`
          : ''
      return track + prog
    })
    .join('')

  const legend = rings
    .map((r, i) => {
      const y = 800 + i * 74
      const pct = r.total ? `${r.pct}%` : '–'
      return (
        `<circle cx='150' cy='${y - 10}' r='14' fill='${r.color}'/>` +
        `<text x='190' y='${y}' ${font} font-size='36' fill='#44403c'>${r.label}</text>` +
        `<text x='850' y='${y}' text-anchor='end' ${font} font-size='36' font-weight='700' fill='#292524'>${pct}</text>`
      )
    })
    .join('')

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
    `<rect width='${W}' height='${H}' fill='#fbfaf7'/>` +
    `<text x='${cx}' y='95' text-anchor='middle' ${font} font-size='44' font-weight='700' fill='#292524'>Meine Lern-Aktivität</text>` +
    ringSVG +
    `<text x='${cx}' y='${cy + 5}' text-anchor='middle' ${font} font-size='108' font-weight='800' fill='#292524'>${overall}%</text>` +
    `<text x='${cx}' y='${cy + 58}' text-anchor='middle' ${font} font-size='32' fill='#a8a29e'>gesamt</text>` +
    legend +
    `<text x='${cx}' y='${H - 45}' text-anchor='middle' ${font} font-size='30' font-weight='700' fill='#a8a29e'>SemBan · Semester im Griff</text>` +
    `</svg>`
  )
}

/** Rendert die Ringe als PNG und teilt sie (Web Share API) bzw. lädt sie herunter. */
export async function shareRings(rings: RingStat[], overall: number): Promise<void> {
  const svg = buildShareSVG(rings, overall)
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG konnte nicht geladen werden'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 1220
  const ctx = canvas.getContext('2d')
  if (!ctx) return
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
