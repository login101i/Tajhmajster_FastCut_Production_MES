import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Local Netlify Functions stand-in (scripts/local-api.mjs). Use `npm run netlify:dev` for full Netlify CLI.
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
