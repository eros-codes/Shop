import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The admin panel runs on 5000 and talks to the API on 3000, through the
// same /api proxy the storefront uses: one origin in the browser, so no
// CORS and a first-party refresh-token cookie.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 5000, strictPort: true },
});
