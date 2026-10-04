// Shared by TUX-054 (downloads) and TUX-046 (Export from the phone menu).
// Records what the page does when it saves a file, in an engine-neutral way:
//   - navigator.share calls (File name, type, size, user activation at call time),
//   - URL.revokeObjectURL calls (to prove the 30 s revoke delay),
//   - download events (collected on the Playwright page).
// Branch on feature presence (hasNativeShare), never on the engine name.
//
// Usage (call BEFORE page.goto):
//   await installRecorder(page)               // wraps a native navigator.share if present
//   await installShareStub(page, 'resolve')   // forces share + canShare in every engine
//   const rec = await readRecorder(page)      // { shareCalls, revoked, downloads }
//   await expectSaved(page, { filename, type, sync? })  // download OR share recorder (TUX-046)

const { expect } = require('@playwright/test');

const RECORDER_INIT = () => {
  window.__shareCalls = [];
  window.__revoked = [];
  const origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function revokeObjectURL(u) {
    window.__revoked.push({ url: u, at: performance.now() });
    return origRevoke.apply(this, arguments);
  };
  window.__recordShare = (data) => {
    const f = data && data.files && data.files[0];
    window.__shareCalls.push({
      name: f ? f.name : null,
      type: f ? f.type : null,
      size: f ? f.size : null,
      activeAtCall: navigator.userActivation ? navigator.userActivation.isActive : null,
    });
  };
};

// Wrap a native navigator.share (WebKit today) with a recorder that resolves
// without opening a sheet. A no-op when the engine has no navigator.share.
const installRecorder = async (page) => {
  await page.addInitScript(RECORDER_INIT);
  await page.addInitScript(() => {
    if (typeof navigator.share !== 'function') return;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: (data) => { window.__recordShare(data); return Promise.resolve(); },
    });
  });
  page.__downloads = [];
  page.on('download', (d) => page.__downloads.push(d.suggestedFilename()));
};

// Define navigator.share + canShare in every engine. mode: resolve | abort | notallowed.
const installShareStub = async (page, mode) => {
  await page.addInitScript(RECORDER_INIT);
  await page.addInitScript((m) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, writable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: (data) => {
        window.__recordShare(data);
        if (m === 'abort') return Promise.reject(new DOMException('Share canceled', 'AbortError'));
        if (m === 'notallowed') return Promise.reject(new DOMException('Needs a user gesture', 'NotAllowedError'));
        return Promise.resolve();
      },
    });
  }, mode);
  page.__downloads = [];
  page.on('download', (d) => page.__downloads.push(d.suggestedFilename()));
};

const hasNativeShare = (page) =>
  page.evaluate(() => typeof navigator.share === 'function' && typeof navigator.canShare === 'function');

const readRecorder = async (page) => {
  const inPage = await page.evaluate(() => ({ shareCalls: window.__shareCalls || [], revoked: window.__revoked || [] }));
  return { ...inPage, downloads: page.__downloads || [] };
};

// TUX-046: "a download event OR a share recorder call" with the expected file.
const expectSaved = async (page, { filename, type }, timeout = 8000) => {
  await expect.poll(async () => {
    const r = await readRecorder(page);
    const shared = r.shareCalls.find((c) => filename instanceof RegExp ? filename.test(c.name || '') : c.name === filename);
    const downloaded = r.downloads.find((n) => filename instanceof RegExp ? filename.test(n) : n === filename);
    if (shared && type) expect(shared.type).toBe(type);
    return !!(shared || downloaded);
  }, { timeout, message: `no download or share for ${filename}` }).toBe(true);
};

module.exports = { installRecorder, installShareStub, hasNativeShare, readRecorder, expectSaved };
