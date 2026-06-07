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
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/main.tsx', 'src/vite-env.d.ts'],
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
      },
      reporter: ['text', 'lcov'],
    },
  },
} as UserConfig);
