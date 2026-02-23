import { defineConfig } from 'vite';
import { resolve } from 'path';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [mkcert()],
  base: '/email-attachment-helper/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'taskpane/taskpane': resolve(__dirname, 'src/taskpane/taskpane.html'),
        'taskpane/auth-dialog': resolve(__dirname, 'src/taskpane/auth-dialog.html'),
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
    https: true,
  },
});
