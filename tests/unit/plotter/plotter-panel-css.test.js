/**
 * CSS contract for the Send to Plotter panel (visual-verification fixes): tab padding, capped field
 * widths, compact calibration picture cards, equal-height profile cards. Reads components.css as text.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const css = fs.readFileSync(path.join(root, 'src/ui/skin/components.css'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'src/ui/plotter-machine-tools.js'), 'utf8');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Declarations of every top-level (or nested in @container) rule whose selector list contains `sel`.
const decls = (sel) => {
  const re = new RegExp(`(?:^|[}\\s,])${esc(sel)}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`, 'g');
  const out = []; let m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out.join(';');
};

describe('Send to Plotter panel CSS contract', () => {
  test('the tool host (Machine and Console tabs) has inner padding like the other tabs', () => {
    expect(decls('.stp-tool-host')).toMatch(/padding:\s*\d+px\s+\d+px/);
  });

  test('number inputs are width-capped and the jog column does not stretch the panel', () => {
    expect(decls('.stp-mt-num')).toMatch(/max-width:\s*\d+px/);
    expect(decls('.stp-mt-jog-side')).toMatch(/max-width:\s*\d+px/);
    expect(decls('.stp-mt-jog-side')).not.toMatch(/flex:\s*1\b/);
  });

  test('calibration cards are compact: fixed 90-110px preview, no aspect-ratio, 2 across then 4 across at >=1100px', () => {
    const pic = decls('.stp-mt-card-pic');
    expect(pic).not.toMatch(/aspect-ratio/);
    const h = /height:\s*(\d+)px/.exec(pic);
    expect(h && Number(h[1])).toBeGreaterThanOrEqual(90);
    expect(Number(h[1])).toBeLessThanOrEqual(110);
    expect(decls('.stp-mt-card-pic svg')).toMatch(/height:\s*\d+(px|%)/);
    expect(decls('.stp-mt-cards')).toMatch(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/@container\s*\(min-width:\s*1100px\)\s*\{[^@]*\.stp-mt-cards\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  });

  test('a done calibration shows a "Done ✓" badge', () => {
    expect(tools).toContain("'Done \\u2713'");
  });

  test('profile cards share a row height: stretch + clamped title + bottom-aligned badge', () => {
    expect(decls('.stp-cards')).toMatch(/align-items:\s*stretch/);
    expect(decls('.stp-card-name')).toMatch(/-webkit-line-clamp:\s*2/);
    expect(decls('.stp-card-name')).toMatch(/min-height:/);
    expect(decls('.stp-badge')).toMatch(/margin-top:\s*auto/);
  });

  test('grid children can shrink (min-width: 0)', () => {
    expect(decls('.stp-card')).toMatch(/min-width:\s*0/);
    expect(decls('.stp-mt-card')).toMatch(/min-width:\s*0/);
  });

  describe('distance-readable scale (panel-scoped tokens)', () => {
    const root = decls('.vectura-modal.stp-dialog');
    const tok = (name) => {
      const m = new RegExp(`${esc(name)}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(root);
      return m ? Number(m[1]) : 0;
    };
    test('tokens meet the minimums', () => {
      expect(tok('--stp-font')).toBeGreaterThanOrEqual(17);
      expect(tok('--stp-font-small')).toBeGreaterThanOrEqual(15);
      expect(tok('--stp-font-heading')).toBeGreaterThanOrEqual(22);
      expect(tok('--stp-font-readout')).toBeGreaterThanOrEqual(22);
      expect(tok('--stp-hit')).toBeGreaterThanOrEqual(48);
      expect(tok('--stp-stop-h')).toBeGreaterThanOrEqual(64);
      expect(tok('--stp-dial')).toBeGreaterThanOrEqual(270); // spec 12.4: about 280 px so the primary block fits 1280x800
      expect(tok('--stp-dir-hit')).toBeGreaterThanOrEqual(56);
    });
    test('controls are driven by the tokens', () => {
      expect(decls('.stp-btn')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-mt-btn')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-tab')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-in')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-mt-num')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-btn.stp-stop')).toMatch(/min-height:\s*var\(--stp-stop-h\)/);
      expect(decls('.stp-btn.stp-stop-big')).toMatch(/min-height:\s*var\(--stp-stop-h\)/);
      expect(decls('.stp-mt-dial')).toMatch(/width:\s*var\(--stp-dial\)/);
      expect(decls('.stp-mt-readout')).toMatch(/font-size:\s*var\(--stp-font-readout\)/);
      expect(decls('.stp-pill')).toMatch(/font-size:\s*var\(--stp-font-pill\)/);
      expect(decls('.stp-runtext')).toMatch(/font-size:\s*var\(--stp-font-readout\)/);
      expect(decls('.stp-mt-wiz-title')).toMatch(/font-size:\s*var\(--stp-font-heading\)/);
      expect(decls('.stp-mt-wiz-text, .stp-mt-wiz-extra')).toMatch(/font-size:\s*var\(--stp-font\)/);
    });
    test('the dialog uses most of the viewport', () => {
      expect(root).toMatch(/width:\s*min\(1500px,\s*96vw\)/);
      expect(root).toMatch(/92vh/);
    });
  });
});

describe('v2 scale fixes (spec 12.5)', () => {
  const px = (decl, prop) => { const m = new RegExp(`${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(decl); return m ? Number(m[1]) : 0; };
  test('jog step chips are at least 52 px tall, 64 px wide with an 18 px label', () => {
    const d = decls('.stp-mt-steps .tog-btn');
    expect(px(d, 'min-height')).toBeGreaterThanOrEqual(52);
    expect(px(d, 'min-width')).toBeGreaterThanOrEqual(64);
    expect(px(d, 'font-size')).toBeGreaterThanOrEqual(18);
  });
  test('the pen-height slider has a thumb of at least 28 px and a track of at least 8 px', () => {
    const thumb = decls('.stp-mt-range::-webkit-slider-thumb');
    expect(px(thumb, 'width')).toBeGreaterThanOrEqual(28);
    expect(px(thumb, 'height')).toBeGreaterThanOrEqual(28);
    expect(px(decls('.stp-mt-range::-webkit-slider-runnable-track'), 'height')).toBeGreaterThanOrEqual(8);
    expect(px(decls('.stp-mt-range::-moz-range-thumb'), 'width')).toBeGreaterThanOrEqual(28);
    expect(px(decls('.stp-mt-range::-moz-range-track'), 'height')).toBeGreaterThanOrEqual(8);
  });
  test('the dial-centre stop sign is at least 96 px across', () => {
    const d = decls('.stp-mt-dial-stop');
    expect(px(d, 'width')).toBeGreaterThanOrEqual(96);
    expect(px(d, 'height')).toBeGreaterThanOrEqual(96);
  });
  test('the header is a single row and E-STOP turns solid red only when armed', () => {
    expect(decls('.stp-head')).toMatch(/flex-wrap:\s*nowrap/);
    expect(decls('.stp-btn.stp-stop.is-armed')).toMatch(/background:\s*var\(--ui-danger\)/);
    expect(decls('.stp-btn.stp-stop')).toMatch(/min-height:\s*var\(--stp-stop-h\)/);
  });

  describe('v2 review fixes', () => {
    test('every disclosure summary has a chevron, a 52px row and a hover state', () => {
      expect(decls('.stp-root details > summary')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(decls('.stp-root details > summary')).toMatch(/cursor:\s*pointer/);
      expect(decls('.stp-root details > summary::before')).toMatch(/content:\s*'\\25B8'/);
      expect(decls('.stp-root details[open] > summary::before')).toMatch(/content:\s*'\\25BE'/);
      expect(css).toMatch(/\.stp-root details > summary:hover\s*\{/);
    });
    test('placement: tall mode segments, three compact inputs in a row', () => {
      expect(decls('.stp-root .tog-btn')).toMatch(/min-height:\s*var\(--stp-hit\)/);
      expect(Number(/font-size:\s*(\d+)px/.exec(decls('.stp-root .tog-btn'))[1])).toBeGreaterThanOrEqual(17);
      expect(decls('.stp-placerow')).toMatch(/repeat\(3,\s*minmax\(0,\s*140px\)\)/);
      expect(decls('.stp-in')).toMatch(/background:\s*var\(--ui-bg\)/);
    });
    test('the live region is sr-only; the Moving pill pulse respects reduced motion', () => {
      expect(decls('.stp-root .sr-only')).toMatch(/clip:\s*rect\(0, 0, 0, 0\)/);
      expect(css).toMatch(/\.stp-pill\.is-moving::before\s*\{[^}]*animation:\s*stp-pulse/);
      expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.stp-pill\.is-moving::before\s*\{\s*animation:\s*none/);
    });
    test('no text under 15px in the Send to Plotter CSS', () => {
      const a = css.indexOf('/* ==== Send to Plotter (shell)');
      const sect = css.slice(a, css.indexOf('/* ==== end Send to Plotter', a)) + css.slice(css.indexOf('/* ==== Send to Plotter (machine tools)'));
      const small = (sect.match(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g) || []).map((m) => Number(/(\d+)px/.exec(m)[1])).filter((n) => n < 15);
      expect(small).toEqual([]);
    });
    test('the machine tools no longer render an in-pane emergency stop bar or state chips', () => {
      expect(tools).not.toMatch(/EMERGENCY STOP/);
      expect(tools).not.toMatch(/stp-mt-pill/);
    });
  });

  test('specs dialog is distance-readable and the profile row and rotation icons keep their layout', () => {
    const px = (sel, prop) => { const m = new RegExp(`${prop}:\\s*(\\d+)px`).exec(decls(sel)); return m && Number(m[1]); };
    expect(px('.stp-spec-list', 'font-size')).toBeGreaterThanOrEqual(16);
    expect(px('.stp-spec-list dt', 'font-size')).toBeGreaterThanOrEqual(15);
    expect(px('.stp-spec-speeds', 'font-size')).toBeGreaterThanOrEqual(16);
    expect(decls('.stp-spec-val')).toMatch(/white-space:\s*nowrap/);
    expect(decls('.stp-spec-body')).toMatch(/overflow:\s*auto/);
    expect(decls('.stp-selrow')).toMatch(/flex-wrap:\s*nowrap/);
    expect(decls('.stp-selrow')).not.toMatch(/flex-wrap:\s*wrap/);
    expect(decls('.stp-selrow-actions')).toMatch(/display:\s*flex/);
    expect(px('.stp-rotcard svg', 'width')).toBeGreaterThanOrEqual(40);
    expect(px('.stp-rotcard svg', 'width')).toBeLessThanOrEqual(48);
  });
});
