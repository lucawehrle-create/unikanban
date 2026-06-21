import { useEffect, useState } from 'react'

/**
 * PWA-Installation & Plattform-Erkennung – Grundlage dafür, dass „Erinnerungen
 * auch bei geschlossener App" wirklich ankommen. Wichtig v. a. für iOS: Web-Push
 * funktioniert dort NUR, wenn SemBan zum Home-Bildschirm hinzugefügt wurde
 * (standalone). Im normalen Safari-Tab gibt es keine Notification-API.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let attached = false
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())

/** Früh in main.tsx aufrufen, damit das beforeinstallprompt-Event nicht verloren geht. */
export function initInstall() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Läuft die App installiert (Home-Bildschirm / eigenes Fenster)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS-spezifisch
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export type Platform = 'ios' | 'android' | 'desktop'

export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  // iPadOS meldet sich als „Macintosh" mit Touch.
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document)
  if (iOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function canPromptInstall(): boolean {
  return deferred !== null
}

/** Nativen Installations-Dialog auslösen (Android/Chrome/Edge). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}

export type InstallState = {
  platform: Platform
  standalone: boolean
  canPrompt: boolean
  /** iOS im Browser-Tab: Web-Push erst nach „Zum Home-Bildschirm" möglich. */
  needsInstallForPush: boolean
  promptInstall: () => Promise<boolean>
}

export function useInstall(): InstallState {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((n) => n + 1)
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [])
  const platform = getPlatform()
  const standalone = isStandalone()
  return {
    platform,
    standalone,
    canPrompt: canPromptInstall(),
    needsInstallForPush: platform === 'ios' && !standalone,
    promptInstall,
  }
}
