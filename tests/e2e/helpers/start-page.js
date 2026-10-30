// Shared, deterministic helpers for the Start Page e2e specs (no sleeps, no reliance on a reused server).

// Runs before the app scripts of EVERY navigation of the page it is installed on, but wipes only the first time
// (a per-tab sessionStorage flag), so later reloads in the same test keep what the test saved. The page has no open
// IndexedDB connection yet when it runs, so the deletes are never blocked by the app's own handles, and the app's
// own opens queue behind them in the browser's per-origin order.
const WIPE = () => {
  try {
    if (sessionStorage.getItem('__sp_wiped')) return;
    sessionStorage.setItem('__sp_wiped', '1');
    localStorage.clear();
    ['vectura-start', 'vectura-start-plates', 'vectura-start-art'].forEach((n) => indexedDB.deleteDatabase(n));
  } catch (_) { /* noop */ }
};
const resetStorage = async (page) => {
  await page.context().clearCookies();
  await page.addInitScript(WIPE);
};

// Everything a reload must see is written: preferences (synchronously, forced) and the plates store (its queue is
// serial, so load() resolves after every earlier mutation has been stored).
const flush = (page) => page.evaluate(async () => {
  window.app.persistPreferences({ force: true });
  const s = window.app.startPage && window.app.startPage.plates && window.app.startPage.plates.store;
  if (s && typeof s.load === 'function') await s.load();
});

// A Start Page preference as it is stored for the next launch (localStorage), or undefined while it is not stored yet.
const persistedPref = (page, key) => page.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem('vectura_prefs')).data.startPage[k]; } catch (_) { return undefined; }
}, key);

// The art on a plate/card has parsed its strokes and drawn: hover effects can attach to it.
const inkReady = async (expect, locator) => {
  await expect.poll(() => locator.evaluate((e) => !!(e._spInk && e._spInk.parsed && e.classList.contains('sp-ink-ready'))), { timeout: 20000 }).toBe(true);
};

// Every seeded work has reached the plates store (the sections re-render once as the works finish loading, and a test that
// acts before that races the re-render).
const worksReady = (expect, page, n) => expect(page.locator('.sp-pl-more')).toContainText(n > 5 ? `of ${n}` : `all ${n}`, { timeout: 20000 });

module.exports = { resetStorage, flush, persistedPref, inkReady, worksReady };
