import { defineConfig } from 'vitest/config';

// Las pruebas cubren los módulos puros (sin React Native): criptografía, PKCE,
// parsing del callback OAuth y la cola de "silent refresh" del cliente HTTP.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
