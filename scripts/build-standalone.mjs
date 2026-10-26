import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
let html = await readFile(join(dist, 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!script || !stylesheet) throw new Error('Production build assets were not found. Run npm run build first.');
const javascript = await readFile(join(dist, script[1]), 'utf8');
const css = await readFile(join(dist, stylesheet[1]), 'utf8');
const favicon = await readFile(join(dist, 'favicon.svg'), 'utf8');
html = html.replace(script[0], () => `<script type="module">${javascript.replaceAll(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(stylesheet[0], () => `<style>${css.replaceAll(/<\/style/gi, '<\\/style')}</style>`);
html = html.replace(/href="(?:\.\/|\/)?favicon\.svg"/, `href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}"`);
await writeFile(join(dist, 'soz-orbitasi.html'), html);
console.log('Ready: dist/soz-orbitasi.html (no installation or server required).');
