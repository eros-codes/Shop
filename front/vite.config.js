import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The storefront runs on 4000 and talks to the API on 3000.
//
// In development every /api call is proxied, so the browser only ever
// sees one origin: no CORS preflights, and the refresh-token cookie is
// a first-party cookie. In production VITE_API_URL points at the real
// API host instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Product images are served by the API from its own uploads folder.
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4000, strictPort: true },
});
