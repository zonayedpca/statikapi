import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/_ui/',
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/ui/index': 'http://127.0.0.1:8788',
      '/_ui/file': 'http://127.0.0.1:8788',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
