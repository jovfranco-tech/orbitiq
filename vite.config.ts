import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { UserConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    // PWA disabled — causes infinite reload loops on Apple Silicon
  ],
  worker: {
    format: 'iife',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) {
            return 'three';
          }
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) {
            return 'recharts';
          }
          if (id.includes('/node_modules/satellite.js/')) {
            return 'satellite';
          }
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'react';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      // Coverage gate scopes the *pure-logic* layer (deterministic, unit-testable).
      // The React UI, imperative WebGL renderer, Web Worker, and orchestration
      // hooks/stores are validated by Playwright e2e + accessibility suites instead.
      include: [
        'src/ai/**/*.ts',
        'src/data/**/*.ts',
        'src/intelligence/**/*.ts',
        'src/orbital/**/*.ts',
        'src/regions/**/*.ts',
        'src/i18n/**/*.ts',
        'src/hooks/useGlobeKeyboard.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 45,
      },
      reporter: ['text', 'lcov'],
    },
  },
} as UserConfig);
