import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const aliasConfig = {
  '@': path.resolve(_dirname, './src')
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: aliasConfig },
        test: {
          name: 'integration',
          environment: 'jsdom',
          include: ['src/**/*.integration.test.tsx', 'src/**/*.i18n.test.tsx'],
        },
      },
      {
        resolve: { alias: aliasConfig },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.integration.test.tsx', 'src/**/*.i18n.test.tsx'],
        },
      },
    ],
  },
});
