import { defineConfig } from 'vitest/config';

/* Prove contro il progetto Supabase vero (quello indicato in .env). Non fanno parte di `npm test`:
   servono la rete e un progetto configurato. Si lanciano con `npm run test:supabase`. */
export default defineConfig({
  test: { include: ['tests/live/**/*.test.ts'], environment: 'node', testTimeout: 30000 }
});
