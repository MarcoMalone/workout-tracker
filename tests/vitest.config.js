import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: { 'https://esm.sh/idb@8': 'idb' }
  }
});
