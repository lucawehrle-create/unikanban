import { useEffect, useRef } from 'react'
import { Renderer, Triangle, Program, Mesh } from 'ogl'
import { useMotionValueEvent, type MotionValue } from 'framer-motion'

// Markenpalette als vec3 (0–1): Cream-Basis + Navy/Indigo/Gelb/Coral-„Blobs".
const COLORS = {
  base: [0.992, 0.988, 0.969], // #fdfcf7
  c1: [0.165, 0.165, 0.431], // #2a2a6e navy
  c2: [0.388, 0.4, 0.945], // #6366f1 indigo
  c3: [0.961, 0.776, 0.271], // #f5c645 gelb
  c4: [0.914, 0.388, 0.235], // #e9633c coral
}

const vert = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`

const frag = `
precision highp float;
uniform float uTime;
uniform float uScroll;
uniform vec2 uRes;
uniform vec3 uBase, uC1, uC2, uC3, uC4;
varying vec2 vUv;

float blob(vec2 uv, vec2 c, float r) { return smoothstep(r, 0.0, length(uv - c)); }

void main() {
  vec2 uv = vUv;
  uv.x *= uRes.x / uRes.y;
  float t = uTime * 0.05;
  float s = uScroll;

  vec2 p1 = vec2(0.30 + 0.10 * sin(t),       0.30 + 0.08 * cos(t * 0.9) - 0.18 * s);
  vec2 p2 = vec2(0.78 + 0.08 * cos(t * 1.1), 0.68 + 0.10 * sin(t * 0.8) + 0.12 * s);
  vec2 p3 = vec2(0.55 + 0.12 * sin(t * 0.7), 0.22 + 0.06 * cos(t)       + 0.30 * s);
  vec2 p4 = vec2(0.18 + 0.09 * cos(t * 1.3), 0.82 + 0.07 * sin(t * 1.2) - 0.22 * s);

  float aspect = uRes.x / uRes.y;
  p1.x *= aspect; p2.x *= aspect; p3.x *= aspect; p4.x *= aspect;

  vec3 col = uBase;
  col = mix(col, uC1, blob(uv, p1, 0.60) * 0.30); // navy dezent (Lesbarkeit)
  col = mix(col, uC2, blob(uv, p2, 0.62) * 0.38); // indigo
  col = mix(col, uC3, blob(uv, p3, 0.58) * 0.65); // gelb kräftiger
  col = mix(col, uC4, blob(uv, p4, 0.56) * 0.50); // coral
  gl_FragColor = vec4(col, 1.0);
}
`

/** Animierter Mesh-Gradient als Hintergrund (GPU, ~1 Quad). */
export function MeshGradient({ scroll }: { scroll: MotionValue<number> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scrollTarget = useRef(0)

  useMotionValueEvent(scroll, 'change', (v) => {
    scrollTarget.current = v
  })

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    let renderer: Renderer
    try {
      renderer = new Renderer({ canvas, dpr, alpha: true, antialias: false })
    } catch {
      return // kein WebGL → CSS-Fallback (Eltern-Hintergrund) bleibt sichtbar
    }
    const gl = renderer.gl
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uRes: { value: [1, 1] },
        uBase: { value: COLORS.base },
        uC1: { value: COLORS.c1 },
        uC2: { value: COLORS.c2 },
        uC3: { value: COLORS.c3 },
        uC4: { value: COLORS.c4 },
      },
    })
    const mesh = new Mesh(gl, { geometry, program })

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h)
      program.uniforms.uRes.value = [gl.canvas.width, gl.canvas.height]
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let running = true
    let cur = 0
    const loop = (ms: number) => {
      if (!running) return
      raf = requestAnimationFrame(loop)
      program.uniforms.uTime.value = ms * 0.001
      cur += (scrollTarget.current - cur) * 0.05
      program.uniforms.uScroll.value = cur
      renderer.render({ scene: mesh })
    }

    if (reduce) {
      program.uniforms.uTime.value = 2.4
      renderer.render({ scene: mesh })
    } else {
      raf = requestAnimationFrame(loop)
    }

    const onVis = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduce) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    const onLost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [scroll])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />
}
