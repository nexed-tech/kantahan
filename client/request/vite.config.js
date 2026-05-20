import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/request/' : '/',
  server: {
    port: 3003,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: '../../dist/request',
    emptyOutDir: true,
  },
}));
