/// <reference lib="webworker" />
/* Service worker: tiene in cache la shell dell'app (HTML, script, stili, caratteri, icone) così si apre senza rete.
   I dati non passano di qui: stanno in IndexedDB e la sincronizzazione parla direttamente con il server. */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// ogni indirizzo dell'app (/calendario, /analisi/…) risponde con la shell, anche offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// una versione nuova resta in attesa finché l'app non chiede di attivarla (pulsante "Aggiorna")
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') void self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
