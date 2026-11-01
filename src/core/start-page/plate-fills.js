/**
 * Start Page plate special fills — window.Vectura.StartPagePlateFills. Pure: no DOM, no storage.
 *
 * The six special paints a plate's artwork, text or background can take instead of a flat color:
 * Iridescent, Iridescent (animated), Duotone ink, Metallic gold, Metallic silver, Sunset gradient. Ids match
 * StartPageOpenArt.FILL_INKS, so a plate can be opened in the editor with the nearest solid ink.
 *
 *   KINDS                         [{ id, name }]
 *   stops(kind, ctx)              [hex, ...]       ctx = { ink, accent, onDark }
 *   spec(kind, ctx)               { kind, type: 'conic'|'linear', angle, anim, speed, stops: [[0..1, hex], ...] }
 *   css(kind, ctx, { still })     CSS background (conic gradients turn with var(--sp-a) unless still)
 *   representative(kind, ctx)     one solid hex (a stop in the middle)
 *   average(stops)                mean hex of a stop list
 *   isFill(value)                 true for a stored { fill: <known kind> }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const KINDS = Object.freeze([
    { id: 'iridescent', name: 'Iridescent' },
    { id: 'iridescent-animated', name: 'Iridescent · animated' },
    { id: 'duotone', name: 'Duotone ink' },
    { id: 'metallic-gold', name: 'Metallic gold' },
    { id: 'metallic-silver', name: 'Metallic silver' },
    { id: 'sunset', name: 'Sunset gradient' },
  ].map((k) => Object.freeze(k)));
  const IDS = KINDS.map((k) => k.id);
  const conic = (kind) => kind === 'iridescent' || kind === 'iridescent-animated';
  const hx = (h) => {
    let s = String(h || '#000000').replace('#', '');
    if (s.length === 3) s = s.replace(/./g, '$&$&');
    const n = parseInt(s, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const average = (stops) => {
    const a = [0, 0, 0];
    stops.forEach((c) => hx(c).forEach((v, k) => { a[k] += v / stops.length; }));
    return `#${a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  };

  const stops = (kind, ctx) => {
    const c = ctx || {}; const dark = !!c.onDark;
    switch (kind) {
      case 'iridescent': case 'iridescent-animated':
        return dark ? ['#ff9ad5', '#ffd29a', '#f2ff9a', '#9affc8', '#9ad8ff', '#c49aff', '#ff9ad5']
          : ['#c2185b', '#d9480f', '#9c7a00', '#2b8a3e', '#1864ab', '#6741d9', '#c2185b'];
      case 'duotone': return [c.ink || '#1a1a1a', c.accent || c.ink || '#1a1a1a'];
      case 'metallic-gold': return ['#8a6a1f', '#f3d77a', '#b8862b', '#fff0b3', '#9c7425'];
      case 'metallic-silver': return ['#6f747c', '#eef1f5', '#9aa0a8', '#ffffff', '#7c828a'];
      case 'sunset': return dark ? ['#ff7eb3', '#ff9a5a', '#ffd36e'] : ['#7b2ff7', '#d6246e', '#e8590c'];
      default: return [c.ink || '#1a1a1a'];
    }
  };
  const spec = (kind, ctx) => {
    const st = stops(kind, ctx); const n = st.length - 1;
    return { kind, type: conic(kind) ? 'conic' : 'linear', angle: conic(kind) ? 0 : 125, anim: kind === 'iridescent-animated', speed: 36,
      stops: st.map((c, k) => [n ? k / n : 0, c]) };
  };
  const css = (kind, ctx, o) => {
    const st = stops(kind, ctx);
    if (!conic(kind)) return `linear-gradient(125deg, ${st.join(', ')})`;
    return `conic-gradient(from ${o && o.still ? '0deg' : 'var(--sp-a, 0deg)'} at 50% 50%, ${st.join(', ')})`;
  };
  const representative = (kind, ctx) => { const st = stops(kind, ctx); return st[Math.floor(st.length / 2)]; };
  const isFill = (v) => !!v && typeof v === 'object' && IDS.includes(v.fill);

  Vectura.StartPagePlateFills = { KINDS, IDS, stops, spec, css, representative, average, isFill };
})();
