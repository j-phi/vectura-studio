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
  //           camAngles, mapper, fillAngle, fillDensity, toneOn, intensityFn,
  //           xray }
  //   intensityFn(worldNormal, worldPoint) → [0,1] combined multi-light intensity
  //   (worldPoint is the per-sample world surface point, needed by point/spot).
  //   xray: { backFaces, backDensity } — when backFaces, also emit the FAR
  //   surface as a second family (polylines tagged `.back = true`) so the caller
  //   draws it dashed/sparse; back count = front count × backDensity (0.2–1).
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
    const mapper = opts.mapper;

    // X-ray (Phase 6): when opts.xray.backFaces is set, emit a SECOND family
    // sampling the FAR surface (camN.z < 0, normally back-face-culled) so the
    // caller can draw it dashed at reduced density — the fix that makes a hatched
    // sphere actually show through. Back-family polylines carry a `.back` flag.
    const xray = opts.xray && opts.xray.backFaces ? opts.xray : null;
    const backDensity = clamp(finite(opts.xray && opts.xray.backDensity, 0.4), 0.2, 1);

    // Highlight treatment (Phase 4): generalizes the ordered-dither highlight
    // gate below from a boolean drop ('blank') into a band classifier that
    // dispatches the TOP tone band(s) to a chosen treatment. Only engaged when a
    // NON-'blank' treatment is supplied AND the sample sits in the highlight
    // band (opts.highlight.isHL(I)); everything else keeps the legacy drop, so
    // 'blank' output is byte-identical. keep/dashed/dotted/sparse/stippleOut are
    // handled per-line here; altFill/burst drop here and are filled by a
    // dedicated specular-region pass in the caller.
    const hl = (opts.highlight && opts.highlight.treatment && opts.highlight.treatment !== 'blank')
      ? opts.highlight : null;
    const hlIsHL = (hl && typeof hl.isHL === 'function') ? hl.isHL : () => false;
    const hlDensity = hl ? clamp(finite(hl.density, 25), 1, 100) : 25;
    // Deterministic 2D hash (mirrors geometry3d strokeHash) for stippleOut.
    const sfHash = (a, b) => {
      let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
      h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };

    // Push a run to `out`, tagging the array when it belongs to the back family.
    const pushRun = (run, back) => { if (run.length >= 2) { if (back) run.back = true; out.push(run); } };

    // Emit one iso-line: fixAxis 'b' ⇒ fix b, sweep a (meridian); 'a' ⇒ fix a,
    // sweep b (parallel). `threshold` is this line's ordered-dither cut (0..1) —
    // the sample draws only where the local shade (1 − I) meets it, so lines
    // vanish toward the lit highlight and pile up in shadow. `back` selects the
    // FAR side (camN.z < 0) instead of the visible front side, and tags the run.
    const emitLine = (fixAxis, fixVal, threshold, back, lineIndex, count) => {
      const wantFront = !back;
      let run = [];
      let hlRun = [];
      const flush = () => { pushRun(run, back); run = []; };
      // Highlight runs are tagged so the caller draws them dashed/dotted on the
      // highlight pen (dashed/dotted treatments).
      const flushHL = () => {
        if (hlRun.length >= 2) { hlRun.highlight = true; if (back) hlRun.back = true; out.push(hlRun); }
        hlRun = [];
      };
      // sparse: is THIS line kept in the highlight band? (every Nth by density).
      const sparseStep = hl ? Math.max(1, Math.round(100 / hlDensity)) : 1;
      const lineKept = !hl || (lineIndex % sparseStep === 0);
      for (let s = 0; s <= steps; s++) {
        const tt = s / steps;
        const smp = fixAxis === 'b' ? sampleAt(tt, fixVal) : sampleAt(fixVal, tt);
        if (!smp || smp.front !== wantFront) { flush(); flushHL(); continue; }
        if (toneOn) {
          const shade = clamp(1 - smp.I, 0, 1);
          if (shade < threshold) {
            // Ordered-dither drop zone. Legacy (no highlight, or not the
            // highlight band): drop = bare paper (byte-identical to pre-Phase-4).
            if (!hl || !hlIsHL(smp.I)) { flush(); flushHL(); continue; }
            const t = hl.treatment;
            if (t === 'keep') { flushHL(); run.push({ x: smp.x, y: smp.y, z: smp.z }); continue; }
            if (t === 'dashed' || t === 'dotted') { flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue; }
            if (t === 'sparse') {
              if (!lineKept) { flush(); flushHL(); continue; }
              flushHL(); run.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            if (t === 'stippleOut') {
              // Thin toward the hotspot: keep-probability rises with shade (away
              // from the glint), deterministic on the quantized screen point.
              const keepProb = clamp((hlDensity / 100) * (0.3 + shade * 2), 0, 1);
              if (sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) >= keepProb) { flush(); flushHL(); continue; }
              flushHL(); run.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            // altFill / burst: base fill drops here; a region pass fills it.
            flush(); flushHL(); continue;
          }
        }
        flushHL();
        run.push({ x: smp.x, y: smp.y, z: smp.z });
      }
      flush();
      flushHL();
    };

    const emitFamily = (fixAxis, count, back) => {
      for (let i = 0; i < count; i++) {
        const fixVal = (i + 0.5) / count;
        emitLine(fixAxis, fixVal, (i + 0.5) / count, back, i, count); // dark→dense ordered dither
      }
    };

    // Render one pass of the current mapper. `count` is the line/row budget
    // (reduced for the sparser back family) and `back` selects the far surface.
    // Returns false only for an unsupported mapper (so the front pass can bail).
    const runMapper = (count, back) => {
      const wantFront = !back;
      if (mapper === 'hatch') {
        emitFamily('b', count, back); // meridians wrap top-to-bottom
      } else if (mapper === 'crosshatch') {
        emitFamily('b', count, back);
        emitFamily('a', count, back); // + parallels
      } else if (mapper === 'contour') {
        emitFamily('a', count, back); // latitude rings following the form
      } else if (mapper === 'spiral') {
        // One continuous helix: a sweeps 0→1 across `count` turns while b advances.
        const turns = count;
        let run = [];
        const flush = () => { pushRun(run, back); run = []; };
        const total = steps * turns;
        for (let s = 0; s <= total; s++) {
          const tt = s / total;
          const smp = sampleAt(tt, (tt * turns) % 1);
          if (!smp || smp.front !== wantFront) { flush(); continue; }
          if (toneOn) { const shade = clamp(1 - smp.I, 0, 1); if (shade < 0.12) { flush(); continue; } }
          run.push({ x: smp.x, y: smp.y, z: smp.z });
        }
        flush();
      } else if (mapper === 'stipple') {
        // Dot lattice on the surface; a dot survives where local shade meets its
        // ordered-dither threshold (fewer dots toward the highlight). Each dot is a
        // small screen mark (a 0.01-unit marker would fall under the emitter's
        // MIN_RUN_MM floor and vanish). The DEFAULT ('dot', no dotSize) keeps the
        // legacy 6-segment R=0.7 ring exactly — a no-op default. Other shapes /
        // an explicit dotSize dispatch to the shared Mappers.stippleMark generator.
        const rows = count;
        const colsPer = Math.max(6, Math.round(count * 1.6));
        const legacyR = 0.7; // dot radius (screen units)
        const SEG = 6;
        const dotShape = typeof opts.dotShape === 'string' ? opts.dotShape : 'dot';
        const dotAngle = finite(opts.dotAngle, 0);
        const legacy = dotShape === 'dot' && !Number.isFinite(opts.dotSize);
        const R = Number.isFinite(opts.dotSize) ? clamp(opts.dotSize, 0.1, 3) : legacyR;
        const Marks = Vectura.Scene3D && Vectura.Scene3D.Mappers;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < colsPer; c++) {
            const smp = sampleAt((r + 0.5) / rows, (c + 0.5) / colsPer);
            if (!smp || smp.front !== wantFront) continue;
            if (toneOn) {
              const shade = clamp(1 - smp.I, 0, 1);
              const th = ((r * colsPer + c) % 7) / 7; // scattered dither
              if (shade < th) continue;
            }
            if (legacy || !Marks || typeof Marks.stippleMark !== 'function') {
              const ring = [];
              for (let k = 0; k <= SEG; k++) {
                const ang = (k / SEG) * Math.PI * 2;
                ring.push({ x: smp.x + Math.cos(ang) * R, y: smp.y + Math.sin(ang) * R, z: smp.z });
              }
              if (back) ring.back = true;
              out.push(ring);
            } else {
              Marks.stippleMark(dotShape, smp.x, smp.y, R, dotAngle).forEach((m) => {
                const mm = m.map((pt) => ({ x: pt.x, y: pt.y, z: smp.z }));
                if (back) mm.back = true;
                if (mm.length) out.push(mm);
              });
            }
          }
        }
      } else {
        return false; // unsupported mapper here
      }
      return true;
    };

    if (!runMapper(N, false)) return null; // front surface (unchanged when no x-ray)
    // X-ray back surface: sparser (count × backDensity) far-side family, tagged.
    if (xray) runMapper(Math.max(2, Math.round(N * backDensity)), true);
    return out;
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { SurfaceFill: { buildObject, chartFor, lineCountFor } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildObject, chartFor, lineCountFor };
  }
})();
