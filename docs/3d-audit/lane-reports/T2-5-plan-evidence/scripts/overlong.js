const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
(async () => {
 const res = {};
 for (const tag of ['v1.4.1','pre-T2-3','T2-3','HEAD']) {
  const V = await L.makeRuntime(tag, { instrument: true });
  for (const rig of ['create','test']) for (const [p,mp] of L.CELLS) {
    const r = L.render(V, { primitive:p, mapper:mp, rig });
    const RP = r.stat.tickField.rowPitch;
    const ts = r.stat.t25marks.map(t=>({ Ld: L.plen(t.pts), R: t.R, L: t.L, I: t.I }));
    const over = (k) => ts.filter(t=>t.Ld > k*RP).length;
    const mm = (k) => Math.round(ts.filter(t=>t.Ld > k*RP).reduce((a,b)=>a+b.Ld,0)*10)/10;
    const maxLd = Math.max(...ts.map(t=>t.Ld));
    const maxR = Math.max(...ts.map(t=>t.R));
    console.log(`${tag}|${rig}|${p}/${mp} RP=${RP.toFixed(2)} n=${ts.length} maxLd=${maxLd.toFixed(2)} (=${(maxLd/RP).toFixed(2)}RP) maxR=${maxR.toFixed(2)} over1.16RP=${over(1.16)} (${mm(1.16)}mm) over1.5RP=${over(1.5)} over2RP=${over(2)} (${mm(2)}mm) over3RP=${over(3)}`);
  }
 }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
