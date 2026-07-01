import { cn } from '@/lib/cn'

// Sem – das SemBan-Maskottchen. Posen liegen als freigestellte WebP in
// /public/mascot/. Neue Posen hier ergänzen, dann überall per <Mascot pose=…/>.
export type MascotPose = 'wave' | 'face'

const SRC: Record<MascotPose, string> = {
  wave: '/mascot/sem-wave.webp',
  face: '/mascot/sem-face.webp',
}

/** Runder Sem-Avatar (Gesicht formatfüllend im Kreis) – für Chat/Profil. */
export function MascotAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cream-50 ring-1 ring-stone-200/80',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={SRC.face}
        alt="Sem"
        draggable={false}
        className="h-full w-full select-none object-cover"
        style={{ transform: 'scale(1.5) translateY(6%)' }}
      />
    </span>
  )
}

export function Mascot({
  pose = 'wave',
  size = 96,
  className,
  alt = 'Sem, dein Lernbegleiter',
}: {
  pose?: MascotPose
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <img
      src={SRC[pose]}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      className={cn('select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}
