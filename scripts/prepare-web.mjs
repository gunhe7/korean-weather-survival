import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'www');

const FILES = [
  'index.html',
  'style.css',
  'manifest.json',
  'sw.js',
  'privacy-policy.html'
];
const DIRS = ['js', 'assets'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, f));
  }
}

for (const d of DIRS) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(outDir, d), { recursive: true });
  }
}

console.log('Prepared offline mobile web bundle in ./www');
