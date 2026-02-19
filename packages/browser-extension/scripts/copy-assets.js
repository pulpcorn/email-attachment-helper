/**
 * Copy static assets vào dist/ sau khi build
 * manifest.json, icons, popup.html, styles.css
 */
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

const copies = [
  ['manifest.json', 'manifest.json'],
  ['icons', 'icons'],
  ['src/popup/popup.html', 'src/popup/popup.html'],
  ['src/ui/styles.css', 'src/ui/styles.css'],
];

for (const [src, dest] of copies) {
  const srcPath = resolve(root, src);
  const destPath = resolve(dist, dest);
  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
}

console.log('[copy-assets] Done ✓');
