const L = require('./lib'); const fs = require('fs');
(async () => {
  const tag = process.argv[2]; const V = await L.makeRuntime(tag);
  const out = {};
  for (const prim of ['cone', 'sphere']) for (const rig of ['create', 'test']) {
    const { paths, stat } = L.render(V, { primitive: prim, rig });
    out[`${prim}|${rig}`] = { rp: stat.tickField && stat.tickField.rowPitch, md5: L.md5(paths),
      paths: paths.map((p) => ({ k: p.meta && p.meta.kind, e: p.meta && p.meta.sceneTarget && p.meta.sceneTarget.edgeClass, pts: L.pts(p).map((q) => [+q.x.toFixed(3), +q.y.toFixed(3)]) })) };
    console.log(tag, prim, rig, paths.length, out[`${prim}|${rig}`].md5.slice(0,10));
  }
  fs.writeFileSync(`${L.S}/dump_${tag}.json`, JSON.stringify(out)); process.exit(0);
})();
