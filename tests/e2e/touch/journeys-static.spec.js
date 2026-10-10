// Static guard for the journey specs (TUX-059). Reads journeys.spec.js, pages.js and journey-defs.js
// as text and fails on any API that would let a journey pass without a real finger gesture.
// helpers/touch.js is NOT scanned: its WebKit synthetic dispatch is sanctioned.
// Also checks that the step table (docs/touch-audit/journey-scripts.md) and the code carry the same
// step ids, and that the ledger only names real steps.
'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { JOURNEYS } = require('./journey-defs');

const DIR = __dirname;
const FILES = ['journeys.spec.js', 'pages.js', 'journey-defs.js'];
const DOC = path.join(DIR, '..', '..', '..', 'docs', 'touch-audit', 'journey-scripts.md');

// Functions that may call page.evaluate and friends (state reads, setup, guard internals).
const EVAL_ALLOWED = new Set([
  'readState', 'loadFixture', 'assertInvariants', 'guardTarget', 'activeEditable', 'swipeStart', 'raiseUndoLimit', 'waitAppReady', 'waitNoToast', 'readSavedPresetNames', 'spyShare', 'sharedFiles', 'captureFile',
]);
const EVAL_MARKER_CAP = 4;

const FORBIDDEN = [
  [/\.click\(/, '.click('],
  [/\.dblclick\(/, '.dblclick('],
  [/(?<!touch)\.tap\(/, 'locator .tap('],
  [/\.fill\(/, '.fill('],
  [/\.check\(/, '.check('],
  [/\.hover\(/, '.hover('],
  [/\.press\(/, '.press('],
  [/(?<!\bm)\.type\(/, '.type(' /* m.type() is the console message kind */],
  [/\bpage\.mouse\b/, 'page.mouse'],
  [/keyboard\.type\b/, 'keyboard.type'],
  [/keyboard\.press\b/, 'keyboard.press'],
  [/dispatchEvent/, 'dispatchEvent'],
  [/scrollIntoView/, 'scrollIntoView'],
  [/\.skip\(|test\.skip|\.only\(|test\.only|test\.fail\(|test\.fixme/, '.skip/.only/test.fail'],
  [/engineSupports/, 'engineSupports guard'],
];

// Blank out comments, keep line numbers.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => {
      const i = l.search(/(^|[^:'"`\\])\/\/(?!\s*journey-eval-ok)/);
      if (i === -1) return l;
      const cut = l.indexOf('//', i === 0 ? 0 : i + 1);
      return l.slice(0, cut);
    })
    .join('\n');
}

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// The nearest column-0 declaration above a line.
function enclosing(lines, idx) {
  for (let i = idx; i >= 0; i -= 1) {
    const m = /^(?:async\s+)?function\s+(\w+)/.exec(lines[i]) || /^const\s+(\w+)\s*=/.exec(lines[i]);
    if (m) return m[1];
  }
  return '';
}

test.describe('journey static guard', () => {
  for (const f of FILES) {
    test(`${f}: no forbidden API`, () => {
      const code = stripComments(read(f));
      for (const [re, label] of FORBIDDEN) {
        const hit = code.split('\n').findIndex((l) => re.test(l));
        expect(hit, `${f}:${hit + 1} uses ${label}`).toBe(-1);
      }
    });
  }

  test('selectOption only inside pickOption, insertText only inside softType', () => {
    for (const f of FILES) {
      const lines = stripComments(read(f)).split('\n');
      lines.forEach((l, i) => {
        if (/selectOption\(/.test(l)) expect(enclosing(lines, i), `${f}:${i + 1} selectOption`).toBe('pickOption');
        if (/insertText\(/.test(l)) expect(enclosing(lines, i), `${f}:${i + 1} insertText`).toBe('softType');
      });
    }
  });

  test('evaluate-like calls only in allowlisted functions or with a capped marker', () => {
    let markers = 0;
    for (const f of FILES) {
      const raw = read(f).split('\n');
      const lines = stripComments(read(f)).split('\n');
      lines.forEach((l, i) => {
        if (!/\.(evaluate|evaluateHandle|\$eval|\$\$eval|waitForFunction|addInitScript|exposeFunction)\(/.test(l)) return;
        if (/journey-eval-ok/.test(raw[i])) { markers += 1; return; }
        expect(EVAL_ALLOWED.has(enclosing(lines, i)), `${f}:${i + 1} evaluate inside "${enclosing(lines, i)}"`).toBe(true);
      });
    }
    expect(markers).toBeLessThanOrEqual(EVAL_MARKER_CAP);
  });

  test('the journey definitions use no raw page access outside P and Locator reads', () => {
    const code = stripComments(read('journey-defs.js'));
    expect(/\.evaluate\(|page\.mouse|page\.keyboard|page\.touchscreen/.test(code)).toBe(false);
  });

  test('the step table and the code carry the same step ids', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    const sections = doc.split(/^## /m).slice(1).filter((s) => /^J\d+ /.test(s));
    expect(sections.length).toBe(JOURNEYS.length);
    for (const J of JOURNEYS) {
      const sec = sections.find((s) => s.startsWith(`${J.id} `));
      expect(sec, `doc section for ${J.id}`).toBeTruthy();
      const ids = [...sec.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map((m) => m[1]);
      expect(ids, `${J.id} step ids differ between journey-scripts.md and journey-defs.js`).toEqual(['boot', ...J.steps.map((s) => s.id)]);
    }
  });

  test('every journey step has an action, a route, a selector contract and a postcondition', () => {
    for (const J of JOURNEYS) {
      for (const s of J.steps) {
        expect(s.id.startsWith(`${J.id.toLowerCase()}.`), `${s.id} prefix`).toBe(true);
        for (const k of ['action', 'route', 'selector', 'expects']) expect(typeof s[k] === 'string' && s[k].length > 0, `${s.id}.${k}`).toBe(true);
        expect(typeof s.run).toBe('function');
        expect(typeof s.post).toBe('function');
      }
    }
  });

  test('each step\'s expects text agrees with its expect.history and with the step table', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    const fmt = (h) => (h === 'any' ? 'any' : `${h >= 0 ? '+' : ''}${h}`);
    for (const J of JOURNEYS) {
      const sec = doc.split(/^## /m).find((x) => x.startsWith(`${J.id} `));
      for (const s of J.steps) {
        const h = s.expect && s.expect.history !== undefined ? s.expect.history : 0;
        const said = /history ([+-]\d+)/.exec(s.expects);
        if (h === 'any') expect(said, `${s.id}: expects says "history ${said && said[1]}" but expect.history is 'any'`).toBeNull();
        else if (said) expect(Number(said[1]), `${s.id}: expects says history ${said[1]}, expect.history is ${h}`).toBe(h);
        else expect(h, `${s.id}: expect.history ${h} is not stated in the expects text`).toBe(0);
        const row = sec.split('\n').find((l) => l.startsWith(`| \`${s.id}\` |`));
        expect(row, `${s.id} row`).toBeTruthy();
        const m = /historyLen (any|[+-]\d+)/.exec(row);
        expect(m && m[1], `${s.id}: journey-scripts.md historyLen column`).toBe(fmt(h));
      }
    }
  });

  test('no ledger reason is a harness-guard or precondition message', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(DIR, 'journey-status.json'), 'utf8'));
    const bad = /end: covered|drag end: off-screen|end: off-screen|no empty canvas spot|^(?:JRN-\d+ )?not found/;
    for (const e of ledger.entries) {
      expect(typeof e.reason, `${e.project}|${e.journey} needs a reason`).toBe('string');
      expect(e.reason.length, `${e.project}|${e.journey} reason is empty`).toBeGreaterThan(0);
      expect(bad.test(e.reason), `${e.project}|${e.journey} is pinned on a harness message: ${e.reason}`).toBe(false);
    }
  });

  test('the ledger names real cells and real steps, sorted', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(DIR, 'journey-status.json'), 'utf8'));
    expect(ledger.projects.length).toBe(8);
    const steps = new Map(JOURNEYS.map((J) => [J.id, new Set(['boot', ...J.steps.map((s) => s.id)])]));
    let prev = '';
    for (const e of ledger.entries) {
      expect(ledger.projects, e.project).toContain(e.project);
      expect(steps.has(e.journey), e.journey).toBe(true);
      expect(steps.get(e.journey).has(e.failsAt), `${e.project}|${e.journey} failsAt ${e.failsAt}`).toBe(true);
      const key = `${e.project}|${String(e.journey.slice(1)).padStart(3, '0')}`;
      expect(key > prev, `ledger order at ${key}`).toBe(true);
      prev = key;
    }
  });
});
