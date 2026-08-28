import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: false },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
