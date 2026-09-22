import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { DEFAULT_API_ORIGIN } from './src/services/apiOrigin';

// The app calls the API at a relative `/api/v1` so the shipped bundle carries
// no host (see src/services/config.ts). In production Vercel rewrites that
// path; in dev this proxy stands in for the rewrite, defaulting to the
// deployed API so `npm run dev` works with nothing running locally. Point
// VITE_DEV_API_PROXY at http://localhost:4000 to develop against a local API.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_API_PROXY?.trim() || DEFAULT_API_ORIGIN;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          ws: true,
        },
      },
    },
  };
});
