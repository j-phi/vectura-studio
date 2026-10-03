/**
 * Fill Style resolver (fill-style review U5). One pure factory, used twice:
 * `scripts/build-tone-laws.js` runs it to verify the COLLAPSE table, and embeds
 * its source (`makeResolver.toString()`) in the generated
 * `src/config/scene3d-tone-laws.js`, so the browser runs the same code.
 *
 * It must stay self-contained: no closure over anything but its argument.
 *
 * Model. A survivor has descriptors (sub-controls) and ENTRIES. An entry is
 * `{ when: { key: value, ... }, law }`: when every `when` key equals the bag's
 * value (an absent or unknown value counts as the descriptor's default), the
 * entry names the INTERNAL engine law id. The most specific entry wins. Two
 * different laws tied at the top mean the combination does not exist, and the
 * result is the bare survivor (the old "several descriptors active" rule).
 * `analyse().ok` is false for such a bag, and also when a visible, non-default
 * descriptor value is not accounted for by the winning entry (e.g. Wave
 * "Loop" together with "Interlocked": no engine law draws that).
 */
function makeResolver(source) {
  // `source` is the roster object, or a function returning it (read on every call,
  // so a test that swaps ENTRIES / STYLE_PARAMS on the live roster is honoured).
  const roster = () => (typeof source === 'function' ? source() : source) || {};
  const ENTRIES_ = () => roster().ENTRIES || {};
  const SP_ = () => roster().STYLE_PARAMS || {};
  const LEGACY_ = () => roster().LEGACY || {};

  const filled = (survivor, bag) => {
    const out = {};
    (SP_()[survivor] || []).forEach((d) => {
      const v = bag ? bag[d.key] : undefined;
      out[d.key] = d.options.some((o) => o.value === v) ? v : d.default;
    });
    return out;
  };
  const isVisible = (d, f) => !d.showWhen || Object.keys(d.showWhen).every((k) => f[k] === d.showWhen[k]);

  const analyse = (survivor, bag) => {
    const es = ENTRIES_()[survivor];
    if (!es) return { law: survivor, ok: true };
    const f = filled(survivor, bag);
    let best = -1;
    let top = [];
    es.forEach((e) => {
      const keys = Object.keys(e.when);
      if (!keys.every((k) => f[k] === e.when[k])) return;
      if (keys.length > best) { best = keys.length; top = [e]; } else if (keys.length === best) top.push(e);
    });
    const laws = [];
    top.forEach((e) => { if (laws.indexOf(e.law) === -1) laws.push(e.law); });
    if (laws.length !== 1) return { law: survivor, ok: false };
    const win = top[0];
    let ok = true;
    (SP_()[survivor] || []).forEach((d) => {
      if (d.passthrough || !isVisible(d, f)) return;
      if (f[d.key] !== d.default && !(d.key in win.when)) ok = false;
    });
    return { law: win.law, ok, entry: win };
  };

  const resolveLaw = (survivor, bag) => analyse(survivor, bag).law;

  // Descriptors the bag currently shows (showWhen satisfied), with the value each holds.
  const visibleDescriptors = (survivor, bag) => {
    const f = filled(survivor, bag);
    return (SP_()[survivor] || []).filter((d) => isVisible(d, f)).map((d) => ({ descriptor: d, value: f[d.key] }));
  };

  // The key/value patch that selects `value` for `key`. When the bare change is not
  // a real combination, the fewest other visible controls are snapped (to the value
  // the winning entry names, or to their default) so the result is one engine law.
  const pickPatch = (survivor, bag, key, value) => {
    const cur = filled(survivor, bag);
    const direct = Object.assign({}, bag || {}, { [key]: value });
    if (analyse(survivor, direct).ok) return { [key]: value };
    const descs = SP_()[survivor] || [];
    let best = null;
    (ENTRIES_()[survivor] || []).forEach((e) => {
      const patch = { [key]: value };
      let changes = 0;
      const cand = Object.assign({}, cur, { [key]: value });
      descs.forEach((d) => {
        if (d.key === key) return;
        if (d.key in e.when) {
          if (cand[d.key] !== e.when[d.key]) { patch[d.key] = e.when[d.key]; cand[d.key] = e.when[d.key]; changes += 1; }
        } else if (!d.passthrough && cand[d.key] !== d.default) {
          patch[d.key] = d.default; cand[d.key] = d.default; changes += 1;
        }
      });
      const res = analyse(survivor, cand);
      const kd = descs.find((d) => d.key === key);
      if (!res.ok || res.entry !== e || (kd && !isVisible(kd, cand))) return;
      if (!best || changes < best.changes) best = { patch, changes };
    });
    return best ? best.patch : { [key]: value };
  };

  // Retired sub-control keys (renamed in U5). A saved style bag that still carries
  // one is rewritten from the id the OLD resolver would have drawn.
  const legacyInternal = (survivor, bag) => {
    const L = LEGACY_()[survivor];
    if (!L) return survivor;
    let law = null;
    let n = 0;
    L.descriptors.forEach((d) => {
      const asked = bag ? bag[d.key] : undefined;
      const matched = d.options.find((o) => o.value === asked) || d.options.find((o) => o.value === d.default);
      if (!matched || matched.value === d.default) return;
      n += 1;
      law = matched.law;
    });
    return n === 1 ? law : survivor;
  };
  const upgradeLegacy = (raw, bag) => {
    const L = LEGACY_()[raw];
    if (!L || !bag) return null;
    if (!L.keys.some((k) => bag[k] !== undefined)) return null;
    return { internal: legacyInternal(raw, bag), dropKeys: L.descriptors.map((d) => d.key) };
  };

  return { analyse, resolveLaw, visibleDescriptors, pickPatch, upgradeLegacy, legacyInternal, filled };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeResolver };
