import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Базовый путь берётся из окружения: на GitHub Pages проект живёт в подпапке,
// например /kozyr1/. Прописывать его руками в коде не нужно — иначе переименование
// репозитория ломает сборку.
const base = process.env.GITHUB_PAGES
  ? '/kozyr1/'
  : process.env.BASE_PATH || '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
