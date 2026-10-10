#!/usr/bin/env node
/*
 * Summarise docs/touch-audit/findings/target-audit.json for the report.
 * Run after target-audit.js:  node docs/touch-audit/scripts/target-audit-summarize.js
 * Prints the per-viewport table, worst offenders by region, and layout signals.
 */
'use strict';
const path = require('path');
const data = require(path.resolve(__dirname, '../findings/target-audit.json'));

const rows = [];
for (const vp of data.viewports) {
  const s = vp.summary;
  rows.push(`| ${vp.id} (${vp.width}x${vp.height}@${vp.dpr}) | ${(s.defaultLayout || []).join(' ') || 'desktop'} | ${s.uniqueTargets} | ${s.pctUnder44}% (${s.under44}) | ${s.pctUnder24}% (${s.under24}) | ${s.failWcag258} | ${s.crowded} | ${s.inputsUnder16} | ${s.covered} | ${s.defaultCanvasPct}% |`);
}
console.log('| Viewport | Layout classes | Unique targets | <44 | <24 | Fail WCAG 2.5.8 | Crowded <8px | Text inputs <16px | Covered at centre | Canvas % (default) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r) => console.log(r));

const mode = process.argv[2] || 'all';
for (const vp of data.viewports) {
  if (mode !== 'all' && mode !== vp.id) continue;
  console.log(`\n## ${vp.id}`);
  console.log('canvas % by state:', JSON.stringify(vp.summary.canvasPctByState));
  console.log('hOverflow:', vp.summary.hOverflowStates.join(', ') || 'none', ' errors:', vp.summary.errors.join(' | ') || 'none');
  const uniq = new Map();
  // Dedupe by selector; prefer the instance where the target is reachable.
  for (const s of vp.states) for (const i of s.items || []) {
    if (!i.onscreen) continue;
    const prev = uniq.get(i.sel);
    const ok = i.hitState === 'ok' || i.hitState === 'ok-ancestor';
    if (!prev || (ok && !(prev.hitState === 'ok' || prev.hitState === 'ok-ancestor'))) uniq.set(i.sel, { ...i, state: s.id });
  }
  const byRegion = {};
  for (const i of uniq.values()) {
    const r = (byRegion[i.region] = byRegion[i.region] || { n: 0, u44: 0, u24: 0, crowd: 0, zoom: 0, worst: [] });
    r.n++; if (!i.hig44) r.u44++; if (!i.min24) r.u24++; if (i.crowded) r.crowd++; if (i.iosZoom) r.zoom++;
    r.worst.push(i);
  }
  for (const [name, r] of Object.entries(byRegion).sort((a, b) => b[1].u24 - a[1].u24)) {
    r.worst.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));
    console.log(`- ${name}: n=${r.n} <44=${r.u44} <24=${r.u24} crowded=${r.crowd} zoomInputs=${r.zoom}`);
    r.worst.slice(0, 6).forEach((i) => console.log(`    ${i.w}x${i.h} gap=${i.gap} [${i.state}] ${i.sel} "${i.label}"`));
  }
  const covered = Array.from(uniq.values()).filter((i) => i.hitState === 'covered');
  if (covered.length) { console.log('covered:'); covered.slice(0, 15).forEach((i) => console.log(`    [${i.state}] ${i.sel} "${i.label}" by ${i.coveredBy}`)); }
  const safe = Array.from(uniq.values()).filter((i) => i.safeUnprotected && i.safeUnprotected.length);
  if (safe.length) { console.log('safe-area unprotected:'); safe.slice(0, 15).forEach((i) => console.log(`    [${i.state}] ${i.sel} ${i.safeUnprotected} y=${i.y} h=${i.h}`)); }
  for (const s of vp.states) {
    if (s.overlays && s.overlays.length) s.overlays.forEach((o) => console.log(`  overlay[${s.id}] ${o.sel} ${o.x},${o.y} ${o.w}x${o.h} fits=${o.fits} scroll=${o.scrollable}/${o.overscroll} close=${o.close ? `${o.close.w}x${o.close.h} inVp=${o.close.inViewport} reach=${o.close.reachable} safe=${o.close.inSafeBand}` : 'none'}`));
    if (s.handles) console.log(`  handles[${s.id}]`, JSON.stringify(s.handles));
  }
  const def = vp.states.find((s) => s.id === 'default');
  if (def) console.log('  default: coarse', def.coarse, 'hover', def.hover, 'bodyOverscroll', def.bodyOverscroll, 'canvasTouchAction', def.canvasTouchAction, 'vOverflow', def.vOverflow, 'safeSelectors', JSON.stringify(def.safeSelectors));
  const scr = new Map();
  vp.states.forEach((s) => (s.scrollers || []).forEach((x) => { if (!scr.has(x.sel)) scr.set(x.sel, { ...x, state: s.id }); }));
  scr.forEach((x) => console.log(`  scroller[${x.state}] ${x.sel} h=${x.h} sh=${x.scrollH} overscroll=${x.overscroll} ta=${x.touchAction} beyondVp=${x.bottomBeyondViewport}`));
}
