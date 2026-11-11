import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Actions } from './data/actions';
import { Store } from './data/store';
import { createRemote, supabaseConfigured } from './data/remote';
import { Sync } from './data/sync';
import { registerServiceWorker } from './lib/pwa';
import { App } from './ui/App';

const store = new Store(), app = new Actions(store);
const sync = new Sync(store, supabaseConfigured() ? createRemote : null);

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App store={store} app={app} sync={sync} /></StrictMode>);

registerServiceWorker();

store.load().then(() => {
  void sync.start();
  // chiede al browser di non cancellare i dati locali quando lo spazio scarseggia
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
});
