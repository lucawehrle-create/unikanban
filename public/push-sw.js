// Web-Push-Handler für SemBan. Wird vom (per Workbox generierten) Service
// Worker via importScripts eingebunden. Zeigt eingehende Erinnerungen an und
// fokussiert/öffnet die App beim Klick.
/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'SemBan', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'SemBan'
  const options = {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/favicon-32.png',
    tag: data.tag || 'semban',
    data: { url: data.url || '/', taskId: data.taskId },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
