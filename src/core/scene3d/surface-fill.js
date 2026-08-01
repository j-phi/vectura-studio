/**
 * Scene3D.SurfaceFill — curved-surface fills that WRAP the 3D form (spec §3.3;
 * Jay live-test D/I/F). A sphere/torus/… must not fill its flat 2D silhouette
 * with parallel scanlines (that reads as a flat disc); the strokes must follow
 * the parametric surface and foreshorten with it, and their density must track
 * the local light so tone bands read across the surface.
 *
 * Model (light-lab reference + spiralizer wrap pattern):
 *   - Re-evaluate the SAME parametric chart the mesh was built from
 *     (Scene3D.Charts.topo<Mode>(sizes)) on a (a,b) lattice, so the fill lands
 *     exactly on the rendered surface.
 *   - Per sample: local point + numeric normal → object transform → world;
 *     world normal → camera space for back-face culling (front ⇔ camN.z > 0);
 *     project through the SAME camera as the mesh (scene.projectWorld).
 *   - Iso-parameter line families wrap the form: meridians (fix b, sweep a),
 *     parallels (fix a, sweep b). hatch = meridians, contour = parallels,
 *     crosshatch = both, spiral = one helix, stipple = a lattice of dots.
 *   - TONE (I): each line carries an ordered-dither threshold; a sample draws
 *     only where the local shade (1 − Lambert I) exceeds it, so dark regions get
 *     every line (dense) and the BRIGHTEST band gets none — the blank paper IS
 *     the highlight (which retires the old solid-white specular disc).
 *
 * Pure/deterministic. Returns screen-space polylines ([{x,y,z}…]); the caller
 * depth-stamps, clips (HLR), and emits them. null ⇒ unsupported primitive, so
 * the caller falls back to the flat silhouette fill.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((val, f = 0) => (Number.isFinite(Number(val)) ? Number(val) : f));
  const clamp = G3.clamp || ((val, lo, hi) => Math.max(lo, Math.min(hi, Number(val) || 0)));
  const v = G3.v || ((x, y, z) => ({ x, y, z }));
  const sub = G3.sub || ((a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z));
  const cross = G3.cross || ((a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x));
  const dot = G3.dot || ((a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
  const mul = G3.mul || ((a, s) => v(a.x * s, a.y * s, a.z * s));
  const normalize = G3.normalize || ((a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  });
  const rotatePoint = G3.rotatePoint;

  const chartFor = (mode, sizes) => {
    const C = Vectura.Scene3D && Vectura.Scene3D.Charts;
    if (!C) return null;
    switch (mode) {
      case 'sphere': return typeof C.topoSphereEllipsoid === 'function' ? C.topoSphereEllipsoid(sizes, 'sphere') : null;
      case 'torus': return typeof C.topoTorus === 'function' ? C.topoTorus(sizes) : null;
      case 'cone': return typeof C.topoCone === 'function' ? C.topoCone(sizes) : null;
      case 'cylinder': return typeof C.topoCylinder === 'function' ? C.topoCylinder(sizes) : null;
      case 'capsule': return typeof C.topoCapsule === 'function' ? C.topoCapsule(sizes) : null;
      case 'superellipsoid': return typeof C.topoSuperellipsoid === 'function' ? C.topoSuperellipsoid(sizes) : null;
      case 'torusKnot': return typeof C.topoTorusKnot === 'function' ? C.topoTorusKnot(sizes) : null;
      case 'pyramid': return typeof C.topoPyramid === 'function' ? C.topoPyramid(sizes) : null;
      default: return null;
    }
  };

  // Line count from the density slider (1..100 → ~6..40 wrap lines).
  const lineCountFor = (density) => Math.max(4, Math.round(6 + clamp(density, 0, 100) * 0.34));

  // buildObject(opts) → array of screen polylines, or null when unsupported.
  //   opts: { mode, sizes, detail, transform, applyTransform, projectWorld,
  //           camAngles, mapper, fillAngle, fillDensity, toneOn, intensityFn }
  //   intensityFn(worldNormal, worldPoint) → [0,1] combined multi-light intensity
  //   (worldPoint is the per-sample world surface point, needed by point/spot).
  const buildObject = (opts) => {
    if (!opts || !rotatePoint) return null;
    const chart = chartFor(opts.mode, opts.sizes);
    const applyTransform = opts.applyTransform;
    const projectWorld = opts.projectWorld;
    if (!chart || typeof applyTransform !== 'function' || typeof projectWorld !== 'function') return null;

    const t = opts.transform || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const rot = { yaw: finite(t.yaw, 0), pitch: finite(t.pitch, 0), roll: finite(t.roll, 0) };
    const cam = opts.camAngles || { yaw: 0, pitch: 0, roll: 0 };
    const toneOn = Boolean(opts.toneOn && typeof opts.intensityFn === 'function');
    const intensityFn = opts.intensityFn || null;
    const EPS = 1e-3;

    // Sample the surface at (a,b) → screen point + front flag + Lambert intensity.
    const sampleAt = (a, b) => {
      const aa = clamp(a, 0, 1);
      const bb = clamp(b, 0, 1);
      const p0 = chart(aa, bb);
      const pa = chart(clamp(aa + EPS, 0, 1), bb);
      const pb = chart(aa, clamp(bb + EPS, 0, 1));
      if (!p0 || !pa || !pb) return null;
      let nLocal = cross(sub(pa, p0), sub(pb, p0));
      const nl = Math.hypot(nLocal.x, nLocal.y, nLocal.z);
      if (nl < 1e-9) return null;
      nLocal = mul(nLocal, 1 / nl);
      if (dot(nLocal, p0) < 0) nLocal = mul(nLocal, -1); // outward (charts centre near origin)
      const world = applyTransform(p0, t);
      const wN = normalize(rotatePoint(nLocal, rot));
      const camN = rotatePoint(wN, cam);
      const scr = projectWorld(world);
      if (!scr || !Number.isFinite(scr.x) || !Number.isFinite(scr.y)) return null;
      const I = toneOn ? clamp(intensityFn(wN, world), 0, 1) : 1;
      return { x: scr.x, y: scr.y, z: scr.z, front: camN.z > 0, I };
    };

    const N = lineCountFor(finite(opts.fillDensity, 50));
    const steps = Math.max(28, Math.round(finite(opts.detail, 24) * 2)); // samples along each line
    const out = [];

    // Emit one iso-line: fixAxis 'b' ⇒ fix b, sweep a (meridian); 'a' ⇒ fix a,
    // sweep b (parallel). `threshold` is this line's ordered-dither cut (0..1) —
    // the sample draws only where the local shade (1 − I) meets it, so lines
    // vanish toward the lit highlight and pile up in shadow. Back-face culling
    // breaks each line into its visible (front) arcs.
    const emitLine = (fixAxis, fixVal, threshold) => {
      let run = [];
      const flush = () => { if (run.length >= 2) out.push(run); run = []; };
      for (let s = 0; s <= steps; s++) {
        const tt = s / steps;
        const smp = fixAxis === 'b' ? sampleAt(tt, fixVal) : sampleAt(fixVal, tt);
        if (!smp || !smp.front) { flush(); continue; }
        if (toneOn) {
          const shade = clamp(1 - smp.I, 0, 1);
          if (shade < threshold) { flush(); continue; }
        }
        run.push({ x: smp.x, y: smp.y, z: smp.z });
      }
      flush();
    };

    const emitFamily = (fixAxis) => {
      for (let i = 0; i < N; i++) {
        const fixVal = (i + 0.5) / N;
        emitLine(fixAxis, fixVal, (i + 0.5) / N); // dark→dense ordered dither
      }
    };

    const mapper = opts.mapper;
    if (mapper === 'hatch') {
      emitFamily('b'); // meridians wrap top-to-bottom
    } else if (mapper === 'crosshatch') {
      emitFamily('b');
      emitFamily('a'); // + parallels
    } else if (mapper === 'contour') {
      emitFamily('a'); // latitude rings following the form
    } else if (mapper === 'spiral') {
      // One continuous helix: a sweeps 0→1 across N turns while b advances.
      const turns = N;
      let run = [];
      const flush = () => { if (run.length >= 2) out.push(run); run = []; };
      const total = steps * turns;
      for (let s = 0; s <= total; s++) {
        const tt = s / total;
        const a = tt;
        const b = (tt * turns) % 1;
        const smp = sampleAt(a, b);
        if (!smp || !smp.front) { flush(); continue; }
        if (toneOn) { const shade = clamp(1 - smp.I, 0, 1); if (shade < 0.12) { flush(); continue; } }
        run.push({ x: smp.x, y: smp.y, z: smp.z });
      }
      flush();
    } else if (mapper === 'stipple') {
      // Dot lattice on the surface; a dot survives where local shade meets its
      // ordered-dither threshold (fewer dots toward the highlight). Each dot is a
      // small screen circle (a 0.01-unit marker would fall under the emitter's
      // MIN_RUN_MM floor and vanish).
      const rows = N;
      const colsPer = Math.max(6, Math.round(N * 1.6));
      const R = 0.7; // dot radius (screen units)
      const SEG = 6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < colsPer; c++) {
          const a = (r + 0.5) / rows;
          const b = (c + 0.5) / colsPer;
          const smp = sampleAt(a, b);
          if (!smp || !smp.front) continue;
          if (toneOn) {
            const shade = clamp(1 - smp.I, 0, 1);
            const th = ((r * colsPer + c) % 7) / 7; // scattered dither
            if (shade < th) continue;
          }
          const ring = [];
          for (let k = 0; k <= SEG; k++) {
            const ang = (k / SEG) * Math.PI * 2;
            ring.push({ x: smp.x + Math.cos(ang) * R, y: smp.y + Math.sin(ang) * R, z: smp.z });
          }
          out.push(ring);
        }
      }
    } else {
      return null; // unsupported mapper here
    }
    return out;
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { SurfaceFill: { buildObject, chartFor, lineCountFor } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildObject, chartFor, lineCountFor };
  }
})();
