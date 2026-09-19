const L = require('./lib');
(async () => {
  for (const t of ['proto3', 'q1']) {
    const V = await L.makeRuntime(t);
    const { stat } = L.render(V, { primitive: 'cone', rig: 'create', density: 220 });
    const s = stat; const ts = s.tickSites; let n = 0, dr = 0; for (let i = 0; i < ts.length; i += 4) { n++; if (ts[i + 3]) dr++; }
    console.log(t, JSON.stringify({ marks: s.marks, pens: s.pens, tooShort: s.tooShort, offSurface: s.offSurface, dupStub: s.dupStub, budget: s.budget, noFrame: s.noFrame, sites: n, drawn: dr, samples: s.samples }));
  }
  process.exit(0);
})();
