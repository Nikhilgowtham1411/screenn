import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = 'http://localhost:8787';
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target, '/stream': target, '/transcode': target, '/subs': target, '/thumb': target, '/receiver': target,
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
