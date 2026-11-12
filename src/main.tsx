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
import { MMDb } from './data/db';
import { currentDbName, rememberOwner, switchAccount } from './data/dbName';
import { Store } from './data/store';
import { createRemote, supabaseConfigured } from './data/remote';
import { Sync } from './data/sync';
import { registerServiceWorker } from './lib/pwa';
import { App } from './ui/App';

// ogni account ha il proprio archivio locale: si apre quello dell'account in uso su questo dispositivo
const store = new Store(new MMDb(currentDbName())), app = new Actions(store);
const sync = new Sync(store, supabaseConfigured() ? createRemote : null, { onLinked: id => rememberOwner(id, store.db.name), onForeign: id => { switchAccount(id); } });

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App store={store} app={app} sync={sync} /></StrictMode>);

registerServiceWorker();

store.load().then(() => {
  void sync.start();
  // chiede al browser di non cancellare i dati locali quando lo spazio scarseggia
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
});
