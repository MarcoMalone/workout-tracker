import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: [
      { find: 'https://esm.sh/idb@8', replacement: 'idb' },
      { find: /.*\/vendor\/anthropic-sdk\.js$/, replacement: '@anthropic-ai/sdk' }
    ]
  }
});
