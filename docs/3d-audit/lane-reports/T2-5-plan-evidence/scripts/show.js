const d = require('/private/tmp/claude-501/scratch-T25/_t25/sweep.json');
const mode = process.argv[2]||'tick';
for (const k of Object.keys(d)) {
  const m = d[k]; if (!m || m.error) { console.log(k, 'ERR'); continue; }
  if (mode==='purity') { console.log(k, JSON.stringify(m.purity.classes)); }
  else { const t=m.tick||{}; console.log(k,
    'O5t25', t.O5t25&&t.O5t25.toFixed(2), 'anchorMean', t.anchorAbsMean&&t.anchorAbsMean.toFixed(3), 'anchorMax', t.anchorMax&&t.anchorMax.toFixed(3),
    'seamOvFrac', t.seamOvFrac&&t.seamOvFrac.toFixed(3), 'seamOvP95', t.seamOvP95&&t.seamOvP95.toFixed(4), 'seamOvMax', t.seamOvMax&&t.seamOvMax.toFixed(4),
    'stepAcrP95', t.stepAcrossP95&&t.stepAcrossP95.toFixed(3), 'stepAcrMax', t.stepAcrossMax&&t.stepAcrossMax.toFixed(3),
    'frag<0.35R', t.fragFrac035&&t.fragFrac035.toFixed(3), 'R2n', t.lenToneR2n&&t.lenToneR2n.toFixed(3),
    'endContactFrac', t.endContactFrac&&t.endContactFrac.toFixed(3), 'roughP95', t.roughP95&&t.roughP95.toFixed(3), 'RP', t.rowPitchUsed&&t.rowPitchUsed.toFixed(2)); }
}
