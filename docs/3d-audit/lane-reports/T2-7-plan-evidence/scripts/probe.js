const L = require('./lib');
(async () => {
  const V = await L.makeRuntime(process.argv[2] || 'main');
  console.log('version', V.APP_VERSION);
  const { paths, stat } = L.render(V, { primitive: 'cone', rig: 'create' });
  const kinds = {};
  paths.forEach((p) => { const k = (p.meta && p.meta.kind) || 'none'; kinds[k] = (kinds[k] || 0) + 1; });
  console.log(paths.length, kinds, 'rowPitch', stat.tickField && stat.tickField.rowPitch);
  console.log(Object.keys(paths[0].meta || {}), JSON.stringify(paths[0].meta).slice(0, 300));
})();
