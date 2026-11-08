/* Scene3D compose worker (classic worker). The main thread (compose-client.js) posts
 *   { type: 'init', scripts: [absolute urls] }  once, then
 *   { type: 'job', id, job }                    per compose.
 * The Scene3D modules are IIFEs on window.Vectura, so `window` is shimmed to the worker scope. */
/* global importScripts */
self.window = self;
self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') {
      importScripts.apply(self, m.scripts);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'job') {
      const out = self.Vectura.Scene3D.ComposeJob.run(m.job);
      self.postMessage({ type: 'result', id: m.id, packed: out.packed, finished: out.finished, ms: out.ms },
        out.packed.buffers.concat(out.finished ? out.finished.buffers : []));
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
