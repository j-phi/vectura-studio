/**
 * Start Page hover effect: Light Current (id "current").
 * Ported from mockup shared/fx-c.js per specs/HOVERFX-V2-SPEC.md. Registers on StartPageHoverFxCore;
 * loaded lazily by hover-fx/index.js only when this effect is chosen.
 */
(() => {
  'use strict';
  const VH = window.Vectura && window.Vectura.StartPageHoverFxCore; if (!VH) return;
  const { register } = VH, TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* grid dims over the stage at the stage's aspect */
  const dims = (ctx, base) => { const c = Math.max(24, Math.round(base * (ctx.quality.field || 1))); return [c, Math.max(14, Math.round(c * ctx.H / Math.max(1, ctx.W)))]; };
  /* bind a texture to unit u and point sampler `name` at it */
  function tex(ctx, P, name, t, u) { const gl = ctx.gl; gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); P.int(name, u); }
  /* ---------------------------------------------------------------- P9: stroke sample graph + Dijkstra */
  /* strokeGraph(ctx): CSR graph over ctx.samples. Edge kinds: 0 along-stroke, 1 junction (strokes within ~1.5 art px),
     2 hop (stroke end → nearest other stroke within 3% sheet width, cost ×4). */
  function strokeGraph(ctx) {
    const S = ctx.samples, n = S.n, E = [];
    let sp = 0, sc = 0; for (let i = 0; i < n; i++) { const j = S.next(i); if (j >= 0) { sp += Math.hypot(S.x[j] - S.x[i], S.y[j] - S.y[i]); sc++; } }
    const spacing = sc ? sp / sc : 4, rJ = Math.max(3, Math.min(9, spacing * 0.9, 1.5 * Math.max(1, ctx.art.lw) + 2)), rH = Math.max(rJ * 2, 0.03 * ctx.W);
    const add = (a, b, w, k) => { E.push(a, b, w, k, b, a, w, k); };
    for (let i = 0; i < n; i++) { const j = S.next(i); if (j >= 0) add(i, j, Math.hypot(S.x[j] - S.x[i], S.y[j] - S.y[i]), 0); }
    const cand = []; /* QA W5: a self-crossing stroke (harmonographs, Lissajous) also junctions where it crosses itself, so one-stroke pieces cascade too */
    for (let i = 0; i < n; i++) {
      const m = S.near(S.x[i], S.y[i], rJ); cand.length = 0;
      for (let k = 0; k < m; k++) { const id = S.buf[k]; if (id > i && (S.stroke[id] !== S.stroke[i] || Math.abs(S.len[id] - S.len[i]) > 6 * spacing)) cand.push([Math.hypot(S.x[id] - S.x[i], S.y[id] - S.y[i]), id]); }
      cand.sort((a, b) => a[0] - b[0]); for (let k = 0; k < Math.min(3, cand.length); k++) add(i, cand[k][1], Math.max(0.5, cand[k][0]), 1);
    }
    const hops = [];
    for (let i = 0; i < n; i++) {
      if (S.prev(i) >= 0 && S.next(i) >= 0) continue;
      const m = S.near(S.x[i], S.y[i], rH); let best = -1, bd = Infinity;
      for (let k = 0; k < m; k++) { const id = S.buf[k]; if (S.stroke[id] === S.stroke[i]) continue; const d = Math.hypot(S.x[id] - S.x[i], S.y[id] - S.y[i]); if (d < bd) { bd = d; best = id; } }
      if (best >= 0 && bd > rJ) { add(i, best, bd * 4, 2); hops.push(i, best); }
    }
    const ne = E.length / 4, off = new Int32Array(n + 1), to = new Int32Array(ne), w = new Float32Array(ne), kind = new Uint8Array(ne);
    for (let e = 0; e < ne; e++) off[E[e * 4] + 1]++;
    for (let i = 0; i < n; i++) off[i + 1] += off[i];
    const fill = off.slice(0, n);
    for (let e = 0; e < ne; e++) { const a = E[e * 4], q = fill[a]++; to[q] = E[e * 4 + 1]; w[q] = E[e * 4 + 2]; kind[q] = E[e * 4 + 3]; }
    return { n, off, to, w, kind, hops, spacing, rJ, rH, heapN: new Int32Array(ne + n + 8), heapK: new Float32Array(ne + n + 8) };
  }
  /* dijkstra(G, src, speedPx, maxT, outT, outE): arrival time (s) and energy (×0.9 per junction/hop) for every sample */
  function dijkstra(G, src, speed, maxT, outT, outE) {
    outT.fill(1e4); outE.fill(0);
    const HN = G.heapN, HK = G.heapK; let hs = 0;
    const push = (v, k) => { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (HK[p] <= k) break; HN[i] = HN[p]; HK[i] = HK[p]; i = p; } HN[i] = v; HK[i] = k; };
    const pop = () => { const v = HN[0], lastN = HN[--hs], lastK = HK[hs]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && HK[c + 1] < HK[c]) c++; if (HK[c] >= lastK) break; HN[i] = HN[c]; HK[i] = HK[c]; i = c; } HN[i] = lastN; HK[i] = lastK; return v; };
    outT[src] = 0; outE[src] = 1; push(src, 0); let reached = 0, tmax = 0;
    while (hs > 0) {
      const k0 = HK[0], u = pop(); if (k0 > outT[u]) continue; reached++; if (k0 > tmax) tmax = k0;
      for (let q = G.off[u], e = G.off[u + 1]; q < e; q++) {
        const v = G.to[q], c = k0 + G.w[q] / speed; if (c < outT[v] && c < maxT && hs < HN.length) { outT[v] = c; outE[v] = outE[u] * (G.kind[q] ? 0.9 : 1); push(v, c); }
      }
    }
    return { reached, tmax };
  }
  /* =================================================================== 6 · LIGHT CURRENT */
  /* Each emission runs one Dijkstra over the stroke graph (P9) and writes per-sample arrival times into one of three
     vertex slots of a quad-segment proxy. The shader then races comet heads outward along the actual pen paths,
     branching at junctions and sparking across gaps; strokes keep a brief afterglow. No per-frame CPU work. */
  const LC_VS = `attribute vec4 aAB; attribute vec3 aC; attribute vec3 aT; attribute vec3 aE;
uniform float uHW; varying vec3 vT; varying vec3 vE; varying float vSide; varying float vHop; varying vec2 vStage;
void main(){
  vec2 a = aAB.xy, b = aAB.zw, d = b - a; float L = length(d); vec2 t = L > 1e-4 ? d / L : vec2(1., 0.), n = vec2(-t.y, t.x);
  vec2 p = mix(a, b, aC.x) + n * aC.y * uHW + t * (aC.x * 2. - 1.) * uHW * .5;
  vStage = p; vSide = aC.y; vHop = aC.z; vT = aT; vE = aE;
  vec2 c = p / uStage * 2. - 1.; gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;
  const LC_FS = `varying vec3 vT; varying vec3 vE; varying float vSide; varying float vHop; varying vec2 vStage;
uniform vec3 uT0, uEn, uMask; uniform float uNow, uHW, uCore, uSpeed, uStill; uniform vec3 uHot, uB;
float lc_head(float x){ float d = x * uSpeed; return d < 0. ? exp(-d * d / 30.) : exp(-d / 30.); }
void lc_acc(float x, float e, inout float H, inout float A){
  if (x < -.05 || e <= 0.) return;
  H += lc_head(x) * e;
  A += (x > 0. ? .14 * exp(-x / .8) : 0.) * e;
}
void main(){
  float px = abs(vSide) * uHW;
  float core = exp(-px * px / (uCore * uCore)), halo = exp(-px * px / (uHW * uHW * .16));
  float H = 0., A = 0.;
  lc_acc(uNow - uT0.x - vT.x, uEn.x * vE.x, H, A);
  lc_acc(uNow - uT0.y - vT.y, uEn.y * vE.y, H, A);
  lc_acc(uNow - uT0.z - vT.z, uEn.z * vE.z, H, A);
  if (uStill > .5) { A = 0.; H = 0.; float T = dot(vT, uMask); A = .55 * clamp(1. - T / 1.2, 0., 1.) * step(T, 1.2); }
  if (vHop > .5) { A = 0.; core *= .55; halo *= .7; }
  float ks = keepScale(vStage);
  H = min(H, 1.6);
  if (uDark > .5) {
    vec3 col = uHot * core * H * .95 + uB * (halo * H * .42 + core * A * 1.25 + core * H * .3);
    gl_FragColor = vec4(col * ks, 0.);
  } else {
    float a = clamp(core * (H * .92 + A * 1.3) + halo * H * .14, 0., 1.) * ks;
    vec3 col = mix(uB, uHot, clamp(H, 0., 1.));
    gl_FragColor = vec4(col * a, a);
  }
}`;
  function lcBuild(ctx, s) {
    const gl = ctx.gl, S = ctx.samples, G = s.G = strokeGraph(ctx);
    const segA = [], segB = [], hop = [];
    for (let i = 0; i < S.n; i++) { const j = S.next(i); if (j >= 0) { segA.push(i); segB.push(j); hop.push(0); } }
    for (let h = 0; h < G.hops.length; h += 2) { segA.push(G.hops[h]); segB.push(G.hops[h + 1]); hop.push(1); }
    const ns = Math.min(segA.length, 16000), nv = ns * 4;
    s.segA = Int32Array.from(segA.slice(0, ns)); s.segB = Int32Array.from(segB.slice(0, ns)); s.ns = ns;
    const st = new Float32Array(nv * 7), C = [[0, -1], [0, 1], [1, -1], [1, 1]];
    for (let q = 0; q < ns; q++) { const a = s.segA[q], b = s.segB[q]; for (let c = 0; c < 4; c++) { const o = (q * 4 + c) * 7; st[o] = S.x[a]; st[o + 1] = S.y[a]; st[o + 2] = S.x[b]; st[o + 3] = S.y[b]; st[o + 4] = C[c][0]; st[o + 5] = C[c][1]; st[o + 6] = hop[q]; } }
    const idx = (nv > 65535 ? Uint32Array : Uint16Array).from({ length: ns * 6 }, (_, k) => { const q = (k / 6) | 0, r = [0, 1, 2, 2, 1, 3][k % 6]; return q * 4 + r; });
    s.u32 = nv > 65535; if (s.u32) gl.getExtension('OES_element_index_uint');
    if (!s.sb) { s.sb = gl.createBuffer(); s.db = gl.createBuffer(); s.ib = gl.createBuffer(); }
    gl.bindBuffer(gl.ARRAY_BUFFER, s.sb); gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
    s.dyn = new Float32Array(nv * 6); for (let v = 0; v < nv; v++) { s.dyn[v * 6] = s.dyn[v * 6 + 1] = s.dyn[v * 6 + 2] = 1e4; }
    gl.bindBuffer(gl.ARRAY_BUFFER, s.db); gl.bufferData(gl.ARRAY_BUFFER, s.dyn, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    s.idxAll = idx; s.idxCull = new idx.constructor(idx.length); s.nIdx = idx.length; s.T = new Float32Array(S.n); s.E = new Float32Array(S.n);
    s.slots = [0, 1, 2].map(() => ({ t0: -99, en: 0, tmax: 0 })); s.uT0 = new Float32Array(3); s.uEn = new Float32Array(3); s.mask = new Float32Array([1, 0, 0]);
  }
  function lcEmit(ctx, s, x, y, en) {
    const S = ctx.samples; let src = S.nearest(x, y, 120); if (src < 0) src = S.nearest(x, y, 320); if (src < 0) return false;
    const r = dijkstra(s.G, src, s.speed, 2.6, s.T, s.E);
    let k = 0; for (let q = 1; q < 3; q++) if (s.slots[q].t0 < s.slots[k].t0) k = q;   /* oldest slot */
    const D = s.dyn, A = s.segA, B = s.segB;
    for (let q = 0; q < s.ns; q++) { const ta = s.T[A[q]], tb = s.T[B[q]], ea = s.E[A[q]], eb = s.E[B[q]]; for (let c = 0; c < 4; c++) { const o = (q * 4 + c) * 6, end = c >= 2; D[o + k] = end ? tb : ta; D[o + 3 + k] = end ? eb : ea; } }
    const gl = ctx.gl; gl.bindBuffer(gl.ARRAY_BUFFER, s.db); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D);
    s.slots[k].t0 = s.now; s.slots[k].en = en; s.lastSlot = k; s.slots[k].tmax = r.tmax; s.lastEmit = s.now; s.ex = x; s.ey = y;
    return true;
  }
  function lcDraw(ctx, s, still) {
    const gl = ctx.gl; ctx.drawArt({ paper: true });
    const P = ctx.bind(s.prog), pal = ctx.pal.gl;
    for (let k = 0; k < 3; k++) { s.uT0[k] = s.slots[k].t0; s.uEn[k] = s.slots[k].en; }
    P.set('uT0', s.uT0).set('uEn', s.uEn).set('uNow', s.now).set('uHW', s.hw).set('uCore', s.core).set('uSpeed', s.speed).set('uStill', still ? 1 : 0).set('uMask', s.mask).set('uHot', pal.hot).set('uB', pal.bright);
    gl.enable(gl.BLEND); if (ctx.pal.dark) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.sb);
    const a = P.A; gl.enableVertexAttribArray(a.aAB); gl.vertexAttribPointer(a.aAB, 4, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(a.aC); gl.vertexAttribPointer(a.aC, 3, gl.FLOAT, false, 28, 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.db);
    gl.enableVertexAttribArray(a.aT); gl.vertexAttribPointer(a.aT, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(a.aE); gl.vertexAttribPointer(a.aE, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ib);
    /* cull: only segments some live current is passing (head not yet arrived .. afterglow gone) are drawn, so cost follows the light, not the drawing */
    if (!still) {
      const D = s.dyn, ix = s.idxAll, out = s.idxCull, now = s.now; let n = 0;
      for (let q = 0; q < s.ns; q++) {
        let live = false;
        for (let k = 0; k < 3 && !live; k++) { const sl = s.slots[k]; if (sl.en <= 0) continue; const ta = D[q * 24 + k], tb = D[q * 24 + 12 + k]; if (ta > 1e3 && tb > 1e3) continue; const x = now - sl.t0 - Math.min(ta, tb); if (x > -0.08 && x < 2.7) live = true; }
        if (live) { const b = q * 6; out[n++] = ix[b]; out[n++] = ix[b + 1]; out[n++] = ix[b + 2]; out[n++] = ix[b + 3]; out[n++] = ix[b + 4]; out[n++] = ix[b + 5]; }
      }
      if (n) { gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, out.subarray(0, n), gl.DYNAMIC_DRAW); gl.drawElements(gl.TRIANGLES, n, s.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0); }
    } else { gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idxAll, gl.STATIC_DRAW); gl.drawElements(gl.TRIANGLES, s.nIdx, s.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0); }
    [a.aAB, a.aC, a.aT, a.aE].forEach(l => gl.disableVertexAttribArray(l));
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  register({
    id: 'current', name: 'Light Current', set: 'C', order: 6,
    blurb: 'Light surges along the pen paths and cascades through the drawing like current.',
    init(ctx) {
      const s = ctx.state; s.prog = ctx.program(LC_VS, LC_FS); s.now = 0; s.lastEmit = -9; s.travel = 0; s.px = null; s.speed = 650;
      s.hw = 8; s.core = Math.max(0.9, (ctx.art.lw || 1) * 0.75 + 0.35);
      lcBuild(ctx, s);
    },
    resize(ctx) { lcBuild(ctx, ctx.state); },
    pointer(ctx, ev) {
      const s = ctx.state; if (!s.G) return;
      if (ev.type === 'enter') { lcEmit(ctx, s, ev.x, ev.y, 1); s.px = ev.x; s.py = ev.y; s.travel = 0; }
      else if (ev.type === 'tap' || (ev.type === 'flick' && s.now - s.lastEmit > 0.15)) lcEmit(ctx, s, ev.x, ev.y, 1.25);
      else if (ev.type === 'move') {
        if (s.px == null) { s.px = ev.x; s.py = ev.y; }
        s.travel += Math.hypot(ev.x - s.px, ev.y - s.py); s.px = ev.x; s.py = ev.y;
        if (s.now - s.lastEmit >= 0.45 && s.travel >= 60 && lcEmit(ctx, s, ev.x, ev.y, 0.9 + 0.2 * ctx.k)) s.travel = 0;
      }
    },
    frame(ctx, dt) {
      const s = ctx.state; s.now += dt * (ctx.on ? 1 : 2.4); lcDraw(ctx, s, false);   /* after the pointer leaves, the current runs out ~2.4x faster so it is at rest inside the teardown window */
      let e = 0; for (let q = 0; q < 3; q++) { const sl = s.slots[q], age = s.now - sl.t0, left = sl.tmax + 2.2 - age; if (left > 0) e += sl.en * left; } /* QA W5: the afterglow (τ .8 s) is invisible 2.2 s after the head passes; was 3.4 s */
      return e;
    },
    reducedMotion(ctx) {
      const s = ctx.state, P = ctx.pointer; s.now = 0; s.slots.forEach(sl => { sl.t0 = -99; sl.en = 0; });
      if (lcEmit(ctx, s, P.sx, P.sy, 1)) { const k = s.lastSlot; s.mask.fill(0); s.mask[k] = 1; s.slots[k].en = 0; lcDraw(ctx, s, true); }
      else ctx.drawArt({ paper: true });
    },
    dispose(ctx) { const s = ctx.state, gl = ctx.gl; if (s.sb) { gl.deleteBuffer(s.sb); gl.deleteBuffer(s.db); gl.deleteBuffer(s.ib); } }
  });
})();
