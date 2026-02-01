import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend URL - switch between local and Railway
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'https://propertycall-production.up.railway.app';
const WS_BACKEND_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: true,
      },
      '/ws': {
        target: WS_BACKEND_URL,
        ws: true,
        secure: true,
      },
    },
  },
});
