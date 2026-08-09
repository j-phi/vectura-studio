/**
 * Scene3D.Lighting + Scene3D.Regions — Phase 2 light-made tone (spec §3.2, §7
 * group E). Pure/deterministic: no randomness, same inputs → same output.
 *
 * Lighting.lightWorldDir(light) is the SINGLE source of the sun's world-space
 * travel vector (CONTRACT L1). Both streams call it (2B's sun widget/drag and
 * 2A's shadow projection) so the overlay and the shadows always agree.
 *
 *   azimuth  (deg): sun bearing, 0° = world +Z, 90° = world +X.
 *   elevation(deg): 0° = horizon, 90° = straight overhead.
 *   toward-sun  L = ( cosEl·sinAz,  sinEl,  cosEl·cosAz )   (points at the sun)
 *   travel      d = −L = (−cosEl·sinAz, −sinEl, −cosEl·cosAz)  (d.y < 0, el > 0)
 *
 * Regions quantizes the Lambert intensity I = max(0, n̂·L̂) into a tone band
 * (thresholds) → coverage (ladder) → hatch spacing (coverageToSpacing), and
 * builds the specular hotspot (the one iso-band exemption, spec group E).
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const clamp = G3.clamp || ((value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)));
  const v = G3.v || ((x, y, z) => ({ x, y, z }));
  const mul = G3.mul || ((a, s) => v(a.x * s, a.y * s, a.z * s));
  const sub = G3.sub || ((a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z));
  const dot = G3.dot || ((a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
  const normalize = G3.normalize || ((a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  });
  const rotatePoint = G3.rotatePoint;
  const projectPoint = G3.projectPoint;
  const circlePath = G3.circlePath;
  const DEG = Math.PI / 180;

  // ── Lighting (CONTRACT L1) ──────────────────────────────────────────────────

  // World-space TRAVEL direction of the sunlight (points away from the sun,
  // into the scene). Unit length; d.y < 0 for any elevation above the horizon.
  const lightWorldDir = (light) => {
    const src = light || {};
    const az = finite(src.azimuth, 135) * DEG;
    const el = finite(src.elevation, 45) * DEG;
    const cosEl = Math.cos(el);
    // travel = −(toward-sun)
    return normalize(v(-cosEl * Math.sin(az), -Math.sin(el), -cosEl * Math.cos(az)));
  };

  // Inverse of lightWorldDir: a travel vector → {azimuth, elevation} (degrees).
  // 2B may use this when a drag hands back a direction rather than angles.
  const lightFromDir = (dir) => {
    const d = dir || {};
    // toward-sun = −travel
    const sx = -finite(d.x, 0);
    const sy = -finite(d.y, -1);
    const sz = -finite(d.z, 0);
    const len = Math.hypot(sx, sy, sz) || 1;
    const ny = clamp(sy / len, -1, 1);
    return {
      azimuth: (Math.atan2(sx, sz) / DEG + 360) % 360,
      elevation: Math.asin(ny) / DEG,
    };
  };

  // Unit vector pointing TOWARD the light (the Lambert L̂), = −travel.
  const towardLight = (light) => normalize(mul(lightWorldDir(light), -1));

  const Lighting = { lightWorldDir, lightFromDir, towardLight };

  // ── Regions (tone banding) ──────────────────────────────────────────────────

  // Coerce the 2nd argument of intensity() into a unit toward-light vector:
  // accepts a light record ({azimuth,elevation}) OR a precomputed L̂ vector
  // (so the face loop can hoist towardLight() out of the hot path).
  const asLightVec = (arg) => {
    if (arg && (typeof arg.azimuth === 'number' || typeof arg.elevation === 'number')) return towardLight(arg);
    if (arg && Number.isFinite(arg.x) && Number.isFinite(arg.y) && Number.isFinite(arg.z)) return normalize(arg);
    return v(0, 1, 0);
  };

  // Lambert intensity of a world normal under the light: I = max(0, n̂·L̂).
  const intensity = (normalWorld, arg) => {
    const L = asLightVec(arg);
    const n = normalize(normalWorld || v(0, 0, 1));
    return Math.max(0, dot(n, L));
  };

  // Hermite smoothstep: 0 below edge0, 1 above edge1, smooth in between.
  const smoothstep = (edge0, edge1, x) => {
    const denom = (edge1 - edge0) || 1e-9;
    const t = clamp((x - edge0) / denom, 0, 1);
    return t * t * (3 - 2 * t);
  };

  // LINEAR distance falloff for a positional (point/spot) light, with a SOFT
  // FLOOR tail past `range` (spec §3.2, positional-light polish):
  //   in-range core  (lin ≥ FLOOR):  atten = clamp(1 − dist/range, 0, 1) — the
  //                                   EXACT linear ramp (unchanged);
  //   tail (lin < FLOOR): atten = FLOOR · (1 − smoothstep) decaying FLOOR→0 over
  //                       an extra range·TAIL beyond the bulb's reach.
  // Why: a plain hard clamp drops to 0 AT range, so a still-lit surface just past
  // it collapses into the darkest tone band — visually identical to a back-face,
  // reading as an abrupt black edge. The floor keeps a faint, monotonically
  // decaying tone across that boundary so the transition is graceful, not a
  // cliff. Continuity: at the crossover (lin = FLOOR) both branches return FLOOR;
  // the tail is non-increasing, so a nearer fragment is still never darker.
  // Chosen over inverse-square deliberately: the tests (and a plotter tone ramp)
  // want a monotonic, legible near→far decay across the whole scene, not a spike
  // that saturates near the bulb and vanishes a few mm out.
  const ATTEN_FLOOR = 0.05; // faint tone a still-lit past-range surface retains
  const ATTEN_TAIL = 0.5;   // tail length as a fraction of range (FLOOR→0 span)
  const positionalAtten = (dist, range) => {
    const r = finite(range, 0);
    if (!(r > 0)) return 1;
    const lin = 1 - dist / r;
    if (lin >= ATTEN_FLOOR) return clamp(lin, 0, 1); // in-range core: exact linear
    const over = clamp((dist - r) / (r * ATTEN_TAIL), 0, 1); // 0 at range → 1 at tail end
    return ATTEN_FLOOR * (1 - over * over * (3 - 2 * over));
  };

  // Deterministic Fibonacci-sphere sub-sample offsets for an AREA light: N unit
  // points spread evenly on a sphere shell of the given radius (golden-angle
  // spiral — NO RNG, so the same scene is byte-identical across regens). The
  // 3D spread makes each sub-sample see the surface point from a slightly
  // different direction; averaging their Lambert terms yields a softer, non-zero
  // terminator (a hard point light clamps to 0 the instant n·L crosses 0).
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const areaSampleOffset = (i, n, radius) => {
    const y = 1 - ((i + 0.5) / n) * 2;          // 1 → −1
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    return v(Math.cos(theta) * rr * radius, y * radius, Math.sin(theta) * rr * radius);
  };

  // Combined intensity of a world normal AT a world point under a LIST of lights
  // (multi-light, spec §3.2 group G):
  //   ambient      → += intensity (flat fill; point-independent);
  //   directional  → += max(0, n̂·L̂) · intensity (Lambert; point-independent);
  //   point        → dir = normalize(position − worldPoint);
  //                  += max(0, n̂·dir) · intensity · atten(dist,range);
  //   spot         → the point term × a smoothstep cone gate: with
  //                  axis = normalize(target − position) and
  //                  toFrag = normalize(worldPoint − position),
  //                  factor = smoothstep(cos(cone+penumbra), cos(cone), toFrag·axis)
  //                  (1 inside the cone, soft across the penumbra, 0 outside).
  // The total is clamped to [0,1] so tone banding stays well-defined. A lone
  // directional sun with intensity 1 and no ambient reduces EXACTLY to
  // `intensity()` (Phase-2 regression safety). Unknown future light types shade
  // as directional in v1. `worldPoint` is only consulted by positional lights;
  // a missing point defaults to the origin (harmless for direction-only lights).
  const combinedIntensity = (normalWorld, worldPoint, lights) => {
    const list = Array.isArray(lights) ? lights : (lights ? [lights] : []);
    const n = normalize(normalWorld || v(0, 0, 1));
    const P = worldPoint && Number.isFinite(worldPoint.x) && Number.isFinite(worldPoint.y) && Number.isFinite(worldPoint.z)
      ? worldPoint : v(0, 0, 0);
    let total = 0;
    for (let i = 0; i < list.length; i++) {
      const light = list[i];
      if (!light) continue;
      const weight = finite(light.intensity, 1);
      const type = light.type;
      if (type === 'ambient') { total += weight; continue; }
      if (type === 'area') {
        // Average N deterministic point-light sub-samples spread across the
        // emitter's extent. No distance range (softness, not falloff) → each
        // sub-sample is a pure Lambert term; the average softens the terminator.
        const pos = light.position || v(0, 0, 0);
        const radius = Math.max(0, finite(light.size, 120) / 2);
        const N = clamp(Math.round(finite(light.samples, 6)), 2, 16);
        let sum = 0;
        for (let s = 0; s < N; s++) {
          const off = areaSampleOffset(s, N, radius);
          const toL = sub(v(pos.x + off.x, pos.y + off.y, pos.z + off.z), P);
          const dist = Math.hypot(toL.x, toL.y, toL.z);
          const dir = dist > 1e-9 ? mul(toL, 1 / dist) : v(0, 1, 0);
          sum += Math.max(0, dot(n, dir));
        }
        total += (sum / N) * weight;
        continue;
      }
      if (type === 'point' || type === 'spot') {
        const pos = light.position || v(0, 0, 0);
        const toL = sub(pos, P);
        const dist = Math.hypot(toL.x, toL.y, toL.z);
        const dir = dist > 1e-9 ? mul(toL, 1 / dist) : v(0, 1, 0);
        let contrib = Math.max(0, dot(n, dir)) * weight * positionalAtten(dist, light.range);
        if (type === 'spot' && contrib > 0) {
          const target = light.target || v(0, 0, 0);
          const axis = normalize(sub(target, pos));
          const toFrag = dist > 1e-9 ? mul(toL, -1 / dist) : v(0, -1, 0); // normalize(P − pos)
          const cosA = dot(toFrag, axis);
          const cone = finite(light.coneAngle, 30);
          const pen = finite(light.penumbra, 8);
          const inner = Math.cos(cone * DEG);
          const outer = Math.cos((cone + pen) * DEG);
          contrib *= smoothstep(outer, inner, cosA);
        }
        total += contrib;
        continue;
      }
      total += Math.max(0, dot(n, towardLight(light))) * weight;
    }
    return clamp(total, 0, 1);
  };

  const validLadder = (tone) => {
    const ladder = tone && Array.isArray(tone.ladder) ? tone.ladder.filter((c) => Number.isFinite(c)) : [];
    return ladder.length ? ladder : [0.5];
  };

  const validThresholds = (tone) => (tone && Array.isArray(tone.thresholds)
    ? tone.thresholds.filter((t) => Number.isFinite(t))
    : []);

  // Quantize intensity I∈[0,1] → band index. Band count is the ladder length
  // (the reader trusts the ladder, tolerating a thresholds/bands length that a
  // hand-edited tone left inconsistent). Higher I → higher band index.
  const band = (I, tone) => {
    const nB = validLadder(tone).length;
    const th = validThresholds(tone);
    const cuts = Math.min(th.length, nB - 1);
    let idx = 0;
    for (let k = 0; k < cuts; k++) {
      if (finite(I, 0) >= th[k]) idx = k + 1;
    }
    return clamp(idx, 0, nB - 1);
  };

  // Coverage fraction (0..1) for a band index, dark→light along the ladder.
  const coverageFor = (bandIndex, tone) => {
    const ladder = validLadder(tone);
    const i = clamp(Math.round(finite(bandIndex, 0)), 0, ladder.length - 1);
    return clamp(finite(ladder[i], 0.5), 0, 1);
  };

  // Coverage → hatch spacing (document mm). Denser coverage → tighter lines;
  // floored at the pen width so a fill never asks for lines finer than the pen.
  const coverageToSpacing = (coverage, penWidth) => {
    const pw = Math.max(0.05, finite(penWidth, 0.3));
    const cov = clamp(finite(coverage, 0.5), 0.02, 1);
    return Math.max(pw, pw / cov);
  };

  // Whole-normal → spacing in one call (band → coverage → spacing).
  const spacingFor = (normalWorld, lightVec, tone, penWidth) => {
    const I = intensity(normalWorld, lightVec);
    return coverageToSpacing(coverageFor(band(I, tone), tone), penWidth);
  };

  // Swatch helper (E-06): the full band ladder as {band, coverage, spacing},
  // dark→light, for a given pen width. Pure — drives a UI preview strip.
  const toneLadder = (tone, penWidth) => validLadder(tone).map((coverage, i) => ({
    band: i,
    coverage: clamp(finite(coverage, 0.5), 0, 1),
    spacing: coverageToSpacing(coverage, penWidth),
  }));

  // Specular hotspot CENTER + radius for a record (Phase 4 highlight sub-region;
  // spec group E, the one iso-band exemption). Reuses the topoform half-vector
  // recipe in CAMERA space: the mirror normal H = normalize(L_cam + V) with
  // V = +z (toward viewer); the front face whose camera normal best aligns with
  // H carries the highlight. Returns { cx, cy, radius, face, faceId, depth,
  // normal } or null (no lit front face). UNLIKE specularRegion this does NOT
  // gate on spec.enabled/size — the highlight sub-region is used by highlight
  // treatments even when the retired specular disc is off; size only scales the
  // radius (defaults to 1 when unset), so a burst/altFill still has a region.
  const specularHotspot = (record, camAngles, toneSpec, light) => {
    const spec = toneSpec || {};
    const size = Math.max(0, finite(spec.size, 0));
    // O16 — `specular.enabled: false` must really disable it. The hotspot used to
    // ignore the flag so `burst` and `altFill` kept firing after specular was
    // switched off, which reads as a broken toggle.
    if (spec.enabled === false) return null;
    if (!record || !Array.isArray(record.faces) || !rotatePoint) return null;
    const Lcam = normalize(rotatePoint(towardLight(light), camAngles || { yaw: 0, pitch: 0, roll: 0 }));
    const H = normalize(v(Lcam.x, Lcam.y, Lcam.z + 1)); // + view direction (+z)
    let best = null;
    let bestDot = 0.0; // require a positively-aligned front face (unlit → null)
    record.faces.forEach((face) => {
      if (!face || !face.front || !face.normalCam) return;
      const n = normalize(face.normalCam);
      const d = n.x * H.x + n.y * H.y + n.z * H.z;
      if (d > bestDot) { bestDot = d; best = face; }
    });
    if (!best || !Array.isArray(best.polygon) || !best.polygon.length) return null;
    let cx = 0; let cy = 0; let count = 0;
    best.polygon.forEach((pt) => {
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) { cx += pt.x; cy += pt.y; count += 1; }
    });
    if (!count) return null;
    cx /= count; cy /= count;
    // Radius scales with the object's projected extent so it reads at any zoom.
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    (record.projected || []).forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    });
    const diag = Number.isFinite(minX) ? (Math.hypot(maxX - minX, maxY - minY) || 1) : 1;
    const radius = Math.max(0.8, diag * 0.05 * clamp(size > 0 ? size : 1, 0, 20));
    return {
      cx,
      cy,
      radius,
      face: best,
      faceId: best.faceId || null,
      depth: finite(best.centroidZ, 0),
      normal: best.normalWorld || v(0, 0, 1),
      projBounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
    };
  };

  // Specular hotspot for a curved record as a filled ring path (spec group E).
  // Retired from the render pipeline (the blank band IS the highlight) but kept
  // for reference/reuse — now delegates the hotspot find to specularHotspot.
  // Returns a filled ring path (meta.fill) or null (off, unlit, size 0).
  const specularRegion = (record, camAngles, toneSpec, light) => {
    const spec = toneSpec || {};
    const size = Math.max(0, finite(spec.size, 0));
    if (spec.enabled === false || size <= 0) return null;
    if (!circlePath) return null;
    const hs = specularHotspot(record, camAngles, toneSpec, light);
    if (!hs) return null;
    const cx = hs.cx; const cy = hs.cy; const radius = hs.radius; const best = hs.face;
    const normal = hs.normal;
    const path = circlePath(cx, cy, radius, 28, {
      algorithm: 'scene3d',
      kind: 'sceneFill',
      fill: true,
      specular: true,
      sceneTarget: {
        objectId: record.id,
        faceId: best.faceId || null,
        edgeClass: null,
        regionClass: 'specular',
        depth: -finite(best.centroidZ, 0),
        normal: { x: normal.x, y: normal.y, z: normal.z },
        facingUp: normal.y > 0.7,
        occluded: false,
      },
    });
    return path && path.length >= 3 ? path : null;
  };

  // ── Light-driven highlight/shadow (I8) ──────────────────────────────────────
  // A PER-SAMPLE specular term reusing specularHotspot's half-vector recipe but
  // evaluated at each surface sample (not one lit face). S = (max(0, n̂·Ĥ))^shin
  // in CAMERA space, combined across a light list by taking the brightest
  // reflection (a highlight is one glint, not a sum). worldPoint is consulted by
  // positional lights (their L direction varies across a face → a point light
  // near a cube corner lights BOTH adjacent faces there, so S>0 spans the two
  // faces = the semicircular cross-face highlight). Deterministic (no RNG).
  const specularTerm = (normalWorld, worldPoint, lights, camAngles, shininess) => {
    if (!rotatePoint) return 0;
    const cam = camAngles || { yaw: 0, pitch: 0, roll: 0 };
    const nCam = normalize(rotatePoint(normalize(normalWorld || v(0, 0, 1)), cam));
    const P = (worldPoint && Number.isFinite(worldPoint.x) && Number.isFinite(worldPoint.y) && Number.isFinite(worldPoint.z))
      ? worldPoint : v(0, 0, 0);
    const list = Array.isArray(lights) ? lights : (lights ? [lights] : []);
    const sh = Math.max(1, finite(shininess, 24));
    let best = 0;
    for (let i = 0; i < list.length; i++) {
      const light = list[i];
      if (!light || light.type === 'ambient') continue;
      let Lworld;
      if (light.type === 'point' || light.type === 'spot' || light.type === 'area') {
        const pos = light.position || v(0, 0, 0);
        const to = sub(pos, P);
        const d = Math.hypot(to.x, to.y, to.z);
        Lworld = d > 1e-9 ? mul(to, 1 / d) : v(0, 1, 0);
      } else {
        Lworld = towardLight(light);
      }
      const Lcam = normalize(rotatePoint(Lworld, cam));
      const H = normalize(v(Lcam.x, Lcam.y, Lcam.z + 1)); // + view direction (+z)
      const dHN = Math.max(0, nCam.x * H.x + nCam.y * H.y + nCam.z * H.z);
      const s = Math.pow(dHN, sh);
      if (s > best) best = s;
    }
    return clamp(best, 0, 1);
  };

  // ── FORM ZONES (design spec §5.1–§5.3) ─────────────────────────────────────
  //
  // The object's own shading is a SIX-zone ladder, and its defining feature is
  // that the ladder is NOT monotonic in "how far the surface has turned from the
  // light":
  //
  //     H(0)   L(light)   M(halftone)   T(terminator)   F(form)   R(reflected)
  //                                          ▲             ▼          ▼
  //                                       DARKEST       LIGHTER   LIGHTER STILL
  //
  // T > F > R is the whole effect. A naive "darker as it turns away" ramp gives
  // T ≤ F ≤ R and the form reads as a flat disc with a dirty edge.
  //
  // Two facts make the dip impossible to express with `band()` alone:
  //
  //   - Lambert is CLAMPED (`max(0, n·L)`), so every surface past the terminator
  //     collapses onto I = 0 → band 0. T, F and R are all the same number and no
  //     threshold can separate them. The SIGNED lambert has to be recovered.
  //   - Nothing in the codebase ever produced a reflected/bounce term, so the
  //     away-facing rim fell to a hard 0 with no floor. The one 'ambient' light
  //     type lifts every normal EQUALLY, so it cannot make a rim by construction.
  //
  // So this classifier keeps `band()` untouched for the LIT gradation and
  // subdivides the darkest band by signed lambert + a bounce term. Both fill
  // implementations call it, which is what keeps a cube and a sphere under one
  // light in the same zones (the I27 parity contract, §5.5.3).
  const FORM_ZONES = ['H', 'L', 'M', 'T', 'F', 'R'];

  // SIGNED lambert against whichever light dominates: > 0 lit, < 0 past the
  // terminator, and — unlike `intensity()` — it keeps going negative so "how far
  // past the terminator" is measurable. Ambient lights are skipped (they have no
  // direction and therefore no terminator).
  const signedLambert = (normalWorld, worldPoint, lights) => {
    const list = Array.isArray(lights) ? lights : (lights ? [lights] : []);
    const n = normalize(normalWorld || v(0, 0, 1));
    const P = worldPoint && Number.isFinite(worldPoint.x) ? worldPoint : v(0, 0, 0);
    let best = -1;
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const light = list[i];
      if (!light || light.type === 'ambient') continue;
      let L;
      if (light.type === 'point' || light.type === 'spot' || light.type === 'area') {
        const pos = light.position || v(0, 0, 0);
        const to = sub(pos, P);
        const d = Math.hypot(to.x, to.y, to.z);
        L = d > 1e-9 ? mul(to, 1 / d) : v(0, 1, 0);
      } else {
        L = towardLight(light);
      }
      const d = dot(n, L);
      if (!any || d > best) { best = d; any = true; }
    }
    return any ? clamp(best, -1, 1) : 0;
  };

  // Reflected/bounce lift (§5.2). Bounce comes UP off the ground, so the
  // surfaces that catch it are the ones facing DOWN (−N.y), and it dies off over
  // roughly one object height. `ground` = { y0, height } in world units — the
  // object's own footing, so a floating object does not collect bounce it cannot
  // physically receive. Returns 0..1; the caller gates it to the unlit side.
  const reflectedLift = (normalWorld, worldPoint, ground) => {
    const n = normalize(normalWorld || v(0, 1, 0));
    const down = Math.max(0, -n.y);
    if (down <= 0) return 0;
    const g = ground || {};
    const h = Math.max(1e-6, finite(g.height, 0));
    if (!(h > 1e-6)) return down;
    const P = worldPoint && Number.isFinite(worldPoint.y) ? worldPoint : v(0, 0, 0);
    const prox = clamp(1 - (P.y - finite(g.y0, 0)) / h, 0, 1);
    return down * prox;
  };

  // Terminator half-width, expressed in SIGNED-LAMBERT units. Near the
  // terminator of a curved form nl ≈ −Δθ and the screen arc ≈ R·Δθ, so a band
  // 8–14% of the form's screen width (2R) is nl ∈ [−0.28, 0). 0.22 sits inside
  // that window and is deliberately a constant: it is a property of how a
  // terminator looks, not a dial (§5.1).
  const TERMINATOR_NL = 0.22;
  // A rim only reads as reflected light once it is decisively down-facing AND
  // close to the ground; below this the facet stays in the form shadow.
  const REFLECT_TH = 0.30;

  // formZone(normalWorld, worldPoint, ctx) → one of FORM_ZONES.
  //   ctx: { tone, lights, ground:{y0,height}, terminator (bool override),
  //          terminatorNL, highlight (bool: this sample carries the glint) }
  // `terminator` is the FACETED override: on a facet the terminator is
  // topological (unlit + shares a SMOOTH edge with a lit facet, §5.5.2) and the
  // dihedral gate is what stops a cube from growing a bogus core shadow, so the
  // faceted caller decides and this function must not second-guess it.
  //
  // §5.3 — T and R only exist at bands = 4. That is what `bands = 4` is FOR, and
  // it is how "2 → 3 → 4 adds bands" stays legible: 2 gives L∪M / T∪F, 3 splits
  // L from M, 4 opens the dip and the reflected rim.
  const formZone = (normalWorld, worldPoint, ctx) => {
    const c = ctx || {};
    const tone = c.tone || null;
    const nB = validLadder(tone).length;
    if (c.highlight === true) return 'H';
    const I = combinedIntensity(normalWorld, worldPoint, c.lights);
    const b = band(I, tone);
    if (b > 0) return b >= nB - 1 ? 'L' : 'M';
    if (nB < 4) return 'F';                       // no room in the ladder for the dip
    if (c.terminator === true) return 'T';
    if (c.terminator === false) {
      // Facet path: the dihedral gate already ruled this facet out of T. It may
      // still catch bounce.
      return reflectedLift(normalWorld, worldPoint, c.ground) >= REFLECT_TH ? 'R' : 'F';
    }
    const nl = signedLambert(normalWorld, worldPoint, c.lights);
    const w = clamp(finite(c.terminatorNL, TERMINATOR_NL), 0.02, 0.9);
    if (nl >= -w) return 'T';
    return reflectedLift(normalWorld, worldPoint, c.ground) >= REFLECT_TH ? 'R' : 'F';
  };

  // Zone → INK RECIPE, in units of "one full family at the master pitch".
  //
  //   coverage  fraction of the master grid family A keeps (0..1)
  //   cross     coverage of a SECOND family, at +65° (0 = none)
  //   duty      dash duty cycle on family A (1 = solid)
  //
  // §5.0 states the ceiling plainly: the ladder alone tops out at 1.6× gain and
  // the span this design needs is ~8:1, so **the dark end has to gain a crossed
  // family**. That is the only way T clears F, and it is the same craft rule as
  // §0 — past the spacing floor, density spills into another DIRECTION.
  //
  // +65°, never +90°: an orthogonal second family reads as a square grid / wire
  // mesh and beats against the raster (§2.3).
  const CROSS_OBJ_DEG = 65;
  const FORM_INK = {
    H: { coverage: 0.00, cross: 0, duty: 1 },
    L: { coverage: 0.42, cross: 0, duty: 1 },
    M: { coverage: 0.70, cross: 0, duty: 1 },
    F: { coverage: 1.00, cross: 0, duty: 1 },
    T: { coverage: 1.00, cross: 0.85, duty: 1 },
    R: { coverage: 0.45, cross: 0, duty: 0.7 },
  };
  const formInk = (zone) => FORM_INK[zone] || FORM_INK.M;

  // Specular exponent for a highlight `size` (bigger size → broader/softer glint
  // → lower exponent → the lit region spans more of the surface). Deliberately
  // soft (size 1 → ~6) so the light-driven glint reads as a semicircular REGION
  // spanning adjacent faces, not a pinpoint. Deterministic.
  const shininessForSize = (size) => clamp(5 / Math.max(0.35, finite(size, 1)), 1.4, 20);

  // Light-driven highlight staging. Given a specular term S and a sensitivity
  // stage count, classify the sample: LOW (sensitivity 1) → one BINARY region
  // (openness 1 everywhere the sample is lit → the whole region is treated
  // uniformly, "lines merely differ"); HIGH (N) → N graded stages where the
  // brightest sample (S→1) is the MOST open (blank/sparsest glint) and the dim
  // region edge is the least open (a smooth gradient). `openness` ∈ [1/N, 1] is
  // the per-sample drop strength the caller compares against a deterministic
  // hash. Deterministic — same S → same stage.
  const highlightStage = (S, sensitivity, regionThreshold) => {
    const reg = clamp(finite(regionThreshold, 0.04), 0, 1);
    const s = clamp(finite(S, 0), 0, 1);
    if (s < reg) return { inRegion: false, stage: 0, openness: 0 };
    const N = clamp(Math.round(finite(sensitivity, 1)), 1, 8);
    if (N <= 1) return { inRegion: true, stage: 0, openness: 1 };
    const f = clamp((s - reg) / (1 - reg || 1e-9), 0, 1); // 0 at region edge → 1 brightest
    const stage = clamp(Math.floor(f * N), 0, N - 1);      // 0..N-1
    return { inRegion: true, stage, openness: (stage + 1) / N };
  };

  // Shadow-side graded darkening (the mirror of highlightStage). sensitivity 1 →
  // no-op (boost 1). N → quantize LOW intensity into N darkening stages; the
  // darkest sample gets the biggest coverage boost so more lines pile up there,
  // and more stages make that dark gradient smoother. Returns a coverage
  // MULTIPLIER ≥ 1 for the dark region. Deterministic.
  const shadowStage = (I, sensitivity, shadowThreshold) => {
    const N = clamp(Math.round(finite(sensitivity, 1)), 1, 8);
    if (N <= 1) return { inRegion: false, stage: 0, boost: 1 };
    const th = clamp(finite(shadowThreshold, 0.5), 0.01, 1);
    const i = clamp(finite(I, 0), 0, 1);
    if (i >= th) return { inRegion: false, stage: 0, boost: 1 };
    const f = clamp(1 - i / th, 0, 1);              // 0 at threshold → 1 darkest
    const stage = clamp(Math.floor(f * N), 0, N - 1);
    const boost = 1 + (stage / (N - 1 || 1)) * 0.8; // up to +80% coverage at the darkest stage
    return { inRegion: true, stage, boost };
  };

  const Regions = {
    intensity,
    combinedIntensity,
    band,
    coverageFor,
    coverageToSpacing,
    spacingFor,
    toneLadder,
    towardLight,
    specularRegion,
    specularHotspot,
    specularTerm,
    shininessForSize,
    highlightStage,
    shadowStage,
    FORM_ZONES,
    CROSS_OBJ_DEG,
    TERMINATOR_NL,
    REFLECT_TH,
    signedLambert,
    reflectedLift,
    formZone,
    formInk,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Lighting, Regions });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lighting, Regions };
  }
})();
