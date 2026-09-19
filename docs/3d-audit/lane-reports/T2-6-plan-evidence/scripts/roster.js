const { makeRuntime, render, md5 } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
const { build } = require('/private/tmp/claude-501/scratch-T26/_t26/proto26.js');
const fs = require('fs');
const F3 = { rho:0.62, subMax:2, anchor:0, splitMinR:0.40, env:0.85, bandOnly:1, single:'stagger' };
(async () => {
  const combos = (process.env.COMBOS || 'cone:create,sphere:create,torus:create,cone:test').split(',');
  const A = await makeRuntime('HEAD', {});
  const B = await makeRuntime('HEAD', { extraOverrides: { 'src/core/scene3d/surface-fill.js': build(F3) } });
  const MAPPERS = A.Scene3D.Params.MAPPERS;
  const LAWS = A.SCENE3D_TONE_LAWS.PRODUCTION;
  console.log('mappers', MAPPERS.length, 'laws', LAWS.length, '=> cells per sweep', MAPPERS.length*LAWS.length);
  const report = {};
  for (const combo of combos) {
    const [primitive, rig] = combo.split(':');
    let n = 0; const changed = [];
    for (const mapper of MAPPERS) for (const toneLaw of LAWS) {
      n += 1;
      const ra = render(A, { primitive, mapper, rig, density: 50, toneLaw });
      const rb = render(B, { primitive, mapper, rig, density: 50, toneLaw });
      if (md5(ra.paths) !== md5(rb.paths)) changed.push(`${mapper}/${toneLaw}`);
    }
    report[combo] = { cells: n, changed };
    console.log(`${combo}: ${changed.length}/${n} changed -> ${changed.join(', ') || '(none)'}`);
  }
  fs.writeFileSync('/private/tmp/claude-501/scratch-T26/_t26/roster.json', JSON.stringify(report, null, 1));
  process.exit(0);
})().catch((e)=>{console.error(e);process.exit(1);});
