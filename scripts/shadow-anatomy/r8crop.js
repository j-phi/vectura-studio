/* Crop a stored harness SVG at high zoom, for looking at. PX matches render.js.
 * Usage: node r8crop.js <dir> <view> <x> <y> <w> <h> <zoom> <outName> */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const PX = 5;

(async () => {
  const [dir, view, x, y, w, h, zoom, out] = process.argv.slice(2);
  const X = Number(x); const Y = Number(y); const W = Number(w); const H = Number(h); const Z = Number(zoom);
  const svg = fs.readFileSync(path.join(dir, `${view}.svg`), 'utf8');
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX * Z}" height="${H * PX * Z}" `
    + `viewBox="${X * PX} ${Y * PX} ${W * PX} ${H * PX}">${inner}</svg>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: Math.ceil(W * PX * Z), height: Math.ceil(H * PX * Z) });
  await page.setContent(`<body style="margin:0;background:#fff">${wrapped}</body>`);
  await page.screenshot({ path: path.join(dir, `${out}.png`) });
  await browser.close();
  console.log(path.join(dir, `${out}.png`));
})();
