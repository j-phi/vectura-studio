const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const sweep = require('../helpers/target-sweep');
const { PROJECTS } = require('./viewports');
const { openPane, addLayer } = require('./target-audit-states');

// TUX-041 batch B1 (header + menubar), strict slice. Q18 (Jay, 2026-10-14): the tablet header is 44 px.
// Every header control, every item of every header menu (the phone sheet too) and the welcome tour
// button has a hit area of at least 44 x 44 CSS px on every touch project. hitArea() counts ::before
// extensions, so an invisible expansion passes only when no neighbour or the canvas steals its pixels.
const MIN = 44;
const MENU_IDS = ['btn-menu-file', 'btn-menu-edit', 'btn-menu-object', 'btn-menu-view', 'btn-menu-insert', 'btn-menu-help'];

const project = (testInfo) => PROJECTS[testInfo.project.name];
const boot = async (page, baseURL) => { await core.bootApp(page, baseURL); await core.waitGeometryStable(page); };

// Visible, hit-testable header controls (phone: hamburger + action buttons; tablet: triggers, theme, pane handles).
const HEADER_CONTROLS = '#app-header button, #app-header [role="button"], #app-header a[href]';

async function listVisible(page, selector) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)]
    .filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && getComputedStyle(e).pointerEvents !== 'none')
    .map((e) => { window.__b1n = (window.__b1n || 0) + 1; const i = window.__b1n; e.setAttribute('data-b1-probe', String(i)); return { i, id: e.id, label: (e.id || e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().slice(0, 40) }; }), selector);
}

async function probeAll(page, selector) {
  const items = await listVisible(page, selector);
  // One page.evaluate for the whole list (sweep.inPage) instead of two round trips per target.
  const res = await sweep.inPage(page, ({ items }, kit) => items.map((it) => {
    const e = document.querySelector(`[data-b1-probe="${it.i}"]`);
    if (!e) return { missing: true };
    e.scrollIntoView({ block: 'nearest' });
    return kit.hitArea(e);
  }), { items });
  const bad = [];
  res.forEach((a, k) => {
    if (a.missing) bad.push(`${items[k].label} left the DOM during the sweep`);
    else if (a.w < MIN || a.h < MIN) bad.push(`${items[k].label} ${a.w}x${a.h}`);
  });
  return { count: items.length, bad };
}

// A disabled menu item takes no pointer events, so the probe cannot read it. It keeps the box of an
// enabled item, so the box itself must be at least 44 px tall.
async function disabledBoxes(page) {
  return page.evaluate((MIN) => [...document.querySelectorAll('.top-menu-panel.open .top-menu-item')]
    .filter((e) => e.disabled || e.hasAttribute('disabled'))
    .map((e) => ({ id: e.id, h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h < MIN).map((x) => `${x.id} (disabled) box ${x.h}`), MIN);
}

async function openMenu(page, id) {
  await page.evaluate((id) => {
    const burger = document.getElementById('btn-menu-hamburger');
    if (burger && burger.checkVisibility() && !document.body.classList.contains('phone-menu-open')) burger.click();
    document.getElementById(id).click();
  }, id);
  await page.waitForFunction((id) => {
    const t = document.getElementById(id);
    const p = t && t.parentElement && t.parentElement.querySelector('.top-menu-panel');
    return !!p && p.classList.contains('open') && p.checkVisibility();
  }, id, { timeout: 10000 });
  await core.waitLayoutSettled(page);
  await core.waitGeometryStable(page);
}

test.describe('TUX-041 B1 header + menus', () => {
  test.use({ reducedMotion: 'reduce' });
  // Every test boots its own page, so the file runs fully parallel.
  test.describe.configure({ mode: 'parallel', retries: 0 });

  test('header controls are at least 44 x 44', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    const r = await probeAll(page, HEADER_CONTROLS);
    expect(r.count, 'no header control found').toBeGreaterThan(2);
    expect(r.bad, `header controls under ${MIN}`).toEqual([]);
  });

  for (const id of MENU_IDS) {
    test(`${id}: every menu item is at least 44 x 44`, async ({ page, baseURL }) => {
      await boot(page, baseURL);
      await addLayer(page, 'wavetable'); // enables the Edit / Object items
      await openMenu(page, id);
      const r = await probeAll(page, '.top-menu-panel.open .top-menu-item:not(:disabled)');
      expect(r.count, 'no menu item found').toBeGreaterThan(0);
      expect([...r.bad, ...(await disabledBoxes(page))], `${id} items under ${MIN}`).toEqual([]);
      // the trigger stays a 44 px target while its menu is open (not on the phone sheet: triggers are rows there)
      const rows = await probeAll(page, `#${id}`);
      expect(rows.bad, `${id} trigger under ${MIN} while open`).toEqual([]);
    });
  }

  test('the tablet header band is 44 px (Q18) and the phone header is unchanged', async ({ page, baseURL }, testInfo) => {
    const spec = project(testInfo);
    await boot(page, baseURL);
    const main = await page.evaluate(() => Math.round(document.querySelector('#app-header .header-main').getBoundingClientRect().height));
    expect(main).toBe(44); // the phone header was already 44; tablet and touch-wide grow from 38
    expect(spec).toBeTruthy();
  });

  test('welcome tour button is at least 44 x 44', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    await openPane(page, 'left');
    await page.waitForFunction(() => { const b = document.getElementById('btn-tour-welcome'); return !!b && b.checkVisibility(); }, null, { timeout: 10000 });
    await core.waitLayoutSettled(page);
    await core.waitGeometryStable(page);
    const r = await probeAll(page, '#btn-tour-welcome');
    expect(r.count).toBe(1);
    expect(r.bad, 'welcome tour button').toEqual([]);
  });
});
