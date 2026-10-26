// Per-surface target sweep (TUX-041 batch B5). The B4 panel spec (targets-panels.spec.js) carries the same logic inline; this copy is
// parameterised by the roots so the Scene3D, Petal Designer and Pattern designer specs can share it.
// A target counts when hitArea() (which resolves ::before extensions and neighbours through elementFromPoint) is at least 44 x 44 and
// its centre resolves to itself. A control that a collapsed section or a scroller clips away entirely is not on screen and is skipped.
const core = require('./target-audit-core');

const MIN = 44;
const TARGETS = 'button, input, select, textarea, summary, a[href], [role="button"], [role="tab"], [role="radio"], [role="option"], [role^="menuitem"], [tabindex="0"], label.sw-toggle, .lvl-algo-sub-item';

async function enumerate(page, roots, sel = TARGETS) {
  return page.evaluate(({ roots, sel }) => {
    document.querySelectorAll('[data-sweep-probe]').forEach((e) => e.removeAttribute('data-sweep-probe'));
    let n = 0; const seen = new Set(); const out = [];
    for (const root of roots) {
      for (const host of document.querySelectorAll(root)) {
        if (!host.checkVisibility({ checkVisibilityCSS: true })) continue;
        for (const e of host.querySelectorAll(sel)) {
          if (seen.has(e)) continue; seen.add(e);
          const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
          if (!e.checkVisibility({ checkVisibilityCSS: true }) || r.width < 1 || r.height < 1 || cs.pointerEvents === 'none') continue;
          if (e.matches('input[type="hidden"], input[type="file"], .sr-only, [aria-hidden="true"][tabindex="-1"]')) continue;
          if (e.matches('input[type="checkbox"], input[type="radio"]') && (e.closest('label.sw-toggle') || cs.opacity === '0')) continue;
          if (e.closest('.sr-only')) continue;
          // An inert subtree (a gated row: main's markRowDisabled) is not offered to the user, as in target-audit-core.
          if (e.closest('[inert]')) continue;
          n += 1; e.setAttribute('data-sweep-probe', String(n));
          const lbl = (e.id ? '#' + e.id : e.dataset.info ? `info[${e.dataset.info}]` : (e.getAttribute('aria-label') || e.getAttribute('data-tab') || e.getAttribute('title') || e.className || e.tagName)).toString().trim().replace(/\s+/g, '.').slice(0, 56);
          const anc = []; for (let p = e.parentElement; p && anc.length < 2; p = p.parentElement) { const c = (typeof p.className === 'string' ? p.className : '').trim().split(/\s+/)[0]; if (c) anc.push(c); }
          out.push({ i: n, label: `${e.tagName.toLowerCase()}${lbl.startsWith('#') ? lbl : '.' + lbl}`.slice(0, 56) + `@${anc.join('<')}` });
        }
      }
    }
    return out;
  }, { roots, sel });
}

// inPage(page, fn, arg): runs fn(arg, kit) inside the page in ONE page.evaluate, so a sweep of N targets costs one CDP round
// trip instead of ~7 per target (hosted WebKit spends most of a targets-* run on round trips). fn must be self-contained (no
// closure over Node variables). kit.hitArea(el, opts) is target-audit-core's hitAreaInPage with the helpers/touch.js hitArea
// defaults (probe 2, radius 48); kit.frame() waits one animation frame (scroll events and the handlers they drive run first).
async function inPage(page, fn, arg) {
  return page.evaluate(async ({ fnSrc, hitSrc, arg }) => {
    const hit = (new Function(`return (${hitSrc})`))();
    const frame = () => new Promise((resolve) => {
      let done = false; const end = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => setTimeout(end, 0)); setTimeout(end, 100); // rAF can be throttled: never hang
    });
    const kit = { hitArea: (el, opts) => hit(el, { probe: 2, radius: 48, ...(opts || {}) }), frame };
    return (new Function(`return (${fnSrc})`))()(arg, kit);
  }, { fnSrc: fn.toString(), hitSrc: core.hitAreaInPage.toString(), arg });
}

// In-page body of measure(): per target, scroll it into view (vertical only), skip it when clipped away, make foreign popups
// transparent to hit tests, read its hit area and whether its centre resolves to itself. Same steps and order as the former
// per-target round-trip loop.
async function sweepTargetsInPage({ items, roots, popups }, kit) {
  const out = [];
  for (const it of items) {
    const e = document.querySelector(`[data-sweep-probe="${it.i}"]`);
    if (!e) { out.push({ i: it.i, missing: true }); continue; }
    e.scrollIntoView({ block: 'center', inline: 'nearest' }); for (let a = e.parentElement; a; a = a.parentElement) if (a.scrollLeft) a.scrollLeft = 0;
    await kit.frame();
    const clipped = (() => {
      const r = e.getBoundingClientRect();
      let l = r.left; let t = r.top; let rt = r.right; let b = r.bottom;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a);
        if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        if (!c.width && !c.height) continue;
        l = Math.max(l, c.left); t = Math.max(t, c.top); rt = Math.min(rt, c.right); b = Math.min(b, c.bottom);
      }
      l = Math.max(l, 0); t = Math.max(t, 0); rt = Math.min(rt, innerWidth); b = Math.min(b, innerHeight);
      // A control that sticks out sideways past the box that clips it is half off screen: its tap is lost or the row is cut.
      const over = rt - l < r.width - 1.5;
      return b - t < 2 ? 'gone' : (over || rt - l < 2) ? 'over' : false;
    })();
    if (clipped === 'gone') { out.push({ i: it.i, clipped }); continue; }
    const ps = popups.length ? [...document.querySelectorAll(popups.join(','))].filter((m) => !m.contains(e) && m.checkVisibility()) : [];
    const prev = ps.map((m) => [m, m.style.pointerEvents]);
    ps.forEach((m) => { m.style.pointerEvents = 'none'; });
    const a = kit.hitArea(e);
    const own = (() => {
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!t) return true;
      if (t === e || e.contains(t) || t.contains(e) || (t.tagName === 'LABEL' && t.control === e)) return true;
      if (e.closest('.dual-range') && t.closest('.dual-range') === e.closest('.dual-range')) return 'other-surface';
      const rootOf = (n) => roots.map((s) => n.closest(s)).find(Boolean) || null;
      return rootOf(t) !== rootOf(e) ? 'other-surface' : false;
    })();
    prev.forEach(([m, v]) => { m.style.pointerEvents = v; });
    out.push({ i: it.i, clipped, w: a.w, h: a.h, own });
  }
  return out;
}

async function measure(page, { roots, popups = [], min = MIN }) {
  const items = await enumerate(page, roots);
  const res = await inPage(page, sweepTargetsInPage, { items, roots, popups });
  const bad = []; const stolen = []; const overflow = []; let skipped = 0;
  res.forEach((m, k) => {
    const it = items[k];
    if (m.missing) { bad.push(`${it.label} left the DOM during the sweep`); return; }
    if (m.clipped === 'gone') { skipped += 1; return; }
    if (m.clipped === 'over') overflow.push(it.label);
    if (m.own === 'other-surface') { skipped += 1; return; }
    if (m.w < min || m.h < min) bad.push(`${it.label} ${m.w}x${m.h}`);
    if (!m.own) stolen.push(it.label);
  });
  return { count: items.length - skipped, listed: items.length, bad, stolen, overflow };
}

module.exports = { MIN, TARGETS, enumerate, measure, inPage };
