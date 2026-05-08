import { chromium } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';

const URL = 'http://127.0.0.1:8765/index.html';
const skins = [
  { id: 'light', file: 'skin3-light.png' },
  { id: 'dark',  file: 'skin3-dark.png' },
  { id: 'lark',  file: 'skin3-lark.png' },
];

const browser = await chromium.launch();
const desktop = join(homedir(), 'Desktop');

for (const { id, file } of skins) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cookieValue = encodeURIComponent(JSON.stringify({
    uiTheme: id,
    cookiePreferencesEnabled: true,
  }));
  await ctx.addCookies([{
    name: 'vectura_prefs',
    value: cookieValue,
    url: 'http://127.0.0.1:8765',
  }]);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${id}] PAGE ERROR:`, e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (skinId) => document.documentElement.getAttribute('data-ui-skin') === skinId,
    id,
    { timeout: 10000 },
  );
  await page.waitForTimeout(250);

  // Probe central canvas color
  const probe = await page.evaluate(() => {
    const sels = ['#workspace', '.workspace', '.canvas-container', '#canvas', 'canvas', 'main'];
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) out[s] = getComputedStyle(el).backgroundColor;
    }
    return out;
  });
  console.log(`[${id}] colors:`, JSON.stringify(probe));

  const outPath = join(desktop, file);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`[${id}] wrote ${outPath}`);
  await ctx.close();
}

await browser.close();
