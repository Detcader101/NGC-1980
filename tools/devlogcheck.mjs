#!/usr/bin/env node
// Review a completed offline report in Chrome; artifacts go outside the report bundle.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { digest, safeArtifact, stamp } from './evidence.mjs';

const file = process.argv[2] && path.resolve(process.argv[2]);
if (!file || process.argv.includes('--help')) {
  console.log('CHROME_PATH=/path/to/chrome node tools/devlogcheck.mjs PATH/devlog.html [REVIEW_DIR]');
  process.exit(file ? 0 : 2);
}
const out = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs', stamp() + '-devlog-review'));
fs.mkdirSync(out, { recursive: true });
const root = path.dirname(file), checks = [], errors = [];
const check = (ok, label, value) => { checks.push({ ok: !!ok, label, value }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) throw new Error(label); };
let browser;
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  check(manifest.artifacts.every(a => digest(fs.readFileSync(safeArtifact(root, a.file))) === a.sha256), 'All bundled artifacts match the manifest');
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true,
    defaultViewport: { width: 1280, height: 900 }, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0), { timeout: 15000 });
  const layout = () => page.evaluate(() => ({ title: document.querySelector('h1')?.textContent,
    images: document.images.length, videos: document.querySelectorAll('video').length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    anchorsOK: [...document.querySelectorAll('a[href^="#"]')].every(a => document.getElementById(a.hash.slice(1))) }));
  const desktop = await layout();
  check(!!desktop.title, 'Report has a visible title', desktop.title);
  check(desktop.anchorsOK, 'All contents links point to sections');
  check(!desktop.overflow, 'Desktop has no document overflow');
  check(desktop.images > 0, 'All selected screenshots and contact sheets decode', desktop.images);
  const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')).filter(x => !x.startsWith('#')));
  check(links.every(p => { safeArtifact(root, p); return true; }), 'All linked media and data exist inside the report');
  for (let i = 0; i < desktop.videos; i++) {
    const played = await page.evaluate(async index => {
      const v = document.querySelectorAll('video')[index]; v.muted = true;
      await new Promise((resolve, reject) => {
        if (v.readyState >= 1) return resolve();
        const timer = setTimeout(() => reject(new Error('Video metadata timeout')), 10000);
        v.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
        v.addEventListener('error', () => { clearTimeout(timer); reject(new Error(v.error?.message || 'Video error')); }, { once: true });
        v.load();
      });
      const target = v.duration * .45;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Seek timeout')), 10000);
        v.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true }); v.currentTime = target;
      });
      await v.play();
      await new Promise((resolve, reject) => {
        const started = performance.now();
        const timer = setInterval(() => {
          if (v.currentTime > target + .1) { clearInterval(timer); resolve(); }
          else if (performance.now() - started > 10000) { clearInterval(timer); reject(new Error('Playback did not advance')); }
        }, 50);
      });
      v.pause();
      return { duration: v.duration, currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight };
    }, i);
    check(played.duration > 0 && played.width > 0, `Clip ${i + 1} loads, seeks and plays offline`, played);
  }
  await page.screenshot({ path: path.join(out, 'desktop.png') });
  await page.screenshot({ path: path.join(out, 'desktop-full.png'), fullPage: true });
  const change = await page.$('#change-2');
  if (change) await change.screenshot({ path: path.join(out, 'interaction-section.png') });
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  const mobile = await layout(); check(!mobile.overflow, '390 px layout has no document overflow');
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  await page.screenshot({ path: path.join(out, 'mobile-full.png'), fullPage: true });
  check(errors.length === 0, 'No report browser errors', errors);
} catch (e) { errors.push(e.message); console.error(e.stack); }
finally { if (browser) await browser.close(); }
const ok = !errors.length && checks.every(c => c.ok);
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok, report: file, reportSha256: digest(fs.readFileSync(file)), checks, errors }, null, 2));
console.log(`${checks.filter(c => c.ok).length}/${checks.length} report checks passed; ${out}`);
process.exitCode = ok ? 0 : 1;
