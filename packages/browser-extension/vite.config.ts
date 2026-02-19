import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker.ts'),
        'content-scripts/gmail': resolve(__dirname, 'src/content-scripts/gmail.ts'),
        'content-scripts/outlook-web': resolve(__dirname, 'src/content-scripts/outlook-web.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: 'src/[name].js',
        chunkFileNames: 'src/chunks/[name].js',
        format: 'es',
      },
    },
    // Chrome Extension cần inline CSS vào JS hoặc copy riêng
    cssCodeSplit: false,
    // Không minify để dễ debug
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@email-helper/shared-core': resolve(__dirname, '../shared-core/src/index.ts'),
    },
  },
});
