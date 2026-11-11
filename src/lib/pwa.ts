/* Registrazione del service worker e stato dell'aggiornamento. */
type Listener = () => void;

const subs = new Set<Listener>();
let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;

export function onPwa(f: Listener): () => void { subs.add(f); return () => { subs.delete(f); }; }
/** true quando una versione nuova dell'app è scaricata e pronta. */
export function updateReady(): boolean { return !!waiting; }
export function swRegistration(): ServiceWorkerRegistration | null { return registration; }

function setWaiting(w: ServiceWorker | null): void { waiting = w; subs.forEach(f => f()); }

/** Attiva la versione in attesa e ricarica la pagina. */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const start = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      if (!reg) return;
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing; if (!sw) return;
        sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw); });
      });
      // controlla se c'è una versione nuova quando l'app torna in primo piano
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { }); });
    }).catch(e => console.error('Service worker non registrato', e));
  };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
}
