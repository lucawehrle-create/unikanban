import { useRef } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from 'framer-motion'
import {
  ArrowRight,
  Repeat2,
  CalendarClock,
  GraduationCap,
  Smartphone,
  Sparkles,
  Check,
  Coffee,
} from 'lucide-react'
import { Logo } from '../Logo'

const NAVY = '#2a2a6e'
const ease = [0.22, 1, 0.36, 1] as const

/** Reveal beim Scrollen (einmalig). */
function Reveal({
  children,
  delay = 0,
  y = 36,
  className,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}

export default function Landing({ onStart }: { onStart: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: scrollRef })

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-y-auto overflow-x-hidden bg-cream-50 text-stone-800"
    >
      {/* mitscrollender Hintergrund */}
      <AuroraBackground progress={scrollYProgress} />

      {/* Scroll-Fortschritt */}
      <motion.div
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand-400"
      />

      <div className="relative z-10">
        <Nav onStart={onStart} />
        <Hero onStart={onStart} progress={scrollYProgress} />
        <StoryShowcase container={scrollRef} />
        <Steps />
        <FinalCTA onStart={onStart} />
        <Footer />
      </div>
    </div>
  )
}

/**
 * Großflächige, weiche Farb-Blobs, deren Position/Größe/Deckkraft direkt vom
 * Scroll-Fortschritt gesteuert wird – der Hintergrund „lebt" beim Scrollen.
 */
function AuroraBackground({ progress }: { progress: MotionValue<number> }) {
  // Blob 1 (gelb): wandert nach unten-rechts
  const x1 = useTransform(progress, [0, 1], ['-10%', '30%'])
  const y1 = useTransform(progress, [0, 1], ['-5%', '60%'])
  const s1 = useTransform(progress, [0, 0.5, 1], [1, 1.4, 1])
  // Blob 2 (coral): wandert nach oben-links
  const x2 = useTransform(progress, [0, 1], ['40%', '-15%'])
  const y2 = useTransform(progress, [0, 1], ['20%', '80%'])
  // Blob 3 (indigo/navy): erscheint in der Mitte des Scrolls
  const y3 = useTransform(progress, [0, 1], ['90%', '10%'])
  const o3 = useTransform(progress, [0, 0.4, 0.8, 1], [0, 0.45, 0.5, 0.3])
  // sanfter Farb-Wash über die ganze Seite (cream → indigo-Hauch → cream)
  const washOpacity = useTransform(progress, [0, 0.5, 1], [0, 0.5, 0])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        style={{ x: x1, y: y1, scale: s1 }}
        className="absolute left-0 top-0 h-[55vh] w-[55vh] rounded-full bg-brand-300/50 blur-[90px]"
      />
      <motion.div
        style={{ x: x2, y: y2, backgroundColor: '#e9633c' }}
        className="absolute right-0 top-0 h-[50vh] w-[50vh] rounded-full opacity-30 blur-[90px]"
      />
      <motion.div
        style={{ y: y3, opacity: o3, backgroundColor: '#6366f1' }}
        className="absolute left-1/2 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full blur-[100px]"
      />
      {/* sanfter Farb-Wash, der zur Seitenmitte kräftiger wird */}
      <motion.div
        style={{
          opacity: washOpacity,
          background:
            'linear-gradient(160deg, transparent 0%, rgba(99,102,241,0.10) 60%, rgba(42,42,110,0.12) 100%)',
        }}
        className="absolute inset-0"
      />
    </div>
  )
}

function Nav({ onStart }: { onStart: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/40 bg-cream-50/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <button
          onClick={onStart}
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
        >
          Anmelden
        </button>
      </div>
    </header>
  )
}

function Hero({
  onStart,
  progress,
}: {
  onStart: () => void
  progress: MotionValue<number>
}) {
  const yVisual = useTransform(progress, [0, 0.25], [0, -80])
  const scaleVisual = useTransform(progress, [0, 0.25], [1, 0.92])
  const yText = useTransform(progress, [0, 0.2], [0, -40])
  const fade = useTransform(progress, [0, 0.16], [1, 0])

  return (
    <section className="relative px-5 pb-24 pt-16 sm:pt-24">
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <motion.div style={{ y: yText, opacity: fade }}>
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div
              variants={item}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-stone-500 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
            >
              <Sparkles size={13} className="text-brand-500" /> Dein Semester-Kanban
            </motion.div>
            <motion.h1
              variants={item}
              className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
              style={{ color: NAVY }}
            >
              Behalte dein
              <br />
              Studium im Griff.
            </motion.h1>
            <motion.p
              variants={item}
              className="mt-5 max-w-md text-lg leading-relaxed text-stone-600"
            >
              SemBan kennt deinen Uni-Rhythmus: automatische Wochenblätter, Stundenplan, Noten & ECTS
              – blitzschnell lokal und auf allen Geräten synchron.
            </motion.p>
            <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={onStart}
                className="group flex items-center gap-2 rounded-full bg-brand-400 px-6 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-brand-500"
              >
                Kostenlos starten
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#features"
                className="rounded-full bg-white/80 px-6 py-3 text-sm font-medium text-stone-600 ring-1 ring-stone-200 backdrop-blur transition hover:bg-white"
              >
                Funktionen ansehen
              </a>
            </motion.div>
            <motion.p variants={item} className="mt-4 text-xs text-stone-400">
              Kostenlos · keine Kreditkarte · deine Daten gehören dir
            </motion.p>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: yVisual, scale: scaleVisual, opacity: fade }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.2 }}
          className="relative"
        >
          <BoardMock />
        </motion.div>
      </div>

      {/* Scroll-Hinweis */}
      <motion.div
        style={{ opacity: fade }}
        className="mt-16 flex justify-center"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-9 w-6 items-start justify-center rounded-full ring-2 ring-stone-300/70 p-1.5"
        >
          <span className="h-1.5 w-1 rounded-full bg-stone-400" />
        </motion.div>
      </motion.div>
    </section>
  )
}

/** Stilisiertes Mini-Board mit schwebenden Akzent-Karten. */
function BoardMock() {
  const cols = [
    {
      title: 'Offen',
      accent: '#cbd5e1',
      cards: [
        { t: 'Übungsblatt 3', c: '#6366f1', due: 'Fr' },
        { t: 'Lektüre Woche 4', c: '#10b981' },
      ],
    },
    { title: 'Dran', accent: '#0ea5e9', cards: [{ t: 'Referat: Kant', c: '#e9633c', due: '2. Jul' }] },
    { title: 'Erledigt', accent: '#10b981', cards: [{ t: 'Übungsblatt 2', c: '#6366f1' }] },
  ]
  return (
    <div className="relative mx-auto max-w-md">
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-3xl bg-white/85 p-4 shadow-2xl ring-1 ring-stone-200/70 backdrop-blur"
      >
        <div className="mb-3 flex items-center gap-2 px-1">
          <Logo size={22} />
          <span className="text-sm font-bold" style={{ color: NAVY }}>
            SoSe 2026
          </span>
          <span className="ml-auto text-[11px] text-stone-400">Woche 4/14</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cols.map((col) => (
            <div key={col.title} className="rounded-2xl bg-cream-50/80 p-2 ring-1 ring-stone-200/50">
              <div className="mb-1.5 flex items-center gap-1 px-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.accent }} />
                <span className="text-[10px] font-semibold text-stone-500">{col.title}</span>
              </div>
              <div className="space-y-1.5">
                {col.cards.map((card) => (
                  <div
                    key={card.t}
                    className="relative overflow-hidden rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-stone-200/70"
                  >
                    <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: card.c }} />
                    <div className="pl-1 text-[10px] font-medium text-stone-700">{card.t}</div>
                    {card.due && <div className="pl-1 text-[9px] text-stone-400">{card.due}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-4 -top-5 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-lg ring-1 ring-stone-200/70"
      >
        <GraduationCap size={14} className="text-brand-500" /> Ø 1,8
      </motion.div>
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-4 -left-5 flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
      >
        <Check size={13} className="text-brand-300" /> +9 ECTS
      </motion.div>
    </div>
  )
}

const STORY = [
  {
    icon: Repeat2,
    tag: 'Automatik',
    title: 'Das ganze Semester,\nschon angelegt.',
    body: 'Definiere deine Blatt-Serien einmal – SemBan erzeugt automatisch jede Woche und zeigt dir gestaffelt nur die nächsten Abgaben.',
    color: '#6366f1',
  },
  {
    icon: CalendarClock,
    tag: 'Rhythmus',
    title: 'Immer wissen,\nwo du stehst.',
    body: 'Dein Stundenplan mit Anwesenheits-Markierungen und einer „Jetzt"-Linie, die quer durch den Tag mitläuft.',
    color: '#0ea5e9',
  },
  {
    icon: GraduationCap,
    tag: 'Fortschritt',
    title: 'Note für Note\nzum Abschluss.',
    body: 'Trag Noten ein – Schnitt und ECTS rechnen sich automatisch, kumuliert über dein ganzes Studium.',
    color: '#e9633c',
  },
  {
    icon: Smartphone,
    tag: 'Überall',
    title: 'Deine Daten,\nauf jedem Gerät.',
    body: 'Blitzschnell lokal und offline nutzbar – und mit einem Konto synchron auf Handy und Laptop.',
    color: '#10b981',
  },
]

/**
 * Gepinnte Scrollytelling-Sektion: pro Szene ein eigenes Visual im sauberen
 * Split-Layout (Text | Visual). Beim Scrollen blenden die Szenen nacheinander
 * durch – kein Überlappen, klare Story.
 */
function StoryShowcase({ container }: { container: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    container,
    target: ref,
    offset: ['start start', 'end end'],
  })
  const n = STORY.length

  return (
    <section ref={ref} id="features" className="relative" style={{ height: `${n * 100}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div className="relative flex-1">
          {STORY.map((s, i) => (
            <StoryScene key={i} scene={s} index={i} n={n} progress={scrollYProgress} />
          ))}
        </div>
        <StoryDots n={n} progress={scrollYProgress} />
      </div>
    </section>
  )
}

function StoryScene({
  scene,
  index,
  n,
  progress,
}: {
  scene: (typeof STORY)[number]
  index: number
  n: number
  progress: MotionValue<number>
}) {
  const span = 1 / n
  const a = index * span
  const d = a + span
  // Eine saubere Bell-Kurve pro Szene; Offsets strikt in [0,1] und aufsteigend
  // (Pflicht für die native ScrollTimeline, an die framer-motion bindet).
  const opacity = useTransform(
    progress,
    [a, a + 0.25 * span, d - 0.25 * span, d],
    [0, 1, 1, 0],
  )
  const y = useTransform(progress, [a, d], [28, -28])
  const Icon = scene.icon

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 flex items-center justify-center px-5">
      <motion.div
        style={{ y }}
        className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-2 lg:gap-14"
      >
        {/* Text */}
        <div className="text-center lg:text-left">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: scene.color }}
          >
            <Icon size={13} /> {scene.tag}
          </span>
          <h3
            className="mt-4 whitespace-pre-line text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl"
            style={{ color: NAVY }}
          >
            {scene.title}
          </h3>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-stone-600 lg:mx-0 lg:text-lg">
            {scene.body}
          </p>
        </div>

        {/* Visual */}
        <div className="mx-auto w-full max-w-sm">
          <FeatureVisual index={index} color={scene.color} />
        </div>
      </motion.div>
    </motion.div>
  )
}

function StoryDots({ n, progress }: { n: number; progress: MotionValue<number> }) {
  return (
    <div className="flex justify-center gap-2 pb-8 pt-2">
      {Array.from({ length: n }).map((_, i) => (
        <StoryDot key={i} index={i} n={n} progress={progress} />
      ))}
    </div>
  )
}

function StoryDot({ index, n, progress }: { index: number; n: number; progress: MotionValue<number> }) {
  const span = 1 / n
  const a = index * span
  const d = a + span
  // Eingabebereich strikt innerhalb [0,1] halten – framer-motion bindet
  // scroll-abhängige Werte an eine native ScrollTimeline, deren Offsets
  // zwingend in [0,1] und aufsteigend liegen müssen.
  const range = [a, a + 0.001, d - 0.001, d]
  const scaleX = useTransform(progress, range, [1, 3, 3, 1])
  const opacity = useTransform(progress, range, [0.25, 1, 1, 0.25])
  return (
    <motion.span
      style={{ scaleX, opacity, backgroundColor: NAVY }}
      className="h-1.5 w-2.5 origin-center rounded-full"
    />
  )
}

function FeatureVisual({ index, color }: { index: number; color: string }) {
  const shell = 'relative overflow-hidden rounded-3xl bg-white/90 p-5 shadow-xl ring-1 ring-stone-200/70 backdrop-blur'
  if (index === 0) {
    return (
      <div className={shell}>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n, i) => (
            <motion.div
              key={n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1 - i * 0.18, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5, ease }}
              className="flex items-center gap-2 rounded-xl bg-cream-50 px-3 py-2 ring-1 ring-stone-200/60"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium text-stone-700">Übungsblatt {n}</span>
              <span className="ml-auto text-xs text-stone-400">Woche {n}</span>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className={shell}>
        <div className="relative grid grid-cols-3 gap-2" style={{ height: 180 }}>
          {['Mo', 'Di', 'Mi'].map((d) => (
            <div key={d} className="rounded-xl bg-cream-50 ring-1 ring-stone-200/50">
              <div className="px-2 py-1 text-[11px] font-semibold text-stone-500">{d}</div>
            </div>
          ))}
          <div className="absolute left-2 top-10 rounded-lg px-2 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
            ANA2 · HS 1
          </div>
          <div className="absolute right-2 top-24 rounded-lg bg-stone-800 px-2 py-1 text-[10px] font-semibold text-white">
            THEO · SR 4
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease }}
            className="absolute inset-x-0 top-20 h-px origin-left bg-rose-400"
          >
            <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-400" />
          </motion.div>
        </div>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className={shell}>
        <div className="text-xs text-stone-400">ECTS-Fortschritt</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold" style={{ color: NAVY }}>
            69
          </span>
          <span className="text-sm text-stone-400">/ 180</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '38%' }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease }}
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-cream-50 px-2.5 py-1 font-semibold text-stone-600 ring-1 ring-stone-200/60">
            Schnitt 1,8
          </span>
          <span className="rounded-full bg-cream-50 px-2.5 py-1 text-stone-500 ring-1 ring-stone-200/60">
            +20 laufend
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className={shell}>
      <div className="flex items-center justify-center gap-6 py-4">
        <div className="flex h-24 w-16 items-center justify-center rounded-2xl bg-cream-50 ring-1 ring-stone-200/60">
          <Smartphone size={22} style={{ color }} />
        </div>
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-stone-400"
        >
          ⇄
        </motion.div>
        <div className="flex h-24 w-32 items-center justify-center rounded-2xl bg-cream-50 ring-1 ring-stone-200/60">
          <span className="text-xs font-semibold" style={{ color: NAVY }}>
            Laptop
          </span>
        </div>
      </div>
      <div className="text-center text-xs text-stone-400">In Echtzeit synchron</div>
    </div>
  )
}

const STEPS = [
  { n: '1', title: 'Studium einrichten', body: 'Studiengang, Semester, Startbilanz – in 30 Sekunden.' },
  { n: '2', title: 'Kurse anlegen', body: 'Mit Stundenplan und Blatt-Serien. Den Rest macht SemBan.' },
  { n: '3', title: 'Loslegen', body: 'Board, Woche, Stundenplan, Noten – dein Semester sortiert sich.' },
]

function Steps() {
  return (
    <section className="px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: NAVY }}>
            In drei Schritten startklar
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-stone-900"
                  style={{ backgroundColor: '#f5c645' }}
                >
                  {s.n}
                </div>
                <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>
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

function FinalCTA({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-5 py-20 sm:py-28">
      <Reveal className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-[2rem] px-8 py-16 text-center shadow-xl" style={{ backgroundColor: NAVY }}>
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
          <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Bereit fürs nächste Semester?
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-base text-indigo-200">
            Richte SemBan in einer Minute ein und starte sortiert ins Semester.
          </p>
          <button
            onClick={onStart}
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-brand-400 px-7 py-3.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-300"
          >
            Jetzt kostenlos starten <ArrowRight size={16} />
          </button>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-stone-200/60 px-5 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-sm font-bold" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          Mit <Coffee size={13} className="text-stone-400" /> für Studierende gebaut ·{' '}
          {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
