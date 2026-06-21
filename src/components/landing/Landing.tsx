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
  Repeat2,
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
} from 'lucide-react'
import { Logo } from '../Logo'
import { MeshGradient } from './MeshGradient'
import { cn } from '@/lib/cn'

const NAVY = '#2a2a6e'
const ease = [0.22, 1, 0.36, 1] as const

/* ---------------- helpers ---------------- */

function useIsDesktop() {
  const [d, setD] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const f = () => setD(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return d
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

export default function Landing({ onStart }: { onStart: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const { scrollYProgress } = useScroll({ container: scrollRef })

  // Lenis Smooth-Scroll auf dem Container (reduced-motion respektieren)
  useEffect(() => {
    const wrapper = scrollRef.current
    if (!wrapper) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
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
        {/* mitscrollender, animierter Hintergrund */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
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

        <div className="relative z-10">
          <Nav onStart={onStart} />
          <Hero onStart={onStart} progress={scrollYProgress} onHowItWorks={scrollToFeatures} />
          <Problem />
          <Showcase container={scrollRef} />
          <Comparison />
          <Trust />
          <SocialProof onStart={onStart} />
          <Steps />
          <Founder />
          <FAQ />
          <FinalCTA onStart={onStart} />
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
      className="absolute inset-0 opacity-[0.18] mix-blend-soft-light"
      style={{ backgroundImage: `url("${noise}")`, backgroundSize: '160px 160px' }}
    />
  )
}

/* ---------------- chrome ---------------- */

function BrowserFrame({ src, className }: { src: string; className?: string }) {
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
      <img src={src} alt="" aria-hidden loading="lazy" className="block w-full" />
    </div>
  )
}

function Nav({ onStart }: { onStart: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-cream-50/50 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
            SemBan
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onStart}
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
  const y = useTransform(progress, [0, 0.16], [0, -50])
  const opacity = useTransform(progress, [0, 0.13], [1, 0])

  return (
    <section className="relative px-5 pb-20 pt-14 sm:px-6 sm:pt-20">
      <motion.div style={{ y, opacity }} className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.div variants={item} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-stone-500 shadow-[var(--shadow-soft)] ring-1 ring-stone-200/70 backdrop-blur">
            <Sparkles size={13} className="text-brand-500" /> Dein Semester. Endlich sortiert.
          </motion.div>
          <motion.h1
            variants={item}
            className="mt-5 text-[clamp(2.6rem,6vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-balance"
            style={{ color: NAVY }}
          >
            Schluss mit Übungsblatt-Chaos.
          </motion.h1>
          <motion.p variants={item} className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600 sm:text-xl text-pretty">
            SemBan baut dir aus einem einzigen Setup automatisch alle Wochenblätter fürs ganze
            Semester – und zeigt dir nur, was als Nächstes dran ist. Stundenplan, Noten und ECTS
            gleich mit dabei.
          </motion.p>
          <motion.ul variants={item} className="mt-6 space-y-2.5">
            {[
              'Übungsblätter fürs ganze Semester – automatisch erzeugt',
              'Stundenplan, Noten & ECTS an einem Ort',
              'In 30 Sekunden startklar, komplett kostenlos',
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
              Kostenlos loslegen
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
            <BrowserFrame src="/landing/board.png" />
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}

/* ---------------- problem ---------------- */

function Problem() {
  const points = [
    'Abgabe war doch erst nächste Woche, oder?',
    'Welches Blatt war nochmal dran?',
    'Wie steht mein Schnitt eigentlich gerade?',
  ]
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className={eyebrowCls}>Kommt dir bekannt vor?</p>
          <h2 className="mt-3 text-4xl font-bold leading-[1.07] tracking-[-0.02em] sm:text-5xl text-balance" style={{ color: NAVY }}>
            Drei Tools, sieben Tabs, null Überblick.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            Übungsblätter im Mail-Postfach, der Stundenplan irgendwo im PDF, die Noten in einer
            Excel, die du seit März nicht mehr geöffnet hast. Studium ist schon anstrengend genug.
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
    eyebrow: 'Superkraft 01',
    icon: Repeat2,
    title: 'Einmal einrichten.\nGanzes Semester erledigt.',
    body: 'Du legst eine Serie an – „Analysis I, Blatt 1–12, jeden Montag fällig" – und SemBan generiert alle Wochenblätter mit den richtigen Fristen. Du siehst immer nur die nächsten.',
    src: '/landing/board.png',
    color: '#6366f1',
  },
  {
    eyebrow: 'Superkraft 02',
    icon: CalendarClock,
    title: 'Dein Stundenplan,\nder mitdenkt.',
    body: 'Alle Veranstaltungen auf einen Blick, mit einer Live-Linie, die zeigt, wo du gerade im Tag stehst. Pro Termin hakst du ab: vorbereitet, besucht, nachbereitet.',
    src: '/landing/schedule.png',
    color: '#0ea5e9',
  },
  {
    eyebrow: 'Superkraft 03',
    icon: GraduationCap,
    title: 'Dein Schnitt.\nImmer aktuell.',
    body: 'Trag Noten und ECTS ein – SemBan rechnet deinen Durchschnitt fortlaufend übers ganze Studium. Bachelor und Master sauber getrennt. Keine bösen Überraschungen vorm Abschluss.',
    src: '/landing/study.png',
    color: '#e9633c',
  },
]

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReduce(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return reduce
}

function Showcase({ container }: { container: React.RefObject<HTMLDivElement | null> }) {
  const isDesktop = useIsDesktop()
  const reduce = usePrefersReducedMotion()
  // Kein Desktop ODER reduzierte Bewegung → einfache, gestapelte Variante.
  if (!isDesktop || reduce) return <ShowcaseStacked />
  return <ShowcasePinned container={container} />
}

function ShowcasePinned({ container }: { container: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, container, offset: ['start start', 'end end'] })
  // Diskreter aktiver Index statt überlappender Opacity-Kurven: So ist immer
  // GENAU ein Text/Screen sichtbar (kein Überlappen bei Smooth-Scroll), der
  // Wechsel ist ein sauberer CSS-Crossfade. Index 0 ist bei Fortschritt 0 aktiv,
  // damit der „Wie's funktioniert"-Sprung nicht auf einem leeren Frame landet.
  const [active, setActive] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const i = v < 0.34 ? 0 : v < 0.67 ? 1 : 2
    setActive((prev) => (prev === i ? prev : i))
  })

  return (
    <section id="features" ref={ref} className="relative" style={{ height: '320vh' }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          {/* Copy – gestapelt, exakt eine sichtbar */}
          <div className="relative min-h-[20rem]">
            {SUPERPOWERS.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'absolute inset-0 transition-opacity duration-500',
                  i === active ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <ShowcaseCopy sp={s} />
              </div>
            ))}
          </div>
          {/* Device – fester Rahmen, Screen wechselt */}
          <div style={{ perspective: 1800 }} className="relative">
            <div className="relative" style={{ transform: 'rotateX(5deg) rotateY(-8deg)' }}>
              {SUPERPOWERS.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    i === 0 ? '' : 'absolute inset-0',
                    'transition-opacity duration-500',
                    i === active ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <BrowserFrame src={s.src} />
                </div>
              ))}
            </div>
          </div>
        </div>
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
      <p className="mt-5 max-w-md text-lg leading-relaxed text-stone-600">{sp.body}</p>
    </>
  )
}

/** Mobile/Tablet: einfache gestapelte Variante (kein Pinning). */
function ShowcaseStacked() {
  return (
    <section id="features" className="space-y-24 px-5 py-24 sm:px-6">
      {SUPERPOWERS.map((s) => {
        const Icon = s.icon
        return (
          <Reveal key={s.eyebrow} className="mx-auto max-w-md text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: s.color }}>
              <Icon size={13} /> {s.eyebrow}
            </span>
            <h2 className="mt-4 whitespace-pre-line text-3xl font-bold leading-[1.08] tracking-[-0.02em]" style={{ color: NAVY }}>
              {s.title}
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-stone-600">{s.body}</p>
            <div className="mt-7">
              <BrowserFrame src={s.src} />
            </div>
          </Reveal>
        )
      })}
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
                Alles fürs Studium an einem Ort – und die Wochenblätter entstehen von selbst.
              </h3>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Einmal einrichten statt jede Woche tippen',
                  'Stundenplan, Aufgaben, Noten & ECTS vereint',
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
          <strong className="text-stone-700">null Bewertungen</strong> statt ausgedachter
          Lobeshymnen von „Max&nbsp;M., begeisterter Nutzer". Sei lieber die*der{' '}
          <strong className="text-stone-700">Erste</strong>, die*der SemBan wirklich testet.
        </p>

        <div className="mx-auto mt-8 max-w-md rounded-3xl border-2 border-dashed border-stone-300 bg-white/40 p-6">
          <Quote size={22} className="mx-auto text-stone-300" />
          <p className="mt-3 text-base font-medium text-stone-500">
            „Dein ehrliches Zitat könnte hier stehen."
          </p>
          <p className="mt-1 text-xs text-stone-400">— du, hoffentlich bald</p>
        </div>

        <button onClick={onStart} className={btnPrimary + ' mt-8'}>
          Erste*r sein
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
            SemBan gebaut. Wenn dir etwas fehlt oder nervt: schreib mir einfach. Ich lese wirklich
            jede Nachricht."
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
  { n: '1', title: 'Semester anlegen', body: 'Kurse, Übungsblatt-Serien und deinen Stundenplan eintragen.' },
  { n: '2', title: 'SemBan rechnet', body: 'Alle Wochenblätter und Fristen werden automatisch generiert.' },
  { n: '3', title: 'Loslegen', body: 'Nur das Nächste im Blick – Woche für Woche durchs Semester.' },
]

function Steps() {
  return (
    <section className="px-5 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={eyebrowCls}>In 3 Minuten startklar</p>
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
  { q: 'Für welche Studiengänge eignet sich SemBan?', a: 'Für fast alle – besonders stark, wenn dein Studium auf wöchentlichen Übungs- oder Tutoriumsblättern läuft (Mathe, Informatik, Physik, Ingenieurwesen, BWL …). Stundenplan, Noten und ECTS helfen in jedem Fach.' },
  { q: 'Wie schnell ist das eingerichtet?', a: 'In ein paar Minuten. Du tippst einmal das Gerüst deines Semesters ein – SemBan generiert den Rest.' },
]

function FAQ() {
  return (
    <section className="px-5 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <p className={eyebrowCls}>Häufige Fragen</p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] sm:text-5xl" style={{ color: NAVY }}>
            Gut zu wissen.
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
            Bereit fürs sortierte Semester?
          </p>
          <h2 className="relative mt-3 text-4xl font-extrabold tracking-[-0.02em] text-white sm:text-5xl text-balance">
            Hol dir dein Semester zurück.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-base text-indigo-200">
            Einmal einrichten, das ganze Semester profitieren. Kostenlos, werbefrei und auf all
            deinen Geräten synchron.
          </p>
          <button onClick={onStart} className={btnPrimary + ' relative mt-8'}>
            Kostenlos loslegen <ArrowRight size={16} />
          </button>
          <p className="relative mt-4 text-xs text-indigo-300">
            Kostenlos · in 30 Sekunden startklar · jederzeit wieder löschbar
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
