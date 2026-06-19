import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue, type Variants } from 'framer-motion'
import { ArrowRight, Repeat2, CalendarClock, GraduationCap, Smartphone, Sparkles, Coffee } from 'lucide-react'
import { Logo } from '../Logo'

const NAVY = '#2a2a6e'
const ease = [0.22, 1, 0.36, 1] as const

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
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }
const item: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }

export default function Landing({ onStart }: { onStart: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: scrollRef })

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto overflow-x-hidden bg-cream-50 text-stone-800">
      {/* DER STAR: vollflächiger, mitscrollender Hintergrund */}
      <ScrollBackground progress={scrollYProgress} />

      <motion.div
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand-400"
      />

      <div className="relative z-10">
        <Nav onStart={onStart} />
        <Hero onStart={onStart} progress={scrollYProgress} />
        {STORY.map((s, i) => (
          <StorySection key={i} scene={s} />
        ))}
        <Steps />
        <FinalCTA onStart={onStart} />
        <Footer />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hintergrund                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fixer Vollbild-Hintergrund. Beim Scrollen wandern große Farbflächen und
 * es werden nacheinander große Grafik-Szenen ein- und ausgeblendet
 * (Board → Stundenplan → Noten → Sync). Alle Offsets liegen in [0,1].
 */
function ScrollBackground({ progress }: { progress: MotionValue<number> }) {
  // große, wandernde Farbflächen (Mesh-Gefühl)
  const ax = useTransform(progress, [0, 1], ['-12%', '26%'])
  const ay = useTransform(progress, [0, 1], ['-8%', '50%'])
  const bx = useTransform(progress, [0, 1], ['30%', '-20%'])
  const by = useTransform(progress, [0, 1], ['10%', '70%'])
  const cy = useTransform(progress, [0, 1], ['85%', '5%'])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div style={{ x: ax, y: ay }} className="absolute left-0 top-0 h-[70vmin] w-[70vmin]">
        <Pulse className="h-full w-full rounded-full bg-brand-300/55 blur-[110px]" />
      </motion.div>
      <motion.div style={{ x: bx, y: by }} className="absolute right-0 top-0 h-[64vmin] w-[64vmin]">
        <Pulse className="h-full w-full rounded-full blur-[110px]" style={{ backgroundColor: '#e9633c40' }} />
      </motion.div>
      <motion.div style={{ y: cy }} className="absolute left-1/2 h-[72vmin] w-[72vmin] -translate-x-1/2">
        <Pulse className="h-full w-full rounded-full blur-[120px]" style={{ backgroundColor: '#6366f140' }} />
      </motion.div>

      {/* große Grafik-Szenen, die nacheinander durchscrollen */}
      <BgLayer progress={progress} range={[0.06, 0.34]} parallax={70} drift={-12}>
        <BoardGiant />
      </BgLayer>
      <BgLayer progress={progress} range={[0.28, 0.54]} parallax={90} drift={14}>
        <CalendarGiant />
      </BgLayer>
      <BgLayer progress={progress} range={[0.5, 0.74]} parallax={70} drift={-14}>
        <RingsGiant />
      </BgLayer>
      <BgLayer progress={progress} range={[0.72, 0.96]} parallax={90} drift={12}>
        <OrbitGiant />
      </BgLayer>

      {/* nur Ränder leicht aufhellen, Mitte bleibt lebendig */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cream-50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-cream-50 to-transparent" />
    </div>
  )
}

function Pulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.12, 1] }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      className={className}
      style={style}
    />
  )
}

/** Eine große Hintergrund-Grafik mit Opacity-Fenster + Zoom/Parallax. */
function BgLayer({
  progress,
  range: [s, e],
  parallax,
  drift = 0,
  children,
}: {
  progress: MotionValue<number>
  range: [number, number]
  parallax: number
  drift?: number
  children: React.ReactNode
}) {
  const mid = (s + e) / 2
  const opacity = useTransform(progress, [s, (s + mid) / 2, (mid + e) / 2, e], [0, 1, 1, 0])
  const scale = useTransform(progress, [s, e], [0.82, 1.22])
  const y = useTransform(progress, [s, e], [parallax, -parallax])
  const x = useTransform(progress, [s, e], [`${-drift}vmin`, `${drift}vmin`])
  const rotate = useTransform(progress, [s, e], [-6, 6])
  return (
    <motion.div style={{ opacity }} className="absolute inset-0 flex items-center justify-center">
      <motion.div style={{ scale, y, x, rotate }} className="flex items-center justify-center">
        {children}
      </motion.div>
    </motion.div>
  )
}

const GIANT = 'relative h-[96vmin] w-[96vmin]'

function BoardGiant() {
  return (
    <div className={GIANT} style={{ opacity: 0.4 }}>
      <div className="absolute inset-[12%] grid grid-cols-3 gap-[3vmin]">
        {[0, 1, 2].map((c) => (
          <div key={c} className="rounded-[4vmin] ring-[0.5vmin] ring-stone-400/40">
            <div className="space-y-[2vmin] p-[2vmin]">
              {Array.from({ length: c === 0 ? 4 : c === 1 ? 2 : 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[6vmin] rounded-[2vmin]"
                  style={{ backgroundColor: ['#6366f1', '#0ea5e9', '#10b981'][c] + '55' }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarGiant() {
  return (
    <div className={GIANT} style={{ opacity: 0.42 }}>
      <div className="absolute inset-[10%] grid grid-cols-5 grid-rows-6">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="border-[0.3vmin] border-stone-400/30" />
        ))}
      </div>
      {/* Termin-Blöcke */}
      <div className="absolute left-[24%] top-[34%] h-[10vmin] w-[12vmin] rounded-[2vmin] bg-[#0ea5e9]/50" />
      <div className="absolute left-[58%] top-[54%] h-[10vmin] w-[12vmin] rounded-[2vmin] bg-[#6366f1]/50" />
      {/* „Jetzt"-Beam */}
      <div className="absolute left-[10%] right-[10%] top-1/2 h-[0.6vmin] bg-rose-400/70" />
    </div>
  )
}

function RingsGiant() {
  return (
    <div className={`${GIANT} flex items-center justify-center`} style={{ opacity: 0.5 }}>
      {[100, 74, 48].map((p, i) => (
        <svg key={p} viewBox="0 0 100 100" className="absolute" style={{ width: `${p}%`, height: `${p}%` }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="#cbd5e1" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={['#e9633c', '#f5c645', '#6366f1'][i]}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${[62, 40, 80][i] * 2.89} 1000`}
            transform="rotate(-90 50 50)"
          />
        </svg>
      ))}
    </div>
  )
}

function OrbitGiant() {
  return (
    <div className={`${GIANT} flex items-center justify-center`} style={{ opacity: 0.42 }}>
      <div className="absolute h-[18vmin] w-[18vmin] rounded-full bg-[#10b981]/40" />
      {[40, 64, 88].map((r, i) => (
        <motion.div
          key={r}
          className="absolute rounded-full border-[0.4vmin] border-stone-400/30"
          style={{ width: `${r}%`, height: `${r}%` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 30 + i * 14, repeat: Infinity, ease: 'linear' }}
        >
          <span
            className="absolute left-1/2 top-0 h-[4vmin] w-[4vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: ['#6366f1', '#0ea5e9', '#f5c645'][i] + '99' }}
          />
        </motion.div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Vordergrund                                                         */
/* ------------------------------------------------------------------ */

function Nav({ onStart }: { onStart: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-cream-50/40 backdrop-blur-md">
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

function Hero({ onStart, progress }: { onStart: () => void; progress: MotionValue<number> }) {
  const yText = useTransform(progress, [0, 0.18], [0, -50])
  const fade = useTransform(progress, [0, 0.14], [1, 0])

  return (
    <section className="relative flex min-h-screen items-center px-5">
      <motion.div style={{ y: yText, opacity: fade }} className="mx-auto w-full max-w-3xl text-center">
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.div
            variants={item}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-stone-500 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
          >
            <Sparkles size={13} className="text-brand-500" /> Dein Semester-Kanban
          </motion.div>
          <motion.h1
            variants={item}
            className="mt-6 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl"
            style={{ color: NAVY }}
          >
            Behalte dein
            <br />
            Studium im Griff.
          </motion.h1>
          <motion.p variants={item} className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-stone-600 sm:text-xl">
            Automatische Wochenblätter, Stundenplan, Noten & ECTS – SemBan kennt deinen Uni-Rhythmus.
            Blitzschnell lokal und auf allen Geräten synchron.
          </motion.p>
          <motion.div variants={item} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onStart}
              className="group flex items-center gap-2 rounded-full bg-brand-400 px-7 py-3.5 text-sm font-semibold text-stone-900 shadow-lg shadow-brand-400/30 transition hover:bg-brand-500"
            >
              Kostenlos starten
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <a
              href="#story"
              className="rounded-full bg-white/70 px-7 py-3.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200 backdrop-blur transition hover:bg-white"
            >
              Wie es funktioniert
            </a>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div style={{ opacity: fade }} className="absolute inset-x-0 bottom-8 flex justify-center">
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-9 w-6 items-start justify-center rounded-full p-1.5 ring-2 ring-stone-300/70"
        >
          <span className="h-1.5 w-1 rounded-full bg-stone-400" />
        </motion.div>
      </motion.div>
    </section>
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
    body: 'Dein Stundenplan mit Anwesenheit und einer „Jetzt"-Linie, die quer durch den Tag mitläuft.',
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

/** Große, ruhige Text-Szene – schwebt über dem animierten Hintergrund. */
function StorySection({ scene }: { scene: (typeof STORY)[number] }) {
  const Icon = scene.icon
  return (
    <section id="story" className="relative flex min-h-screen items-center justify-center px-5">
      <Reveal className="mx-auto max-w-3xl text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: scene.color }}
        >
          <Icon size={13} /> {scene.tag}
        </span>
        <h2
          className="mt-5 whitespace-pre-line text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ color: NAVY }}
        >
          {scene.title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600 sm:text-xl">{scene.body}</p>
      </Reveal>
    </section>
  )
}

const STEPS = [
  { n: '1', title: 'Studium einrichten', body: 'Studiengang, Semester, Startbilanz – in 30 Sekunden.' },
  { n: '2', title: 'Kurse anlegen', body: 'Mit Stundenplan und Blatt-Serien. Den Rest macht SemBan.' },
  { n: '3', title: 'Loslegen', body: 'Board, Woche, Stundenplan, Noten – dein Semester sortiert sich.' },
]

function Steps() {
  return (
    <section className="relative px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: NAVY }}>
            In drei Schritten startklar
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
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
    <section className="relative px-5 py-24">
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
    <footer className="relative px-5 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-sm font-bold" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          Mit <Coffee size={13} className="text-stone-400" /> für Studierende gebaut · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
