const L = require('./lib'); const fs = require('fs');
(async () => {
  let src = fs.readFileSync(L.ROOTS.p6d + '/src/core/scene3d/surface-fill.js', 'utf8');
  src = src.replace("if (Math.hypot(b[i].x - p.x, b[i].y - p.y) < mkInkR) return true;", "if (Math.hypot(b[i].x - p.x, b[i].y - p.y) < mkInkR) { const __g = (typeof window !== 'undefined' ? window : globalThis); (__g.__H = __g.__H || []).push([p.x, p.y, b[i].x, b[i].y, b[i].li, lineIndex, b[i].mk, mkStat.marks]); return true; }");
  src = src.replace("b.push(p); if (i > 0)", "b.push({ x: p.x, y: p.y, li: lineIndex, mk: mkStat.marks }); if (i > 0)");
  const V = await L.makeRuntime('p6d', { 'src/core/scene3d/surface-fill.js': src });
  V.__win.__H = [];
  L.render(V, { primitive: 'cone', rig: 'create' });
  const H = V.__win.__H; console.log('hits', H.length);
  let same = 0, sameMark = 0; const dl = {};
  H.forEach((h) => { if (h[4] === h[5]) same++; if (h[6] === h[7]) sameMark++; const d = Math.abs(h[4] - h[5]); dl[d] = (dl[d] || 0) + 1; });
  console.log('sameLine', same, 'sameMarkCounter', sameMark, 'lineDelta hist', JSON.stringify(dl).slice(0, 300));
  console.log(H.slice(0, 5).map((h) => h.map((v) => (typeof v === 'number' ? +v.toFixed(2) : v))));
  process.exit(0);
})();
