import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/data/journal.json')) {
            return 'monograph-data';
          }
          if (id.includes('src/data/chalk-art.json')) {
            return 'chalk-art-data';
          }
        },
      },
    },
  },
  server: {
    port: 4173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
});
