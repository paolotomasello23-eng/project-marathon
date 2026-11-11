import { defineConfig } from 'vitest/config';

// Le date del dominio sono locali: i test girano nel fuso dell'atleta (cambio dell'ora compreso).
process.env.TZ = 'Europe/Rome';

export default defineConfig({
  test: {
    include: ['tests/domain/**/*.test.ts', 'tests/data/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts']
  }
});
