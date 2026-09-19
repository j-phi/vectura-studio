const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
(async () => {
  const B = await L.makeRuntime('HEAD', { instrument:true, extraOverrides: { 'src/core/scene3d/surface-fill.js': L.instrumentSurfaceFill(P.build({ anchor:'stagger', subdiv:true, L0:1.05 })) } });
  for (const [p,mp,d] of [['sphere','hatch',220],['torus','hatch',220],['sphere','hatch',50]]) {
    const r = L.render(B, { primitive:p, mapper:mp, rig:'create', density:d });
    const RP=r.stat.tickField.rowPitch;
    const bad = r.stat.t25marks.map(t=>({Ld:L.plen(t.pts), n:t.pts.length, R:t.R, Lsolve:t.L, nPoly:t.nPoly, band:t.band, nSub: t.band? Math.round(t.R/t.band):1}))
      .filter(t=>t.Ld>2*RP).sort((a,b)=>b.Ld-a.Ld);
    console.log(`${p}/${mp} d=${d} RP=${RP.toFixed(2)} over2RP=${bad.length}`);
    bad.slice(0,6).forEach(t=>console.log(`   Ld=${t.Ld.toFixed(2)} (${(t.Ld/RP).toFixed(2)}RP) pts=${t.n} R=${t.R.toFixed(2)} (R/RP=${(t.R/RP).toFixed(2)}) Lsolve=${t.Lsolve.toFixed(2)} nSub=${t.nSub} nPoly=${t.nPoly}`));
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
