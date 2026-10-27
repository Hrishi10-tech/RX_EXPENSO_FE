/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server on 5173 with the API behind /api (HTTP and the Socket.IO websocket).
 * API_TARGET overrides the API origin for local runs (default: the dedicated web instance on 4101).
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:4101';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false, ws: true },
    },
  },
  preview: {
    port: 5180,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false, ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
