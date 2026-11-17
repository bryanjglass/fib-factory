import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const BACKEND = process.env.FIB_BACKEND_ORIGIN ?? 'http://127.0.0.1:8787';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'production' && !env.VITE_SERVER_URL) {
    console.warn(
      '\n⚠️  VITE_SERVER_URL is not set. The production build will expect the API on the same origin as the page.\n' +
        '   For GitHub Pages, set VITE_SERVER_URL to your Worker URL (e.g. https://fib-factory.<account>.workers.dev).\n',
    );
  }
  const proxy = { '/api': { target: BACKEND, ws: true, changeOrigin: true } };
  return {
    root: 'client',
    // Relative base + hash routing works on any static host path (e.g. GitHub Pages project sites).
    base: './',
    envDir: '..',
    plugins: [react(), tailwindcss()],
    build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
    server: { host: true, port: 5173, strictPort: true, proxy },
    preview: { host: true, port: 4173, strictPort: true, proxy },
  };
});
