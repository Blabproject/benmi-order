import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'frontend/shared'),
      '@pos': path.resolve(rootDir, 'frontend/apps/pos')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['frontend/**/*.test.ts', 'frontend/**/*.test.tsx'],
    setupFiles: ['./frontend/test-setup.ts']
  }
});
