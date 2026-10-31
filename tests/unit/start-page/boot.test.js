/**
 * Start Page boot guard (src/ui/start-page/boot.js): the synchronous <head> script that decides, before first paint, whether
 * this launch will show the page (so the editor is never painted first) and applies the saved skin (no light -> dark flash).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/boot.js'), 'utf8');

const run = ({ search = '', webdriver = false, prefs = null, cookie = '' } = {}) => {
  const dom = new JSDOM('<!doctype html><html data-ui-skin="meridian-dark"><head><link id="active-skin" href="./src/ui/skin/meridian-dark.css?v=1.4.41"></head><body></body></html>',
    { url: `http://localhost/${search}`, runScripts: 'outside-only' });
  if (prefs != null) dom.window.localStorage.setItem('vectura_prefs', typeof prefs === 'string' ? prefs : JSON.stringify({ version: 1, data: prefs }));
  if (cookie) dom.window.document.cookie = cookie;
  Object.defineProperty(dom.window.navigator, 'webdriver', { value: webdriver, configurable: true });
  vm.runInContext(SRC, dom.getInternalVMContext(), { filename: 'boot.js' });
  const root = dom.window.document.documentElement;
  return { dom, boot: root.hasAttribute('data-sp-boot'), skin: root.getAttribute('data-ui-skin'), href: dom.window.document.getElementById('active-skin').getAttribute('href') };
};

describe('start page boot guard', () => {
  it('covers the editor on a normal launch (no saved prefs)', () => {
    expect(run().boot).toBe(true);
  });
  it('does not cover when the saved preference says never show', () => {
    expect(run({ prefs: { startPage: { showOnLaunch: false } } }).boot).toBe(false);
  });
  it('keeps the automation rule: no cover under webdriver unless ?startPage=launch', () => {
    expect(run({ webdriver: true }).boot).toBe(false);
    expect(run({ webdriver: true, search: '?startPage=launch' }).boot).toBe(true);
    expect(run({ webdriver: true, search: '?x=1&startPage=launch' }).boot).toBe(true);
    expect(run({ webdriver: true, search: '?startPage=launchx' }).boot).toBe(false);
  });
  it('reads the cookie mirror when there is no localStorage snapshot', () => {
    const json = JSON.stringify({ version: 1, data: { startPage: { showOnLaunch: false } } });
    expect(run({ cookie: `vectura_prefs=${Buffer.from(json).toString('base64')}` }).boot).toBe(false);
  });
  it('ignores unreadable preferences (old behavior: the page shows)', () => {
    expect(run({ prefs: '{not json' }).boot).toBe(true);
  });
  it('applies the saved skin before first paint, keeping the cache-busting query', () => {
    const r = run({ prefs: { uiTheme: 'light' } });
    expect(r.skin).toBe('light');
    expect(r.href).toBe('./src/ui/skin/meridian-light.css?v=1.4.41');
    expect(run({ prefs: { uiTheme: 'classic-lark' } }).href).toBe('./src/ui/skin/classic-lark.css?v=1.4.41');
  });
  it('leaves the default skin for an unknown or missing theme', () => {
    expect(run({ prefs: { uiTheme: 'nonsense' } }).href).toBe('./src/ui/skin/meridian-dark.css?v=1.4.41');
    expect(run().skin).toBe('meridian-dark');
  });
  it('is loaded synchronously (not deferred) in index.html head, before the app scripts', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const tag = /<script src="\.\/src\/ui\/start-page\/boot\.js[^"]*"([^>]*)><\/script>/.exec(html);
    expect(tag).toBeTruthy();
    expect(tag[1]).not.toMatch(/defer|async/);
    expect(html.indexOf(tag[0])).toBeLessThan(html.indexOf('</head>'));
  });
});
