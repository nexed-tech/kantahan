import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/display/' : '/',
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: '../../dist/display',
    emptyOutDir: true,
  },
}));
