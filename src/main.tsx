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
import { LOCAL_ONLY } from './data/sync';
import { registerServiceWorker } from './lib/pwa';
import { App } from './ui/App';
import type { AccountApi } from './ui/ctx';

const store = new Store(), app = new Actions(store);
const account: AccountApi = { status: LOCAL_ONLY, signIn: async () => 'Accesso non configurato.', signOut: async () => { }, syncNow: () => { }, resolve: async () => { } };

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App store={store} app={app} account={account} /></StrictMode>);

registerServiceWorker();

store.load().then(() => {
  // chiede al browser di non cancellare i dati locali quando lo spazio scarseggia
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
});
