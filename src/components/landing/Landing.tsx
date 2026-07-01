import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  MotionConfig,
  type MotionValue,
  type Variants,
} from 'framer-motion'
import Lenis from 'lenis'
import {
  ArrowRight,
  ListChecks,
  CalendarClock,
  GraduationCap,
  Sparkles,
  ShieldCheck,
  WifiOff,
  Coffee,
  Plus,
  Minus,
  Check,
  Star,
  Quote,
  Brain,
  Layers,
  Hourglass,
  Bell,
  Target,
  CalendarPlus,
  MessageSquarePlus,
} from 'lucide-react'
import { Logo } from '../Logo'
import { MeshGradient } from './MeshGradient'
import { cn } from '@/lib/cn'

const NAVY = '#2a2a6e'
const ease = [0.22, 1, 0.36, 1] as const

/* ---------------- helpers ---------------- */

/** true bei reduzierter Bewegung ODER Touch-Geräten. Dann verzichten wir auf
 *  scroll-/viewport-gebundene Animationen – auf Mobile sind sie die Hauptquelle
 *  fürs Auftauchen/Verschwinden von Inhalten beim Scrollen. Der Initialwert wird
 *  synchron gesetzt (kein Flash beim ersten Paint). */
function useCalmMotion() {
  const [calm] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        window.matchMedia('(pointer: coarse)').matches),
  )
  return calm
}

/**
 * Sem läuft beim Scrollen unten im Hero von links herein und winkt – ein per
 * Scroll „gescrubbtes" Video (video.currentTime am Fortschritt gekoppelt). Der
 * Clip ist auf demselben Creme-Ton gerendert und per Maske weich ausgeblendet,
 * sodass er nahtlos in den Seitenhintergrund übergeht. Auf Touch/Reduced-Motion
 * (kein flüssiges Video-Scrubbing, v.a. iOS) ein ruhiges statisches Bild.
 */
function HeroSem({ progress }: { progress: MotionValue<number> }) {
  const calm = useCalmMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const durRef = useRef(0)

  // Scroll-Fortschritt des Hero-Fensters (0 … ~0.16) → Video-Zeit (0 … Dauer).
  useMotionValueEvent(progress, 'change', (v) => {
    const vid = videoRef.current
    if (!vid || !durRef.current) return
    const p = Math.min(1, Math.max(0, v / 0.16))
    const t = p * durRef.current
    if (Math.abs(vid.currentTime - t) > 0.015) vid.currentTime = t
  })

  const mask = {
    WebkitMaskImage: 'radial-gradient(80% 115% at 50% 100%, #000 55%, transparent 82%)',
    maskImage: 'radial-gradient(80% 115% at 50% 100%, #000 55%, transparent 82%)',
  } as const
  // Klein & unten gehalten, damit Sem den Hero-Text nicht überlagert – er läuft
  // als dezenter Begleiter am unteren Rand herein.
  const box = 'h-[clamp(150px,22vw,300px)] w-full object-contain object-bottom'

  if (calm) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-2 z-0 mx-auto max-w-6xl px-5 sm:px-6"
      >
        <img src="/landing/sem-hero.webp" alt="" className={cn(box, 'select-none')} style={mask} />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-2 z-0 mx-auto max-w-6xl px-5 sm:px-6"
    >
      <video
        ref={videoRef}
        src="/landing/sem-walkin.mp4"
        poster="/landing/sem-walkin-poster.webp"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onLoadedMetadata={(e) => {
          const vid = e.currentTarget
          durRef.current = vid.duration || 0
          // Dekoder „aufwecken", damit currentTime-Seeks sofort Frames zeigen.
          vid.play().then(() => vid.pause()).catch(() => {})
        }}
        className={cn(box, 'block select-none')}
        style={mask}
      />
    </div>
  )
}

function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const calm = useCalmMotion()
  // Auf Touch/Reduced-Motion: statisch sichtbar, keine viewport-gebundene Animation.
  if (calm) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }
const item: Variants = { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }

const btnPrimary =
  'group inline-flex items-center justify-center gap-2 rounded-full bg-brand-400 px-7 py-3.5 text-sm font-semibold text-stone-900 shadow-[0_10px_28px_-8px_rgba(247,201,72,0.6)] transition hover:bg-brand-300 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50'
const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-white/70 px-7 py-3.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 backdrop-blur transition hover:bg-white active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

const eyebrowCls = 'text-xs font-semibold uppercase tracking-[0.12em] text-stone-500'

/* ---------------- root ---------------- */

export default function Landing({
  onStart,
  onSignIn,
}: {
  onStart: () => void
  onSignIn: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const { scrollYProgress } = useScroll({ container: scrollRef })

  // Lenis Smooth-Scroll auf dem Container (reduced-motion respektieren)
  useEffect(() => {
    const wrapper = scrollRef.current
    if (!wrapper) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Auf Touch-Geräten kein JS-Smooth-Scroll: natives Scrollen ist dort flüssiger
    // und vermeidet Konflikte/Flackern mit dem fixen Hintergrund.
    if (window.matchMedia('(pointer: coarse)').matches) return
    let lenis: Lenis | null = null
    let raf = 0
    try {
      lenis = new Lenis({
        wrapper,
        content: (wrapper.firstElementChild as HTMLElement) ?? undefined,
        duration: 1.05,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
      })
      lenisRef.current = lenis
      const loop = (t: number) => {
        lenis?.raf(t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    } catch {
      /* fällt auf natives Scrollen zurück */
    }
    return () => {
      cancelAnimationFrame(raf)
      lenis?.destroy()
      lenisRef.current = null
    }
  }, [])

  // „Wie's funktioniert" scrollt im Container zum Feature-Bereich.
  // Wichtig: Die Seite scrollt in einem Container, kein Window-Scroll →
  // native #anchor-Links funktionieren nicht.
  const scrollToFeatures = () => {
    const el = scrollRef.current?.querySelector<HTMLElement>('#features')
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (lenisRef.current && !reduce) {
      lenisRef.current.scrollTo(el, { offset: -8 })
    } else {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={scrollRef}
        className="relative h-full overflow-y-auto overflow-x-hidden text-stone-800"
        style={{
          background:
            'radial-gradient(120% 120% at 85% 10%, #f7ecc9 0%, rgba(247,236,201,0) 55%), linear-gradient(135deg,#fdfcf7 0%,#faf6ec 55%,#f6eed6 100%)',
        }}
      >
        {/* mitscrollender, animierter Hintergrund – eigene Compositor-Ebene
            (transform-gpu/isolate) gegen Repaint-Flackern auf Mobile */}
        <div className="pointer-events-none fixed inset-0 z-0 transform-gpu overflow-hidden [backface-visibility:hidden] [isolation:isolate]">
          <MeshGradient scroll={scrollYProgress} />
          <div className="absolute inset-0 bg-cream-50/20" />
          <Grain />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cream-50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-cream-50 to-transparent" />
        </div>

        <motion.div
          style={{ scaleX: scrollYProgress }}
          className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand-400"
        />

        <div className="relative z-10 transform-gpu [isolation:isolate]">
          <Nav onStart={onStart} onSignIn={onSignIn} />
          <main>
            <Hero onStart={onStart} progress={scrollYProgress} onHowItWorks={scrollToFeatures} />
            <Problem />
            <Showcase />
            <StudyPlan onStart={onStart} />
            <MoreFeatures />
            <Comparison />
            <Trust />
            <SocialProof onStart={onStart} />
            <Steps />
            <Founder />
            <FAQ />
            <FinalCTA onStart={onStart} />
          </main>
          <Footer />
        </div>
      </div>
    </MotionConfig>
  )
}

function Grain() {
  const noise =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"
  return (
    <div
      className="absolute inset-0 opacity-[0.06]"
      style={{ backgroundImage: `url("${noise}")`, backgroundSize: '160px 160px' }}
    />
  )
}

/* ---------------- chrome ---------------- */

function BrowserFrame({
  src,
  alt,
  eager,
  className,
}: {
  src: string
  alt?: string
  eager?: boolean
  className?: string
}) {
  return (
    <div
      className={
        'overflow-hidden rounded-2xl bg-white ring-1 ring-black/10 shadow-[var(--shadow-float)] ' +
        (className ?? '')
      }
    >
      <div className="flex items-center gap-1.5 border-b border-stone-200/70 bg-stone-50/90 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 hidden rounded-full bg-white px-3 py-0.5 text-[11px] text-stone-400 ring-1 ring-stone-200 sm:inline">
          semban.de
        </span>
      </div>
      <img
        src={src}
        alt={alt ?? ''}
        aria-hidden={alt ? undefined : true}
        loading={eager ? 'eager' : 'lazy'}
        className="block w-full"
      />
    </div>
  )
}

function Nav({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-cream-50/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onSignIn}
            className="hidden text-sm font-medium text-stone-500 transition hover:text-stone-800 sm:inline"
          >
            Anmelden
          </button>
          <button
            onClick={onStart}
            className="rounded-full bg-brand-400 px-4 py-2 text-sm font-semibold text-stone-900 shadow-[0_8px_20px_-8px_rgba(247,201,72,0.7)] transition hover:bg-brand-300 active:scale-[.98]"
          >
            Kostenlos starten
          </button>
        </div>
      </div>
    </header>
  )
}

/* ---------------- hero ---------------- */

function Hero({
  onStart,
  progress,
  onHowItWorks,
}: {
  onStart: () => void
  progress: MotionValue<number>
  onHowItWorks: () => void
}) {
  const calm = useCalmMotion()
  const y = useTransform(progress, [0, 0.16], [0, -50])
  const opacity = useTransform(progress, [0, 0.13], [1, 0])

  return (
    <section className="relative px-5 pb-20 pt-14 sm:px-6 sm:pt-20">
      {/* Sem läuft beim Scrollen unten herein (hinter dem Inhalt, blendet in Creme) */}
      <HeroSem progress={progress} />
      {/* Scroll-Parallax nur auf Nicht-Touch (auf Mobile sonst Flacker-Quelle) */}
      <motion.div style={calm ? undefined : { y, opacity }} className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.div variants={item} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-stone-500 shadow-[var(--shadow-soft)] ring-1 ring-stone-200/70 backdrop-blur">
            <Sparkles size={13} className="text-brand-500" /> Dein Semester. Endlich sortiert.
          </motion.div>
          <motion.h1
            variants={item}
            className="mt-5 text-[clamp(2.6rem,6vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-balance"
            style={{ color: NAVY }}
          >
            Verpass nie wieder eine Abgabe.
          </motion.h1>
          <motion.p variants={item} className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600 sm:text-xl text-pretty">
            Schluss mit zehn Tabs: SemBan sammelt alle Abgaben, Fristen und Aufgaben deiner Kurse an
            einem Ort – Übungsblätter, Hausarbeiten, Referate, Klausuren. Und für die Prüfungen baut
            es dir einen fertigen Lernplan. Stundenplan, Noten und ECTS – alles dabei.
          </motion.p>
          <motion.ul variants={item} className="mt-6 space-y-2.5">
            {[
              'Alle Abgaben und Fristen – auf einen Blick',
              'Automatischer Lernplan für jede Klausur',
              'Stundenplan, Noten & ECTS – alles dabei, kostenlos',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[15px] text-stone-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-stone-900">
                  <Check size={13} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </motion.ul>
          <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={onStart} className={btnPrimary}>
              Jetzt loslegen
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <button type="button" onClick={onHowItWorks} className={btnSecondary}>
              Wie's funktioniert
            </button>
          </motion.div>
          <motion.p variants={item} className="mt-4 text-xs text-stone-400">
            Kostenlos · Werbefrei · Auf all deinen Geräten synchron
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
          style={{ perspective: 1600 }}
          className="relative"
        >
          <div style={{ transform: 'rotateX(6deg) rotateY(-9deg)' }}>
            <BrowserFrame
              src="/landing/board.png"
              alt="SemBan Kanban-Board mit allen Aufgaben, Fristen und Kursen im Überblick"
              eager
            />
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}

/* ---------------- problem ---------------- */

function Problem() {
  const points = [
    'Wann muss ich welches Übungsblatt oder Tutorium abgeben?',
    'War das Referat nicht diese Woche – und wann ist die Hausarbeit fällig?',
    'Wie weit bin ich eigentlich mit alldem?',
  ]
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className={eyebrowCls}>Kommt dir bekannt vor?</p>
          <h2 className="mt-3 text-4xl font-bold leading-[1.07] tracking-[-0.02em] sm:text-5xl text-balance" style={{ color: NAVY }}>
            Studium organisieren: drei Tools, sieben Tabs, null Überblick.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            Übungsblätter, Tutorien, Hausarbeiten, Referate – verteilt über Mails, PDFs, Moodle und
            drei Apps. Bei fünf oder sechs Kursen verliert man da schnell den Faden. Genau da setzt
            SemBan an.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {points.map((p, i) => (
            <Reveal key={p} delay={i * 0.08}>
              <div className="rounded-2xl bg-white/70 px-4 py-4 text-sm font-medium text-stone-600 shadow-[var(--shadow-soft)] ring-1 ring-stone-200/70 backdrop-blur">
                „{p}"
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- showcase (pinned) ---------------- */

const SUPERPOWERS = [
  {
    eyebrow: 'Überblick',
    icon: ListChecks,
    title: 'Alles, was ansteht.\nAuf einen Blick.',
    body: 'Jede Aufgabe aus jedem Kurs auf einem Board: Übungsblatt, Tutorium, Hausarbeit, Referat. Du siehst sofort, was offen ist, woran du arbeitest und was erledigt ist – mit Fortschritt pro Aufgabe (Hausarbeit: Recherche ✓, Gliederung ✓, Rohfassung …). Wiederkehrende Aufgaben wie wöchentliche Übungsblätter legt SemBan automatisch an.',
    src: '/landing/board.png',
    alt: 'SemBan Kanban-Board mit Übungsblättern, Hausarbeiten und Fristen aus allen Kursen',
    color: '#6366f1',
  },
  {
    eyebrow: 'Fristen',
    icon: CalendarClock,
    title: 'Keine Frist\nmehr verpassen.',
    body: 'Wann ist welche Abgabe? SemBan sortiert alle Fristen über deine Kurse und erinnert dich rechtzeitig – auch wenn die App geschlossen ist. Dein Stundenplan zeigt mit einer Linie, wo du gerade im Tag stehst; pro Termin hakst du ab: vorbereitet, besucht, nachbereitet.',
    src: '/landing/schedule.png',
    alt: 'SemBan Stundenplan mit Jetzt-Linie und Anwesenheit pro Vorlesung',
    color: '#0ea5e9',
  },
  {
    eyebrow: 'Noten & ECTS',
    icon: GraduationCap,
    title: 'Dein Schnitt.\nImmer aktuell.',
    body: 'Trag Noten und ECTS ein – SemBan rechnet deinen Durchschnitt fortlaufend übers ganze Studium. Bachelor und Master sauber getrennt. So weißt du immer, wo du stehst – nicht erst beim Abschluss.',
    src: '/landing/study.png',
    alt: 'SemBan Noten- und ECTS-Übersicht mit Notendurchschnitt fürs Studium',
    color: '#e9633c',
  },
]

/** Drei „Superkräfte" als natürlich scrollende, alternierende Abschnitte –
 *  kein Pinning/Scroll-Jacking, damit sich das Scrollen flüssig anfühlt. */
function Showcase() {
  return (
    <section id="features" className="px-5 py-24 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl space-y-20 sm:space-y-28">
        {SUPERPOWERS.map((s, i) => {
          const flip = i % 2 === 1
          return (
            <Reveal key={s.eyebrow}>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={cn('text-center lg:text-left', flip && 'lg:order-2')}>
                  <ShowcaseCopy sp={s} />
                </div>
                <div className={cn(flip && 'lg:order-1')}>
                  <BrowserFrame src={s.src} alt={s.alt} />
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

function ShowcaseCopy({ sp }: { sp: (typeof SUPERPOWERS)[number] }) {
  const Icon = sp.icon
  return (
    <>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
        style={{ backgroundColor: sp.color }}
      >
        <Icon size={13} /> {sp.eyebrow}
      </span>
      <h2 className="mt-4 whitespace-pre-line text-4xl font-bold leading-[1.06] tracking-[-0.02em] sm:text-5xl" style={{ color: NAVY }}>
        {sp.title}
      </h2>
      <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-stone-600 lg:mx-0">{sp.body}</p>
    </>
  )
}

/* ---------------- study plan (marquee feature) ---------------- */

const PLAN_POINTS = [
  'Plant rückwärts ab dem Klausurtermin – intensiv erst im richtigen Vorbereitungsfenster',
  'Verteilte Wiederholung statt Nacht-vor-der-Klausur (Spaced Repetition)',
  'Fokus-Tage statt Häppchen: wenige Kurse pro Tag, klare Tages- & Wochengrenzen',
  'Altklausuren als Generalprobe, Karteikarten als tägliche Gewohnheit',
  'Erledigtes bleibt erledigt – der Plan balanciert sich live neu',
]

function StudyPlan({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6366f1] px-3 py-1 text-xs font-semibold text-white">
            <Brain size={13} /> Lernplan
          </span>
          <h2
            className="mt-4 text-4xl font-bold leading-[1.06] tracking-[-0.02em] sm:text-5xl text-balance"
            style={{ color: NAVY }}
          >
            Dein Lernplan für die Klausur – fertig in Minuten.
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-stone-600">
            Klausurtermin, Kapitel, Übungs- und Tutoriumsblätter und Altklausuren rein – SemBan baut
            daraus einen kompletten Lernplan über all deine Kurse. Sinnvoll auf die Wochen vor der
            Klausur verteilt, mit Wiederholungen im richtigen Abstand und Tages- & Wochenlimits,
            damit du dranbleibst, ohne auszubrennen.
          </p>
          <ul className="mt-6 space-y-2.5">
            {PLAN_POINTS.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[15px] text-stone-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-stone-900">
                  <Check size={13} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <button onClick={onStart} className={btnPrimary + ' mt-8'}>
            Lernplan erstellen
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </Reveal>
        <Reveal delay={0.1}>
          <BrowserFrame
            src="/landing/plans.png"
            alt="SemBan Lernplan für die Klausur: Strategie-Varianten und Materialverteilung über die Wochen"
          />
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- more features ---------------- */

const MORE_FEATURES = [
  { icon: Layers, title: 'Karteikarten-Planung', body: 'SemBan plant täglich Zeit für deine Karteikarten ein – kleine Dosis, dafür regelmäßig.' },
  { icon: Hourglass, title: 'Klausurphase', body: 'Countdown bis zur Klausur, Fortschritt pro Fach und ein Klick zum Aufholen, wenn du hinterherhängst.' },
  { icon: CalendarPlus, title: 'Kalender-Abo & Export', body: 'Abonniere deinen Plan in Google oder Apple Kalender – oder importiere deinen Stundenplan per ICS.' },
  { icon: Bell, title: 'Erinnerungen', body: 'Rechtzeitige Hinweise auf Abgaben – auf Wunsch sogar, wenn die App geschlossen ist.' },
  { icon: Target, title: 'Tagesfokus „Heute"', body: 'Ein Klick blendet alles aus außer dem, was heute wirklich ansteht.' },
  { icon: MessageSquarePlus, title: 'Wünsch dir Features', body: 'Schlag Funktionen vor und stimme über die Roadmap ab – SemBan wächst mit dir.' },
]

function MoreFeatures() {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={eyebrowCls}>Alles dabei</p>
          <h2
            className="mt-3 text-4xl font-bold leading-[1.07] tracking-[-0.02em] sm:text-5xl text-balance"
            style={{ color: NAVY }}
          >
            Und noch viel mehr fürs Studium.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            Kein Wirrwarr aus Einzel-Apps – die kleinen Helfer, die den Alltag wirklich leichter
            machen, sind schon eingebaut.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <Reveal key={f.title} delay={Math.min(i, 3) * 0.06}>
                <div className="h-full rounded-3xl bg-white/75 p-6 shadow-[var(--shadow-card)] ring-1 ring-stone-200/70 backdrop-blur">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-100 text-stone-700 ring-1 ring-stone-200/70">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight" style={{ color: NAVY }}>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.body}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------- trust ---------------- */

function Trust() {
  const items = [
    { icon: ShieldCheck, title: 'Privat & geschützt', body: 'Alles liegt sicher in deinem persönlichen Konto – Zugriff hast nur du.' },
    { icon: WifiOff, title: 'Auch offline da', body: 'SemBan läuft lokal auf deinem Gerät weiter und gleicht sich ab, sobald du wieder online bist.' },
    { icon: Sparkles, title: 'Kostenlos & werbefrei', body: 'Kein Abo, kein Kleingedrucktes. Deine Notenliste verkaufen wir nicht.' },
  ]
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={eyebrowCls}>Kein Haken</p>
          <h2 className="mt-3 text-4xl font-bold leading-[1.07] tracking-[-0.02em] sm:text-5xl text-balance" style={{ color: NAVY }}>
            Deine Daten gehören dir.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            Dein Konto ist privat: Was du in SemBan einträgst, sehen nur du – sicher gespeichert und
            auf all deinen Geräten synchron. Deine Notenliste ist niemandes Geschäftsmodell.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => {
            const Icon = it.icon
            return (
              <Reveal key={it.title} delay={i * 0.08}>
                <div className="h-full rounded-3xl bg-white/75 p-6 shadow-[var(--shadow-card)] ring-1 ring-stone-200/70 backdrop-blur">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-100 text-stone-700 ring-1 ring-stone-200/70">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight" style={{ color: NAVY }}>
                    {it.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{it.body}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------- comparison (Einwand: „reicht doch X") ---------------- */

const ALTERNATIVES = [
  { name: 'Notion & Co.', body: 'Mächtig – aber du baust dir alles selbst zusammen und pflegst es ewig.' },
  { name: 'Excel / Kalender', body: 'Schnell unübersichtlich, vergisst Fristen und rechnet deinen Schnitt nicht mit.' },
  { name: 'Die Uni-App', body: 'Zeigt den Stundenplan – und sonst ziemlich genau nichts.' },
]

function Comparison() {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={eyebrowCls}>„Reicht doch Notion …"</p>
          <h2 className="mt-3 text-4xl font-bold leading-[1.07] tracking-[-0.02em] sm:text-5xl text-balance" style={{ color: NAVY }}>
            Klar. Aber willst du das wirklich selbst basteln?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            SemBan ist für genau eine Sache gemacht – dein Studium – und macht die Fleißarbeit von
            allein.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="grid gap-3">
            {ALTERNATIVES.map((a, i) => (
              <Reveal key={a.name} delay={i * 0.06}>
                <div className="rounded-2xl bg-white/60 p-5 ring-1 ring-stone-200/70 backdrop-blur">
                  <div className="text-sm font-semibold text-stone-500">{a.name}</div>
                  <p className="mt-1 text-sm leading-relaxed text-stone-500">{a.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div className="flex h-full flex-col justify-center rounded-3xl p-7 text-white shadow-[var(--shadow-float)]" style={{ backgroundColor: NAVY }}>
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-400 px-3 py-1 text-xs font-bold text-stone-900">
                <Sparkles size={13} /> SemBan
              </div>
              <h3 className="mt-4 text-2xl font-bold leading-snug">
                Alles fürs Studium an einem Ort – du verlierst nie den Überblick.
              </h3>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Alle Abgaben & Fristen aus allen Kursen vereint',
                  'Status & Fortschritt auf einen Blick',
                  'Kostenlos & ohne Werbung',
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-indigo-100">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-stone-900">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------- social proof (ehrlich & augenzwinkernd) ---------------- */

function SocialProof({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className={eyebrowCls}>Ganz ehrlich</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={28} className="text-stone-300" />
          ))}
        </div>
        <div className="mt-2 text-sm font-medium text-stone-400">0,0 · noch keine Bewertungen</div>
        <h2 className="mt-5 text-4xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl text-balance" style={{ color: NAVY }}>
          Hier stehen sonst erfundene 5-Sterne-Stimmen.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
          Haben wir nicht. SemBan ist frisch gestartet – also gibt's hier ehrliche{' '}
          <strong className="text-stone-700">null Bewertungen</strong> statt erfundener
          Lobeshymnen von „Max&nbsp;M., total begeistert". Probier's aus – und wenn's dir hilft,
          bist du die <strong className="text-stone-700">erste echte Stimme</strong> hier.
        </p>

        <div className="mx-auto mt-8 max-w-md rounded-3xl border-2 border-dashed border-stone-300 bg-white/40 p-6">
          <Quote size={22} className="mx-auto text-stone-300" />
          <p className="mt-3 text-base font-medium text-stone-500">
            „Dein ehrliches Zitat könnte hier stehen."
          </p>
          <p className="mt-1 text-xs text-stone-400">— du, hoffentlich bald</p>
        </div>

        <button onClick={onStart} className={btnPrimary + ' mt-8'}>
          Jetzt ausprobieren
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </Reveal>
    </section>
  )
}

/* ---------------- founder ---------------- */

function Founder() {
  return (
    <section className="px-5 py-20 sm:px-6 sm:py-24">
      <Reveal className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-white/70 p-7 shadow-[var(--shadow-card)] ring-1 ring-stone-200/70 backdrop-blur sm:p-9">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-400 text-xl font-extrabold text-stone-900">
              L
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: NAVY }}>
                Luca
              </div>
              <div className="text-xs text-stone-400">Student & Macher von SemBan</div>
            </div>
          </div>
          <p className="mt-5 text-lg leading-relaxed text-stone-600 text-pretty">
            „Hi! 👋 Ich studiere selbst und hatte mein Semester-Chaos – Übungsblätter, Fristen, Noten
            verteilt auf zehn Tabs – irgendwann satt. Keine App brachte das zusammen, also hab ich
            SemBan gebaut. Wenn dir etwas fehlt oder nervt: schreib mir einfach. Ich lese jede
            Nachricht und antworte dir meist innerhalb eines Tages."
          </p>
          <a
            href="mailto:lucawehrle@gmail.com?subject=Feedback%20zu%20SemBan"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
          >
            Feedback schreiben <ArrowRight size={15} />
          </a>
        </div>
      </Reveal>
    </section>
  )
}

/* ---------------- steps ---------------- */

const STEPS = [
  { n: '1', title: 'Semester anlegen', body: 'Kurse, Fristen und deinen Stundenplan eintragen – Wiederkehrendes erstellt SemBan automatisch.' },
  { n: '2', title: 'SemBan sortiert', body: 'Alle Aufgaben und Fristen landen übersichtlich auf deinem Board.' },
  { n: '3', title: 'Überblick behalten', body: 'Du siehst, was ansteht und wie weit du bist – Woche für Woche durchs Semester.' },
]

function Steps() {
  return (
    <section className="px-5 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={eyebrowCls}>In wenigen Minuten eingerichtet</p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] sm:text-5xl" style={{ color: NAVY }}>
            So einfach geht's.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-3xl bg-white/80 p-6 shadow-[var(--shadow-card)] ring-1 ring-stone-200/70 backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-400 text-sm font-bold text-stone-900">
                  {s.n}
                </div>
                <h3 className="mt-4 text-lg font-semibold" style={{ color: NAVY }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- faq ---------------- */

const FAQS = [
  { q: 'Ist SemBan kostenlos?', a: 'Ja, komplett. Kein Abo, keine Testphase, die plötzlich Geld kostet, kein „Premium" hinter der nächsten Tür.' },
  { q: 'Brauche ich ein Konto?', a: 'Ja, ein kostenloses Konto. Damit sind deine Daten sicher gespeichert und auf Handy und Laptop automatisch synchron. Die Anmeldung dauert nur ein paar Sekunden.' },
  { q: 'Sind meine Daten sicher? Wo werden sie gespeichert?', a: 'Deine Daten liegen geschützt in deinem persönlichen Konto und sind so abgesichert, dass nur du darauf zugreifen kannst. Auf deinem Gerät bleibt zusätzlich eine Kopie, damit alles schnell und offline läuft.' },
  { q: 'Funktioniert das offline?', a: 'Ja. SemBan speichert eine Kopie direkt auf deinem Gerät und läuft deshalb auch im Funkloch der Bib oder im Zug. Sobald du wieder online bist, gleicht sich alles automatisch ab.' },
  { q: 'Kann ich Handy und Laptop nutzen?', a: 'Klar. Mit deinem Konto sind alle Geräte automatisch im Gleichstand – einmal eintragen, überall aktuell.' },
  { q: 'Geht es nur um Übungsblätter?', a: 'Nein – SemBan hilft dir, den Überblick über alle Aufgaben und Fristen deiner Kurse zu behalten: Übungsblätter, Tutorien, Hausarbeiten, Referate, Klausuren. Wöchentliche Übungsblätter sind nur ein Beispiel, das SemBan zusätzlich automatisch anlegt.' },
  { q: 'Erstellt SemBan einen Lernplan für die Klausur?', a: 'Ja. Du gibst Klausurtermin, Kapitel, Übungs- und Tutoriumsblätter sowie Altklausuren an – SemBan erstellt automatisch einen Lernplan über all deine Kurse: verteilt auf die Wochen vor der Klausur, mit Wiederholungen im richtigen Abstand (Spaced Repetition), Fokus-Tagen statt Häppchen und Tages- sowie Wochenlimits, damit du nicht ausbrennst. Altklausuren landen als Prüfungssimulation am Ende, Karteikarten als tägliche Gewohnheit. Erledigtes bleibt erledigt – der Plan balanciert sich automatisch neu.' },
  { q: 'Kann ich Stundenplan & Aufgaben in meinen Kalender exportieren?', a: 'Ja. Du kannst deinen Stundenplan und deine Aufgaben als Kalender (ICS) abonnieren oder exportieren und in Google Kalender, Apple Kalender oder Outlook anzeigen. Umgekehrt kannst du einen bestehenden Stundenplan per ICS importieren.' },
  { q: 'Für welche Studiengänge eignet sich SemBan?', a: 'Für fast jedes Fach mit mehreren Kursen, Abgaben und Fristen – egal ob Mathe, Informatik, Jura, BWL, Geistes- oder Naturwissenschaften. Stundenplan, Noten und ECTS helfen sowieso überall.' },
  { q: 'Wie schnell ist das eingerichtet?', a: 'In ein paar Minuten. Du trägst einmal deine Kurse, Fristen und den Stundenplan ein – den Rest macht SemBan.' },
  { q: 'Erinnert mich SemBan an Fristen und Abgaben?', a: 'Ja. SemBan erinnert dich rechtzeitig an anstehende Abgaben – auf Wunsch sogar, wenn die App geschlossen ist. So verpasst du keine Frist mehr, egal über wie viele Kurse sie verteilt sind.' },
  { q: 'Was ist der Unterschied zu Notion?', a: 'Notion ist mächtig, aber du baust dir alles selbst zusammen und pflegst es ewig. SemBan ist fertig fürs Studium: Aufgaben, Fristen, Stundenplan, Noten & ECTS – ohne Setup, kostenlos und sofort startklar.' },
  { q: 'Funktioniert SemBan für mehrere Studiengänge (Bachelor & Master)?', a: 'Ja. Du kannst mehrere Studiengänge anlegen; Noten und ECTS werden für Bachelor und Master sauber getrennt kumuliert.' },
]

function FAQ() {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <p className={eyebrowCls}>FAQ</p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] sm:text-5xl" style={{ color: NAVY }}>
            Häufige Fragen zur Semesterplaner-App
          </h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={Math.min(i, 4) * 0.05}>
              <FaqItem q={f.q} a={f.a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl bg-white/75 ring-1 ring-stone-200/70 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-stone-800"
        aria-expanded={open}
      >
        {q}
        <span className="shrink-0 text-stone-400">{open ? <Minus size={18} /> : <Plus size={18} />}</span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-stone-600">{a}</p>
      </motion.div>
    </div>
  )
}

/* ---------------- final cta ---------------- */

function FinalCTA({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-5 py-20 sm:px-6 sm:py-28">
      <Reveal className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-[2rem] px-8 py-16 text-center shadow-[var(--shadow-float)]" style={{ backgroundColor: NAVY }}>
          <motion.div
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-400/30 blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -24, 0], y: [0, 24, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[#e9633c]/25 blur-3xl"
          />
          <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-indigo-300">
            Bereit, endlich den Überblick zu haben?
          </p>
          <h2 className="relative mt-3 text-4xl font-extrabold tracking-[-0.02em] text-white sm:text-5xl text-balance">
            Hol dir dein Semester zurück.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-base text-indigo-200">
            Einmal einrichten, das ganze Semester profitieren. Kostenlos, werbefrei und auf all
            deinen Geräten synchron.
          </p>
          <button onClick={onStart} className={btnPrimary + ' relative mt-8'}>
            Jetzt loslegen <ArrowRight size={16} />
          </button>
          <p className="relative mt-4 text-xs text-indigo-300">
            Kostenlos · werbefrei · jederzeit wieder löschbar
          </p>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-sm font-bold" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          Von Studis für Studis · mit <Coffee size={13} /> gebaut · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
