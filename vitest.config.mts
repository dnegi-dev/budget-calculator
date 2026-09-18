import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Getestet wird ausschließlich die reine Domänenlogik (lib/domain) —
    // Funktionen ohne React und ohne Storage. Darum reicht die Node-Umgebung.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
