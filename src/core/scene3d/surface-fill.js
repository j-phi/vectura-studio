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

  // Charts whose native (u,vv) convention samples u=AROUND / vv=ALONG-axis — the
  // OPPOSITE of the sphere/cone convention every wrap here assumes (a = along-axis
  // sweep, b = around wind). SurfaceFill wraps these (a,b) → raw(b,a) so a
  // meridian/parallel/helix lands with the correct roles: before this a
  // superellipsoid (or cylinder/capsule/pyramid) Spiral wound its LATITUDE `turns`
  // times → a near-vertical striped band instead of a helix (I21). Only the FILL
  // is normalized — the MESH still calls Charts.topo* directly, so mesh baselines
  // and the charts-parity golden are untouched.
  const AROUND_IS_U = new Set(['cylinder', 'capsule', 'superellipsoid', 'pyramid']);

  const chartFor = (mode, sizes) => {
    const C = Vectura.Scene3D && Vectura.Scene3D.Charts;
    if (!C) return null;
    let raw = null;
    switch (mode) {
      case 'sphere': raw = typeof C.topoSphereEllipsoid === 'function' ? C.topoSphereEllipsoid(sizes, 'sphere') : null; break;
      case 'torus': raw = typeof C.topoTorus === 'function' ? C.topoTorus(sizes) : null; break;
      case 'cone': raw = typeof C.topoCone === 'function' ? C.topoCone(sizes) : null; break;
      case 'cylinder': raw = typeof C.topoCylinder === 'function' ? C.topoCylinder(sizes) : null; break;
      case 'capsule': raw = typeof C.topoCapsule === 'function' ? C.topoCapsule(sizes) : null; break;
      case 'superellipsoid': raw = typeof C.topoSuperellipsoid === 'function' ? C.topoSuperellipsoid(sizes) : null; break;
      case 'torusKnot': raw = typeof C.topoTorusKnot === 'function' ? C.topoTorusKnot(sizes) : null; break;
      case 'pyramid': raw = typeof C.topoPyramid === 'function' ? C.topoPyramid(sizes) : null; break;
      default: raw = null;
    }
    if (typeof raw !== 'function') return null;
    return AROUND_IS_U.has(mode) ? (a, b) => raw(b, a) : raw;
  };

  // O6 — CENTRE-LIGHT FLOOR (see coverageForSample). Module scope so the test
  // seam at the bottom of the file reads the same constant the fill does.
  // The cap may never remove more than this fraction of the lit band's own
  // ladder coverage, and never take it under LIT_FLOOR outright.
  const GLINT_KEEP = 0.6;
  const LIT_FLOOR = 0.12;

  // ── The tone MASTER GRID (design spec §5.0/§5.4) ────────────────────────────
  //
  // Round 2 shipped a curved fill that did not shade: `bands` 2/3/4 produced
  // pixel-identical drawings. Two faults, and the first one hid the second.
  //
  // FAULT 1 — the dither rank WAS the family coordinate. Every family emitted
  // line i with the ordered-dither threshold `(i+0.5)/count`, and line i sits at
  // parameter b = `(i+0.5)/count`. Rank and position were the SAME NUMBER. So
  // "keep the fraction `cov` of the lines" did not thin the family — it cut it
  // at a LONGITUDE. Worse, on a lit form the light also varies with longitude,
  // so rank and coverage were correlated and the gate collapsed into a single
  // hard edge: full family on one side, bare paper on the other, no intermediate
  // density anywhere. Measured: a flat D ≈ 0.08 across the whole sphere at every
  // band count. `rankOf` replaces the coordinate with a bit-reversed (van der
  // Corput) permutation, which is spatially well-distributed at EVERY prefix
  // length — so keeping the first `cov·N` ranks keeps an evenly spread subset,
  // and coverage finally means density.
  //
  // FAULT 2 — nothing to be blank against. At the shipped line budget a FULL
  // family already sits at ~17 × pen width, so the lit band (a fraction of that)
  // was near-bare paper and blanking a sub-region of it — which is what every
  // highlight treatment does — was invisible. §5.4 states the rule directly:
  // floor the centre light so its spacing never exceeds 6 × pen. That is only
  // possible if the family the ladder subsets is itself dense enough, so when
  // the ladder is active the line budget is FLOORED at a master pitch measured
  // in pen widths. Density still rules above the floor.
  // A tone grid is the FINE grid the ladder subsets, not the finished spacing —
  // `hatchSpacing(density)` is the latter, so it is subdivided to become the
  // former. Chosen so the shipped default Density lands the ladder where Round 3
  // measured it well.
  const TONE_SUBDIV = 5;
  // §0 / C15 / designer item #5 — "cap TOTAL coverage, not just per-family
  // pitch: ~0.75 dark-fraction ceiling above the 1.2 x pen floor". 1.2 x pen is
  // the plot floor, but a SINGLE family ruling at 1.2 x pen already measures
  // D ~ 0.83 — and then the terminator's crossed family lands on top of it and
  // the form hits 0.946, darker than the contact shadow under it (C2/O13 fail:
  // the object stops sitting on the ground). So family A is floored where it
  // measures ~0.45, leaving the cross the room it needs to make T read, and the
  // COMBINED perceived coverage is ceilinged outright.
  const PLOT_FLOOR_PEN = 2.2;
  // ROUND 10 — READ, NOT RESTATED. These two lived here and the faceted path had
  // no copy at all, so the composed ceiling was a law of the curved path only.
  // They now live beside `FORM_INK` in `regions.js`, which is where the weight
  // they divide by comes from, and both fill paths read the one definition.
  // Values unchanged: 0.47 and 2.0, so every drawing stays byte-identical.
  // Resolved lazily: `regions.js` may register after this file, and the point of
  // the move is that there is exactly ONE definition, so a stale snapshot taken
  // at load time would defeat it. The literals are the fallback for a runtime
  // that somehow has no Regions, and they are the same 0.47 / 2.0.
  const darkCeilConst = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.TOTAL_DARK_CEIL)) ? R.TOTAL_DARK_CEIL : 0.47;
  };
  const darkestWeightConst = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.DARKEST_WEIGHT)) ? R.DARKEST_WEIGHT : 2.0;
  };
  // ROUND 10 — §5.4 #1 / O6, and it MOVED for the same reason the two above
  // did. `LIT_MAX_PITCH_PEN` was declared here and used only for two SPARSE-END
  // clamps on the master grid (`o6Pitch`, `litFloorCov`). Round 9 swept it at
  // 12 / 10 / 8 / 6 and Round 10 added 4: the two binding ladder fixtures are
  // bit-identical from 12 down to 6, and at 4 D(L) goes DOWN and the protected
  // F/M range breaks. It named O6 in its own comment and did not control it.
  // It now lives in `regions.js`, where it floors `formCeiling('L')` — the one
  // quantity that actually bounds D(L) — and the ladder test reads its O6 bar
  // from the same constant. The clamps below keep their job (they are the real
  // sparse-end clamps, and they bind when Density is genuinely too thin to
  // carry a ladder), but they are no longer what enforces O6.
  // Resolved lazily for the same reason as the two ceiling constants: exactly
  // ONE definition, and `regions.js` may register after this file.
  const litMaxPitchPen = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.LIT_MAX_PITCH_PEN)) ? R.LIT_MAX_PITCH_PEN : 12;
  };
  // The composed ceiling, read not restated. `82789c4` moved the two constants
  // to `regions.js` but left this file computing the ceiling from them by hand,
  // so `formCeiling` was the single expression on the faceted path only and a
  // second copy of the law survived here — which is how the L-zone floor above
  // would have been enforced on one path and not the other.
  const zoneCeiling = (zone) => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    if (R && typeof R.formCeiling === 'function') return R.formCeiling(zone);
    const ink = Regions.formInk(zone);
    const weight = clamp(finite(ink.coverage, 0) + finite(ink.cross, 0), 0, 4);
    return darkCeilConst() * clamp(weight / darkestWeightConst(), 0, 1);
  };
  const MASTER_MAX_LINES = 420;  // pathological-input guard (steps × lines)
  // RULING CONTINUITY (see emitLine). The scale at which a break stops reading
  // as a break and starts reading as a wobble in one line, and at which a mark
  // stops reading as a stroke and starts reading as a speck. Stated in pen
  // widths like every other plot-safety number here: at the shipped 0.3 mm pen
  // these are 3.6 mm, an order of magnitude below a tone zone's own span on a
  // typical object, so a genuine zone termination is untouched and only
  // sub-stroke chatter is removed.
  const BRIDGE_PEN = 12;
  const SPECK_PEN = 12;
  // EMISSION FLOOR, unconditional. `scene3d.js` has carried MIN_RUN_MM = 0.6 for
  // structural edges since Phase 1 — "sub-pen-width fragments that draw as a dot
  // at best and only cost pen-down travel" — but it was never applied to fill
  // runs, and the curved fill emits plenty: measured on Jay's capsule, ten of
  // family A's twenty-eight runs were under 1 mm and four were under 0.2 mm.
  // Those are not tone at any density; they are a pen-down/pen-up dot. 2 x pen
  // reproduces the existing 0.6 mm at the shipped 0.3 mm pen.
  const MIN_MARK_PEN = 2;

  // Radical inverse base 2, scaled off the index — the classic ordered-dither
  // permutation. vdc(0,1,2,3,…) = 0, .5, .25, .75, .125, … so any prefix is
  // spread across [0,1) instead of clustered at one end.
  const rankOf = (i) => {
    let n = (i >>> 0) + 1;
    let rev = 0;
    let denom = 1;
    while (n > 0) { rev = rev * 2 + (n & 1); n >>>= 1; denom *= 2; }
    return (rev / denom) % 1;
  };

  // Zone-boundary FEATHER (§4, and O26 — a curved form must show NO banding
  // between tone bands). Coverage is piecewise-constant across a zone boundary,
  // so without this every line in the family flips state at the same place and
  // the flips line up into a contour. The comparison is dithered by a hash of
  // (line index, a COARSE bucket of the along-line parameter), which moves each
  // line's flip point independently by up to ±FEATHER_AMPL of rank — i.e.
  // stochastic line-end termination, the burin's own answer, at zero extra
  // pen-up cost. The bucket is coarse so the result is a ragged interdigitated
  // boundary, not per-sample speckle.
  // ROUND 4 (O26). The first cut hashed a QUANTIZED bucket of the along-line
  // parameter, so the offset was piecewise CONSTANT — every ruling flipped at one
  // of a handful of shared positions and the boundary came out as traceable right
  // angles in parameter space. A blocky staircase is exactly the artefact the
  // feather exists to prevent, and on the ground (C9/C10) the same idea reads as
  // the best artefact in the set because THERE it is continuous. So the offset is
  // now interpolated between adjacent hash samples: it wanders smoothly along
  // each ruling, and independently per ruling, which is what interdigitates.
  const FEATHER_AMPL = 0.30;
  const FEATHER_BUCKET = 5;
  // Re-start margin on the dither comparison, in units of `rank` (see the
  // one-sided hysteresis in emitLine). DERIVED, not tuned: `featherAt` returns
  // [-0.5, 0.5], so the feather moves the comparison by at most
  // ±FEATHER_AMPL/2. A margin of exactly that half-amplitude is the smallest
  // one the feather cannot fake — so the feather can still move WHERE a ruling
  // stops (its documented job) but can no longer switch a ruling back on again
  // mid-form (which was never its job).
  const HYST_RANK = FEATHER_AMPL / 2;

  // Line count from the density slider (1..100 → ~6..40 wrap lines).
  const lineCountFor = (density) => Math.max(4, Math.round(6 + clamp(density, 0, 100) * 0.34));

  // A wrapped spiral needs many more loops than a hatch line-count to read as a
  // dense helix: Density 100 must approach full overlap (I13). The wrap budget is
  // `lineCountFor(density) × SPIRAL_TURN_GAIN`, capped so a pathological
  // density/detail combo cannot explode the sample count (steps × turns).
  const SPIRAL_TURN_GAIN = 2.4;
  const SPIRAL_MAX_TURNS = 120;

  // buildObject(opts) → array of screen polylines, or null when unsupported.
  //   opts: { mode, sizes, detail, fillFidelity, transform, applyTransform,
  //           projectWorld, camAngles, mapper, fillAngle, fillDensity, toneOn,
  //           intensityFn, xray }
  //   fillFidelity: Style-tab Fidelity — a multiplier (0.25..3, default 1) on the
  //   number of SAMPLES taken along each fill line. Distinct from `detail`, which
  //   is the mesh's tessellation. 1 ⇒ byte-identical to the pre-Fidelity fill.
  //   fillAngle: hatch/crosshatch direction in the surface's OWN tangent frame
  //   (deg). 0 = meridians (the legacy family), 90 = parallels; see the angle
  //   family block below. Omitted/0 ⇒ byte-identical to the pre-angle fill.
  //   cross: { angleDelta, densityRatio, triple } — the crosshatch family-B
  //   controls, with EXACTLY the faceted path's semantics (crossFamilies in
  //   scene3d.js): family B sits at fillAngle + angleDelta and its SPACING is
  //   scaled by densityRatio (ratio > 1 ⇒ sparser B); `triple` adds a third pass
  //   at fillAngle + 45 on family-B's spacing, and the CALLER owns its
  //   darkest-tone-band gate (as the faceted path does). Omitted ⇒ the legacy
  //   +90 / same-density / no-triple crossing family, byte-identical.
  //   intensityFn(worldNormal, worldPoint) → [0,1] combined multi-light intensity
  //   (worldPoint is the per-sample world surface point, needed by point/spot).
  //   xray: { backFaces, backDensity } — when backFaces, also emit the FAR
  //   surface as a second family (polylines tagged `.back = true`) so the caller
  //   draws it dashed/sparse; back count = front count × backDensity (0.2–1).
  //   I8 (light-driven): shadowSensitivity (stage count, dark-end grading),
  //   specularFn(worldNormal, worldPoint) → per-sample specular S, and
  //   highlight.{lightDriven, sensitivity} place a per-sample glint. All default
  //   off ⇒ byte-identical to the pre-I8 fill.
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

    // ── Tone LADDER consumption (items 1+2). The old dither compared the local
    // shade (1 − I) to a purely geometric per-line rank (i+0.5)/count, so the
    // curved fill ignored band count / thresholds / coverage / specular. Now
    // each sample's intensity I is quantized into a band (Regions.band) and the
    // band's authored coverage sets how many of the N lines draw there.
    //
    // Direction: SurfaceFill renders dark→dense, bright→sparse (the blank cap IS
    // the highlight — the retired specular disc). The ladder is authored dark→
    // light and Regions.band gives bright = HIGH index, so we read the coverage
    // for the COMPLEMENT band: the darkest surface gets the ladder's high-coverage
    // end (dense), the lit cap the low end (near-blank). Band COUNT (ladder
    // length) therefore changes the number of tone steps, and each Coverage
    // slider scales its band's line density.
    const Regions = Vectura.Scene3D && Vectura.Scene3D.Regions;
    const tone = opts.tone || null;
    const ladderLen = tone && Array.isArray(tone.ladder)
      ? tone.ladder.filter((c) => Number.isFinite(c)).length : 0;
    const useLadder = Boolean(toneOn && tone && Regions
      && typeof Regions.band === 'function' && typeof Regions.coverageFor === 'function'
      && ladderLen >= 1);
    // Specular: when enabled, the BRIGHTEST band is further sparsened/blanked to
    // read as a distinct glint cap, scaled by size (bigger size → blanker). When
    // disabled it keeps the ladder coverage. This is the live wiring of the Tone
    // section's Specular On/Off + size (they were previously dead), and doubles
    // as the "dark specular" fix — the bright band reads LIGHTER, never denser.
    // `none` — the total highlight/specular BYPASS (Jay, 2026-08-09: "none
    // should represent no highlighting being present at all. This means the
    // lines must not break"). It kills the glint cap outright, which is the
    // confirmed cause of the "chunks simply missing from my rings with
    // highlights off" report: the cap fired on the brightest band regardless of
    // whether any highlight was switched on. Under `none` there is no H zone, no
    // cap, no highlight channel and no highlight pen — the fill is exactly what
    // the tone ladder made.
    const noHL = opts.noHighlight === true;
    const specOn = Boolean(useLadder && !noHL && tone.specular && tone.specular.enabled !== false);
    const specSize = specOn ? clamp(finite(tone.specular.size, 1), 0, 3) : 0;
    const nB = ladderLen;
    // I8 — shadow SENSITIVITY: graded darkening on the dark end (stage count).
    // Default 1 = strict no-op; N quantizes low intensity into N darkening stages
    // (more coverage → denser shadow), a smoother dark gradient as N rises.
    const shadowSens = clamp(Math.round(finite(opts.shadowSensitivity, 1)), 1, 8);
    const shadowGrades = Boolean(useLadder && shadowSens > 1 && Regions && typeof Regions.shadowStage === 'function');
    // Ink line-fraction (0..1) for a sample: how many of the N wrap lines draw at
    // this local intensity. Dark → high, lit cap → low.
    // O6 — THE GLINT CAP IS BOUNDED. Unbounded, `cov *= (1 - 0.5*specSize)` took
    // a default-ish lit coverage of ~0.2 down to ~0.1, i.e. fewer than one wrap
    // line in ten. Two things went wrong with that, and they are the same thing
    // seen from two sides:
    //
    //   - The centre light was ALREADY near-bare paper, so blanking a sub-region
    //     of it — which is what every highlight treatment does — was invisible.
    //     That is why highlights "don't work": there was no surround to contrast
    //     against. A highlight is defined by the ink around it.
    //   - It fires on the BRIGHTEST BAND regardless of whether any highlight is
    //     switched on, so with highlights disabled a contour/parallel fill came
    //     out with chunks simply missing from its rings. Reported from the app on
    //     a capsule, and it is the same defect.
    //
    // So the cap now lightens the lit band by at most 1 - GLINT_KEEP of its own
    // ladder coverage, never below LIT_FLOOR outright. It still reads as a glint
    // (specular on is measurably lighter than specular off, and the ladder's
    // ordering is untouched) without gouging the fill.
    const coverageForSample = (I) => {
      const b = Regions.band(I, tone);
      // b: 0..nB-1, bright = HIGH
      let cov = Regions.coverageFor(nB - 1 - b, tone); // complement → dark = dense
      if (b === nB - 1) {
        const raw = cov;
        if (specOn) cov *= clamp(1 - 0.5 * specSize, 0, 1); // glint cap
        cov = Math.max(cov, raw * GLINT_KEEP, LIT_FLOOR);
      }
      return clamp(cov, 0, 1);
    };

    // ── FORM ZONES on the curved path ──────────────────────────────────────────
    // The ladder's own coverage numbers cannot express T > F > R (Lambert is
    // clamped, so T, F and R are all I = 0), so the zone classifier in Regions
    // owns the dark end and the ladder's coverage keeps owning the lit end. Both
    // fill implementations call the SAME classifier — that is the I27 parity
    // contract, and it is why a cube, a low-poly sphere and this capsule under
    // one light now land in the same zones.
    const zoneCtx = opts.formZone || null;
    const zonesOn = Boolean(useLadder && zoneCtx && typeof Regions.formZone === 'function');
    // The blank highlight is placed by the SPECULAR term, not by "the top tone
    // band". That is what makes it sit offset toward the light (O7), shrink to a
    // few percent of the silhouette instead of a quarter of it (O4/O5), respond
    // to `tone.specular` on the curved path at all (O24) and vanish outright
    // when specular is switched off (O16). The exponent is tighter than the
    // light-driven glint's: this one has to land inside the ≤8%-of-silhouette
    // window of §5.4 #8, where the lightDriven region deliberately spans faces.
    const hlSpecFn = (specOn && typeof opts.specularFn === 'function') ? opts.specularFn : null;
    const HL_EXP = clamp(30 / Math.max(0.2, specSize || 1), 10, 120);
    const HL_TH = 0.35;
    const isGlint = (wN, world) => {
      if (!hlSpecFn) return false;
      // specularFn is authored at the lightDriven shininess; re-sharpen it to the
      // blank-highlight exponent by re-exponentiating the cosine it encodes.
      const s = clamp(hlSpecFn(wN, world), 0, 1);
      if (s <= 0) return false;
      const cosH = Math.pow(s, 1 / Math.max(1, finite(opts.specShininess, 6)));
      return Math.pow(cosH, HL_EXP) >= HL_TH;
    };
    const zoneOf = (smp) => {
      if (!zonesOn) return null;
      return Regions.formZone(smp.wN, smp.world, {
        tone,
        lights: zoneCtx.lights,
        ground: zoneCtx.ground,
        terminatorNL: zoneCtx.terminatorNL,
        highlight: isGlint(smp.wN, smp.world),
      });
    };
    // Zone → family-A coverage, with the two floors §5.4 #1 demands. The glint
    // cap may lighten the centre light, but never past `litMaxPitchPen()` — a
    // highlight is defined by the ink AROUND it, and a surround at 17 × pen has
    // no ink to be defined by. `litFloorCov` is the coverage at which family A's
    // spacing is exactly `litMaxPitchPen()` × pen, so the floor is stated in the
    // spec's units. (The comment used to say "6 × pen"; the constant has read 12
    // for several rounds and the two had drifted.)
    //
    // ROUND 10 — WHAT THIS FLOOR IS AND IS NOT. It is the SPARSE-END clamp: it
    // binds when Density is genuinely too thin to carry a ladder. It is NOT what
    // enforces O6. Measured on the four-fixture ladder, the requested coverage
    // here sits well ABOVE the composed ceiling on the binding fixtures, so it
    // is clamped downstream and neither this floor nor GLINT_KEEP reaches the
    // paper — GLINT_KEEP 0.6 → 0.8 → 1.0 is bit-identical on two of four. O6 is
    // bounded by `Regions.formCeiling('L')`, and that is where §5.4 #1's pitch
    // statement is now wired.
    let litFloorCov = LIT_FLOOR; // assigned once the master pitch is known, below
    let floorPitch = 0;          // ditto: the plot-safe local pitch (C15)
    // ── THE FORM SHADOW'S CROSS COMES OFF THE SILHOUETTE (§5.1, O3) ───────────
    // §5.1 gives F a single family whose rulings compress toward the limb; the
    // crossed family belongs to the terminator and F borrows a half-weight share
    // of it so it can hold a value of its own. What F must not do is carry that
    // second direction out to the contour. Family A already crowds hard there —
    // a sphere's meridians converge AT the silhouette — so a second direction on
    // top of it turns the outer rim into a woven mesh, and then the terminator
    // stops reading as a band, which is O3's own clause. Measured before this:
    // 46 % (r 46) and 54 % (r 92) of the outermost F windows carried two
    // families.
    // `nz` is the camera-space normal's z: 1 facing the camera, exactly 0 ON the
    // silhouette. So the taper is stated in the geometry's own terms and needs no
    // radius, no bbox and no projection assumption. Smoothstepped, so there is no
    // edge where it engages — an abrupt one would be a contour line, which is the
    // artefact O26 forbids.
    const LIMB_CROSS_LO = 0.30;
    const LIMB_CROSS_HI = 0.65;
    const limbCrossTaper = (smp) => {
      if (!smp || !Number.isFinite(smp.nz)) return 1;
      const u = clamp((Math.abs(smp.nz) - LIMB_CROSS_LO) / (LIMB_CROSS_HI - LIMB_CROSS_LO), 0, 1);
      return u * u * (3 - 2 * u);
    };
    // How much of `zone`'s crossed family actually lands on this sample. Only F
    // tapers: T's cross is the terminator's own band and must stay whole, and no
    // other zone crosses at all.
    const crossWeightAt = (zone, smp) => {
      const c = clamp(Regions.formInk(zone).cross, 0, 1);
      return zone === 'F' ? c * limbCrossTaper(smp) : c;
    };
    const zoneCoverage = (zone, isCross, isDensityCross, smp) => {
      const ink = Regions.formInk(zone);
      if (isCross) return clamp(crossWeightAt(zone, smp), 0, 1);
      if (isDensityCross) {
        // §0's craft rule made operational: Density past the plot floor spends
        // itself on a second DIRECTION, never on a tighter pitch. Weighted by the
        // zone's own coverage so the ladder's ORDER survives the spill — the
        // highlight gets none of it and the centre light barely any, which is
        // what keeps the blank readable while the form darkens.
        return clamp(ink.coverage * densityOverflow, 0, 1);
      }
      let cov = clamp(ink.coverage, 0, 1);
      if (zone === 'L') {
        const raw = cov;
        if (specOn) cov *= clamp(1 - 0.5 * specSize, 0, 1);
        cov = Math.max(cov, raw * GLINT_KEEP, litFloorCov);
      }
      return clamp(cov, 0, 1);
    };
    const SHADOW_TH = 0.5; // intensity below which the dark-grading infill engages

    // I8 — LIGHT-DRIVEN highlight: the highlight region is where the per-sample
    // specular term S is high (a glint that spans faces near a point light), not
    // the top tone band. `sensitivity` stages the drop: 1 = binary (uniform
    // treatment across the region), N = a gradient (brightest = blankest). When
    // engaged the perFace band-treatment dispatch is disabled (they are mutually
    // exclusive within one fill). Default off ⇒ every branch below is inert.
    const hlCfg = opts.highlight || null;
    const specularFn = opts.specularFn || null;
    const ldOn = Boolean(hlCfg && hlCfg.lightDriven && typeof specularFn === 'function' && Regions
      && typeof Regions.highlightStage === 'function');
    const ld = ldOn ? {
      treatment: hlCfg.treatment || 'blank',
      sensitivity: clamp(Math.round(finite(hlCfg.sensitivity, 1)), 1, 6),
    } : null;
    const LD_REG = 0.025; // specular threshold for "in the glint" (matches faceted)

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
      // Screen-space derivatives of the parameter square. A wrapped family's
      // pitch is NOT uniform — meridians converge to nothing at a sphere's poles
      // — so the only way to know what a family actually rules at HERE is to
      // measure it here. See the plot-safe cap in emitLine (C15).
      let dA = null; let dB = null;
      if (useLadder) {
        const sa = projectWorld(applyTransform(pa, t));
        const sb = projectWorld(applyTransform(pb, t));
        if (sa && sb && Number.isFinite(sa.x) && Number.isFinite(sb.x)) {
          dA = { x: (sa.x - scr.x) / EPS, y: (sa.y - scr.y) / EPS };
          dB = { x: (sb.x - scr.x) / EPS, y: (sb.y - scr.y) / EPS };
        }
      }
      const I = toneOn ? clamp(intensityFn(wN, world), 0, 1) : 1;
      // I8 — per-sample specular term for light-driven highlight (0 when off).
      const S = (ldOn && typeof specularFn === 'function') ? clamp(specularFn(wN, world), 0, 1) : 0;
      // `nz` = the camera-space normal's z. It is 1 facing the camera and 0 ON
      // the silhouette, so it is the exact, projection-correct measure of "how
      // close to the contour is this sample" — used by the limb taper below.
      return { x: scr.x, y: scr.y, z: scr.z, front: camN.z > 0, nz: camN.z, I, S, wN, world, dA, dB };
    };

    // PERPENDICULAR screen pitch between adjacent rulings at this sample.
    //
    // The offset between two adjacent lines in PARAMETER space projects to a
    // screen vector, but that vector's LENGTH is not the spacing the eye (or the
    // pen) sees: near a silhouette the projection shears hard and the offset
    // ends up nearly parallel to the rulings themselves, so the true
    // perpendicular gap is a fraction of it. Measuring the magnitude instead of
    // the perpendicular component under-reported crowding by 2x exactly where it
    // mattered, and the form's core shadow flooded to D = 0.81 — darker than the
    // contact shadow beneath it, which is C2/O13 and means the object floats.
    // The cross product with the ruling's own screen direction is the fix.
    const perpPitch = (smp, pitchStep, lineDir) => {
      if (!pitchStep || !lineDir || !smp.dA || !smp.dB) return null;
      const ox = smp.dA.x * pitchStep.a + smp.dB.x * pitchStep.b;
      const oy = smp.dA.y * pitchStep.a + smp.dB.y * pitchStep.b;
      const lx = smp.dA.x * lineDir.a + smp.dB.x * lineDir.b;
      const ly = smp.dA.y * lineDir.a + smp.dB.y * lineDir.b;
      const ll = Math.hypot(lx, ly);
      if (ll < 1e-9) return Math.hypot(ox, oy);
      const perp = Math.abs(ox * (ly / ll) - oy * (lx / ll));
      return perp > 1e-6 ? perp : 1e-6;
    };

    // ── Line budget ────────────────────────────────────────────────────────────
    // Density owns the count, exactly as before, EXCEPT that an active tone
    // ladder floors it: the ladder is a set of subsets of this family, so if the
    // family itself rules at 17 × pen there is no room below it for a centre
    // light and no room above it for anything but bare paper. The floor is
    // computed from the object's own PROJECTED size so it holds at any zoom and
    // for any primitive, and it only ever RAISES the count — Density is fully
    // live above it. With tone off, `N` is bit-for-bit `lineCountFor(density)`.
    let N = lineCountFor(finite(opts.fillDensity, 50));
    let masterPitch = 0;
    let densityOverflow = 0; // Density past the plot floor, spent on a 2nd direction
    const penWidth = Math.max(0.02, finite(opts.penWidth, 0.3));
    if (useLadder && opts.penWidth != null) {
      // Calibrate off the MEDIAN local pitch the family will actually rule at,
      // not off a bounding box. A wrapped family's pitch is wildly non-uniform —
      // on a sphere the meridians converge to nothing at the poles and crowd at
      // the silhouette — and a bbox estimate gets it wrong by about 2x. When the
      // budget is too dense EVERY zone hits the plot floor and the whole ladder
      // flattens into one value: measured L/M/T/F all landing within 0.05 of each
      // other at an effective pitch of 0.75-0.79mm. Calibrating on the median
      // puts the darkest zone at the target pitch and leaves the lit end room.
      const rad = (finite(opts.fillAngle, 0) * Math.PI) / 180;
      // Across the primary family, in parameter space. 'contour' rules the other
      // axis; every other mapper's family runs along (cos, sin) of fillAngle.
      const acr = opts.mapper === 'contour'
        ? { a: 1, b: 0 }
        : { a: -Math.sin(rad), b: Math.cos(rad) };
      const widths = [];
      for (let i = 0; i <= 16; i++) {
        for (let j = 0; j <= 16; j++) {
          const smp = sampleAt(i / 16, j / 16);
          if (!smp || !smp.front || !smp.dA || !smp.dB) continue;
          const w = perpPitch(smp, acr, { a: -acr.b, b: acr.a });
          if (w != null && w > 1e-6) widths.push(w);
        }
      }
      if (widths.length >= 8) {
        widths.sort((x, y) => x - y);
        const median = widths[widths.length >> 1];
        // ── DENSITY IS THE DIAL; THE FLOOR ONLY CATCHES THE SPARSE END ────────
        //
        // Round 3 sized the grid at a FIXED master pitch, and I claimed "Density
        // is fully live above it". It is not: `lineCountFor(100)` is 40 lines and
        // the floor wants ~150 for a 92mm ball at a 0.3mm pen, so N sat AT the
        // floor for every Density value and the ball emitted byte-identical
        // geometry at Density 10 and at 100. There was no Density setting left.
        //
        // So Density sets the pitch, through the SAME `hatchSpacing` law the
        // faceted path uses (subdivided: a tone grid is the fine grid the ladder
        // subsets, not the finished spacing). Two clamps sit on it, and each has
        // a reason rather than a number:
        //
        //   SPARSE END — the centre light must still carry ink, or the highlight
        //   has nothing to be blank against (O6, §5.4 #1). Derived from the LIT
        //   band's own requirement: L rules at `pitch / cov_L`, and that may not
        //   exceed LIT_MAX_PITCH. This is the only floor, and it binds only when
        //   Density is genuinely too sparse to carry a ladder.
        //
        //   DENSE END — past the plot floor you do not get darker by ruling
        //   closer, you get a flooded blob (§0). The excess is NOT discarded: it
        //   spills into a second DIRECTION, which is what the craft rule says to
        //   do with it and what keeps Density live at the top of its range.
        const tonePitch = Math.max(0.05, finite(opts.tonePitch, 3) / TONE_SUBDIV);
        const litCov = clamp(Regions.formInk('L').coverage, 0.05, 1);
        const o6Pitch = litMaxPitchPen() * penWidth * litCov;
        const floorPen = PLOT_FLOOR_PEN * penWidth;
        masterPitch = Math.min(tonePitch, o6Pitch);
        if (masterPitch < floorPen) {
          densityOverflow = clamp(floorPen / masterPitch - 1, 0, 1);
          masterPitch = floorPen;
        }
        N = clamp(Math.max(4, Math.round(median / masterPitch)), 4, MASTER_MAX_LINES);
        masterPitch = median / N; // what the family ACTUALLY rules at, typically
      }
    }
    // Coverage at which family A's spacing is exactly LIT_MAX_PITCH_PEN × pen —
    // the floor under the centre light, stated in §5.4's own units.
    litFloorCov = masterPitch > 0
      ? clamp(masterPitch / (litMaxPitchPen() * penWidth), 0.05, 1)
      : LIT_FLOOR;
    floorPitch = PLOT_FLOOR_PEN * penWidth;
    const BRIDGE_MM = BRIDGE_PEN * penWidth;
    const SPECK_MM = SPECK_PEN * penWidth;
    const MIN_MARK_MM = MIN_MARK_PEN * penWidth;
    // Samples along each fill line. The MESH's tessellation `detail` sets the
    // base; the Style tab's own Fidelity (`fillFidelity`) scales it.
    //
    // These are two different questions and they now have two different
    // controls. Mesh Fidelity buys FACETS — a 22-sided capsule. Style Fidelity
    // buys POINTS: each fill line re-evaluates the SAME parametric chart at more
    // (or fewer) places, so a dense line follows the form while a coarse one
    // cuts across it in chunky chords. Nothing here touches the mesh, so the
    // silhouette is unmoved whatever this says.
    //
    // Default 1 ⇒ Math.round(base × 1) === base ⇒ byte-identical. The upper
    // clamp keeps the spiral's `steps × turns` budget bounded (turns is already
    // capped at SPIRAL_MAX_TURNS).
    //
    // MERGE NOTE (round7-accepted → 3d-scene/p4). This is the SAMPLES-ALONG-A-
    // RULING axis; the tone master grid computed just above owns the NUMBER OF
    // RULINGS (`N`). They are orthogonal and neither reads the other — the
    // grid's median-pitch calibration walks its own fixed 17×17 `sampleAt`
    // lattice, not `steps`. The one real coupling is the budget: `N` may now
    // reach MASTER_MAX_LINES (420) where it used to cap at 40, so the product
    // `steps × N` is bounded by 220 × 420. See the plot-safety perf pin.
    const baseSteps = Math.max(28, Math.round(finite(opts.detail, 24) * 2));
    const fillFidelity = clamp(finite(opts.fillFidelity, 1), 0.25, 3);
    const steps = fillFidelity === 1
      ? baseSteps
      : Math.max(6, Math.min(220, Math.round(baseSteps * fillFidelity)));
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
    // perFace band-treatment dispatch — DISABLED when lightDriven owns the
    // highlight (the two are mutually exclusive within one fill).
    const hl = (!ldOn && opts.highlight && opts.highlight.treatment && opts.highlight.treatment !== 'blank')
      ? opts.highlight : null;
    const hlIsHL = (hl && typeof hl.isHL === 'function') ? hl.isHL : () => false;
    const hlDensity = hl ? clamp(finite(hl.density, 25), 1, 100) : 25;
    const ldDensity = ldOn ? clamp(finite(hlCfg.density, 25), 1, 100) : 25;
    // Deterministic 2D hash (mirrors geometry3d strokeHash) for stippleOut.
    const sfHash = (a, b) => {
      let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
      h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };

    // Smoothly-varying per-ruling feather offset in [-0.5, 0.5]. Deterministic:
    // same ruling, same position, same value, frame to frame (the "swim" contract).
    const featherAt = (lineIndex, step) => {
      const u = step / FEATHER_BUCKET;
      const k = Math.floor(u);
      const f = u - k;
      const seed = (lineIndex | 0) * 2654435761;
      const a = sfHash(seed, k);
      const b = sfHash(seed, k + 1);
      const t = f * f * (3 - 2 * f); // smoothstep — no corners at the sample joins
      return (a + (b - a) * t) - 0.5;
    };

    // Push a run to `out`, tagging the array when it belongs to the back family.
    // `lineIndex` (when given) records WHICH RULING the run came from. A ruling
    // is meant to survive as one polyline; the tag is what lets a test — or a
    // diagnostic — count how many pieces a single ruling was cut into, which is
    // the only way to tell legitimate tone (whole rulings dropped) apart from
    // fragmentation (one ruling chopped into stubs). Same tagging precedent as
    // `.back` / `.highlight`.
    const pushRun = (run, back, lineIndex) => {
      if (run.length < 2) return;
      if (back) run.back = true;
      if (lineIndex != null) run.lineIndex = lineIndex;
      out.push(run);
    };

    // A line in the (a,b) parameter square, as a function of its own 0..1 sweep
    // parameter. The axis-aligned families keep the exact legacy arithmetic:
    // 'b' ⇒ fix b, sweep a (meridian); 'a' ⇒ fix a, sweep b (parallel).
    const axisLine = (fixAxis, fixVal) => (fixAxis === 'b'
      ? (tt) => ({ a: tt, b: fixVal })
      : (tt) => ({ a: fixVal, b: tt }));

    // ── RULING CONTINUITY: the run sink ──────────────────────────────────────
    // Jay, 2026-08-16, on a hatched capsule with Highlight = None: "with no
    // highlights and hatched fill, I would not expect all of these partial fill
    // lines."
    //
    // The tone drop test is evaluated PER SAMPLE, and every quantity it reads
    // moves CONTINUOUSLY along a ruling on a wrapped surface: `cap =
    // localPitch / floorPitch` tracks the chart's foreshortening, the composed-
    // budget ceiling divides by that same local pitch, and the feather adds
    // ±FEATHER_AMPL/2 of rank on top. So a ruling whose rank sits anywhere near
    // the local coverage does not cut ONCE — it chatters, and arrives as a row
    // of stubs. Measured on Jay's capsule, family A emitted 28 runs at a MEDIAN
    // LENGTH OF 3 mm, ten of them under 1 mm and four under 0.2 mm, on a form
    // ~70 mm across. A FACETED face has a constant local pitch and a
    // near-constant zone, which is why a cube measures zero mid-form endpoints
    // and every chart-wrapped primitive is riddled with them. Highlight
    // treatment is NOT implicated: `none` and `blank` measure identically, so
    // the `0188e01` glint-cap bypass holds — the cut fires upstream of every
    // highlight branch, which is why no Highlight setting could ever have met
    // the "lines must not break" contract.
    //
    // TONE IS NOT TOUCHED. Dropping a whole ruling, and terminating a ruling
    // where the surface genuinely changes zone, are how this engine shades and
    // both still happen — `gateT`/`gateF`, the zone-confined crossed families,
    // are deliberately short and are left exactly as authored. What this sink
    // removes is sub-stroke chatter: a break too short to read as a break, and
    // a mark too short to read as a stroke.
    //
    // Only a DITHER drop is bridgeable (`softDrop`). A break because the
    // surface ended, because a zone-gated family left its zone, because a
    // highlight treatment re-routed the ink, or because `FORM_INK.R` asked for
    // a dashed rim (duty < 1) is DELIBERATE and calls `flush` — the rim's
    // dashes survive exactly as authored.
    // Each FAMILY gets its own id. `lineIndex` is only unique WITHIN a family —
    // crosshatch's A and B families both index from 0 — so a per-ruling test
    // that keyed on lineIndex alone would merge two different rulings into one
    // and read the pair as a fragmented line.
    let famSeq = 0;
    let currentFam = 'A';
    const nextFam = (kind) => { currentFam = `${kind}#${famSeq}`; famSeq += 1; return currentFam; };
    const makeSink = (back, lineIndex, fam) => {
      let run = [];
      let runLen = 0;
      let gapPts = [];
      let gapLen = 0;
      let softStart = false;   // this run began after a dither drop, not at a boundary
      let sawSoftDrop = false;
      const emitRun = (softEnd) => {
        // A mark bounded by the SURFACE at both ends is legitimate however short
        // (a ruling clipped by a narrow neck, or by the poles), so only a mark
        // the dither carved out of the MIDDLE of a ruling can be a speck. The
        // sub-pen-width floor applies to every run regardless — that one is a
        // pen-down dot, not tone, at any density.
        const speck = softStart && softEnd && runLen < SPECK_MM;
        if (run.length >= 2 && runLen >= MIN_MARK_MM && !speck) {
          run.fam = fam;
          pushRun(run, back, lineIndex);
        }
        run = []; runLen = 0; softStart = false;
      };
      return {
        flush: () => { emitRun(false); gapPts = []; gapLen = 0; sawSoftDrop = false; },
        softDrop: (pt) => {
          sawSoftDrop = true;
          if (!run.length) return;           // nothing open yet — a leading drop
          const prev = gapPts.length ? gapPts[gapPts.length - 1] : run[run.length - 1];
          gapLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
          gapPts.push(pt);
          if (gapLen > BRIDGE_MM) { emitRun(true); gapPts = []; gapLen = 0; }
        },
        addPt: (pt) => {
          if (run.length && gapPts.length) {
            // Bridge. The skipped samples lie ON the surface, so re-adding them
            // keeps the ruling on the form instead of chording across it.
            gapPts.forEach((g) => {
              runLen += Math.hypot(g.x - run[run.length - 1].x, g.y - run[run.length - 1].y);
              run.push(g);
            });
          }
          gapPts = []; gapLen = 0;
          if (!run.length) softStart = sawSoftDrop;
          else runLen += Math.hypot(pt.x - run[run.length - 1].x, pt.y - run[run.length - 1].y);
          run.push(pt);
        },
      };
    };

    // Emit one iso-line. `paramAt(tt)` walks the line through the (a,b)
    // parameter square. `threshold` is this line's ordered-dither cut (0..1) —
    // the sample draws only where the local shade (1 − I) meets it, so lines
    // vanish toward the lit highlight and pile up in shadow. `back` selects the
    // FAR side (camN.z < 0) instead of the visible front side, and tags the run.
    // `ladderRank` is the line's position in the dither PERMUTATION (see rankOf)
    // — decoupled from `threshold`, which stays the geometric rank the legacy
    // no-ladder callers compare shade against. `zoneGate`, when set, restricts
    // the line to a single form zone: that is how the terminator's crossed
    // family is spent on T alone instead of being sprayed over the whole dark
    // band (O17 — Round 2 crossed ALL of band 0, at 0/90, and it read as wire mesh).
    const emitLine = (paramAt, threshold, back, lineIndex, count, ladderRank, zoneGate, pitchStep, lineDir, densityCross) => {
      const wantFront = !back;
      const rank = Number.isFinite(ladderRank) ? ladderRank : threshold;
      let hlRun = [];
      // The base channel goes through the shared run sink (see makeSink).
      const sink = makeSink(back, lineIndex, currentFam);
      // A hard cut ends the continuous span, so both trigger flags reset.
      const flush = () => { sink.flush(); drawing = false; everDrew = false; };
      const softDrop = sink.softDrop;
      const addPt = sink.addPt;
      let drawing = false;     // is this ruling currently laying ink?
      let everDrew = false;    // has it laid any within the current continuous span?
      // Highlight runs are tagged so the caller draws them dashed/dotted on the
      // highlight pen (dashed/dotted treatments).
      const flushHL = () => {
        if (hlRun.length >= 2) {
          hlRun.highlight = true; hlRun.lineIndex = lineIndex;
          if (back) hlRun.back = true;
          out.push(hlRun);
        }
        hlRun = [];
      };
      // sparse: is THIS line kept in the highlight band? (every Nth by density).
      // Under lightDriven `hl` is null, so the perFace density is unavailable —
      // read the same density off the lightDriven config, otherwise `sparse`
      // keeps every line and collapses onto `keep` (O15).
      const sparseDensity = hl ? hlDensity : ldDensity;
      const sparseOwner = hl || ld;
      const sparseStep = sparseOwner ? Math.max(1, Math.round(100 / sparseDensity)) : 1;
      const lineKept = !sparseOwner || (lineIndex % sparseStep === 0);
      for (let s = 0; s <= steps; s++) {
        const tt = s / steps;
        const pr = paramAt(tt);
        const smp = sampleAt(pr.a, pr.b);
        if (!smp || smp.front !== wantFront) { flush(); flushHL(); continue; }
        if (toneOn) {
          const shade = clamp(1 - smp.I, 0, 1);
          // I8 — LIGHT-DRIVEN glint: the per-sample specular term overrides the
          // base tone fill inside the lit region. Brightest sample → blank; the
          // dim region edge → kept; graded by sensitivity (1 = binary). Spans
          // faces automatically because a point light's direction varies across
          // the surface. keep/dashed/dotted route kept samples to the highlight
          // channel; blank/sparse/stippleOut drop them to bare paper.
          if (ld) {
            const stg = Regions.highlightStage(smp.S, ld.sensitivity, LD_REG);
            if (stg.inRegion) {
              // `openness` = per-sample treatment strength (brightest → ~1). A
              // TREATED sample reroutes (keep/dashed/dotted → highlight channel)
              // or blanks (blank/sparse → bare paper); UNTREATED stays on the base
              // run. sensitivity 1 → whole region treated (binary); N → graded.
              const treated = sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) < stg.openness;
              const tr = ld.treatment;
              if (tr === 'dashed' || tr === 'dotted') {
                if (treated) { flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); }
                else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }); }
              } else if (tr === 'sparse' || tr === 'stippleOut') {
                // O15 — these two used to fall into the `blank` arm below, so
                // switching highlightMode to lightDriven silently turned a sparse
                // or stippled highlight into a hole. They now thin on the
                // highlight channel here exactly as they do under perFace.
                if (!treated) { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }); }
                else if (tr === 'sparse'
                  ? lineKept
                  : sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) < clamp((ldDensity / 100) * (0.3 + shade * 2), 0, 1)) {
                  flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z });
                } else { flush(); flushHL(); }
              } else if (treated) { flush(); flushHL(); }        // blank glint
              else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }); }
              continue;
            }
          }
          // The sample draws where this line's PERMUTED rank sits below the local
          // coverage — dark zones cover more ranks (dense), the centre light few
          // (sparse), the glint none (blank). The comparison is feathered so the
          // flips do not line up into a contour at a zone boundary (O26).
          // Without a ladder (other callers) it degrades to the legacy shade<rank.
          let dropZone;
          let dutyBreak = false;
          if (useLadder) {
            const zone = zoneOf(smp);
            if (zoneGate && zone !== zoneGate) { flush(); flushHL(); continue; }
            const cov = zone
              ? zoneCoverage(zone, Boolean(zoneGate), densityCross === true, smp)
              : coverageForSample(smp.I);
            // §0, restated as arithmetic, and C15: past ~1.2 x pen width you do
            // not get darker by ruling closer — you get a flooded blob and a wet
            // plot. On a wrapped surface that limit is reached LOCALLY long
            // before it is reached globally: a sphere's meridians converge to
            // zero pitch at the poles, so the pole caps flooded solid (measured
            // D = 1.000) while the equator was still legible. Capping coverage by
            // the LOCAL pitch spends the excess the only way the craft rule
            // allows — by dropping rulings — and it is what keeps the lit end of
            // the ladder separable instead of saturating into the dark end.
            let cap = 1;
            // `pitchStep` / `lineDir` are constants for a straight parameter-
            // space family and FUNCTIONS OF tt for the screen-frame crossed
            // family, whose direction — and therefore whose neighbour offset —
            // varies along the line. Everything downstream is unchanged.
            const stepHere = typeof pitchStep === 'function' ? pitchStep(tt) : pitchStep;
            const dirHere = typeof lineDir === 'function' ? lineDir(tt) : lineDir;
            const localPitch = perpPitch(smp, stepHere, dirHere);
            if (localPitch != null) {
              // Effective pitch is localPitch / coverage and must stay at or above
              // the floor, so the darkest zone may not exceed localPitch/floor.
              // Applied MULTIPLICATIVELY, not as a clamp: where the geometry
              // crowds, every zone thins by the same factor, so the ladder's
              // ratios survive intact instead of the whole ramp collapsing onto
              // the floor together (which is exactly what a clamp did — L, M, T
              // and F all landed at the same effective pitch and the form went
              // flat).
              if (localPitch > 1e-6 && floorPitch > 1e-6) cap = clamp(localPitch / floorPitch, 0, 1);
            }
            let covCapped = cov * cap;
            // Perceived coverage composes as 1 - PROD(1 - c_i): the crossed
            // family overlaps family A, so treating them as additive over-reports
            // and lets the pair flood. Solve for the most the CROSS may lay down
            // without the pair passing the ceiling.
            // ── ONE COMPOSED BUDGET, SPLIT ACROSS EVERY PASS ─────────────────
            //
            // ROUND 7 (C2 / O13 / C15-on-the-object). Two faults, one cause.
            //
            // (a) The BASE pass had no composed budget at all. It was limited
            //     only by the multiplicative `cap = localPitch / floorPitch`,
            //     a per-family PITCH rule — so the ceiling was enforced purely
            //     by WITHHOLDING the cross, and where family A alone busted it
            //     the composed total simply stayed at whatever A had done.
            //     Measured at the peak: one family, alone, at an effective
            //     0.466 mm = 1.55 x pen, coverage 0.644 — inside C15's literal
            //     1.2 x bar, 1.4x past this path's own family-A floor, and
            //     carrying the object's maximum D.
            //
            // (b) The cross pass modelled family A's already-laid coverage as
            //     `penWidth * primary / localPitch` — using the CROSS family's
            //     local pitch, because that is the only one in scope. Family A
            //     runs at a different angle and therefore a different pitch, so
            //     the term was evaluated on the wrong quantity: where the cross
            //     ran sparser than A, `cA` came out too low, `room` too
            //     generous, and the pair composed to 0.642 against a 0.47
            //     ceiling. Measured at the peak window: family A 0.497,
            //     crossed family 0.289.
            //
            // Both are the same error the collar took three rounds to shed — a
            // cap stated on a proxy one transform away from the metric. So the
            // budget is no longer modelled at all. Each pass is handed a SHARE
            // of the zone's composed ceiling, in proportion to the ink that
            // pass is meant to contribute, and enforces only its own share
            // against its own pitch — which is the one pitch it actually knows.
            // Because 1 - PROD(1 - c_i) with c_i = 1 - (1-ceil)^(w_i/W) is
            // exactly `ceil` when every pass saturates, the composed total is
            // bounded by construction and no pass needs to know about any
            // other.
            if (zone && localPitch != null && localPitch > 1e-6) {
              // The ceiling stays PROPORTIONAL to the zone's intended weight,
              // never a flat clamp. A flat clamp collapses every zone that
              // reaches it onto one value — T and F both crossed, both
              // saturated, T/F 0.98, and the dip closed again.
              const ink = Regions.formInk(zone);
              const ceil = zoneCeiling(zone);
              // Every family that will land on this sample, and what each is
              // for. The Density overflow is a THIRD direction and has to be in
              // the denominator or it spends budget nobody accounted for.
              const wBase = Math.max(0, ink.coverage);
              // The cross's weight is what will ACTUALLY land here, tapered and
              // all — a family that is not drawn must not hold budget.
              const wCross = Math.max(0, crossWeightAt(zone, smp));
              const wOver = densityOverflow > 0 ? Math.max(0, ink.coverage * densityOverflow) : 0;
              const W = wBase + wCross + wOver;
              let share = 1;
              if (W > 1e-6) {
                if (densityCross) share = wOver / W;
                else if (zoneGate) share = wCross / W;
                else share = wBase / W;
              }
              const myCeil = share >= 1 ? ceil : 1 - Math.pow(1 - ceil, clamp(share, 0, 1));
              covCapped = Math.min(covCapped, (myCeil * localPitch) / penWidth);
            }
            const jit = featherAt(lineIndex, s) * FEATHER_AMPL;
            // HYSTERESIS, ONE-SIDED. The bare comparison `rank >= covCapped +
            // jit` is a per-sample verdict on a quantity that WANDERS along the
            // ruling (foreshortening, the composed-budget ceiling, and
            // ±FEATHER_AMPL/2 of feather on top). A ruling whose rank sits near
            // the local coverage therefore stops and RESTARTS repeatedly, and
            // those restarts are what strew a form with stubs.
            //
            // So STARTING is what gets the margin, and STOPPING keeps the exact
            // legacy test. That asymmetry is deliberate and load-bearing:
            //
            //   - Raising the bar to START can only ever REMOVE ink, so the
            //     composed C15/§0 budget that `covCapped` enforces is untouched
            //     — the object cannot flood. A symmetric trigger, which also
            //     made a ruling harder to STOP, let rulings run on past their
            //     coverage and pushed a 4 mm window to 0.571 against the 0.56
            //     ceiling (scene3d-plot-safety). Plot safety outranks tidiness.
            //   - A ruling that has stopped can still resume, but only where
            //     coverage genuinely RISES by more than the feather can fake —
            //     entering the terminator, say. Inside a uniform zone, where the
            //     feather was the only thing talking, it stays stopped. That is
            //     the chatter, gone, with the shading left intact.
            //   - The margin applies to a RE-start only. A ruling's FIRST start
            //     inside a continuous span keeps the legacy test, so a ruling
            //     stock would have drawn is still drawn: charging the margin on
            //     every start instead cost 13-20% of the fill ink across the
            //     tone goldens, which is a tone change, not a continuity fix.
            dropZone = (drawing || !everDrew)
              ? rank >= covCapped + jit
              : rank >= covCapped + jit - HYST_RANK;
            // Dash duty — the reflected rim breaks its rulings rather than
            // tightening them (§5.1: widened spacing + duty 0.7). A duty break
            // is DELIBERATE, so it cuts hard and is never bridged.
            if (!dropZone && zone) {
              const duty = clamp(finite(Regions.formInk(zone).duty, 1), 0, 1);
              if (duty < 1 && sfHash(lineIndex + 7717, Math.round(s / 2)) >= duty) { dropZone = true; dutyBreak = true; }
            }
          } else {
            dropZone = shade < threshold;
          }
          if (dropZone) {
            // Ordered-dither drop zone. Legacy (no highlight, or not the
            // highlight band): drop = bare paper. This is the ONE bridgeable
            // break: it is the dither's per-sample verdict, and on a wrapped
            // surface it chatters (see RULING CONTINUITY above). A duty break
            // is deliberate and still cuts hard.
            drawing = false;
            if (!hl || !hlIsHL(smp.I)) {
              flushHL();
              if (dutyBreak) flush();
              else softDrop({ x: smp.x, y: smp.y, z: smp.z });
              continue;
            }
            const t = hl.treatment;
            if (t === 'dashed' || t === 'dotted') { flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue; }
            // O11/O14 — `sparse` and `stippleOut` used to push their survivors
            // into the BASE run, untagged: they came out in the object pen and
            // read as slightly thinner fill rather than as a highlight, and the
            // highlight pen never reached them. They belong on the highlight
            // channel, like keep/dashed/dotted.
            if (t === 'sparse') {
              if (!lineKept) { flush(); flushHL(); continue; }
              flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            if (t === 'stippleOut') {
              // Thin toward the hotspot: keep-probability rises with shade (away
              // from the glint), deterministic on the quantized screen point.
              const keepProb = clamp((hlDensity / 100) * (0.3 + shade * 2), 0, 1);
              if (sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) >= keepProb) { flush(); flushHL(); continue; }
              flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            // altFill / burst: base fill drops here; a region pass fills it.
            flush(); flushHL(); continue;
          }
        }
        flushHL();
        drawing = true; everDrew = true;
        addPt({ x: smp.x, y: smp.y, z: smp.z });
      }
      flush();
      flushHL();
    };

    const emitFamily = (fixAxis, count, back, zoneGate) => {
      nextFam(zoneGate ? `gate${zoneGate}` : 'A');
      for (let i = 0; i < count; i++) {
        const fixVal = (i + 0.5) / count;
        emitLine(axisLine(fixAxis, fixVal), (i + 0.5) / count, back, i, count, rankOf(i), zoneGate,
          fixAxis === 'b' ? { a: 0, b: 1 / count } : { a: 1 / count, b: 0 },
          fixAxis === 'b' ? { a: 1, b: 0 } : { a: 0, b: 1 });
      }
    };

    // ── Fill ANGLE on a wrapped surface ────────────────────────────────────────
    // Live defect (Jay): "Style > Hatch > Angle does nothing on at least one of
    // the shapes." buildObject documented `fillAngle` in its opts contract and
    // the scene3d caller passed it, but the module never read it — every
    // chart-wrapped primitive was hard-wired to the meridian family, so the dial
    // re-grouped the fill and re-emitted identical line art. (Faceted prims and
    // the flat-silhouette fallback always honoured it, hence "at least one".)
    //
    // The angle is measured in the surface's OWN tangent frame — exactly the
    // convention the faceted path uses, where 0 runs along the face's first
    // parametric axis. Here that first axis is `a` (the along-axis sweep), so:
    //   0°  ⇒ meridians  (the legacy hatch family — byte-identical, see below)
    //   90° ⇒ parallels  (the latitude family)
    // and everything between is a helical family that still wraps the form.
    // The rotation is done in the (a,b) parameter square, so the fill keeps
    // landing exactly on the rendered surface; `b` is periodic (the wind seam),
    // so a line clipped at b=0/b=1 continues as its neighbour with no visible
    // break. Deterministic — no RNG.
    //
    // Returns the family as { span, lineAt(frac) }. `frac` (0..1) is the line's
    // position across the family — the same 0..1 offset the axis families use —
    // and lineAt returns that line's paramAt(tt), or null when it misses the
    // parameter square entirely.
    const angleFamily = (angleDeg) => {
      const rad = (finite(angleDeg, 0) * Math.PI) / 180;
      const da = Math.cos(rad); const db = Math.sin(rad);   // along the line
      const na = -db; const nb = da;                        // across the family
      // Perpendicular extent of the unit square → the offsets to sweep through.
      const projs = [0, na, nb, na + nb];
      const cMin = Math.min.apply(null, projs);
      const span = Math.max.apply(null, projs) - cMin;
      const lineAt = (frac) => {
        const c = cMin + frac * span;
        // Clip the infinite line p(t) = c·n + t·d to the unit square (slab clip).
        let t0 = -Infinity; let t1 = Infinity;
        let inside = true;
        const slab = (p0, dir) => {
          if (Math.abs(dir) < 1e-12) { if (p0 < -1e-9 || p0 > 1 + 1e-9) inside = false; return; }
          const ta = (0 - p0) / dir; const tb = (1 - p0) / dir;
          t0 = Math.max(t0, Math.min(ta, tb));
          t1 = Math.min(t1, Math.max(ta, tb));
        };
        slab(c * na, da);
        slab(c * nb, db);
        if (!inside || !(t1 > t0)) return null;
        const a0 = c * na; const b0 = c * nb;
        return (tt) => {
          const t = t0 + (t1 - t0) * tt;
          return { a: clamp(a0 + t * da, 0, 1), b: clamp(b0 + t * db, 0, 1) };
        };
      };
      return { span, lineAt, na, nb, da, db };
    };

    const emitAngledFamily = (angleDeg, count, back, zoneGate, densityCross) => {
      nextFam(densityCross ? 'over' : (zoneGate ? `gate${zoneGate}` : 'A'));
      const fam = angleFamily(angleDeg);
      // Keep the LINE SPACING (not the line count) constant as the family
      // rotates, so Density reads the same at every angle. span = 1 on an axis.
      const n = Math.max(2, Math.round(count * fam.span));
      for (let i = 0; i < n; i++) {
        const at = fam.lineAt((i + 0.5) / n);
        // Same dark→dense ordered-dither rank the axis families use. Adjacent
        // lines are span/n apart ALONG the family normal, in parameter space.
        const step = fam.span / n;
        if (at) emitLine(at, (i + 0.5) / n, back, i, n, rankOf(i), zoneGate,
          { a: fam.na * step, b: fam.nb * step }, { a: fam.da, b: fam.db }, densityCross);
      }
    };

    // ── THE CROSSED FAMILY IS MEASURED ON SCREEN, NOT IN THE CHART ────────────
    //
    // §2.3 states the rule as a statement about the EYE: crossed families sit at
    // +65°, "never +90°, which produces a visible square grid and moirés against
    // the raster". Until Round 8 that +65° was added to `fillAngle` inside the
    // (a,b) PARAMETER square and only then pushed through the chart, so what the
    // eye actually saw was the pushforward of 65°, which is 65° only where the
    // chart happens to be conformal and isotropic. On a sphere it is neither: the
    // pushforward metric is (R·cos v · du, R · dv), so as cos v → 0 toward the
    // pole the u-component collapses and any family carrying a dv component
    // swings toward 90° ON SCREEN against the parallels. Measured on the drawing
    // (length-weighted orientation histogram per 4 mm window): the terminator's
    // crossing ran a median 70° with a p90 of 85° and 13 % of windows at or past
    // 80° — the lit pole read as a clean square grid while the source said 65 the
    // whole time. It is also why O26's band boundaries were traceable: the flips
    // lined up along parameter-space isolines rather than along anything the
    // viewer can see.
    //
    // So the crossed family is now built the other way round. At every sample we
    // take family A's SCREEN direction (its own pushforward), rotate THAT by 65°
    // in screen space, and pull the result back through the inverse Jacobian to
    // get the parameter-space direction to march in. The family is therefore a
    // set of integral curves of a direction field rather than straight lines in
    // the chart — it CURVES in parameter space precisely so that it stays
    // straight-angled on screen, which is the frame the criterion is written in.
    //
    // Two things are deliberately NOT changed:
    //   - the crosshatch mapper's own family B (`cross.angleDelta`) keeps its
    //     parameter-frame semantics, because that dial is documented as matching
    //     the faceted path's `crossFamilies` exactly and is a user-facing angle;
    //   - the LINE BUDGET. The streamlines are seeded at the nominal family's own
    //     line positions, so `count` and the seeding pitch are untouched and the
    //     ladder's ink weights carry over unchanged.
    const CROSS_MIN_DET = 1e-9;
    // Fraction of the plot floor at which a traced ruling is treated as having
    // collapsed onto another (see sepDist below).
    const CROSS_SEP_FRAC = 0.5;

    // Pull an on-screen direction (tx,ty) back into the parameter square through
    // the inverse of J = [dA dB]. Returns null where J is degenerate — at a pole
    // or on the silhouette, where the surface has no two independent screen
    // directions to speak of and the question has no answer.
    const pullbackDir = (smp, tx, ty) => {
      if (!smp || !smp.dA || !smp.dB) return null;
      const det = smp.dA.x * smp.dB.y - smp.dB.x * smp.dA.y;
      const scale = Math.hypot(smp.dA.x, smp.dA.y) * Math.hypot(smp.dB.x, smp.dB.y);
      if (!(Math.abs(det) > CROSS_MIN_DET * Math.max(1e-12, scale))) return null;
      const a = (smp.dB.y * tx - smp.dB.x * ty) / det;
      const b = (smp.dA.x * ty - smp.dA.y * tx) / det;
      const n = Math.hypot(a, b);
      if (!(n > 1e-12)) return null;
      return { a: a / n, b: b / n };
    };

    // The parameter direction whose screen pushforward sits `deg` from family
    // A's, with the rotation SENSE (+1/−1) fixed once per family so the whole
    // family crosses the same way round.
    const screenCrossDir = (smp, aDir, deg, sense) => {
      if (!smp || !smp.dA || !smp.dB) return null;
      const sx = smp.dA.x * aDir.a + smp.dB.x * aDir.b;
      const sy = smp.dA.y * aDir.a + smp.dB.y * aDir.b;
      const L = Math.hypot(sx, sy);
      if (!(L > 1e-9)) return null;
      const rad = (sense * finite(deg, 65) * Math.PI) / 180;
      const c = Math.cos(rad); const s = Math.sin(rad);
      return pullbackDir(smp, (sx * c - sy * s) / L, (sx * s + sy * c) / L);
    };

    const alignTo = (d, ref) => (ref && (d.a * ref.a + d.b * ref.b) < 0 ? { a: -d.a, b: -d.b } : d);
    const inSquare = (p) => p.a >= 0 && p.a <= 1 && p.b >= 0 && p.b <= 1;

    // Build the whole screen-frame crossed family once, and cache it: the T
    // gate, the F gate and the Density-overflow pass all emit the SAME geometry
    // and differ only in which zone they are allowed to draw in, so tracing once
    // makes the new family cheaper than the three straight ones it replaces.
    const crossFamilyCache = new Map();
    const buildCrossFamily = (baseAngleDeg, deg, count) => {
      const key = `${baseAngleDeg}|${deg}|${count}`;
      if (crossFamilyCache.has(key)) return crossFamilyCache.get(key);
      const nominal = angleFamily(finite(baseAngleDeg, 0) + finite(deg, 65));
      const n = Math.max(2, Math.round(count * nominal.span));
      const step = nominal.span / n;
      const nomOff = { a: nominal.na * step, b: nominal.nb * step };
      const nomDir = { a: nominal.da, b: nominal.db };
      // Family A's parameter direction — the frame everything is measured from.
      const aRad = (finite(baseAngleDeg, 0) * Math.PI) / 180;
      const aDir = opts.mapper === 'contour'
        ? { a: 0, b: 1 }
        : { a: Math.cos(aRad), b: Math.sin(aRad) };
      // Fix the rotation sense once, at the first sample that has a frame: pick
      // whichever of ±deg lands closer to where the parameter-frame family used
      // to run, so the drawing keeps the same handedness it always had.
      let sense = 1;
      for (let i = 0; i < n && sense === 1; i++) {
        const at = nominal.lineAt((i + 0.5) / n);
        if (!at) continue;
        const seed = at(0.5);
        const smp = sampleAt(seed.a, seed.b);
        if (!smp || !smp.dA || !smp.dB) continue;
        const plus = screenCrossDir(smp, aDir, deg, 1);
        const minus = screenCrossDir(smp, aDir, deg, -1);
        if (!plus || !minus) continue;
        const dp = Math.abs(plus.a * nomDir.a + plus.b * nomDir.b);
        const dm = Math.abs(minus.a * nomDir.a + minus.b * nomDir.b);
        sense = dm > dp ? -1 : 1;
        break;
      }
      const dirField = (p, ref) => {
        const smp = sampleAt(p.a, p.b);
        const d = smp ? screenCrossDir(smp, aDir, deg, sense) : null;
        // Degenerate frame (pole / silhouette): fall back to the nominal
        // parameter direction rather than stopping the line dead.
        return alignTo(d || nomDir, ref || nomDir);
      };

      // ── THE RULINGS ARE SPACED IN SCREEN SPACE, NOT LEFT TO THE FIELD ────────
      //
      // Integral curves of a direction field are NOT an evenly-spaced family.
      // Where the field folds they run together onto a caustic, and every ruling
      // that reaches it lands on the same locus. That is not a modelling
      // subtlety — it is plainly visible: the first cut of this family drew a
      // solid black curve across the lit pole of the 92 mm ball, and the
      // window there went from D 0.433 to D 0.688 against a 0.56 object
      // ceiling. No per-ruling pitch estimate can catch it, because the rulings
      // that collide are not adjacent in the family; measuring the offset to
      // line i±1 more conservatively made it WORSE (0.644 → 0.688), which is
      // the measurement that ruled the estimate out as the cause.
      //
      // So spacing is enforced where the criterion is stated — on screen. A
      // ruling stops the moment it comes within the plot floor of a ruling
      // already laid down (Jobard–Lefebvre evenly-spaced streamlines). This is
      // §0 verbatim, applied to a curved family: past the floor you do not get
      // darker by ruling closer, so the ruling ends. Ending a stroke is also the
      // idiom the rest of this fill already speaks — the dither terminates
      // rulings everywhere.
      //
      // Occupancy is a sparse screen-space hash at the separation distance.
      // Back-facing samples are neither stamped nor tested: they project on top
      // of the front surface and would block rulings against geometry that is
      // not drawn.
      // WHAT SEPARATION, EXACTLY. The traced family is the FINE grid the ladder
      // subsets — the dither drops whole rulings by rank, so the geometry is laid
      // at the master pitch and only a fraction of it is ever drawn. Separating
      // at the master pitch itself therefore destroys the family before the
      // ladder gets to choose from it: measured, T fell 0.420 → 0.323 and T/F
      // went under the spec's own 1.25 on the big ball. The separation exists to
      // catch COLLAPSE — the caustic, where spacing goes to zero — not to space
      // the family, which the seeding already did. So it sits at a fraction of
      // the plot floor, low enough that an ordinary ruling never trips it.
      const sepDist = Math.max(1e-3, floorPitch * CROSS_SEP_FRAC);
      const CELL = sepDist * 0.7;
      const occ = new Map();
      const cellKey = (x, y) => ((Math.floor(x / CELL) + 8192) * 65536) + (Math.floor(y / CELL) + 8192);
      const occupiedByOther = (x, y, self) => {
        const ix = Math.floor(x / CELL); const iy = Math.floor(y / CELL);
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const v2 = occ.get(((ix + i + 8192) * 65536) + (iy + j + 8192));
            if (v2 !== undefined && v2 !== self) return true;
          }
        }
        return false;
      };
      const stamp = (x, y, self) => {
        const k = cellKey(x, y);
        if (!occ.has(k)) occ.set(k, self);
      };
      // EACH STREAMLINE CARRIES ITS NOMINAL COUNTERPART'S ARC LENGTH, centred on
      // the same seed. This is not cosmetic. A streamline is free to stay inside
      // the parameter square much longer than the straight chord it replaces, and
      // an unbounded trace put ~2x the ink on every ruling: the worst window on
      // the 92 mm ball went from 30 mm of ink to 66 mm and D from 0.529 to 0.669,
      // straight through the 0.56 object ceiling. Binding the arc length keeps
      // ink-per-ruling equal to the budget the ladder actually allocated, and it
      // keeps the k-th point of line i and the k-th point of line i+1 at the same
      // arc length from their seeds — which is what makes the neighbour offset
      // below an honest measurement of the local spacing rather than a guess.
      const halfSteps = Math.max(4, Math.round(steps / 2));
      const trace = (seed, nomLen, self) => {
        const h = Math.max(1e-4, nomLen / 2) / halfSteps;
        const fwd = []; const bwd = [];
        const walk = (sign, into) => {
          let cur = { a: seed.a, b: seed.b };
          let ref = null;
          for (let k = 0; k < halfSteps; k++) {
            let d = dirField(cur, ref);
            if (ref == null && sign < 0) d = { a: -d.a, b: -d.b };
            const mid = { a: cur.a + d.a * h * 0.5, b: cur.b + d.b * h * 0.5 };
            if (!inSquare(mid)) break;
            const d2 = dirField(mid, d);
            const nx = { a: cur.a + d2.a * h, b: cur.b + d2.b * h };
            if (!inSquare(nx)) break;
            // Screen-space separation: walk the new step at sub-cell resolution
            // and stop the ruling the moment it enters another ruling's floor.
            const s0 = sampleAt(cur.a, cur.b);
            const s1 = sampleAt(nx.a, nx.b);
            if (s0 && s1 && s0.front && s1.front) {
              const segLen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
              const sub = Math.max(1, Math.ceil(segLen / (CELL * 0.5)));
              let blocked = false;
              for (let q = 1; q <= sub; q++) {
                const u = q / sub;
                const px = s0.x + (s1.x - s0.x) * u; const py = s0.y + (s1.y - s0.y) * u;
                if (occupiedByOther(px, py, self)) { blocked = true; break; }
              }
              if (blocked) break;
              for (let q = 0; q <= sub; q++) {
                const u = q / sub;
                stamp(s0.x + (s1.x - s0.x) * u, s0.y + (s1.y - s0.y) * u, self);
              }
            }
            cur = nx; ref = d2;
            into.push({ a: cur.a, b: cur.b, da: d2.a, db: d2.b });
          }
        };
        walk(1, fwd);
        walk(-1, bwd);
        const d0 = dirField(seed, null);
        const pts = [];
        for (let i = bwd.length - 1; i >= 0; i--) pts.push(bwd[i]);
        pts.push({ a: seed.a, b: seed.b, da: d0.a, db: d0.b });
        for (let i = 0; i < fwd.length; i++) pts.push(fwd[i]);
        return { pts, seedIndex: bwd.length };
      };
      const lines = [];
      for (let i = 0; i < n; i++) {
        const at = nominal.lineAt((i + 0.5) / n);
        if (!at) { lines.push(null); continue; }
        // The nominal chord's own length through the parameter square — the arc
        // budget this ruling is entitled to.
        const p0 = at(0); const p1 = at(1);
        const nomLen = Math.hypot(p1.a - p0.a, p1.b - p0.b);
        lines.push(trace(at(0.5), nomLen, i));
      }
      // NEIGHBOUR OFFSET, measured rather than assumed. Every streamline is
      // marched with the same step from a seed on the nominal family's own
      // normal, so index k is the same arc length along every line: the vector
      // from line i's k-th point to line i+1's k-th point IS the local offset to
      // the neighbouring ruling, which is the quantity the plot-safe cap needs.
      // Where the neighbour has already run off the square we fall back to the
      // nominal seeding offset.
      // BOTH neighbours, and the TIGHTER of the two — a ruling is as crowded as
      // its closest neighbour, not as its average one. Where neither neighbour
      // reaches this arc length (the family is running off the surface, which on
      // a sphere is exactly the pole) the last measured offset is carried
      // forward rather than reverting to the nominal seeding offset: the nominal
      // is an UPPER bound on the spacing, and handing an upper bound to a cap
      // whose whole job is to catch crowding licences the flood it exists to
      // prevent.
      lines.forEach((L, i) => {
        if (!L) return;
        const sides = [lines[i - 1] || null, lines[i + 1] || null];
        const raw = L.pts.map((p, k) => {
          let best = null;
          sides.forEach((o) => {
            if (!o) return;
            const q = o.pts[k - L.seedIndex + o.seedIndex];
            if (!q) return;
            const off = { a: q.a - p.a, b: q.b - p.b };
            const m = Math.hypot(off.a, off.b);
            if (!(m > 1e-9)) return;
            if (!best || m < best.m) best = { off, m };
          });
          // Diverging past the seeding pitch is legitimate but unbounded, so it
          // is clamped back to nominal: extra room is never spent, only crowding
          // is ever acted on.
          return best ? (best.m > step ? nomOff : best.off) : null;
        });
        let carry = nomOff;
        for (let k = 0; k < raw.length; k++) { if (raw[k]) carry = raw[k]; else raw[k] = carry; }
        for (let k = raw.length - 1; k >= 0; k--) { if (raw[k] === nomOff && raw[k + 1]) raw[k] = raw[k + 1]; else break; }
        L.off = raw;
      });
      const fam = { n, lines, step, nomOff };
      crossFamilyCache.set(key, fam);
      return fam;
    };

    // Emit the screen-frame crossed family. Same signature role as
    // emitAngledFamily, same line budget, same ladder ranks.
    const emitScreenCross = (baseAngleDeg, deg, count, back, zoneGate, densityCross) => {
      const fam = buildCrossFamily(baseAngleDeg, deg, count);
      for (let i = 0; i < fam.n; i++) {
        const L = fam.lines[i];
        if (!L || L.pts.length < 2) continue;
        const last = L.pts.length - 1;
        const idxAt = (tt) => clamp(tt, 0, 1) * last;
        const paramAt = (tt) => {
          const f = idxAt(tt);
          const k = Math.min(last - 1, Math.floor(f));
          const u = f - k;
          const p = L.pts[k]; const q = L.pts[k + 1];
          return { a: clamp(p.a + (q.a - p.a) * u, 0, 1), b: clamp(p.b + (q.b - p.b) * u, 0, 1) };
        };
        const dirAt = (tt) => L.pts[Math.round(idxAt(tt))] || L.pts[0];
        const lineDir = (tt) => { const p = dirAt(tt); return { a: p.da, b: p.db }; };
        const pitchStep = (tt) => L.off[Math.round(idxAt(tt))] || fam.nomOff;
        emitLine(paramAt, (i + 0.5) / fam.n, back, i, fam.n, rankOf(i), zoneGate,
          pitchStep, lineDir, densityCross);
      }
    };

    // I8 — SHADOW SENSITIVITY infill. The base dither can't densify shadow past a
    // meridian's own length (its rank is tied to its longitude), so graded
    // darkening is added as EXTRA lines confined to the dark region: a sample
    // survives only where I < SHADOW_TH, and each extra line's rank gates it by
    // stage so DEEPER shadow keeps MORE of them → a smooth dark gradient. More
    // sensitivity stages → more infill lines + a finer gradient. Default
    // (shadowSens 1) emits nothing → byte-identical.
    // `lineAt(frac)` places the infill line at the family's own 0..1 offset, so
    // the infill follows whatever direction the base family runs (axis or
    // angled) instead of always lying along the meridians.
    const emitShadowInfill = (lineAt, mainCount, back) => {
      if (!shadowGrades) return;
      const wantFront = !back;
      const extra = (shadowSens - 1) * Math.max(2, mainCount);
      for (let i = 0; i < extra; i++) {
        const paramAt = lineAt((i + 0.75) / extra); // interleaved with the base family
        if (!paramAt) continue;
        const rank = i % shadowSens;       // 0..shadowSens-1
        let run = [];
        const flush = () => { pushRun(run, back); run = []; };
        for (let s = 0; s <= steps; s++) {
          const tt = s / steps;
          const pr = paramAt(tt);
          const smp = sampleAt(pr.a, pr.b);
          if (!smp || smp.front !== wantFront || smp.I >= SHADOW_TH) { flush(); continue; }
          const stg = Regions.shadowStage(smp.I, shadowSens, SHADOW_TH);
          if (!stg.inRegion || stg.stage < rank) { flush(); continue; } // deeper shadow keeps more
          run.push({ x: smp.x, y: smp.y, z: smp.z });
        }
        flush();
      }
    };

    // Render one pass of the current mapper. `count` is the line/row budget
    // (reduced for the sparser back family) and `back` selects the far surface.
    // Returns false only for an unsupported mapper (so the front pass can bail).
    const runMapper = (count, back) => {
      const wantFront = !back;
      // Hatch/crosshatch are the two mappers that expose the Angle dial. 0 (and
      // any multiple of 180) is the legacy meridian family and takes the
      // axis-aligned emitters — byte-identical to the pre-fix output, so an
      // existing scene at angle 0 and every direct caller that omits fillAngle
      // are untouched. Contour/spiral/stipple have no Angle control and keep
      // their own families.
      const hatchAngle = finite(opts.fillAngle, 0);
      const onMeridianAxis = (((hatchAngle % 180) + 180) % 180) === 0;
      const meridianAt = (frac) => axisLine('b', frac);
      // Crosshatch family-B controls, clamped to the SAME ranges the faceted
      // path and the params schema use. A wrapped family's spacing is 1/count,
      // so the faceted "spacing × ratio" is "count ÷ ratio" here.
      const cross = opts.cross || {};
      const crossDelta = clamp(finite(cross.angleDelta, 90), 10, 170);
      const crossRatio = clamp(finite(cross.densityRatio, 1), 0.25, 2);
      const crossTriple = cross.triple === true;
      // Emit a family that is NOT the primary one, at an arbitrary angle. When
      // the primary family sits on a parametric axis the crossing family takes
      // the axis emitters too (delta 90 ⇒ the parallels family, exactly what
      // crosshatch has always emitted); when the primary is already an angled
      // scanline family, so is the crossing one. Either way the default
      // (delta 90, ratio 1, no triple) reproduces the previous output exactly.
      const emitSecondary = (angleDeg, count, back) => {
        if (!onMeridianAxis) { emitAngledFamily(angleDeg, count, back); return; }
        const a180 = (((finite(angleDeg, 0) % 180) + 180) % 180);
        if (a180 === 0) emitFamily('b', count, back);
        else if (a180 === 90) emitFamily('a', count, back);
        else emitAngledFamily(angleDeg, count, back);
      };
      // §5.0's hard ceiling, discharged: the ladder cannot reach a core shadow
      // by coverage alone (it runs out at full family), so the TERMINATOR — and
      // only the terminator — gains a second family, at +65°. Never +90°: an
      // orthogonal pair reads as a square grid and beats against the raster
      // (§2.3). This is what makes T out-ink F, which is the whole dip.
      // ROUND 8: the +65° is now measured in the SCREEN frame (see
      // emitScreenCross). One traced family serves all three passes.
      const emitTerminatorCross = (count, back) => {
      if (typeof globalThis !== 'undefined') globalThis.__SF_FAM = 'cross';
        if (!zonesOn) return;
        const base = finite(opts.fillAngle, 0);
        emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, 'T');
        emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, 'F');
        // The Density overflow (see the line budget): everything Density asked
        // for past the plot floor, laid down in a second direction instead of a
        // tighter pitch. Zero at and below the floor, so it is inert until it is
        // needed.
        if (densityOverflow > 0) {
          emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, null, true);
        }
      };
      if (mapper === 'hatch') {
        if (onMeridianAxis) {
          emitFamily('b', count, back); // meridians wrap top-to-bottom
          emitTerminatorCross(count, back);
          emitShadowInfill(meridianAt, count, back);
        } else {
          emitAngledFamily(hatchAngle, count, back);
          emitTerminatorCross(count, back);
          emitShadowInfill(angleFamily(hatchAngle).lineAt, count, back);
        }
      } else if (mapper === 'crosshatch') {
        // Family B is `crossDensityRatio` SPACING wider than family A, i.e. this
        // many lines; ratio 1 leaves the count untouched.
        const countB = Math.max(2, Math.round(count / crossRatio));
        if (onMeridianAxis) emitFamily('b', count, back);
        else emitAngledFamily(hatchAngle, count, back);
        emitSecondary(hatchAngle + crossDelta, countB, back);      // the crossing family
        // §2.3 — the tone-driven third pass goes to +32°, not +45°: with family B
        // already at the user's delta, +45 lands close enough to A or B to beat.
        if (crossTriple) emitSecondary(hatchAngle + 32, countB, back); // darkest-band third pass
        emitTerminatorCross(count, back);
        emitShadowInfill(onMeridianAxis ? meridianAt : angleFamily(hatchAngle).lineAt, count, back);
      } else if (mapper === 'contour') {
        emitFamily('a', count, back); // latitude rings following the form
        emitTerminatorCross(count, back);
        emitShadowInfill((frac) => axisLine('a', frac), count, back);
      } else if (mapper === 'spiral') {
        // One continuous helix: the ALONG-axis coordinate sweeps 0→1 while the
        // AROUND coordinate winds `turns` times. `count` (line budget) is amplified
        // by SPIRAL_TURN_GAIN so Density 100 packs the loops toward full overlap
        // (I13); the back-face pass keeps its reduced `count`. The spiral controls
        // (I14) each warp this helix and are a strict no-op at their defaults.
        const sp = opts.spiral || {};
        const phase = finite(sp.offset, 0) / 360;              // angle offset → winding phase
        const gamma = clamp(finite(sp.eccentricity, 1), 0.3, 3); // sweep easing (1 = even)
        const symmetric = sp.center === 'bboxCenter';          // double helix from the middle
        const snap = sp.axisSnap === true;                     // wind the OTHER parametric axis
        const turns = Math.max(4, Math.min(SPIRAL_MAX_TURNS, Math.round(count * SPIRAL_TURN_GAIN)));
        // Same run sink as emitLine: a helix loop is a ruling too, and its rank
        // (the turn it is on) is compared against a coverage that varies along
        // the loop, so it chattered in exactly the same way — just less often,
        // because a whole turn shares one rank.
        const sink = makeSink(back, null, nextFam('spiral'));
        const flush = sink.flush;
        const total = steps * turns;
        for (let s = 0; s <= total; s++) {
          const f = s / total;
          // Along-axis sweep (0..1). bboxCenter folds it into a symmetric up-and-
          // down double helix; eccentricity eases where the loops bunch.
          let sweep = symmetric ? (f < 0.5 ? f * 2 : (1 - f) * 2) : f;
          if (gamma !== 1) sweep = Math.pow(sweep, gamma);
          const wind = (f * turns + phase) % 1;
          const smp = snap ? sampleAt(wind, sweep) : sampleAt(sweep, wind);
          if (!smp || smp.front !== wantFront) { flush(); continue; }
          if (toneOn) {
            // O18 — the spiral used to gate on a hardcoded `shade < 0.12` and
            // ignored `ladder[]` outright, so `bands` did nothing at all on a
            // spiral-filled object. A helix has no family index, so its rank is
            // the TURN it is on: whole loops drop out toward the light, which
            // keeps the arcs continuous instead of speckling the helix.
            if (useLadder) {
              const zone = zoneOf(smp);
              const cov = zone ? zoneCoverage(zone, false) : coverageForSample(smp.I);
              if (rankOf(Math.floor(f * turns)) >= cov) { sink.softDrop({ x: smp.x, y: smp.y }); continue; }
            } else {
              const shade = clamp(1 - smp.I, 0, 1);
              if (shade < 0.12) { flush(); continue; }
            }
          }
          sink.addPt({ x: smp.x, y: smp.y, z: smp.z });
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
              // O18 — stipple used a hardcoded `(…%7)/7` dither and never read
              // `ladder[]`, so a stippled object showed no tone bands at all.
              // The dot's rank is now the same bit-reversed permutation the line
              // families use, compared against the local zone coverage.
              if (useLadder) {
                const zone = zoneOf(smp);
                const cov = zone ? zoneCoverage(zone, false) : coverageForSample(smp.I);
                if (rankOf(r * colsPer + c) >= cov) continue;
              } else {
                const shade = clamp(1 - smp.I, 0, 1);
                const th = ((r * colsPer + c) % 7) / 7; // scattered dither
                if (shade < th) continue;
              }
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

  // Test seam for O6: the lit-band floor is applied deep inside a per-sample
  // dither, so its effect on the emitted paths is diluted by everything else in
  // the pipeline. `rawCoverage` is the brightest band's ladder coverage,
  // `specSize` the glint size (0 = specular off).
  const __litFloorForTest = (rawCoverage, specSize) => {
    const capped = specSize > 0
      ? rawCoverage * clamp(1 - 0.5 * specSize, 0, 1)
      : rawCoverage;
    return clamp(Math.max(capped, rawCoverage * GLINT_KEEP, LIT_FLOOR), 0, 1);
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {},
    { SurfaceFill: { buildObject, chartFor, lineCountFor, __litFloorForTest, __rankForTest: rankOf } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildObject, chartFor, lineCountFor, __litFloorForTest, __rankForTest: rankOf };
  }
})();
