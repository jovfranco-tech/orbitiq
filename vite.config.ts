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
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          satellite: ['satellite.js'],
          react: ['react', 'react-dom'],
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
    setupFiles: [],
  },
} as UserConfig);
