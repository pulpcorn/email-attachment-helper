import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'commands/event-handlers': resolve(__dirname, 'src/commands/event-handlers.html'),
        'taskpane/taskpane': resolve(__dirname, 'src/taskpane/taskpane.html'),
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@email-helper/shared-core': resolve(__dirname, '../shared-core/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    https: false,
  },
});
