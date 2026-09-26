import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    // Same-origin in dev, so the app needs no CORS middleware in either
    // environment. In production the API serves the built client itself.
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    // Guard-rail for the 120 KB client budget in quality-benchmarks.yaml.
    chunkSizeWarningLimit: 120,
  },
});
