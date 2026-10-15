import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../play/', import.meta.url), { recursive: true });
await copyFile(new URL('../dist/index.html', import.meta.url), new URL('../play/Kirby-Crossing.html', import.meta.url));
console.log('Browser-ready game copied to play/Kirby-Crossing.html');
