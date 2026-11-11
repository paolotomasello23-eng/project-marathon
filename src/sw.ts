/// <reference lib="webworker" />
/* Service worker: tiene in cache la shell dell'app (HTML, script, stili, caratteri, icone) così si apre senza rete.
   I dati non passano di qui: stanno in IndexedDB e la sincronizzazione parla direttamente con il server. */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { MMDb } from './data/db';
import { iso } from './domain/plan';
import { fromHour, REM_TAG, type Reminder } from './lib/reminders';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// ogni indirizzo dell'app (/calendario, /analisi/…) risponde con la shell, anche offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// una versione nuova resta in attesa finché l'app non chiede di attivarla (pulsante "Aggiorna")
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') void self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// ---------- promemoria ----------
// Dove il sistema concede il controllo periodico in background (Android, app installata) il service worker
// viene svegliato circa una volta al giorno: legge l'elenco preparato dall'app e mostra la notifica di oggi.

async function remind(): Promise<void> {
  if (!('Notification' in self) || Notification.permission !== 'granted') return;
  const db = new MMDb();
  try {
    if (!(await db.getMeta<boolean>('rem:on'))) return;
    const t = iso(new Date()), now = new Date();
    if ((await db.getMeta<string>('rem:last')) === t || now.getHours() < await fromHour(db)) return;
    const r = ((await db.getMeta<Reminder[]>('rem:plan')) || []).find(x => x.d === t);
    if (!r) return;
    await self.registration.showNotification(r.title, { body: r.body, tag: REM_TAG, icon: '/icon-192.png', badge: '/maskable-192.png', lang: 'it', data: { url: '/' } });
    await db.setMeta('rem:last', t);
  } finally { db.close(); }
}
self.addEventListener('periodicsync', e => { const ev = e as ExtendableEvent & { tag: string }; if (ev.tag === REM_TAG) ev.waitUntil(remind()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs[0]; return c ? c.focus().then(() => undefined) : self.clients.openWindow(url).then(() => undefined); }));
});
