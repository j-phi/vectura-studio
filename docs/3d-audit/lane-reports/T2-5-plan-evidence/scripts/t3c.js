const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
const mean=(a)=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
(async () => {
  const A = await L.makeRuntime('HEAD', { instrument:true });
  const B = await L.makeRuntime('HEAD', { instrument:true, extraOverrides: { 'src/core/scene3d/surface-fill.js': L.instrumentSurfaceFill(P.build({ anchor:'stagger', subdiv:true, L0:1.05 })) } });
  for (const law of ['mkDashRamp','mkTick']) for (const d of [1,5,10,50,220]) for (const rig of ['create','test']) {
    const out = {};
    for (const [nm,V] of [['HEAD',A],['RANK1',B]]) {
      const r = L.render(V, { primitive:'cone', mapper:'hatch', rig, density:d, toneLaw: law });
      const mk = r.stat ? r.stat.t25marks : [];
      const byRow = new Map(); mk.forEach(t=>{ const k=t.lineIndex; if(!byRow.has(k)) byRow.set(k,[]); byRow.get(k).push(t); });
      const duty = mk.map(t=>L.plen(t.pts)/Math.max(1e-6,t.P));
      const lenFrac = mk.map(t=>L.plen(t.pts)/Math.max(1e-6,t.R));
      out[nm] = { md5: L.md5(r.paths).slice(0,10), paths: r.paths.length, ink: Math.round(r.paths.reduce((a,p)=>a+L.plen(L.pathPts(p)),0)*10)/10,
        marks: mk.length, rows: byRow.size, perRow: byRow.size?mk.length/byRow.size:0, duty: mean(duty), lenOverR: mean(lenFrac) };
    }
    const same = out.HEAD.md5===out.RANK1.md5;
    console.log(`${law} d=${d} ${rig}: HEAD md5=${out.HEAD.md5} marks=${out.HEAD.marks} rows=${out.HEAD.rows} perRow=${out.HEAD.perRow.toFixed(2)} duty=${out.HEAD.duty&&out.HEAD.duty.toFixed(3)} Ld/R=${out.HEAD.lenOverR&&out.HEAD.lenOverR.toFixed(3)} | RANK1 md5=${out.RANK1.md5} marks=${out.RANK1.marks} perRow=${out.RANK1.perRow.toFixed(2)} duty=${out.RANK1.duty&&out.RANK1.duty.toFixed(3)} Ld/R=${out.RANK1.lenOverR&&out.RANK1.lenOverR.toFixed(3)} | IDENTICAL=${same}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
