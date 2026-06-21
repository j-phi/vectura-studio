/**
 * halftone algorithm — "Dotscreen".
 *
 * A picture is sampled on a rotatable screen grid; each cell becomes a closed dot
 * (one of a dozen shapes) whose size grows with local darkness. The result is a
 * classic halftone screen rendered as pen-ready vector loops. Tone is shaped by
 * brightness / contrast / gamma / invert before dot sizing. The Tiling control
 * lays the screen on a square, brick-staggered or honeycomb (hex) lattice so
 * interlocking shapes — hexagons, triangles, packed circles — share edges instead
 * of sitting on a plain rectangular grid. Universal dot controls — Spin, Jitter,
 * Size Variance and Aspect — apply to every shape, breaking the mechanical
 * regularity of the screen. With no uploaded picture it screens the built-in
 * shaded sphere.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  const TAU = Math.PI * 2;

  // Every shape generator below builds a closed loop centred on the origin so the
  // caller can apply aspect-squash + translation uniformly. `rot` rotates the
  // shape (screen angle + per-dot spin); the trailing point repeats the first to
  // close the loop.
  const close = (pts) => { pts.push({ x: pts[0].x, y: pts[0].y }); return pts; };
  const pt = (r, a) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

  const circleLoop = (r, rot) => {
    const samples = clamp(Math.ceil((TAU * r) / 0.8), 10, 48);
    const pts = [];
    for (let i = 0; i < samples; i++) pts.push(pt(r, rot + (i / samples) * TAU));
    return close(pts);
  };

  const polyLoop = (r, sides, rot) => {
    const pts = [];
    for (let i = 0; i < sides; i++) pts.push(pt(r, rot + (i / sides) * TAU));
    return close(pts);
  };

  // Alternating outer/inner radii → an N-pointed star / spiky burst.
  const starLoop = (rOuter, rInner, points, rot) => {
    const n = points * 2;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(pt(i % 2 ? rInner : rOuter, rot + (i / n) * TAU));
    return close(pts);
  };

  // Square-toothed cog: each tooth holds the outer radius for half a segment then
  // drops to the inner radius for the gap.
  const gearLoop = (rOuter, rInner, teeth, rot) => {
    const seg = TAU / teeth;
    const pts = [];
    for (let i = 0; i < teeth; i++) {
      const a = rot + i * seg;
      pts.push(pt(rOuter, a));
      pts.push(pt(rOuter, a + seg * 0.5));
      pts.push(pt(rInner, a + seg * 0.5));
      pts.push(pt(rInner, a + seg));
    }
    return close(pts);
  };

  // Rose curve r = base·(0.5 + 0.5·cos(petals·θ)) → a smooth multi-lobe flower.
  const flowerLoop = (r, petals, rot) => {
    const samples = clamp(petals * 14, 36, 80);
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * TAU;
      const rr = r * (0.45 + 0.55 * Math.abs(Math.cos((petals / 2) * a)));
      pts.push(pt(rr, a + rot));
    }
    return close(pts);
  };

  // Plus / cross: arm half-length r, arm half-thickness t·r. 12 corners, rotated.
  const crossLoop = (r, t, rot) => {
    const b = t * r;
    const base = [
      [-b, -r], [b, -r], [b, -b], [r, -b], [r, b], [b, b],
      [b, r], [-b, r], [-b, b], [-r, b], [-r, -b], [-b, -b],
    ];
    const c = Math.cos(rot); const s = Math.sin(rot);
    const pts = base.map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }));
    return close(pts);
  };

  // Parametric heart, normalised so its bounding radius ≈ r (y flipped for screen).
  const heartLoop = (r, rot) => {
    const samples = 46;
    const k = r / 17;
    const c = Math.cos(rot); const s = Math.sin(rot);
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const t = (i / samples) * TAU;
      const hx = 16 * Math.pow(Math.sin(t), 3) * k;
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k;
      pts.push({ x: hx * c - hy * s, y: hx * s + hy * c });
    }
    return close(pts);
  };

  // Area-preserving circumradius for a regular n-gon: keeps a polygon's visual mass
  // equal to the circle of radius r regardless of side count (R → r as n → ∞).
  const polyCircum = (sides) => Math.sqrt(TAU / (sides * Math.sin(TAU / Math.max(3, sides))));

  // The five built-in shapes; polygon / star / gear / flower are parametric (their
  // side / point / cog / petal count is a separate control), replacing the old
  // fixed-shape zoo. Legacy shape ids from older files are remapped in generate().
  const SHAPES = new Set(['circle', 'polygon', 'star', 'gear', 'flower', 'cross', 'heart']);

  // Origin-centred dot loop for any shape. `n` carries the relevant count knob
  // (polygon sides / star points / gear teeth / flower petals). Polygons and stars
  // are oriented point-up by default; the caller's rotation rides on top.
  const dotLoop = (r, shape, rot, n) => {
    switch (shape) {
      case 'polygon': return polyLoop(r * polyCircum(n), n, rot - Math.PI / 2);
      case 'star': return starLoop(r * 1.4, r * (0.4 + 1.2 / n), n, rot - Math.PI / 2);
      case 'gear': return gearLoop(r * 1.18, r * 0.82, n, rot);
      case 'flower': return flowerLoop(r * 1.25, n, rot);
      case 'cross': return crossLoop(r * 1.25, 0.38, rot);
      case 'heart': return heartLoop(r * 1.15, rot);
      default: return circleLoop(r, rot);
    }
  };

  // Remap dot shapes saved by older versions onto the parametric scheme so legacy
  // .vectura files and presets keep rendering the shape they asked for.
  const LEGACY_SHAPES = {
    square: { shape: 'polygon', sides: 4, rot: Math.PI / 4 },
    diamond: { shape: 'polygon', sides: 4, rot: 0 },
    triangle: { shape: 'polygon', sides: 3, rot: 0 },
    pentagon: { shape: 'polygon', sides: 5, rot: 0 },
    hexagon: { shape: 'polygon', sides: 6, rot: 0 },
    octagon: { shape: 'polygon', sides: 8, rot: 0 },
    burst: { shape: 'star', points: 8, rot: 0 },
  };

  // Spatial ramp curves for the rotation / size offset dials. `t` is the dot's
  // normalised position (0..1) along the chosen offset direction.
  const ease = (name, t) => {
    switch (name) {
      case 'ease-in': return t * t;
      case 'ease-out': return t * (2 - t);
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'exponential': return (Math.exp(3 * t) - 1) / (Math.exp(3) - 1);
      default: return t; // linear
    }
  };

  // Decorrelated per-cell hash in [0,1) — stable regardless of which cells the
  // tone threshold skips, so jitter/size variance stay deterministic and the dots
  // don't reshuffle as White Cutoff changes.
  const hash01 = (ix, iy, k) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(k, 362437)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Smart Edges: union overlapping dots into clean merged outlines (so dense, dark
  // regions plot as solid blobs traced once, not hundreds of stacked overlapping
  // circles). Uses the bundled polygon-clipping engine. Each input dot is a closed
  // {x,y} loop → fed as a Polygon ([ring]); the union's every ring (exterior AND
  // holes) comes back as its own closed pen path. Returns null when clipping is
  // unavailable so the caller can fall back to raw dots.
  const MERGE_CAP = 5000; // bound the union cost; above this, keep raw dots
  const mergeDots = (loops) => {
    const pc = window.polygonClipping || (window.Vectura.FillBoolean && null);
    if (!pc || !pc.union || loops.length < 2 || loops.length > MERGE_CAP) return null;
    const polys = loops.map((loop) => [loop.map((pt) => [pt.x, pt.y])]);
    let result;
    try {
      result = pc.union(polys[0], ...polys.slice(1));
    } catch (e) {
      return null;
    }
    if (!Array.isArray(result)) return null;
    const merged = [];
    result.forEach((polygon) => {
      (polygon || []).forEach((ring) => {
        if (!Array.isArray(ring) || ring.length < 4) return;
        const path = ring.map(([x, y]) => ({ x, y }));
        path.meta = { algorithm: 'halftone', straight: true, closed: true };
        merged.push(path);
      });
    });
    return merged.length ? merged : null;
  };

  // Universal Fill: pattern the interior of each (open-outline) dot with the shared
  // fill library — hatch / crosshatch / spiral / radial / dots / wave. Mirrors the
  // spiralizer marker-fill bridge: the panel's `fill<Prop>` params are mapped onto
  // the generator's bare `<prop>` keys and the dot's polygon is the fill region.
  const buildFillArg = (p, region) => {
    const arg = { region, fillType: p.markerFill };
    Object.keys(p).forEach((k) => {
      if (k.length > 4 && k.slice(0, 4) === 'fill') {
        arg[k.charAt(4).toLowerCase() + k.slice(5)] = p[k];
      }
    });
    return arg;
  };
  const fillDot = (p, region) => {
    if (!region || (p.markerFill || 'none') === 'none') return [];
    const reg = window.Vectura.AlgorithmRegistry;
    const gen = reg && reg._generatePatternFillPaths;
    if (typeof gen !== 'function') return [];
    let out;
    try {
      out = gen(buildFillArg(p, region)) || [];
    } catch (err) {
      out = [];
    }
    return (out || []).filter((pp) => Array.isArray(pp) && pp.length >= 2);
  };

  window.Vectura.AlgorithmRegistry.halftone = {
    generate: (p, rng, noise, bounds) => {
      const IS = Vectura.ImageSource;
      if (!IS) return [];
      // Re-hydrate a persisted picture after reload (async; falls back until ready).
      IS.ensure(p, () => { try { Vectura.appInstance && Vectura.appInstance.regen && Vectura.appInstance.regen(); } catch (e) {} });
      const luma = IS.resolveLuma(p);

      const { m, dW, dH } = bounds;
      // Fit the picture into the display frame preserving aspect ("contain").
      const aspect = IS.aspect(p);
      let rectW = dW; let rectH = dW / aspect;
      if (rectH > dH) { rectH = dH; rectW = dH * aspect; }
      const cx = m + dW / 2; const cy = m + dH / 2;
      const halfW = rectW / 2; const halfH = rectH / 2;

      const spacing = Math.max(0.4, finite(p.dotSpacing, 4.8));
      const maxD = Math.max(0, finite(p.maxDotSize, 4.2));
      const minD = clamp(finite(p.minDotSize, 0), 0, maxD);
      const threshold = clamp(finite(p.dotThreshold, 4) / 100, 0, 0.99);
      const angle = (finite(p.gridAngle, 0) * Math.PI) / 180;
      const cos = Math.cos(angle); const sin = Math.sin(angle);
      const maxDots = Math.max(50, Math.round(finite(p.maxDots, 6000)));

      // Resolve the dot shape, remapping legacy ids onto the parametric scheme.
      const legacy = LEGACY_SHAPES[p.dotShape];
      const shape = legacy ? legacy.shape : (SHAPES.has(p.dotShape) ? p.dotShape : 'circle');
      const legacyRot = legacy ? legacy.rot : 0;
      // The count knob, per shape: polygon sides / star points / gear teeth / flower petals.
      let count = 6;
      if (shape === 'polygon') count = Math.round(clamp(finite(legacy ? legacy.sides : p.dotSides, 6), 3, 24));
      else if (shape === 'star') count = Math.round(clamp(finite(legacy ? legacy.points : p.dotPoints, 5), 3, 24));
      else if (shape === 'gear') count = Math.round(clamp(finite(p.dotTeeth, 8), 3, 36));
      else if (shape === 'flower') count = Math.round(clamp(finite(p.dotPetals, 5), 2, 16));

      // Universal dot controls. Rotation carries a base value plus a spatial offset
      // that ramps across the screen along a 360° direction dial, by an amount,
      // following an easing curve. At defaults the classic screen is untouched.
      // Jitter (position) and Aspect (squash) round out the set. Dot size is owned
      // entirely by Max/Min Dot + tone — there is no separate size control here.
      const baseSpin = (finite(p.dotSpin, 0) * Math.PI) / 180 + legacyRot;
      const spinAmount = (finite(p.dotSpinAmount, 0) * Math.PI) / 180; // offset magnitude
      const spinDir = (finite(p.dotSpinDir, 0) * Math.PI) / 180; // 360° dial
      const spinCurve = p.dotSpinCurve || 'linear';
      const jitter = clamp(finite(p.dotJitter, 0) / 100, 0, 1) * spacing * 0.5; // max offset
      const dotAspect = clamp(finite(p.dotAspect, 1), 0.25, 4); // width : height stretch
      const sx = Math.sqrt(dotAspect); const sy = 1 / Math.sqrt(dotAspect); // area-preserving

      // Normalised position (0..1) of a point along the rotation offset direction.
      const spinDX = Math.cos(spinDir); const spinDY = Math.sin(spinDir);
      const rampT = (lx, ly, dx, dy) => {
        const projMax = halfW * Math.abs(dx) + halfH * Math.abs(dy) || 1;
        return clamp((lx * dx + ly * dy + projMax) / (2 * projMax), 0, 1);
      };

      // Interlocking lattice. `square` is the classic rectangular screen. `brick`
      // staggers every other row by half a cell. `hex` staggers AND compresses the
      // row pitch to √3⁄2, so dot centres sit on a triangular lattice and grown
      // neighbours share full edges — a honeycomb for hexagons, the densest packing
      // for circles. Mirrors the shared brick/hex tiling convention (row offset =
      // row%2 · ½ pitch, hex row pitch = √3⁄2) used across the tiling algorithms
      // (raster-plane / topo / spiral …) so the screen tessellates the same way.
      const gridMode = (p.dotGrid === 'hex' || p.dotGrid === 'brick') ? p.dotGrid : 'square';
      const rowPitch = gridMode === 'hex' ? spacing * (Math.sqrt(3) / 2) : spacing;

      const fillable = (p.markerFill || 'none') !== 'none';
      const boundsRadius = Math.hypot(halfW, halfH);
      const gridMin = -boundsRadius - spacing;
      const gridMax = boundsRadius + spacing;

      const paths = [];
      const fills = []; // interior fill lines, kept apart so Smart-Edges only unions dots
      let iy = 0;
      for (let gy = gridMin; gy <= gridMax; gy += rowPitch, iy++) {
        // Half-cell stagger on odd rows for brick/hex; square rows stay aligned.
        const rowOffset = gridMode === 'square' ? 0 : (iy & 1) * spacing * 0.5;
        let ix = 0;
        for (let gx = gridMin; gx <= gridMax; gx += spacing, ix++) {
          // Rotate the lattice (incl. its stagger) by the screen angle, keep cells in rect.
          const sgx = gx + rowOffset;
          const localX = sgx * cos - gy * sin;
          const localY = sgx * sin + gy * cos;
          if (localX < -halfW || localX > halfW || localY < -halfH || localY > halfH) continue;
          const u = (localX + halfW) / rectW;
          const v = (localY + halfH) / rectH;
          const darkness = 1 - luma(u, v);
          if (darkness <= threshold) continue;
          const tone = clamp((darkness - threshold) / Math.max(1e-3, 1 - threshold), 0, 1);
          const r = (minD + (maxD - minD) * Math.sqrt(tone)) * 0.5;
          if (r <= 0.05) continue;
          // Per-dot rotation: screen angle + base spin + directional spin ramp.
          let rot = angle + baseSpin;
          if (spinAmount !== 0) rot += spinAmount * ease(spinCurve, rampT(localX, localY, spinDX, spinDY));
          // Per-dot positional jitter, decorrelated per cell.
          let dx = cx + localX; let dy = cy + localY;
          if (jitter > 0) {
            dx += (hash01(ix, iy, 1) * 2 - 1) * jitter;
            dy += (hash01(ix, iy, 2) * 2 - 1) * jitter;
          }
          const loop = dotLoop(r, shape, rot, count);
          // Aspect-squash about the dot centre, then translate into place.
          for (let k = 0; k < loop.length; k++) {
            loop[k].x = dx + loop[k].x * sx;
            loop[k].y = dy + loop[k].y * sy;
          }
          loop.meta = { algorithm: 'halftone', straight: true, closed: true };
          paths.push(loop);
          // Pattern the dot interior with the universal Fill library. Skip sub-mm
          // dots (hatching them is pointless and explodes the path count on fine
          // screens, which naturally bounds the cost when fill is enabled).
          if (fillable && r >= 0.6) {
            fillDot(p, loop).forEach((fp) => {
              fp.meta = { algorithm: 'halftone', markerFill: true };
              fills.push(fp);
            });
          }
          if (paths.length >= maxDots) break;
        }
        if (paths.length >= maxDots) break;
      }
      // Smart Edges merges overlapping dot outlines into single traced loops; any
      // interior fill lines ride along unchanged.
      if (p.smartEdges) {
        const merged = mergeDots(paths);
        if (merged) return fills.length ? merged.concat(fills) : merged;
      }
      return fills.length ? paths.concat(fills) : paths;
    },
    formula: () => 'dot Ø = f(√darkness) on a rotatable screen grid',
  };
})();
