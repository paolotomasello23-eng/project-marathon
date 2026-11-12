import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { supabaseEnv } from './scripts/supabase-env.mjs';

export default defineConfig(({ mode }) => {
  // indirizzo e chiave pubblica di Supabase: da .env o dall'hosting, con o senza prefisso VITE_
  const sb = supabaseEnv(loadEnv(mode, process.cwd(), ''));
  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(sb.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(sb.key)
    },
    plugins: [
      react(),
      VitePWA({
        // service worker scritto a mano (src/sw.ts): precache della shell, apertura offline, promemoria
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: false,
        // le icone del manifest le aggiunge il plugin: qui il resto della shell
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}', 'apple-touch-icon.png'] },
        includeAssets: [],
        manifest: {
          id: '/',
          name: 'Madrid 27',
          short_name: 'Madrid 27',
          description: 'Preparazione della Maratona di Madrid del 25 aprile 2027',
          lang: 'it',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#18212C',
          theme_color: '#18212C',
          categories: ['sports', 'health', 'fitness'],
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ],
          shortcuts: [
            { name: 'Registra', url: '/registra', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Calendario', url: '/calendario', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] }
          ]
        },
        devOptions: { enabled: false }
      })
    ],
    build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
    server: { port: 5173 }
  };
});
