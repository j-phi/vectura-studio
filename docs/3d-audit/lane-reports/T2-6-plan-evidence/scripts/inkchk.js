const { makeRuntime, render } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
const { build } = require('/private/tmp/claude-501/scratch-T26/_t26/proto26.js');
const { sites } = require('/private/tmp/claude-501/scratch-T26/_t26/metrics26.js');
(async () => {
  for (const [name, v] of [['HEAD', null], ['C62', { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, single:'stagger' }], ['C75', { rho:0.75, subMax:4, anchor:0, splitMinR:0.30, single:'stagger' }]]) {
    const ov = v ? { 'src/core/scene3d/surface-fill.js': build(v) } : null;
    const V = await makeRuntime('HEAD', { instrument: true, extraOverrides: ov });
    const r = render(V, { primitive:'cone', mapper:'hatch', rig:'create', density:50 });
    const st = r.stat;
    const S = sites(st.t26marks, st.tickField.rowPitch);
    let askL = 0, drawn = 0;
    S.forEach((s)=>{ askL += s.L; drawn += s.Tlen; });
    console.log(name, 'sites', S.length, 'Sum sv.L', askL.toFixed(1), 'Sum drawn', drawn.toFixed(1),
      'ratio', (drawn/askL).toFixed(4), '| mkStat ink', st.ink.toFixed(1), 'marks', st.marks, 'tooShort', st.tooShort,
      'dupStub', st.dupStub, 'offSurface', st.offSurface, 'trunc', st.trunc, 'askSum', st.askSum&&st.askSum.toFixed(1), 'drawnSum', st.drawnSum&&st.drawnSum.toFixed(1));
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
