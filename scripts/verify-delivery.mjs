import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const dist = resolve(import.meta.dirname, '../dist');
const standalone = await readFile(resolve(dist, 'soz-orbitasi.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
 try {
  if (req.url === '/standalone/') { res.setHeader('Content-Type', mime['.html']); res.end(standalone); return; }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!path.startsWith('/learn-words/')) { res.writeHead(404).end(); return; }
  const file = resolve(dist, path.slice('/learn-words/'.length) || 'index.html');
  if (!file.startsWith(dist + '/')) { res.writeHead(403).end(); return; }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
 } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const address = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
try {
 for (const path of ['/standalone/', '/learn-words/']) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(address + path);
  await page.getByRole('heading', { name: 'Hali so‘z qo‘shilmagan', exact: true }).waitFor();
  const card = page.locator('.orbit-card-0');
  const original = await card.evaluate(el => getComputedStyle(el).transform);
  assert.match(original, /^matrix3d/);
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await page.waitForFunction(initial => getComputedStyle(document.querySelector('.orbit-card-0')).transform !== initial, original);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(initial => getComputedStyle(document.querySelector('.orbit-card-0')).transform === initial, original);
  if (path === '/standalone/') await context.setOffline(true);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('textbox', { name: 'JSON matni', exact: true }).fill(JSON.stringify({schemaVersion:1, language:'de', level:'A1.2', title:'Sinov', words:[{word:'heute', translation:'bugun'},{word:'der Tisch', translation:'stol'}]}));
  await page.getByRole('button', { name: 'Tekshirish', exact: true }).click();
  await page.getByRole('button', { name: 'To‘plamni saqlash', exact: true }).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button', { name:'Mashqni boshlash', exact:true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name:'Mashqni boshlash', exact:true }).click();
  await page.locator('#practice-answer').fill('heute');
  await page.keyboard.press('Enter');
  await page.getByText('To‘g‘ri javob!', {exact:true}).waitFor();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', {name:'stol', exact:true}).waitFor();
  await page.locator('#practice-answer').fill('der Tisch');
  await page.getByRole('button', {name:'Tekshirish', exact:true}).click();
  await page.getByText('To‘g‘ri javob!', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Raundni yakunlash', exact:true}).click();
  await page.getByRole('heading', {name:'Yana bir qadam oldinga.', exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS ${path}: actual build 3D scroll forward/back; immediate Enter advances; immediate click completes round; no console errors.`);
  await context.close();
 }
} finally { await browser.close(); server.close(); }
