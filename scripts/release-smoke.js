#!/usr/bin/env node
/**
 * Release smoke (judgment R-3): node scripts/release-smoke.js <release.zip>
 *
 * Unzips the release into a temp directory, serves it, and loads index.html in Playwright
 * Chromium. Adds one layer and generates it. Fails on any page error, on any same-origin
 * request that fails or returns >= 400 (a file left out of the zip), or when that layer has no paths.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const MIME = {
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.vectura': 'application/json; charset=utf-8',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const zip = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(zip)) throw new Error(`usage: release-smoke.js <release.zip> (got ${process.argv[2] || 'nothing'})`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-release-smoke-'));
  execFileSync('unzip', ['-q', zip, '-d', root]);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('release zip has no index.html at its root');

  const server = await serve(root);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const problems = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    page.on('requestfailed', (req) => {
      if (req.url().startsWith(origin)) problems.push(`request failed: ${req.url()} (${req.failure()?.errorText})`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.startsWith(origin) && res.status() >= 400 && !url.endsWith('/favicon.ico')) problems.push(`HTTP ${res.status()}: ${url.slice(origin.length)}`);
    });
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.app && window.app.engine && window.app.ui), null, { timeout: 30000 })
      .catch(() => problems.push('the app did not start within 30 s'));
    // A new document starts empty. addLayer() generates the new layer, as the UI does.
    const summary = await page.evaluate(() => {
      const engine = window.app && window.app.engine;
      if (!engine) return { count: 0, paths: 0, types: [] };
      engine.addLayer('spiral');
      window.app.ui?.renderLayers?.();
      const layers = engine.layers || [];
      return { count: layers.length, paths: layers.reduce((n, l) => n + ((l.paths && l.paths.length) || 0), 0), types: layers.map((l) => l.type) };
    });
    await page.waitForTimeout(500);
    if (summary.paths < 1) problems.push(`no generated geometry: ${JSON.stringify(summary)}`);
    console.log(`release smoke: ${summary.count} layer(s) [${summary.types.join(', ')}], ${summary.paths} path(s)`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (problems.length) throw new Error(`release smoke FAILED:\n  ${problems.join('\n  ')}`);
  console.log('release smoke: OK');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
