/**
 * Cover type preference (typeface + size) and its global admin defaults / lock (src/config/start-page.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const load = (admin) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  if (admin) vm.runInContext(`window.Vectura = { START_PAGE_ADMIN: ${JSON.stringify(admin)} };`, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/config/start-page.js'), 'utf8'), ctx, { filename: 'start-page.js' });
  return dom.window.Vectura.START_PAGE;
};

describe('cover type preference', () => {
  it('defaults to Space Grotesk at 100%', () => {
    const SP = load();
    expect(SP.DEFAULTS.coverFont).toBe('grotesk');
    expect(SP.DEFAULTS.coverScale).toBe(100);
    expect(SP.coverType({})).toMatchObject({ id: 'grotesk', scale: 100, kern: true });
  });
  it('sanitizes the typeface (unknown falls back) and the size (clamped, stepped)', () => {
    const SP = load();
    expect(SP.sanitize({ coverFont: 'mono', coverScale: 72 })).toMatchObject({ coverFont: 'mono', coverScale: 70 });
    expect(SP.sanitize({ coverFont: 'comic', coverScale: 'x' })).toMatchObject({ coverFont: 'grotesk', coverScale: 100 });
    expect(SP.sanitize({ coverScale: 10 }).coverScale).toBe(50);
    expect(SP.sanitize({ coverScale: 900 }).coverScale).toBe(100);
  });
  it('a user choice wins over the global defaults', () => {
    const SP = load({ coverFont: 'serif', coverScale: 80 });
    expect(SP.DEFAULTS).toMatchObject({ coverFont: 'serif', coverScale: 80 });
    expect(SP.coverType({}).id).toBe('serif');
    expect(SP.coverType({ coverFont: 'mono', coverScale: 60 })).toMatchObject({ id: 'mono', scale: 60 });
  });
  it('the admin lock applies the global values to everyone', () => {
    const SP = load({ coverFont: 'mono', coverScale: 90, lockCoverType: true });
    expect(SP.ADMIN.lockCoverType).toBe(true);
    expect(SP.coverType({ coverFont: 'serif', coverScale: 50 })).toMatchObject({ id: 'mono', scale: 90 });
  });
  it('ignores a malformed admin block', () => {
    const SP = load({ coverFont: 'nope', coverScale: 'big', lockCoverType: 'yes' });
    expect(SP.ADMIN).toMatchObject({ coverFont: 'grotesk', coverScale: 100, lockCoverType: false });
  });
});

describe('admin defaults block (Developer Mode write-back)', () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'src/config/start-page.js'), 'utf8');
  it('builds a validated block and replaces it between the markers', () => {
    const SP = load();
    const region = SP.adminRegion({ coverFont: 'mono', coverScale: 72, lockCoverType: true });
    expect(region).toContain("coverFont: 'mono', coverScale: 70, lockCoverType: true");
    const next = SP.replaceAdminRegion(SRC, region);
    expect(next).toContain("Object.freeze({ coverFont: 'mono', coverScale: 70, lockCoverType: true })");
    expect(next.split('<admin-defaults:begin>')).toHaveLength(SRC.split('<admin-defaults:begin>').length); // markers survive, so it can be rewritten again
    // the rewritten file loads and carries the new global defaults
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    vm.runInContext(next, ctx);
    expect(dom.window.Vectura.START_PAGE.ADMIN).toMatchObject({ coverFont: 'mono', coverScale: 70, lockCoverType: true });
  });
  it('rejects a file without the markers and sanitizes junk values', () => {
    const SP = load();
    expect(() => SP.replaceAdminRegion('const x = 1;', SP.adminRegion({}))).toThrow(/markers/);
    expect(SP.adminRegion({ coverFont: "x'; alert(1)", coverScale: 'huge' })).toContain("coverFont: 'grotesk', coverScale: 100, lockCoverType: false");
  });
  it('Developer Mode edits the defaults, so the lock does not hide its own pick', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    vm.runInContext(`window.Vectura = { START_PAGE_ADMIN: { coverFont: 'mono', coverScale: 90, lockCoverType: true }, DevMode: { isOn: () => true } };`, ctx);
    vm.runInContext(SRC, ctx);
    expect(dom.window.Vectura.START_PAGE.coverType({ coverFont: 'serif', coverScale: 60 })).toMatchObject({ id: 'serif', scale: 60 });
  });
});
