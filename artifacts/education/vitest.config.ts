import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        // Integration tests that mount the full React app need the React JSX
        // plugin and a DOM environment.
        plugins: [react()],
        test: {
          name: 'integration',
          environment: 'jsdom',
          include: ['src/**/*.integration.test.tsx'],
        },
      },
      {
        // Pure unit tests run in Node (faster, no DOM overhead).
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
