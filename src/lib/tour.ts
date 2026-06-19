import { useSync } from './sync'

// „Tour gesehen" gilt pro Konto (bzw. „local" ohne Konto), nicht global –
// so startet die Tour bei einem neuen Account einmalig automatisch, auch
// wenn auf demselben Gerät vorher schon jemand die Tour gesehen hat.
function key() {
  const uid = useSync.getState().user?.id
  return `semban:tourSeen:${uid ?? 'local'}`
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(key()) === '1'
  } catch {
    return false
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(key(), '1')
  } catch {
    /* ignore */
  }
}
