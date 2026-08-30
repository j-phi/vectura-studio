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

  // C4 — the roster PenFill implements, and the committed default. Exposed on
  // the namespace so the UI control and src/config/defaults.js read the same
  // list instead of restating it (AGENTS.md: defaults live in config, never
  // hardcoded twice).
  const STROKE_FILL_STYLES = ['spiral', 'concentric', 'serpentine', 'contourParallel'];
  // The committed default. Owned by src/config/defaults.js as
  // `window.Vectura.SCENE3D_STROKE_FILL_DEFAULT` (AGENTS.md: defaults live in
  // config, not in the engine). Read at CALL time, not at load time — config
  // loads before core in index.html, but a lean test runtime may not have it,
  // and 'spiral' is the floor that keeps the path count flat either way.
  const strokeFillDefault = () => {
    const cfg = Vectura.SCENE3D_STROKE_FILL_DEFAULT;
    return STROKE_FILL_STYLES.indexOf(cfg) !== -1 ? cfg : 'spiral';
  };

  // Bucket B — the twelve variable-width laws. See `isRibbonLaw` inside
  // buildObject for why this set is written out rather than derived.
  const RIBBON_LAWS = {
    nibAngle: 1, taperedEnds: 1, weightModulated: 1, isophoteWidth: 1,
    whiteBand: 1, weightSmoothstep: 1, ampSpacing: 1, weaveDepth: 1,
    interlockWeave: 1, trochoidLoop: 1, amplitudeOnly: 1, onePenDown: 1,
  };

  // ── A CYLINDER'S AND A CONE'S FLAT CAPS ARE NOT IN THE CHART ───────────────
  //
  // `Charts.topoCylinder` is an OPEN TUBE and `Charts.topoCone` is a lateral
  // cone. Neither includes the flat cap the MESH builds and the border pass
  // rims, so the curved fill could not reach it: the app-default cylinder
  // rendered with a completely bare top disc, measured as a 15.1 mm ink-free
  // hole — by a factor of six the largest bare region anywhere in the
  // primitive x mapper matrix, and the only one visible as a hole rather than
  // as tone.
  //
  // The ends of the ALONG-AXIS coordinate are spent on the caps, exactly as
  // `topoCapsule` spends its ends on the hemispheres, and the split is placed
  // by ARC LENGTH (centre -> rim is `capR` of a meridian that is `capR + h +
  // capR` long) so the ruling pitch stays even across the rim instead of
  // jumping at it. The cap centre is a chart singularity like a sphere's pole
  // and `sampleAt` already handles one.
  //
  // Added HERE, in the fill's own chart wrapper, and NOT in `charts.js`: the
  // MESH calls `Charts.topo*` directly, so `tests/baselines/scene3d/*.json`,
  // the charts-parity golden and every silhouette are untouched by this.
  const cappedChart = (raw, sizes, mode) => {
    // topoCylinder/topoCone place the along-axis extent at +-sy, so the side is
    // 2*sy long; the cap's radial extent is the rim radius.
    const alongLen = 2 * Math.max(1e-6, finite(sizes && sizes.sy, 1));
    const capR = Math.max(1e-6, Math.max(finite(sizes && sizes.sx, 1), finite(sizes && sizes.sz, 1)));
    // The cylinder is capped at BOTH ends; the cone tapers to a point at a = 1
    // and so has only a base.
    const both = mode === 'cylinder';
    const totalLen = alongLen + (both ? 2 * capR : capR);
    const f = capR / totalLen;
    if (!(f > 1e-6) || f > 0.49) return raw;
    const lo = f;
    const hi = both ? 1 - f : 1;
    const spanA = hi - lo;
    return (a, b) => {
      if (a < lo) { const t = a / lo; const p = raw(0, b); return { x: p.x * t, y: p.y, z: p.z * t }; }
      if (both && a > hi) { const t = (1 - a) / f; const p = raw(1, b); return { x: p.x * t, y: p.y, z: p.z * t }; }
      return raw(clamp((a - lo) / spanA, 0, 1), b);
    };
  };

  // Shoelace on an implicitly closed {x,y} ring. The SIGN is load-bearing (see
  // `resolveFoldRings`), so this never takes an absolute value.
  const ringSignedArea = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]; const q = ring[(i + 1) % ring.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };

  // Even-odd point-in-ring on an implicitly closed {x,y} ring. Module scope
  // because both the region tracer and the region report need it and they sit
  // ~4600 lines apart in the same closure.
  const ptInRing = (p, ring) => {
    if (!p || !Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]; const b = ring[j];
      if ((a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x) inside = !inside;
    }
    return inside;
  };

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
    const norm = AROUND_IS_U.has(mode) ? (a, b) => raw(b, a) : raw;
    return (mode === 'cylinder' || mode === 'cone') ? cappedChart(norm, sizes, mode) : norm;
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
  // band count. The fix is to decouple the selection from the coordinate
  // entirely: see `ladderStep` below, whose phase accumulator keeps a subset
  // that is EVENLY SPACED at every coverage, so coverage means density. (The
  // first fix was a bit-reversed van der Corput rank, which decoupled the two
  // but spaced the survivors in power-of-two gaps — that is the defect
  // `ladderStep` replaces, and its measurements are recorded there.)
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
  // I5 follow-up — this is the DEFAULT for the master grid's line-count
  // floor (see `floorPen` inside the `STAGE.masterGrid` block below), and
  // remains the ONLY value `floorPitch` (the module-scope plot-safety floor
  // used everywhere else in this closure) ever reads. `opts.masterFloorPen`
  // is an opt-in, pen-multiple override of `floorPen` alone, consumed only
  // by the one call scene3d.js's `curvedMasterFloorPen` makes past Density
  // 100 — see the comment at `floorPen`'s computation for why it can't just
  // be a lower constant.
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
  // ── UNCAPPED MODE — comparison only, NEVER the committed default ────────────
  //
  // Jay, on the ten-law comparison: "no limit on the number of lines you may use
  // — focus on nailing the lighting." The last round's renders were shaped as
  // much by the line budget as by the tone law, so the budget comes off and
  // exactly ONE physical limit is left standing: the PLOT FLOOR. Below ~1.2 x
  // pen width real ink floods and the plot comes off the bed wet; this repo has
  // always stated that bar as `PLOT_FLOOR_PEN` = 2.2 x pen, which is stricter,
  // and it is NOT relaxed here.
  //
  // What is lifted, and where:
  //   - MASTER_MAX_LINES        → `maxLines()`, 4000 instead of 420
  //   - the masterPitch clamp   → the master grid is ruled AT the plot floor, so
  //                               a tone law may ask for any pitch down to it
  //   - the density-derived N   → follows from the pitch above
  // What replaces them: a per-sample clamp `cov ≤ localPitch / floorPitch`, so
  // the floor is enforced where the geometry actually crowds (a sphere's
  // meridians converge to nothing at the poles) rather than on a global average.
  // Every clamp is counted and reported — see `floorStat` / `lastFloorStats`.
  const TONE_UNCAPPED = false;
  const UNCAPPED_MAX_LINES = 4000;
  const maxLines = () => (TONE_UNCAPPED ? UNCAPPED_MAX_LINES : MASTER_MAX_LINES);
  // The last uncapped build's floor report. `null` in the committed build.
  let lastFloorStats = null;
  // The last build's RIBBON report (see `ribbonize`). Unlike `lastFloorStats`
  // this is always written, because it is the only way to tell the three ways a
  // ribbon law can look identical from outside and be completely different
  // inside: a real clipped ribbon, an unclipped one (defect D2 back), and a
  // silent degrade to centrelines because a module was missing. Cheap — one
  // small object per build — and read by the T2/T4 tests.
  let lastRibbonStats = null;
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

  // A closed sweep's two ends meet ON the parameter seam, so they land on the
  // SAME sampled point — this is a floating-point tolerance, not a bridge. It is
  // deliberately far below MIN_MARK (2 x pen = 0.6 mm at the shipped pen): two
  // ends this close are one point, and nothing else can pass it.
  const SEAM_JOIN_MM = 1e-6;
  // Upper bound on a single ruling's sample count. A wrapped helix asks for more
  // samples than an axis line (see angleFamily); this is the same ceiling the
  // Fidelity control already carries, so `steps x N` stays bounded.
  const MAX_LINE_STEPS = 220;

  // STAGED RE-WIRING of the tone/highlight apparatus. All false => every ruling
  // emits continuously end-to-end; only back-face culling, HLR and MIN_RUN_MM
  // may cut it. Flip ONE at a time. See the dependency notes:
  //   - `masterGrid` and `dither` are a PAIR (masterGrid on + dither off = ~5x
  //     the line count with nothing dropped = a solid black form).
  //   - `coverageCap` / `feather` / `hysteresis` / `treatment` / `dashDuty` only
  //     touch quantities INSIDE the dither block, so each is a strict no-op
  //     while `dither` is off.
  //   - `hysteresis` is meaningless without `feather` OR `coverageCap`.
  //   - `dashDuty` needs `toneZones` (it reads FORM_INK[zone].duty).
  //   - `specular` is a total no-op at Highlight = None regardless (`noHL`).
  //   - `lightDriven` and `treatment` are mutually exclusive by construction.
  const HL_STAGE = {
    masterGrid:     true,  // the ladder's line budget (N, masterPitch, densityOverflow)
    toneZones:      false, // Regions.formZone + FORM_INK + the T/F cross families
    dither:         true,  // the rank-vs-coverage drop verdict itself
    coverageCap:    false, // cap = localPitch/floorPitch  AND  the myCeil ceiling
    feather:        false, // featherAt jitter on the comparison
    hysteresis:     false, // the one-sided re-start margin
    specular:       false, // glint cap + the blank H zone
    lightDriven:    false, // the per-sample specular highlight branch
    treatment:      false, // keep/dashed/dotted/sparse/stippleOut dispatch
    dashDuty:       false, // FORM_INK.duty dash breaks (the R rim)
    shadowGrade:    false, // emitShadowInfill
    continuitySink: true,  // bridge + speck cull. LEAVE ON: it only ever removes
                           // ink the dither made; it is the mitigation, not the disease.
  };

  // ── FIVE TONE ALGORITHMS, SIDE BY SIDE ──────────────────────────────────────
  //
  // Jay, on the phase-stepped Stage-1 render: the rulings "sit in visible
  // clusters of two or three with wider gaps between the clusters". Each
  // coverage LEVEL is internally even now (that is what the phase ladder buys),
  // but the ladder itself has only `tone.ladder.length` rungs — 3 on the shipped
  // default, coverages 0.85 / 0.50 / 0.20 read dark→light. Pitch is masterPitch
  // divided by coverage, so those three rungs are three pitches in the ratio
  // 1 : 1.7 : 4.25. Two adjacent rungs inside one crop read exactly as
  // "two or three tight, then a wide gap": the clustering is the BAND STEP.
  //
  // This is a comparison exercise, not a migration. All five laws live here at
  // once and the selector picks one. `ladder` is the committed default and is
  // byte-identical to the behaviour before this block existed.
  //
  //   'ladder'          the control — discrete rungs, phase-stepped selection.
  //   'continuousPitch' no bands at all. Local pitch is a smoothly EASED
  //                     function of intensity: tight in shadow, easing wider
  //                     toward the light. Rulings are placed by integrating that
  //                     pitch field (which is what the phase accumulator already
  //                     is) rather than by selecting from a rung.
  //   'fineLadder'      the minimal change: the same rung mechanism, but the
  //                     rung count is derived from the ladder's own coverage
  //                     RANGE at ~0.02 per rung, so the step falls below the
  //                     visual threshold instead of being removed.
  //   'weightModulated' perfectly even spacing EVERYWHERE — one pitch, the
  //                     sparse-end pitch — with tone carried by pen weight
  //                     instead of by line density. The plotter-real answer
  //                     (heavier pen / doubled pass in shadow) and the strongest
  //                     possible answer to "100 % even".
  //   'layeredCross'    tone by ADDING families: one in the light, a second
  //                     crossed family through the mid-tones, a third in the
  //                     darks. Each family internally even and continuous. The
  //                     classic engraving answer. Its zones come from intensity
  //                     directly — `HL_STAGE.toneZones` stays off.
  //
  // ── FIVE MORE, AIMED AT THE LIGHTING RATHER THAN AT THE SPACING ─────────────
  //
  // The first five are TONE-TRANSFER laws: they differ in how a coverage number
  // becomes placement. These five differ in what the coverage number MEANS.
  //
  //   'perceptualRamp'    the literal reading of "nail the lighting". Line
  //                       density does not map linearly to perceived grey, so
  //                       the intensity→coverage map goes through a calibrated
  //                       tone response (Murray-Davies ink area → CIE L*) and is
  //                       INVERTED, so apparent darkness on paper is linear in
  //                       scene radiance. It also divides by the LOCAL screen
  //                       pitch, which takes the chart's foreshortening out of
  //                       the answer: the grey then tracks the light and only
  //                       the light.
  //   'crossFade'         layeredCross's tonal strength without its two fatal
  //                       flaws. The second and third families are NOT zone
  //                       confined and are never gated: they fade in by
  //                       CONTINUOUS density, starting sparse and thickening, so
  //                       there is no traceable band edge and no ruling ever
  //                       terminates mid-surface. The composed target is split
  //                       across the families by 1 − Π(1 − a_k), so the three
  //                       together hit the target exactly instead of stacking.
  //   'contourFlow'       the rulings follow the LIGHTING instead of the chart.
  //                       Streamlines of the intensity field: 'iso' runs along
  //                       the iso-intensity curves, 'grad' runs down the
  //                       gradient (their orthogonals). The drawing's line
  //                       DIRECTION then describes the light, which is what a
  //                       hand engraver does. Coverage is perceptualRamp's.
  //   'errorDiffused'     perceptualRamp's target, placed by 1-D error diffusion
  //                       with a two-tap carry instead of by a phase
  //                       accumulator. Aperiodic by construction, so no banding
  //                       and no moiré against the raster, at the cost of the
  //                       Sturmian word's two-consecutive-gaps guarantee.
  //   'fullLightingModel' not a tone-transfer law at all — a SHADING MODEL.
  //                       Highlight, mid-tone, terminator, core shadow and
  //                       reflected/bounce light are each rendered as their own
  //                       term, with specular kept separate from diffuse, and
  //                       the composed darkness is then run through the same
  //                       calibrated response perceptualRamp inverts.
  //
  // ── FIVE MORE, ON THE OTHER AXIS: WEIGHT ALONG THE RULING ───────────────────
  //
  // Measured across the eleven above: nine tie at R² 0.00-0.14 on the sphere and
  // the capsule however the coverage law is written, because the emitter takes
  // ONE draw/skip verdict per RULING — it has to, or a ruling ends in open
  // front-facing surface. Tone can therefore only vary PERPENDICULAR to the
  // rulings, and light does not vary that way on a curved form. `contourFlow`
  // escaped by re-aiming the rulings along the light, at the cost of 10.6 mm
  // free ends and collapsed spacing.
  //
  // WEIGHT IS THE OTHER ESCAPE, AND IT COSTS NO CONTINUITY AT ALL: a stroke that
  // changes width mid-stroke breaks no line. The output format carries ONE
  // `meta.weightScale` per path (the renderer and the SVG export both read it as
  // a stroke-width multiplier), so a weight that varies along a ruling is
  // expressed as CONSECUTIVE ABUTTING PIECES — piece k's last point IS piece
  // k+1's first point, so the pen never lifts and nothing ends in open surface.
  // `splitByWeight` is the whole mechanism, and it never drops a short piece
  // (that would be the one thing this construction may not do — leave a hole);
  // it merges it into its neighbour instead.
  //
  //   'weightAlongLine'   the idea, minimal: geometry perfectly even at
  //                       weightModulated's own pitch, weight taken PER SAMPLE
  //                       from the local radiance and from the local pitch, so
  //                       the chart's foreshortening comes out of the tone too.
  //                       Same weight RANGE as weightModulated, so the pair
  //                       differ only in per-sample vs per-run.
  //   'weightDeepDark'    the darks the user says are missing. The base pitch is
  //                       chosen so the HEAVIEST legal stroke saturates it
  //                       (W_DEEP_AREA), and the transfer is the same L*-linear
  //                       response laws 6-10 invert, so the light end stays
  //                       delicate while the shadow runs to near-solid.
  //   'weightPlusSpacing' both channels at once — spacing concentrates toward
  //                       the shadow AND weight ramps, the required
  //                       amplification split geometrically between them, so
  //                       NEITHER has to quantise as hard.
  //   'weightMultiPass'   the plotter-honest deep dark: instead of asking for a
  //                       pen N times as wide, lay N real strokes of the actual
  //                       pen, offset perpendicular by one ink width and centred
  //                       on the ruling. Costs plot time; reports it.
  //   'weightSmoothstep'  the anti-banding study. weightModulated's per-run mean
  //                       weight exactly, but through a 7th-order smoothstep and
  //                       with a golden-ratio dither on the weight, so residual
  //                       quantisation is broken up rather than aligned.
  //
  // ── ROUND 3: NINE MORE, EACH TAKEN FROM A NAMED SOURCE ─────────────────────
  //
  // Jay: "avoid banding and concentrate lines in deep shadow and space in areas
  // of highlighting." The literature survey behind these is in the scratchpad
  // (`hatching-research.md`, 17 primary sources); each law below names its own.
  //
  //   'nestedFineLadder'  THE RE-TEST OF `29fb99f`. Three independent sources
  //                       (Rössl & Kobbelt PG'00 §7; Praun et al. SIGGRAPH'01
  //                       §3; Winkenbach & Salesin SIGGRAPH'94's prioritized
  //                       stroke texture) say the anti-banding mechanism is a
  //                       NESTED prefix of a bit-reversed (van der Corput)
  //                       order: darkening may only ADD rulings, never re-lay
  //                       them. `29fb99f` replaced exactly that with a phase
  //                       accumulator, on the grounds that vdc's kept-index gaps
  //                       are a power-of-two PAIR. But Webb et al. NPAR'02 §3.1
  //                       says the reason a nested ladder bands is too FEW tone
  //                       levels — they went from 6 to 64 — and the phase ladder
  //                       was never compared against a nested one at 64 levels.
  //                       This is that comparison. `phaseFineLadder` is its
  //                       control: the same 64-level tone target, selected by
  //                       the shipped phase accumulator, so the pair differ in
  //                       the SELECTOR and in nothing else.
  //   'phaseFineLadder'   the control for the above. Not a candidate.
  //   'whiteBand'         Rössl & Kobbelt PG'00 §7. Every ruling reserves a
  //                       CONSTANT width w and draws a black core of (1−c)·w
  //                       with white bands of c·w/2 either side, c ∈ [c_min,
  //                       c_max] being the local grey. Nothing is ever dropped,
  //                       so no ruling can vanish and no gap can open; c_min
  //                       guarantees white space (no flood), c_max guarantees a
  //                       core (no hairline). Both ends of the range are clamped
  //                       BY CONSTRUCTION rather than by a tuned curve.
  //   'isophoteWidth'     Goodwin, Vollick & Hertzmann NPAR'07. Stroke thickness
  //                       from how fast the shading FALLS OFF locally: the
  //                       image-space distance from this sample to the chosen
  //                       isophote, d = (I_iso − I)/‖∇I‖. Slow falloff ⇒ broad
  //                       dark band ⇒ thick stroke. A physically-grounded width
  //                       law, not a fitted response.
  //   'strokesGrow'       Praun et al. SIGGRAPH'01 §5. Ink cannot fade in, so a
  //                       new ruling enters as a SHORT black segment at its own
  //                       darkest point and LENGTHENS as the tone deepens:
  //                       clamp(8t − 3.5) on the blend. Needs two numbers per
  //                       ruling, not a per-sample rewrite. IT ENDS RULINGS IN
  //                       OPEN SURFACE BY CONSTRUCTION — that is the mechanism,
  //                       and the number is reported, not hidden.
  //   'evenStreamlines'   Jobard & Lefer 1997, applied to contourFlow's field.
  //                       contourFlow read the light best of every law measured
  //                       (R² 0.444) and had the worst craft (spacing CoV 2.32,
  //                       10.6 mm free ends, 10.2 mm bare). The known fix is
  //                       evenly-spaced streamline PLACEMENT: seed new curves at
  //                       d_sep from the ones already laid, stop a curve when it
  //                       comes within d_test·d_sep of another. d_sep is the
  //                       Salisbury spacing law w = 2h/t evaluated on the LOCAL
  //                       radiance, so the spacing IS the tone and no ladder,
  //                       threshold or quantisation is involved anywhere.
  //   'importanceGreedy'  Salisbury et al. SIGGRAPH'97 §3, the no-quantisation
  //                       reference. importance(x) = the share of the intended
  //                       darkness NOT YET accumulated; a ruling draws only
  //                       where its own mean importance is still positive, and
  //                       its contribution is then subtracted through a blur
  //                       whose DIAMETER is the inter-stroke distance that tone
  //                       needs (w = 2h/t). Spacing is emergent. The quality
  //                       ceiling to measure the others against.
  //   'lozengeStipple'    Copperplate engraving's own anti-banding, anti-moiré
  //                       mark (Goltzius' dotted lozenge; RISD "The Brilliant
  //                       Line"). Where the ladder drops a ruling it leaves a
  //                       residual the next ruling cannot express; that residual
  //                       is spent as short flicks along the dropped ruling,
  //                       thickening toward shadow and tapering to bare paper in
  //                       the light — "a gentle merging of the inscribed marks
  //                       with the white of the paper".
  //   'deepFillTSP'       Velho & Gomes SIGGRAPH'91 / Kaplan & Bosch 2005. In
  //                       the darkest ~15 %, where a ruled family has already
  //                       saturated (inkWidth/floorPitch = 0.509 ink area), the
  //                       ruling is replaced by a boustrophedon space-filling
  //                       traverse of its own gap: ONE continuous path, no extra
  //                       pen lifts, aperiodic phase, and an effective pitch of
  //                       half the ruled pitch without adding a ruling.
  //   'forcedContrast'    Winkenbach & Salesin SIGGRAPH'94 §2.2 + Hertzmann &
  //                       Zorin SIGGRAPH'00 §6.1/§6.3. Practitioners do NOT
  //                       chase the true radiance: "it is sometimes important to
  //                       FORCE TONE by enhancing contrast or inventing
  //                       shadows", and Mach bands / undercuts are fabricated at
  //                       silhouettes. Expect a WORSE apparent-tone R² and,
  //                       possibly, the best-looking drawing. The disagreement
  //                       is the point.
  //   'weightPlusSpacingTuned'  weightPlusSpacing at kappa 0.35 instead of 0.50
  //                       — the prior round's own recommendation, to recover its
  //                       ink cost (2036 mm against weightDeepDark's 1290) and
  //                       its spacing CoV (0.561 against 0.346) by moving
  //                       amplification off the spacing channel and onto the pen.
  //
  // ── ROUND 4: SIX MORE, ALL ON whiteBand's CHASSIS ──────────────────────────
  //
  // Round 3's winner was `whiteBand` (Rössl & Kobbelt PG'00 §7) — constant
  // reserved width, per-sample black core, white margins, nothing ever dropped.
  // sphere·hatch: R² 0.512, off-the-line 5.8 %, L* span 29, darkest L* 51.4,
  // spacing CoV 0.31, zero free ends, 1192 mm of ink. These six each change ONE
  // thing about it, so every comparison is against a single variable.
  //
  //   'whiteLineInverse'  Bewick's white-line engraving, and mezzotint. Lay a
  //                       near-solid ground and CARVE the light out of it by
  //                       widening the white margin. Mechanically: whiteBand
  //                       with the base pitch chosen so the heaviest legal pen
  //                       SATURATES it (6·ink/0.94) instead of leaving a 15 %
  //                       margin (6·ink/0.85), and the transfer stated on the
  //                       white rather than on the ink. The dark end is the
  //                       whole point; the ink cost is high and is reported.
  //   'nibAngle'          A broad/calligraphic nib held at a fixed SCREEN angle.
  //                       The mark's width is w·|sin(θ_stroke − θ_nib)|, so on a
  //                       curved form — where the ruling direction rotates
  //                       continuously — tone varies from DIRECTION alone, with
  //                       no coverage decision taken anywhere. Mean-normalised,
  //                       so the average tone is still whiteBand's and the
  //                       difference between them is purely directional.
  //   'taperedEnds'       No stroke starts or stops at full width. Two tapers:
  //                       one into each end of a run (smootherstep over
  //                       TAPER_MM), and one on the TRANSFER — whiteBand's hard
  //                       [c_min, c_max] clamp is replaced by a soft one, so the
  //                       approach to the pen at the lit end has no knee. Aimed
  //                       squarely at the highlight boundary every law so far
  //                       leaves visible.
  //   'curvatureField'    Hertzmann & Zorin SIGGRAPH'00. Rulings follow the
  //                       principal-curvature directions of the SURFACE rather
  //                       than the chart's parameterisation. The singularity is
  //                       handled explicitly and reported: at an umbilic every
  //                       direction is principal, a sphere is umbilic at every
  //                       point, so the field is BLENDED toward the light's own
  //                       iso-tangent by the curvature anisotropy.
  //   'screenAngles'      Halftone screen-angle theory instead of this file's
  //                       +65°/+32°. A dot screen has 90° symmetry (hence
  //                       15/45/75, 30° apart); a LINE screen has 180°, so three
  //                       families go 60° apart. Worst pair separation 33° → 60°.
  //   'multiScale'        A hatching pyramid. A coarse family at twice the
  //                       reserved pitch carries broad form and lightens the
  //                       highlight below any single family's floor; a fine
  //                       family enters by density from nothing where the coarse
  //                       one runs out of legal pen. Two octaves, each internally
  //                       even, neither anywhere near the plot floor.
  //
  // ── ROUND 5: THE CONTINUOUS SPACING FIELD (`contField*`) ────────────────────
  //
  // Jay, on what the spacing is actually supposed to do:
  //   "it's absolutely fine for lines to be right up against each other to
  //    render pure black, and then EVENLY gradually introduce gaps to add white
  //    — this spacing must be thoughtfully eased along the contour of the
  //    object … two curves on a sphere are stacked with no gap in an area of
  //    total shadow but gradually open up over an area of highlight and then
  //    return to touching where there's shadow on another side."
  //
  // Every law above this line — `ladder`, `phaseFineLadder`, `perceptualRamp`,
  // all of them — places rulings on a MASTER GRID and decides which ones to
  // draw. The realised pitch is therefore always an INTEGER MULTIPLE of the
  // master pitch: 1×, 2×, 3×. There is no such thing as a 1.4× gap, so "evenly
  // gradually introduce gaps" is not something the chassis can express. That is
  // the whole of `phaseFineLadder`'s 0.710 spacing CoV and its 2× largest
  // adjacent step, and no amount of extra tone LEVELS can fix it: the levels
  // quantise the tone, the grid quantises the SPACING, and it is the second one
  // the eye reads as a step.
  //
  // These ten laws throw the grid away. A ruling's position is not chosen from
  // a comb; it is INTEGRATED. Walk the family's cross-direction from one edge of
  // the form to the other, and at each point ask the tone what gap it wants
  // there, in millimetres, then step by exactly that. The gap is a continuous
  // function of position with no quantisation anywhere, so it can ease. Every
  // ruling then draws WHOLE — there is no drop decision left to take, which is
  // also why these laws cannot leave a free end.
  //
  //
  // EVERY `MEASURED` LINE BELOW IS POST-FIX (the walk's step ceiling, see
  // `dfMax`), sphere-hatch unless another cell is named, app-default scene,
  // uncapped. The two references it answers to, on the same cell and harness:
  //   phaseFineLadder  R² 0.045  span  9.2  darkest 78.6  off 38.7%
  //                    median adjacent spacing step 1.87x  ·  40 % monotone
  //   whiteBand        R² 0.512  span 29.0  darkest 51.4  off  5.8%
  //                    median adjacent spacing step 1.21x  ·  50 % monotone
  //
  //   'contFieldPitch'    The baseline. Gap = inkWidth / targetArea(I), i.e.
  //                       the same L*-linear tone target `perceptualRamp` and
  //                       `phaseFineLadder` state, read as a SPACING instead of
  //                       as a probability. Integrated across the family, screen
  //                       metric, floored at the plot floor.
  //                       MEASURED: R² 0.079, span 11.3, darkest 72.4, off the
  //                       line 21.1 %, median adjacent step 1.03x (trimmed max
  //                       1.21x), rho(gap, radiance) 0.897, 80.6 % of adjacent
  //                       transitions with the light, 0 free ends, 0 marks
  //                       outside, 58 flooded 1 mm cells — all at the pole, where
  //                       a per-ruling MEAN pitch cannot see the convergence.
  //                       On ellipsoid-contour, whose rings nearly follow the
  //                       isophotes: R² 0.382, off the line 11.4 %, 90.9 %
  //                       monotone, median step 1.02x.
  //   'contFieldEase'     Smootherstep between the darkest and lightest legal
  //                       pitch. The ease is applied in PITCH space, so the
  //                       clearance itself has zero first and second derivative
  //                       at both ends of the ramp.
  //                       MEASURED: R² 0.150, span 11.3, darkest 73.0, off the
  //                       line 44.0 %, median adjacent step 1.02x, rho 0.820,
  //                       69.2 % monotone. Buys R² by spending gap RANGE
  //                       (0.42-2.34 mm against the baseline's 0.42-1.69) and
  //                       pays for it twice — the off-the-line error doubles and
  //                       the ordering loses 11 points. Best ramp of the round on
  //                       ellipsoid-contour, R² 0.431.
  //   'contFieldSigmoid'  Sterzik, Vollmer & Vollmer (CGF 2024) fitted a
  //                       perceptual response to hatching specifically:
  //                       f(x) = 1 / (1 + (1/a − 1)(1/x − 1)^b), a = 0.4753,
  //                       b = 1.5918. Their curve, on this file's pitch range.
  //                       MEASURED: R² 0.144, span 10.7, darkest 72.9, off the
  //                       line 47.7 %, median step 1.03x, rho 0.848, 72.0 %
  //                       monotone. Their sigmoid beats smootherstep on ORDERING
  //                       at the same ramp and the same cost; both wide-range
  //                       laws trade off-the-line error for L* span. On
  //                       ellipsoid-contour: R² 0.438, 92.0 % monotone — the
  //                       best-ordered cell in the round.
  //   'contFieldMeasured' The tone response INVERTED FROM MEASUREMENT rather
  //                       than from theory. Pass 1 places with the baseline law
  //                       and records what ink area each radiance actually
  //                       received once foreshortening, the floor and the
  //                       silhouette had their say; pass 2 corrects the field by
  //                       the measured residual. Two passes, per family.
  //                       MEASURED: R² 0.126, span 11.4, darkest 72.3, off the
  //                       line 29.1 %, median step 1.03x, rho 0.820, 74.1 %
  //                       monotone. Post-fix it no longer beats the plain
  //                       baseline (29.1 % against 21.1 %): the residual it was
  //                       correcting was largely the bare patch the old step
  //                       ceiling left, and with that gone the LUT over-fits.
  //   'contFieldEquil'    Ostromoukhov (SIGGRAPH 2001) equilibration, on the
  //                       spacing field: rasterise the placed ink → apply dot
  //                       gain → low-pass with an HVS kernel → compare with the
  //                       target luminance → correct the local gap → iterate.
  //                       Three rounds, correction quantised to 16 levels.
  //                       MEASURED: R² 0.072, span 10.8, darkest 72.5, off the
  //                       line 20.8 % — the round's BEST off-the-line on
  //                       sphere-hatch — median step 1.03x, rho 0.894, 80.0 %
  //                       monotone. The local correction is worth about half a
  //                       point of off-the-line over the plain baseline and
  //                       nothing at all on the ramp.
  //   'contFieldAniso'    Zander, Isenberg, Schlechtweg & Strothotte (CGF 2004)
  //                       measure clearance ACROSS THE FLOW only. A gap chosen
  //                       from the seeding offset is right in the middle of a
  //                       ruling and wrong at its tips, where a converging
  //                       family has already closed. So the step is corrected
  //                       against the MEASURED minimum across-flow distance to
  //                       the ruling already laid.
  //                       MEASURED, and it is a NEGATIVE result worth keeping:
  //                       R² 0.028, span 7.5, darkest 88.5, off the line 48.7 %,
  //                       median step 1.14x (the round's worst) and 33.3 %
  //                       monotone (worse than phaseFineLadder's 40 %), 1225 mm
  //                       of ink against the baseline's 3006, 37 rulings vs 54. The minimum works — the
  //                       pole flood is gone (7 flooded cells against 64) — but
  //                       a MINIMUM over a converging family is set by the point
  //                       of convergence, so the pole's clearance requirement
  //                       propagates outward and opens the whole family. On a
  //                       chart whose rulings meet at a singularity, across-flow
  //                       minimum clearance and even tone are not compatible.
  //   'contFieldSurface'  Contour-following: the field is integrated in the
  //                       SURFACE's own arc length, not on screen. The spacing
  //                       is then a property of the form and eases along it,
  //                       and the projection is deliberately left in.
  //                       MEASURED: R² 0.067, darkest 47.0, off the line 52.1 %,
  //                       gaps 0.10-1.32 mm, 146 flooded cells.
  //                       FALSE LIMB-DARKENING, isolated and quantified: an even
  //                       spacing ON THE SURFACE lands 0.10 mm on the paper at
  //                       the limb — a sixth of the plot floor — and drives the
  //                       darkest tone to L* 47 where the light asks for 72.
  //   'contFieldFore'     Its partner. Zander's foreshortening correction,
  //                       |proj_viewplane(cross(t, n))|, divides the wanted gap
  //                       so that a surface turning away from the camera does
  //                       NOT read as darker than the light says. That false
  //                       limb-darkening is a prime suspect for the off-the-line
  //                       error every chart-ruled law carries.
  //                       MEASURED: R² 0.070, darkest 68.1, gaps 0.27-1.62 mm,
  //                       76 flooded cells. It removes MOST of
  //                       contFieldSurface's false darkening (min gap 0.10 →
  //                       0.27 mm, darkest 47.0 → 67.6) and not all of it,
  //                       because |proj(cross(t, n))| is not the screen
  //                       clearance: it omits the SHEAR between the projected
  //                       cross-direction and the projected ruling. `perpPitch`,
  //                       which takes the cross product with the ruling's own
  //                       screen direction, carries that term — which is why the
  //                       plain screen metric (contFieldPitch) beats both, at
  //                       0.63 mm minimum and L* 71.9.
  //   'contFieldTouch'    The sub-floor case, stated. Where the field asks for
  //                       zero clearance the lines TOUCH — that is the intended
  //                       black, not a fault — so the floor is lowered from the
  //                       plot floor (2.2 × pen) to one ink width, at which
  //                       adjacent rulings abut and the area is solid. Flooding
  //                       is not hidden; it is counted and reported.
  //                       MEASURED, and it is the DARK end this family could not
  //                       otherwise reach: R² 0.310, L* span 37.8, DARKEST L* 4.5 — black, against the 76 a single
  //                       family at the plot floor saturates at — off the line
  //                       21.7 %, median adjacent step 1.01x, 86.4 % monotone,
  //                       gaps 0.20-0.88 mm. It costs 6327 mm of ink (twice the
  //                       baseline) and 286 flooded 1 mm cells of 1928 (15 % of
  //                       the form). On CROSSHATCH it floods completely — 1928
  //                       of 1928, moiré RMS 4.9, i.e. no structure left at all
  //                       — so the touching floor is a HATCH-ONLY licence.
  //   'contFieldQuant'    The control for "is continuity worth anything, or
  //                       would 128 levels do?" — `contFieldPitch`'s field with
  //                       the GAP quantised to CF_LEVELS steps. Run at 128 and
  //                       at 256 against the continuous original.
  //                       MEASURED, levels sweep against the same field run
  //                       continuously:
  //                         levels   R²     span  darkest  off    medStep  mono
  //                            16   0.084   11.8   71.9   18.9%   1.01x   53.1%
  //                           128   0.077   11.1   71.9   20.9%   1.03x   71.0%
  //                           256   0.079   11.3   72.4   20.7%   1.02x   83.9%
  //                            ∞    0.079   11.3   72.4   21.1%   1.03x   80.6%
  //                       The RAMP is settled by 16 levels — R² moves 0.012 over
  //                       the whole sweep, which is noise. The EASE is not:
  //                       monotonicity runs 56.7 → 80.0 → 90.0 %, and only at 256
  //                       does a quantised field stop putting reversals into a
  //                       spacing that is supposed to open smoothly. Webb et
  //                       al.'s 64 levels answer the tone question; they do not
  //                       answer this one.
  //
  // ── ROUND 5: TEN NESTED-SERPENTINE / SPACE-FILLING LAWS ────────────────────
  //
  // Jay's brief for this round, in his own words: "wavy lines nest within each
  // other in the darkest areas of shadow to minimize open space, and the
  // amplitude gradually lessens, creating more whitespace." All ten sit on
  // whiteBand's chassis (one even grid, nothing dropped, tone on the pen) and
  // add a CHART-SPACE lateral wave. Amplitude, wavelength, phase offset between
  // neighbours and nesting depth are the tonal channels; the extra ink comes
  // from ARC LENGTH, and is spent on a WIDER reserved pitch — see the WV_ block
  // for the arithmetic and for the three guards that keep a crest inside the
  // silhouette.
  //
  //   'nestedSerpentine'  The plain nest. Neighbours IN PHASE, so the two curves
  //                       are translates and the clearance between them is the
  //                       drawn pitch at every point. Amplitude eases from zero
  //                       in the light to 0.42 of the pitch in the core shadow.
  //   'interlockWeave'    The interlock. Neighbours ANTI-PHASE, each crest
  //                       pointing into its neighbour's trough. Amplitude capped
  //                       live at the clearance the plot floor allows, which is
  //                       the "minimum open space" number the round reports.
  //   'amplitudeOnly'     The control experiment. The pen never moves — every
  //                       scrap of the tone ramp is arc length. It answers "how
  //                       far can elongation alone carry a drawing", which is
  //                       the currency the other nine are spending.
  //   'trochoidLoop'      A circle of radius A rolling along the ruling. Past
  //                       A = lambda/2pi the crests LOOP, laying a chain of
  //                       near-circles that closes the band far faster than any
  //                       single-valued wave can. The deepest-dark candidate.
  //   'waveToRuling'      Amplitude AND wavelength ramp together, so the crests
  //                       walk apart before they stop happening — the continuous
  //                       transition from interlocked serpentine to plain
  //                       ruling, with no switch anywhere in it.
  //   'nestedOctaves'     Nesting DEPTH as the channel: one wave in the light,
  //                       three nested (each half the wavelength and half the
  //                       amplitude of its parent) in the core shadow.
  //   'onePenDown'        One continuous path over the whole form. Rulings run
  //                       boustrophedon and are bridged IN THE CHART, so the
  //                       link is a curve on the surface and never a chord
  //                       across the limb. Read the pen-down count.
  //   'hilbertDepth'      The same refinement taken further — a Takagi/
  //                       blancmange stack, which is the 1-D form of a Hilbert
  //                       order increase, at a recursion depth that rises with
  //                       darkness.
  //   'sfcHalftone'       Velho & Gomes SIGGRAPH '91. Tone along a space-filling
  //                       traverse is laid by CLUSTERING: two pen states, the
  //                       error carried ALONG the curve, so the mean is exact
  //                       and the cluster boundaries cannot line up.
  //   'tourScribble'      Overdraw, in the deepest shadow only. Amplitude past
  //                       0.5 of the pitch with anti-phase neighbours and a
  //                       golden-ratio phase walk, so the waves interpenetrate
  //                       and never lattice. It floods by design; it is counted.
  //
  // ── ROUND 5, MEASURED (sphere·hatch, uncapped, app-default scene) ──────────
  //
  // The two standing bars: whiteBand R² 0.512, off the line 5.8 %, darkest
  // (5th-pct) L* 51.4, 1192 mm, 450 pen-downs; transverseReserve darkest L*
  // 23.6 but 21.5 mm of free end. MARKS OUTSIDE THE SILHOUETTE: 0 for all ten
  // laws on all five cells — the chart-space construction holds.
  //
  //   law                R²     off-line  darkest  ink mm  pen-downs  clearance
  //                                       L* p05             (median, darks)
  //   nestedSerpentine   0.197   36.4 %    52.0    1330.5     811      1.05 mm
  //   interlockWeave     0.208   33.5 %    50.9    1253.0     752      1.30 mm
  //   amplitudeOnly      0.005   48.8 %    80.1    2113.1      61      0.70 mm
  //   trochoidLoop       0.354   13.9 %    20.2    1779.7     866      0.94 mm
  //   waveToRuling       0.144   37.2 %    52.0    1249.6     778      1.05 mm
  //   nestedOctaves      0.036   79.9 %    69.5    1099.6     697      1.44 mm
  //   onePenDown         0.249   16.5 %    48.2    1329.8      19      1.17 mm
  //   hilbertDepth       0.039   78.4 %    69.9    1101.1     708      1.45 mm
  //   sfcHalftone        0.169   21.1 %    53.7    1221.7     951      1.20 mm
  //   tourScribble       0.440   14.9 %     4.5    2047.3     918      0.62 mm
  //   whiteBand          0.512    5.8 %    51.4    1192.4     450      1.48 mm
  //   transverseReserve  0.301   14.5 %    23.6    1292.3     483      1.39 mm
  //
  // THE THREE RESULTS WORTH KEEPING.
  //
  // 1. 'trochoidLoop' IS THE NEW DEEPEST DARK, and it is deeper honestly.
  //    Darkest L* 20.2 against transverseReserve's 23.6, with a better tone fit
  //    (R² 0.354 vs 0.301), less deviation (13.9 % vs 14.5 %), a wider L* span
  //    (39.2 vs 37.3) and — the part that matters — ZERO free ends against
  //    transverseReserve's 21.5 mm. It holds on four of five cells.
  //    WHERE THE EXTRA INK COMES FROM, stated plainly: ARC LENGTH. It rules at
  //    10 × pen where whiteBand rules at 7.06, so it lays 0.706 × whiteBand's
  //    ruling count — about 842 mm of straight ruling — and delivers 1779.7 mm.
  //    The other ~940 mm is path the rolling circle added; the pen genuinely
  //    travels farther. Measured elongation 1.768 ×, against 1.0 for a ruling.
  //    THE COST, equally plainly: the 5th-percentile clearance in the darks is
  //    0.286 mm, under the 0.66 mm plot floor, and `wvElongCap` fired on 2165
  //    samples. The deepest part of that dark is bought below the floor.
  //
  // 2. 'onePenDown' IS THE PLOTTER RESULT. 19 pen-downs for the whole sphere
  //    against whiteBand's 450 — 24 × fewer — at 1329.8 mm of ink (+12 %), a
  //    slightly deeper dark (48.2 vs 51.4), zero free ends on four of five
  //    cells and zero marks outside the silhouette. Every bridge is a curve ON
  //    the surface, so the saving costs no ink placed where the form is not.
  //
  // 3. THE OPEN SPACE DID CLOSE, and by a measurable amount: median neighbour
  //    clearance in the darks 0.94–1.05 mm for the wave laws against
  //    whiteBand's 1.48 mm — 29–36 % less open space at equal or deeper tone —
  //    while the amplitude eases to exactly zero in the lights by construction.
  //    AND THE INTUITION ABOUT PHASE IS BACKWARDS. In-phase nesting narrows the
  //    PERPENDICULAR clearance by the elongation factor (two nested serpentines
  //    are a pitch apart vertically but only pitch/e apart across the stroke),
  //    so `nestedSerpentine` closes to 1.05 mm while the anti-phase
  //    `interlockWeave` — capped at the floor — stays open at 1.30 mm. The nest
  //    minimises open space; the interlock only looks as though it should.
  //
  // AND THE THREE THAT DID NOT WORK, named plainly.
  //
  //   'amplitudeOnly' is the control and it CONFIRMS THE PRIOR NEGATIVE RESULT.
  //     At a fixed pen, arc length alone realised an elongation of 1.121 and an
  //     L* span of 7.2 with R² 0.005. A space-filling curve cannot add ink at
  //     the floor; it can only lengthen the path a WIDER pen is already laying.
  //     That is the currency the other nine are spending, and it is small.
  //   'nestedOctaves' / 'hilbertDepth' broke the tone (off the line 79.9 % and
  //     78.4 %) for a reason already met once this round: the third octave has
  //     a wavelength of λ/8 = 0.27 mm, which IS the sample spacing at
  //     MAX_LINE_STEPS. The elongation model claims 1.77–1.83 ×, the drawn
  //     polyline delivers nothing like it, the ask is divided by a number the
  //     paper never saw, and the drawing comes back too light (darkest L* 69.5
  //     / 69.9). Nesting depth needs its own sample budget, not the ruling's.
  //   'tourScribble' reaches darkest L* 4.5 on every cell — the deepest number
  //     in the whole comparison — and it should NOT be read as a win. Its
  //     5th-percentile clearance is 0.18 mm against a 0.66 mm floor: it is dark
  //     because neighbouring rulings interpenetrate and overdraw the same
  //     paper. On a real plotter that is a wet blob, not a black.
  //
  // ── ROUND 6, MEASURED — sphere · hatch, app default, UNCAPPED ──────────────
  //
  //                      R²    off-line  L*span  dark   UNINTENDED  waviness   elong
  //                                                p05  BARE AREA   retained   model/real
  //   ampSpacing        0.188   11.7 %    22.0   49.8      3.3 %      252 %    1.068/1.050
  //   ampClearance      0.184   11.7 %    22.0   49.0      3.2 %      265 %    1.049/1.035
  //   ampLambda         0.186   22.2 %    25.1   48.6      3.1 %      239 %    1.008/1.007
  //   ampPasses         0.299   10.2 %    32.0   35.9     25.4 %       66 %    1.440/1.439
  //   ampPhaseWalk      0.188   11.1 %    21.8   49.8      3.3 %      252 %    1.068/1.050
  //   weaveNestPerp     0.181   17.0 %    23.3   48.5      3.2 %      249 %    1.045/1.033
  //   weaveDepth        0.185   18.0 %    23.5   47.7      3.0 %      152 %    1.028/1.025
  //   weaveOctaveEase   0.209   13.9 %    23.7   48.5      3.2 %      227 %    1.031/1.022
  //   weaveAmpEase      0.278   21.4 %    24.6   50.4      9.9 %       95 %    1.040/1.041
  //   weaveJitter       0.177   16.0 %    22.7   49.7      3.0 %      262 %    1.034/1.024
  //   ── the Round 5 bars ────────────────────────────────────────────────────
  //   amplitudeOnly     0.005   48.8 %     7.2   80.1     11.7 %      0.3 %    1.121/1.117
  //   interlockWeave    0.208   33.5 %    25.2   50.9     34.1 %      0.3 %    1.397/1.407
  //   trochoidLoop      0.354   13.9 %    39.2   20.2     23.9 %      0.3 %    1.768/1.983
  //   NO TONE (Stage 0)   —        —        —    92.6     58.4 %       —          —
  //
  // 1. THE WAVINESS SURVIVES, AND IT DID NOT BEFORE. All three Round 5 bars
  //    retain 0.3 % of their form-mean amplitude in the lit region (I ≥ 0.55):
  //    the wave is not faint there, it is GONE, because `k = wvRamp(I)` is zero
  //    above WV_I0. All ten laws here retain 66–265 %. That is the round's
  //    stated requirement and it is met on every cell of every law.
  //
  // 2. THE PERPENDICULAR REFRAMING CLOSED THE GAPS, AS PREDICTED. Unintended
  //    bare area — form further than 0.6 mm from any ink where the light asks
  //    for tone — falls from interlockWeave's 34.1 % to 3.0–3.3 % on the eight
  //    in-phase / bounded-texture laws, an 11× reduction, and the widest bare
  //    gap from 1.96 mm to 1.06–1.35 mm. The mechanism is not the spacing: it is
  //    that an in-phase nest's perpendicular clearance is bounded by
  //    lambda/(2·pi·f) = 1.16 mm HOWEVER wide the pitch gets.
  //
  // 3. THE ELONGATION MODEL NOW MATCHES THE PAPER. Modelled against realised
  //    agrees within 1.5 % on all ten (worst 1.068 vs 1.050). `nestedOctaves`
  //    and `hilbertDepth` were out by a third; `trochoidLoop` is still out by
  //    12 % the other way (1.768 vs 1.983 — it UNDER-claims, so it runs dark).
  //
  // 4. WHAT IT COST, STATED PLAINLY. The spacing IS the tone channel, so the
  //    spacing must vary: CoV 0.75–0.79 against interlockWeave's 0.28. The
  //    largest adjacent spacing step is 2–3×, i.e. no better than the 2.4× this
  //    round set out to fix — the ladder is a discrete keep/drop and at these
  //    coverages its index gaps are small integers, so 2× is its floor. And the
  //    darks do not go deeper: 47.7–50.4 against interlockWeave's 50.9. Only
  //    `ampPasses` (35.9) improves on that, and only `trochoidLoop` (20.2) is
  //    genuinely deep, partly below the plot floor.
  //
  // 5. THE HONEST LIMIT, AND IT IS PHYSICS. A dark made of touching strokes has
  //    no room left for a visible excursion: where the spacing has closed to the
  //    plot floor the clearance floor cuts the amplitude to ~0.004 mm, so the
  //    eight spacing-tone laws are wavy everywhere EXCEPT the core shadow. That
  //    is the opposite of the Round 5 failure (straight in the LIGHT) and it is
  //    the better half of the trade, but it is not "wavy everywhere". The two
  //    laws that keep a wave in the shadow — `ampPasses` and `weaveAmpEase` —
  //    do it by refusing to close the spacing, and pay for it in bare area
  //    (25.4 % and 9.9 %).
  //
  // 6. WHERE A SPACING-ONLY CHANNEL BREAKS. On cylinder·hatch the eight
  //    spacing-tone laws collapse to R² ~0.00 with a 5th-percentile L* of 4.5 —
  //    a solid black band. A cylinder has a WIDE region of near-constant low
  //    radiance, so the spacing field drives the whole band to the plot floor at
  //    once and the wave floods it. A sphere's core shadow is a small crescent
  //    and never triggers it. `ampPasses` (R² 0.262, L* 38.8) and `weaveAmpEase`
  //    (0.031, 42.7) do not collapse, because neither hands the whole ramp to
  //    the spacing. This is a real limit of the channel, not a tuning miss.
  // The committed default, and the fallback for any per-call law the running
  // build does not implement (unknown / missing `opts.toneLaw` degrades here,
  // never throws, never draws nothing — see `buildObject`'s local `TONE_ALGO`).
  const TONE_ALGO_DEFAULT = 'ladder';
  // 'contFieldQuant' only: how many discrete gap sizes the field may use.
  // Module-level FALLBACK only — `opts.toneQuantLevels` absent/invalid.
  // The live per-call value is `CF_LEVELS`, shadowed inside `buildObject`
  // right next to the per-call `TONE_ALGO` (same pattern, same reasoning).
  const CF_LEVELS_DEFAULT = 128;
  // ── ROUND 6 — TWELVE MARK LANGUAGES, ONE PEN WIDTH ─────────────────────────
  //
  // Jay, on the ten lozenge laws: "I'm seeing some subtle differences ... I
  // would love to see much more variation — and more variants like
  // lozengeStipple. I'd also like all of these to be single weight if possible."
  //
  // THE DIAGNOSIS. All ten sat on whiteBand's chassis, and whiteBand carries
  // tone in STROKE WIDTH. Width dominates the visual read outright, so the
  // dissolution — the only thing that differed between the ten — was a garnish
  // on one drawing. `lozengeStipple` looked different for exactly one reason: it
  // is not on that chassis. So the family ancestor for this round is
  // `lozengeStipple` (marks on a light ruled scaffold), not `whiteBand`, and the
  // width channel is REMOVED rather than reduced.
  //
  // THE HARD CONSTRAINT, AND WHY IT IS THE POINT. One constant pen width
  // throughout: no `weightScale`, no `splitByWeight`, no swell, no width channel
  // of any kind. Mechanically these laws are NOT weight laws (`isWeightLaw()` is
  // false for every one of them), so `sink.noteW` is never called and no run
  // ever carries a `weightScale`. Tone therefore has to come entirely from what
  // the mark IS, how big it is, how many there are and where it sits — which is
  // the constraint that forces the twelve apart from each other.
  //
  // THE CHASSIS. An EVEN ruled scaffold at a constant coverage `MK_ROW_COV`
  // (the master grid is at the plot floor under uncapped, so the drawn row pitch
  // is masterPitch/MK_ROW_COV ≈ 2 mm — a cell a mark can actually be legible
  // in). Rows are never dropped and never crowded: the row spacing is even
  // everywhere, and every tone ramp is carried by the marks strung on the rows.
  // The user's spacing direction — "marks may sit right against each other for
  // pure black, then gaps open EVENLY and eased along the form's CONTOUR toward
  // the highlight" — is realised as the MARK period, driven by a phase
  // accumulator over arc length, which is even and eased by construction and has
  // no steps in it at all.
  //
  // HOW A SINGLE PEN REACHES BLACK. It cannot, from one solid ruling: a family
  // at row pitch R lays ink area inkWidth/R, which at R = 2 mm is 0.17 — L* 93.
  // The only plotter-legal move left is for the MARKS TO MERGE, and Jay has
  // explicitly approved marks touching to make pure black. So every law here
  // reaches its darkest by one of two named mechanisms:
  //
  //   ABUTMENT     the mark's own extent grows until it meets its neighbour, and
  //                the marks then tile the cell (tick meets tick across the row;
  //                dash joins dash along it; the scribble's amplitude reaches the
  //                row pitch and its wavelength falls to the ink width).
  //   REPLICATION  the mark is repeated — nested outlines, parallel passes,
  //                concentric arcs, extra arms, more spiral turns — at an
  //                inkWidth offset, until the cell is full. This is the
  //                engraver's own answer and it is what a burin actually does.
  //
  // Both put ink at an inkWidth pitch inside the darkest region, which is BELOW
  // the plot floor (2.2 × pen). That is a deliberate, reported ink flood — the
  // plot floor is respected as the ink-flood LIMIT it is, and `mkStat.flood`
  // counts every sample where the mark spacing crosses it, rather than the
  // drawing pretending it did not happen.
  //
  // NOTHING LEAVES THE SILHOUETTE. A mark is built in SCREEN millimetres in the
  // ruling's own local frame, then every vertex is pushed BACK through the chart
  // (`sampleAt`) and the whole mark is refused unless every one of its vertices
  // comes back front-facing and in-domain. The refusals are counted. There is no
  // path by which a mark can be laid outside the silhouette.
  //
  //   'mkDotScreen'   The dot screen. A round dot drawn as a pen-down spiral —
  //                   an Archimedean spiral at an inkWidth turn pitch, i.e. a
  //                   filled disc — on a HEX lattice (alternate rows offset half
  //                   a period). Tone is DOT SIZE at a fixed count. Black when
  //                   the discs grow until they touch. Mezzotint/aquatint's own
  //                   tone channel, and the one law here with no linear mark at
  //                   all.
  //   'mkLozenge'     The engraver's lozenge proper: an elongated diamond
  //                   aligned to the ruling, on a BRICK lattice. Tone is mark
  //                   SIZE; past the size cap the diamond is NESTED — concentric
  //                   outlines an inkWidth apart — which is exactly how a burin
  //                   fills a lozenge and is why it can reach solid.
  //   'mkDashRamp'    THE DISSOLUTION RAMP the perceptual literature licenses
  //                   (Sterzik et al. TVCG 2024: hatch, stipple and triangles
  //                   lie on ONE perceptual manifold). Fixed period; the mark
  //                   MORPHS dot → dash → full unbroken ruling as tone deepens,
  //                   and past that the dash thickens into a BAND of parallel
  //                   passes an inkWidth apart. One mark language, four states.
  //   'mkTick'        Short dashes PERPENDICULAR to the ruling, on a brick
  //                   lattice, at a fixed size of nearly the full row pitch.
  //                   Tone is COUNT. Black by pure abutment: the ticks pack
  //                   along the row until they touch, and a row of touching
  //                   ticks IS a solid band. The cheapest black on the board.
  //   'mkChevron'     A V, its apex turned to the ISOPHOTE — the mark is aligned
  //                   to the form's own tone contour, not to the ruling — so the
  //                   texture turns with the surface. Tone is SIZE; the arms
  //                   lengthen to the row pitch and then replicate into nested
  //                   chevrons.
  //   'mkComma'       The comma / teardrop: a quarter-arc flick, tangent to the
  //                   ruling, curling toward the light. Tone is COUNT on a
  //                   BLUE-NOISE lattice (an across-row exclusion disc), so the
  //                   commas never line up into phantom rows. Black by nesting
  //                   the arc concentrically.
  //   'mkSFlick'      The S-flick — two opposed quarter arcs. Placed by real
  //                   ERROR DIFFUSION along the ruling with a sideways carry
  //                   into the next row (Floyd-Steinberg's two-tap, on the
  //                   surface), so the pattern is aperiodic by construction.
  //                   Tone is ELONGATION; black by parallel bundling.
  //   'mkCrossPlus'   A saltire — two strokes crossing at 45° to the ruling — on
  //                   a JITTERED grid. Tone is SIZE, and past the size cap the
  //                   mark GROWS ARMS: 2 → 3 → 4 → 6, a cross becoming an
  //                   asterisk becoming a rosette. Black when the rosettes'
  //                   arms overlap into a mesh.
  //   'mkTriangle'    A triangle outline, apex to the isophote, on a POISSON-
  //                   DISK lattice (rejection against a screen-space minimum
  //                   distance). Tone is SIZE; black by NESTING the triangle
  //                   inward. Sterzik's third primitive, drawn as a primitive.
  //   'mkScribble'    The squiggle. ONE continuous polyline per row: a triangle
  //                   wave whose AMPLITUDE and WAVELENGTH both carry tone. In
  //                   the highlight it is a broken hairline; in the mid-tones a
  //                   gentle wave; in the shadow a tight, full-pitch zigzag that
  //                   fills solid. By far the cheapest plot here — a whole row
  //                   is one pen-down — which is the other thing it proves.
  //   'mkDotLozenge'  The historical ANTI-BANDING, ANTI-MOIRE mark: alternating
  //                   rows of DOTS and LOZENGES (Goltzius; RISD "The Brilliant
  //                   Line"). Even rows carry nested lozenges on a size ramp,
  //                   odd rows carry spiral dots on a count ramp, so no two
  //                   neighbouring rows share a spatial frequency and there is
  //                   nothing for a beat to form between.
  //   'mkRadialFlick' Flicks oriented RADIALLY to the light — every mark points
  //                   straight up the intensity gradient, so the field fans
  //                   around the highlight like iron filings. Tone is COUNT on a
  //                   blue-noise lattice. Black by abutment once the flicks
  //                   crowd below their own length.
  // ── MEASURED (fillcmp/v6mark.mjs, app-default scene, uncapped, pen 0.3) ────
  //
  // sphere·hatch. `pen` is PEN-DOWNS — a stipple's whole cost on a plotter.
  // `out` is emitted fill points more than 0.5 mm outside the front surface: it
  // is ZERO for all twelve, by construction rather than by luck. `rEnd` is the
  // worst free end belonging to a RULING (as opposed to a deliberate mark): it
  // is zero for all twelve, because these laws emit nothing BUT marks.
  //
  //   law            weight   R²    span  dark  HFALL moiré  ink   pen   out rEnd
  //   whiteBand      1–6.0×  0.512  29.0  51.4  6.07   8.93  1192   450   0   0
  //   lozengeStipple 1–1×    0.051  10.8  75.3  7.61   8.63  2627   242   0  23.8
  //   mkScribble     1–1×    0.714  37.9  46.2  6.70   6.77  4007    58   0   0
  //   mkDashRamp     1–1×    0.640  36.6  46.0  6.39   7.59  3912  2246   0   0
  //   mkDotScreen    1–1×    0.616  36.3  44.9  6.58   8.06  3915   844   0   0
  //   mkRadialFlick  1–1×    0.568  40.3  40.1  5.63   9.90  4030  2173   0   0
  //   mkDotLozenge   1–1×    0.510  49.3  21.5  6.92  14.18  4392  1252   0   0
  //   mkLozenge      1–1×    0.505  65.1   4.5  6.78  20.41  4835   931   0   0
  //   mkTriangle     1–1×    0.468  60.5   4.5  6.84  18.87  4578  1112   0   0
  //   mkChevron      1–1×    0.444  42.9   4.5  6.40  15.03  4135  1798   0   0
  //   mkTick         1–1×    0.436  40.2  35.4  8.19  12.83  3975  2484   0   0
  //   mkCrossPlus    1–1×    0.416  38.3  34.1  7.16  13.10  3788  2355   0   0
  //   mkComma        1–1×    0.373  38.2  36.2  7.42  12.60  3751  3128   0   0
  //   mkSFlick       1–1×    0.256  53.8   4.5  8.26  22.97  4183   831   0   0
  //
  // SEVEN of the twelve beat whiteBand's L* SPAN and all twelve beat it on the
  // worst adjacent tone step in the highlight (whiteBand 79.4, the twelve
  // 9.5–31.4) — that step is whiteBand's hard clamp, the place where the pen
  // runs out of thinness and the drawing stops tracking the light. Four beat it
  // on R². The price is ink and pen-downs: whiteBand draws the same sphere in
  // 1192 mm and 450 pen-downs because a width channel is free, and a
  // single-weight drawing has to lay every unit of tone as LENGTH.
  //
  // WHAT THE MEASUREMENT ALSO SHOWS. Laws whose mark is a CLOSED OUTLINE that
  // nests (lozenge, triangle, dot-and-lozenge) reach the deepest black — 4.5,
  // the metric's own floor, over a region — but pay for it in moiré (14–20 L*
  // RMS against whiteBand's 8.9): a nested outline is a strong periodic texture
  // and the eye reads that texture as tone the light does not explain. Laws
  // whose mark is a single open stroke (scribble, dash ramp, dot screen) sit at
  // 6.8–8.1 moiré — as clean as whiteBand — but saturate lighter, because an
  // open stroke's capacity in its own cell is smaller.
  //
  // THE PAIRWISE VISUAL DIFFERENCE MATRIX (fillcmp/v6mark-diffmatrix.json).
  // Ink-mask IoU between every pair, over the twelve: median 62 %, worst pair
  // 83 %. Against whiteBand: 31–58 %. The previous round's ten sat at
  // 97.8–99.9 % identical inked pixels against whiteBand — which is what "they
  // all look alike" was, measured. Removing the width channel is what moved it.
  const MARK_LAWS = {
    mkDotScreen: 1, mkLozenge: 1, mkDashRamp: 1, mkTick: 1, mkChevron: 1,
    mkComma: 1, mkSFlick: 1, mkCrossPlus: 1, mkTriangle: 1, mkScribble: 1,
    mkDotLozenge: 1, mkRadialFlick: 1,
  };
  // `isMarkLaw` moved inside `buildObject` (below its per-call `TONE_ALGO`) —
  // this used to be a module-scope reader closing over the module constant,
  // which is exactly the bug the per-call refactor must not reintroduce. See
  // `buildObject`'s local `isMarkLaw` for the live definition.
  // 'contourFlow' only: which streamline family the rulings follow.
  //   'iso'  along the iso-intensity curves
  //   'grad' down the intensity gradient (their orthogonals)
  // Module-level FALLBACK only — `opts.toneFlowMode` absent/invalid. The live
  // per-call value is `FLOW_MODE`, shadowed inside `buildObject`.
  const FLOW_MODE_DEFAULT = 'iso';

  // ── THE LADDER IS PHASE-STEPPED, NOT BIT-REVERSED ───────────────────────────
  //
  // The ladder decides WHICH rulings of a family survive at a given coverage.
  // Until now that was a threshold on a per-line rank drawn from the radical
  // inverse base 2 (van der Corput): keep line i iff `vdc(i) < cov`, with
  // vdc(0,1,2,3,…) = .5, .25, .75, .125, … A bit-reversed prefix is SPREAD —
  // that is what fixed the original "the rank WAS the family coordinate" fault
  // (see the master-grid note above, FAULT 1) — but spread is not the same
  // thing as EVENLY SPACED. vdc is a binary refinement, so the kept-index gaps
  // are always a POWER-OF-TWO pair. Measured on the app default at Stage 1:
  //   cov 0.62 → 11 gaps of 1 line and 18 of 2
  //   cov 0.42 → 17 gaps of 2 and 3 of 4
  //   cov 0.20 → gaps of 4 and 8
  // A gap twice as wide as its neighbours, in an otherwise regular field, reads
  // as a white band that should not be there. That is the "hatch, crosshatch,
  // spiral etc. on curved surfaces seem to have unexpected gaps" report, and it
  // is a property of the PERMUTATION, not of the geometry.
  //
  // The even selection is Bresenham's, i.e. a phase accumulator: carry a
  // running coverage total and keep a ruling exactly when the total crosses an
  // integer. At a CONSTANT coverage that is the Sturmian word of density cov,
  // whose gaps are exactly floor(1/cov) and ceil(1/cov) — two CONSECUTIVE
  // integers, which is the most even a subset of an integer grid can be.
  // Swept over cov 0.02…0.99 at N = 40/64/120/200 it produces a two-consecutive-
  // value gap set at every coverage (0 exceptions) against vdc's 81/194, and a
  // mean spacing CoV of 0.19 against vdc's 0.26.
  //
  // IT HAS TO BE AN ACCUMULATOR, not the closed form `frac((i+1)·cov) < cov`.
  // The two agree only while cov is the same for every ruling, and it is not —
  // every ruling reads its own span mean (see spanDrops). Where cov drifts by
  // cov' per ruling the closed form's phase advances by cov + i·cov', so the
  // kept density comes out as cov + i·cov': on the app-default sphere (cov ~0.2
  // lit to ~0.6 dark across ~100 rulings) that is a 50 % density error halfway
  // down the form — it would trade the gaps for a broken tone ramp. Adding each
  // ruling's OWN coverage advances the phase by exactly cov per ruling, so the
  // local density is the local coverage and the spacing stays even THROUGH the
  // ramp. `ladderPhase` (declared per buildObject call, beside `famSeq`) keys
  // one accumulator per family and span ordinal, so each family is phased
  // independently and rulings are visited in spatial order.
  //
  // WHAT IT COSTS, stated plainly: the kept sets are no longer NESTED. A rank
  // threshold is nested by construction (rank(i) < c1 < c2 ⇒ kept at both), so
  // a tone step used to ADD rulings where a phase-stepped set re-phases them.
  // That is not a preference — the two properties are provably incompatible.
  // Exhaustively (scratchpad `even/nested-proof.mjs`): for N = 6, 8, 9, 10, 11
  // and 12 there is NO nested chain whose every prefix keeps a gap set of at
  // most two consecutive values past m = 2, and vdc is already the best a
  // nested scheme can do (its gap ratio never exceeds 2). Nesting is not
  // load-bearing here: the verdict is taken ONCE PER SPAN, so a ruling still
  // draws its whole span or none of it, and ruling continuity — the thing the
  // seam/span/boundary tests protect — does not depend on it.
  //
  // The phase starts at 0.5 (not 0) for the same reason every family indexes at
  // (i + 0.5)/count: it centres the first kept ruling in its own gap instead of
  // pushing a whole gap in front of it.
  const LADDER_PHASE0 = 0.5;
  // Golden-ratio conjugate. Used to offset one phase track from the next where
  // the tracks are PARALLEL rather than sequential (the stipple raster's rows):
  // it is the step that stays furthest from lining up with itself at every
  // count, so no small number of rows ever falls into phase.
  const GOLDEN_STEP = 0.6180339887498949;
  // One step of the ladder: fold this ruling's coverage into the phase and read
  // off the verdict. Pure, so the test can drive it directly.
  const ladderStep = (phase, cov) => {
    const next = finite(phase, LADDER_PHASE0) + clamp(finite(cov, 0), 0, 1);
    return next >= 1 ? { phase: next - 1, keep: true } : { phase: next, keep: false };
  };
  // ── THE BIT-REVERSED (VAN DER CORPUT) RANK, RESTORED FOR THE RE-TEST ───────
  // rev(j) as a fraction: the radical inverse of j+1 in base 2. Any PREFIX of
  // the order it induces is equidistributed — that is Rössl & Kobbelt's own
  // statement of why it beats a sequential order, and it is what makes a tone
  // ladder built on it NESTED (rank < c1 < c2 ⇒ kept at both coverages), so
  // darkening only ever ADDS rulings and never re-lays them. Indexed from j+1
  // so ruling 0 does not get rank 0 and draw at every coverage including zero.
  const vdc2 = (i) => {
    let n = (Math.max(0, Math.round(Number(i) || 0)) + 1) >>> 0;
    let r = 0; let d = 0.5;
    while (n) { r += (n & 1) * d; n >>>= 1; d *= 0.5; }
    return r;
  };
  // Praun et al.'s ink transfer, clamp(8t − 3.5), with the blend `t` restated in
  // COVERAGE units: a ruling whose rank sits `GROW_BAND/8` below the local
  // coverage is fully drawn, one `GROW_BAND/8` above it is gone, and in between
  // it is a black segment growing symmetrically out of its own darkest point.
  // "New strokes appear as gradually LENGTHENING BLACK STROKES instead of
  // gradually darkening grey strokes" — which is the only fade an ink pen has.
  const GROW_BAND = 0.8;
  const growLength = (cov, rank) => {
    const t = 0.5 + (clamp(finite(cov, 0), 0, 1) - clamp(finite(rank, 0), 0, 1)) / GROW_BAND;
    return clamp(8 * t - 3.5, 0, 1);
  };
  // Drive the ladder over a whole family in one call — the sequence form of
  // `ladderStep`, exported for the spacing-regularity test.
  const ladderKeep = (covs, phase0) => {
    let phase = Number.isFinite(phase0) ? phase0 : LADDER_PHASE0;
    return (covs || []).map((c) => { const r = ladderStep(phase, c); phase = r.phase; return r.keep; });
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
  // ...AND IT IS A SHARE OF THE LOCAL COVERAGE, NOT AN ABSOLUTE RANK OFFSET.
  //
  // The paragraph above derives the SIZE of the margin correctly and then states
  // it in the wrong units, which made it a ban rather than a margin everywhere
  // the form is sparse.
  //
  // A zone's usable rank budget IS its coverage: only rulings whose rank sits
  // below `covCapped` ever draw there. Subtracting a flat 0.15 therefore means
  // something different in every zone. At the dark ceiling (`TOTAL_DARK_CEIL`
  // 0.47) it is about a third of the budget and reads as "you need a real rise",
  // which is the documented intent. At the centre light, whose composed
  // coverage measures ~0.08 on the ladder fixtures, it is TWICE the whole
  // budget: `covCapped - HYST_RANK` is negative, no rank can satisfy it, and a
  // ruling that stops anywhere in L can never restart. That is not "harder to
  // restart", it is "cannot", and it deletes the sparse marks §5.4 #1 requires
  // the centre light to carry.
  //
  // So the margin is charged as a SHARE OF THE LOCAL COVERAGE. It keeps its
  // meaning in every zone — "a re-start needs a rise worth this much of what
  // the zone can lay down" — instead of meaning "a real rise" in the dark and
  // "never" in the light.
  //
  // MEASURED. `f` is margin ÷ coverage (the flat rule is f = 0.15/cov, which
  // is where it blows up). Four-fixture ladder, `scene3d-form-ladder`'s boolean
  // grid, with the L-zone speck exemption below held on throughout:
  //
  //   f        D(L) per fixture           worst    worst F/M   O12 2->3  C15 caustic
  //   flat     .0638 .0587 .0692 .0750    .0587 X  1.7300 X    .0346 X   demoted X
  //   0.05  <- .0725 .0702 .0762 .0865    .0702    1.6841      pass      1.069 both
  //   0.075                    (ladder unchanged)                pass    1.069 both
  //   0.10     .0725 .0702 .0762 .0865    .0702    1.6915      pass      demoted X
  //   0.15     .0725 .0702 .0762 .0865    .0702    1.6915      pass      demoted X
  //   0.20     .0684 .0698 .0736 .0840    .0684    1.6942      pass      demoted X
  //   0.32     .0684 .0690 .0714 .0798    .0684    1.6904      .0431 X   demoted X
  //   (Round 10, pre-p4)
  //            .0694 .0678 .0762 .0865    .0678    1.6601      .0465     1.069 both
  //
  // Bars, for reading the table: O6 ratchet D(L) >= 0.067, F/M <= 1.70, O12's
  // bands 2 -> 3 ratchet > 0.046.
  //
  // "demoted" is the C15 sub-window clause losing its own subject: above
  // f = 0.075 the pole caustic on `W-bigball-bands4` falls from 1.069 to 0.888
  // and stops being that drawing's worst point, so the global argmax moves to an
  // ordinary lighting-driven dark patch that DOES follow the sun — which is
  // exactly what `scene3d-subwindow-density`'s light-independence test reports.
  //
  // Every criterion is met across the plateau f ∈ (0, 0.075], and every one is
  // met at least as well as it was pre-p4. Pinned in the middle of the plateau
  // rather than at either edge: the flat rule failed in the first place because
  // it sat where a small change in the drawing flips a verdict.
  const HYST_COV_SHARE = HYST_RANK / 3;   // 0.05
  const hystFor = (covCapped) => HYST_COV_SHARE * clamp(covCapped, 0, 1);

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
  //   masterFloorPen (I5 follow-up): opt-in pen-multiple override of the
  //   master grid's line-count floor (default PLOT_FLOOR_PEN = 2.2). Omitted
  //   ⇒ byte-identical. See the constant's own comment for why it exists.
  const buildObject = (opts) => {
    if (!opts || !rotatePoint) return null;
    const chart = chartFor(opts.mode, opts.sizes);
    const applyTransform = opts.applyTransform;
    const projectWorld = opts.projectWorld;
    if (!chart || typeof applyTransform !== 'function' || typeof projectWorld !== 'function') return null;

    // ── PER-CALL TONE LAW ────────────────────────────────────────────────────
    // Shadows the module-level `TONE_ALGO_DEFAULT` for the whole closure below.
    // Every in-closure reference to `TONE_ALGO` (179 of them) now reads the
    // per-call law with no edit at the site. Unknown / absent `opts.toneLaw`
    // (an old document, a law the running build does not implement, or no
    // control wired to it yet) degrades to the committed default — it must
    // never throw and never silently draw nothing.
    const TONE_LAWS = (Vectura.SCENE3D_TONE_LAWS && Vectura.SCENE3D_TONE_LAWS.IDS) || null;
    const askedLaw = typeof opts.toneLaw === 'string' ? opts.toneLaw : '';
    const TONE_ALGO = (askedLaw && (!TONE_LAWS || TONE_LAWS.indexOf(askedLaw) !== -1)
      && askedLaw !== 'none') ? askedLaw : TONE_ALGO_DEFAULT;
    // Relocated from module scope (see the comment left at the old site) — this
    // is THE highest-risk line in the per-call refactor. Left at module scope
    // it would close over `TONE_ALGO_DEFAULT` forever and every mark law would
    // silently mis-dispatch to `ladder`'s behaviour.
    const isMarkLaw = () => MARK_LAWS[TONE_ALGO] === 1;

    // Per-call `contFieldQuant` gap-quantisation level count — same shadow
    // pattern as `TONE_ALGO` above. `opts.toneQuantLevels` absent/non-finite
    // degrades to `CF_LEVELS_DEFAULT` (128), byte-identical to the pre-wire
    // build. Clamped [4, 256] — the same bound `params.js`'s `clampStyleParam`
    // enforces on the way in, re-asserted here because `buildObject` is a
    // public boundary a test (or a future caller) can hit directly.
    const CF_LEVELS = clamp(Math.round(finite(opts.toneQuantLevels, CF_LEVELS_DEFAULT)), 4, 256);
    // Per-call `contourFlow` streamline family. `opts.toneFlowMode` anything
    // other than the literal 'grad' degrades to `FLOW_MODE_DEFAULT` ('iso') —
    // same rule `params.js` uses.
    const FLOW_MODE = opts.toneFlowMode === 'grad' ? 'grad' : FLOW_MODE_DEFAULT;

    // ── C4 — THE RIBBON'S FILL STYLE ─────────────────────────────────────────
    // How `ribbonize` fills a ribbon's interior once its outline is drawn.
    // Validated HERE for the same reason `toneLaw` is: `buildObject` is a
    // public boundary a saved document, a test, or a future caller can hit
    // directly, and an unknown id must degrade rather than throw.
    //
    // The 'spiral' default is LOAD-BEARING, not cosmetic. A spiral is ONE
    // unbroken stroke per region however wide the ribbon gets, so it holds the
    // emitted path count flat; 'concentric' and 'contourParallel' legitimately
    // emit many paths per ribbon and are a deliberate choice, never a default.
    const STROKE_FILL_STYLE = STROKE_FILL_STYLES.indexOf(opts.strokeFillStyle) !== -1
      ? opts.strokeFillStyle : strokeFillDefault();

    // `toneLaw: 'none'` is Stage 0 (`masterGrid` + `dither` both off, measured
    // as "NO TONE" in docs/tone-laws/) — NOT the same as `opts.toneOn = false`,
    // which this leaves untouched. `HL_STAGE` itself stays a module const;
    // `STAGE` is the per-call view every HL_STAGE.* read below now uses.
    const stage0 = askedLaw === 'none';
    const STAGE = stage0
      ? Object.assign({}, HL_STAGE, { masterGrid: false, dither: false })
      : HL_STAGE;

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
    const specOn = Boolean(STAGE.specular && useLadder && !noHL && tone.specular && tone.specular.enabled !== false);
    const specSize = specOn ? clamp(finite(tone.specular.size, 1), 0, 3) : 0;
    const nB = ladderLen;
    // I8 — shadow SENSITIVITY: graded darkening on the dark end (stage count).
    // Default 1 = strict no-op; N quantizes low intensity into N darkening stages
    // (more coverage → denser shadow), a smoother dark gradient as N rises.
    const shadowSens = clamp(Math.round(finite(opts.shadowSensitivity, 1)), 1, 8);
    const shadowGrades = Boolean(STAGE.shadowGrade && useLadder && shadowSens > 1 && Regions && typeof Regions.shadowStage === 'function');
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
    //
    // THE SPARSE-END FLOOR IS A PITCH, NOT A CONSTANT — AND IT IS NOT APPLIED
    // HERE. `zoneCoverage` below floors the lit band at `litFloorCov`, derived
    // from the master pitch so the lit band's SPACING can never exceed
    // `litMaxPitchPen() × pen` (3.6 mm at a 0.3 mm pen). This function floors it
    // at the bare constant `LIT_FLOOR`, which cannot know what pitch it buys.
    //
    // That is deliberate, and the reason is the scale it is applied at. This is
    // a PER-SAMPLE coverage: the span verdict averages it over a whole ruling,
    // so raising it here lifts every ruling that so much as clips the centre
    // light. Measured: floored here at `litFloorCov`, the app-default sphere's
    // lit cap went from 0.425 to 0.739 mm of ink per mm² — DENSER than its own
    // core shadow (0.567) — and the 62 mm contour ramp fell from 1.87x to 1.72x,
    // under the 1.8x bar `scene3d-fill-span-verdict` sets for "the drawing still
    // shades". The bar is right and the floor is right; the SCALE was wrong.
    //
    // So the pitch bar is charged once per SPAN, in the verdict itself (see
    // `litSpanFloor` in emitLine), on the rulings that actually lie in the
    // centre light. See there for the numbers.
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

    // ── THE FOUR ALTERNATIVE TONE LAWS ─────────────────────────────────────────
    //
    // Every one of them is a function of surface intensity `I` returning the
    // same quantity `coverageForSample` returns: the FRACTION of the master grid
    // that draws here. The phase accumulator turns that fraction into placement,
    // so a coverage field IS a pitch field — local pitch = masterPitch / cov —
    // and integrating it is exactly what `ladderStep` already does. That is why
    // none of these needs a second placement mechanism.
    //
    // THE ENVELOPE, and where its two ends come from. Neither end is invented:
    //   dark end  = the ladder's own densest rung. Going denser than the author
    //               asked is not this exercise's business.
    //   light end = `litFloorCov`, the coverage at which family A rules at
    //               exactly `litMaxPitchPen() × pen`. That is §5.4 #1 / O6's
    //               sparse-end floor, and it is the SAME bar `litSpanFloor`
    //               charges on the discrete ladder — so all five laws share one
    //               sparse end and the comparison is fair.
    // The plot floor needs no clamp here and cannot be reached: the master grid
    // already floors `masterPitch` at `PLOT_FLOOR_PEN × pen`, and coverage ≤ 1,
    // so the emitted pitch masterPitch/cov is ≥ masterPitch ≥ the floor. Stated
    // as a clamp anyway, because a floor you only argue for is not a floor.
    let toneEnv = null;
    const toneEnvelope = () => {
      if (toneEnv) return toneEnv;
      const covs = [];
      for (let b = 0; b < nB; b++) covs.push(clamp(finite(Regions.coverageFor(b, tone), 0.5), 0, 1));
      // UNCAPPED: the dark end is the PLOT FLOOR itself, not the ladder's densest
      // rung. The rung is a budget decision ("going denser than the author asked
      // is not this exercise's business") and the budget is exactly what has
      // been lifted; with the master grid ruled AT the floor, coverage 1 is the
      // floor, and that is the darkest legal tone rather than an authored one.
      const covDark = TONE_UNCAPPED ? 1
        : clamp(covs.length ? Math.max.apply(null, covs) : 0.85, 0.05, 1);
      const rawLight = covs.length ? Math.min.apply(null, covs) : 0.2;
      // The sparse end never goes BELOW the O6 pitch bar, and never above the
      // dark end (a degenerate one-rung ladder collapses to a flat field, which
      // is honest: there is no ramp to draw).
      const covLight = clamp(Math.max(rawLight, litFloorCov > 0 ? litFloorCov : rawLight), 0.02, covDark);
      // Plot floor, restated as the clamp it is.
      const capByFloor = (masterPitch > 1e-6 && floorPitch > 1e-6)
        ? clamp(masterPitch / floorPitch, 0.02, 1) : 1;
      toneEnv = { covDark: Math.min(covDark, capByFloor), covLight: Math.min(covLight, capByFloor) };
      return toneEnv;
    };
    // Smootherstep. The user asked for an EASE, not a linear ramp: this one has
    // zero first AND second derivative at both ends, so the ramp leaves the
    // shadow and arrives at the highlight without a visible knee.
    const ease = (t) => { const u = clamp(t, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };
    // 'continuousPitch' — the eased pitch field, no bands anywhere. The EASE is
    // applied in PITCH space, not in coverage space, because pitch is the thing
    // the eye measures: an eased coverage would still bunch the wide gaps at the
    // light end (coverage is a reciprocal). Reciprocating back at the end is
    // what hands the phase accumulator a density it can integrate.
    const contPitchCov = (I) => {
      const env = toneEnvelope();
      const uDark = 1 / Math.max(1e-6, env.covDark);    // pitch, in master-grid units
      const uLight = 1 / Math.max(1e-6, env.covLight);
      const u = uDark + (uLight - uDark) * ease(clamp(finite(I, 0), 0, 1));
      return clamp(1 / Math.max(1e-6, u), 0.02, 1);
    };
    // The ladder's own SHAPE as a continuous curve: piecewise-linear through the
    // authored rungs at their band centres. `fineLadder` re-quantizes this, so
    // it keeps the author's tone curve and only removes the step size.
    const bandCentre = (b) => {
      const th = (tone && Array.isArray(tone.thresholds))
        ? tone.thresholds.filter((t) => Number.isFinite(t)) : [];
      const lo = b === 0 ? 0 : clamp(finite(th[b - 1], b / nB), 0, 1);
      const hi = b >= nB - 1 ? 1 : clamp(finite(th[b], (b + 1) / nB), 0, 1);
      return (lo + hi) / 2;
    };
    const ladderCurve = (I) => {
      const x = clamp(finite(I, 0), 0, 1);
      if (nB <= 1) return coverageForSample(x);
      // Coverage read dark→dense, exactly as `coverageForSample` reads it.
      const covAtBand = (b) => clamp(finite(Regions.coverageFor(nB - 1 - b, tone), 0.5), 0, 1);
      if (x <= bandCentre(0)) return covAtBand(0);
      for (let b = 1; b < nB; b++) {
        const c0 = bandCentre(b - 1); const c1 = bandCentre(b);
        if (x <= c1) {
          const t = c1 > c0 + 1e-9 ? (x - c0) / (c1 - c0) : 1;
          return covAtBand(b - 1) + (covAtBand(b) - covAtBand(b - 1)) * t;
        }
      }
      return covAtBand(nB - 1);
    };
    // 'fineLadder' — rungs, still, but MANY. The count is derived, not chosen:
    // one rung per 0.02 of the ladder's own coverage range (0.85 → 0.41 on the
    // shipped default = 22 rungs), bounded so a degenerate ladder cannot ask for
    // one rung or a thousand.
    const FINE_RUNG_COV = 0.02;
    let fineRungs = 0;
    const fineRungCount = () => {
      if (fineRungs) return fineRungs;
      const env = toneEnvelope();
      fineRungs = clamp(Math.round((env.covDark - env.covLight) / FINE_RUNG_COV), 8, 32);
      return fineRungs;
    };
    const fineLadderCov = (I) => {
      const env = toneEnvelope();
      const n = fineRungCount();
      const span = env.covDark - env.covLight;
      if (span <= 1e-6 || n < 2) return env.covDark;
      const c = clamp(ladderCurve(I), env.covLight, env.covDark);
      const k = clamp(Math.round(((c - env.covLight) / span) * (n - 1)), 0, n - 1);
      return clamp(env.covLight + (k / (n - 1)) * span, 0.02, 1);
    };
    // 'weightModulated' and 'layeredCross' both hold the GEOMETRY constant and
    // put the tone somewhere else, so both read one coverage everywhere: the
    // sparse end, i.e. the widest even pitch the sparse-end floor allows. It has
    // to be the sparse end — a heavier pen or a second family can only ever ADD
    // ink, so the even base must be the lightest value the drawing needs.
    const flatCov = () => toneEnvelope().covLight;
    // 'weightModulated' — the tone the geometry no longer carries, restated as
    // pen weight. 1.0 in the light, up to covDark/covLight in the shadow, on the
    // same ease. That ratio is chosen so the WEIGHTED ink density (length × pen
    // width) traces the same dark/light ramp the ladder draws, which is what
    // makes the two comparable at all.
    const weightAt = (I) => {
      const env = toneEnvelope();
      const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, 6);
      return clamp(top + (1 - top) * ease(clamp(finite(I, 0), 0, 1)), 1, 6);
    };
    // 'layeredCross' — the engraver's zones, off intensity alone. No call into
    // `Regions.formZone`, no `HL_STAGE.toneZones`: two cuts on I, placed at the
    // ladder's own thresholds when it has them so the three families change over
    // where the author said the tone does.
    const xcCuts = () => {
      const th = (tone && Array.isArray(tone.thresholds))
        ? tone.thresholds.filter((t) => Number.isFinite(t)).slice().sort((a, b) => a - b) : [];
      const lo = clamp(finite(th[0], 0.33), 0.02, 0.95);
      const hi = clamp(finite(th[th.length - 1], 0.66), lo + 0.02, 0.98);
      return { lo, hi };
    };
    const xcZoneOf = (smp) => {
      const c = xcCuts();
      const I = clamp(finite(smp && smp.I, 0), 0, 1);
      if (I < c.lo) return 'X2';   // darks — three families
      if (I < c.hi) return 'X1';   // mid-tones — two families
      return 'X0';                 // light — one family
    };
    // ── LAWS 6–10: THE LIGHTING, NOT THE SPACING ───────────────────────────────
    //
    // THE TONE RESPONSE, AND WHY IT HAS TO BE INVERTED.
    //
    // Line density does NOT map linearly onto perceived grey, and it fails in
    // two separate places:
    //
    //   (1) INK AREA is linear in density but perceived LIGHTNESS is not linear
    //       in ink area. Parallel rulings of width w at screen pitch p lay down
    //       an area fraction a = w/p (Murray-Davies; they do not overlap, which
    //       is what the plot floor guarantees). Paper reflectance is Y = 1 − a,
    //       and the eye reads Y through a cube root — CIE L*. So a drawing whose
    //       DENSITY ramps linearly has a GREY that crowds into the darks: half
    //       the ink is nowhere near half the apparent tone.
    //
    //   (2) THE CHART FORESHORTENS. `masterPitch` is a median over the form; the
    //       pitch that actually lands at a sample is `localPitch`, and on a
    //       sphere that varies by an order of magnitude between the equator and
    //       the pole. A law stated in coverage alone therefore draws the CHART's
    //       geometry as tone on top of the light's.
    //
    // Laws 6–10 all correct both: they name a target APPARENT AREA as a function
    // of the light, and then divide by the pitch that is actually here. What is
    // left is a drawing whose grey is a function of scene radiance and of
    // nothing else — which is the whole of "nail the lighting".
    const Lstar = (Y) => { const t = clamp(finite(Y, 1), 0, 1); return t > 0.008856 ? 116 * Math.cbrt(t) - 16 : 903.3 * t; };
    const invLstar = (L) => { const l = Math.max(0, finite(L, 100)); return l > 8 ? Math.pow((l + 16) / 116, 3) : l / 903.3; };
    // The nib lays a line wider than its nominal width — ink spreads into the
    // paper. One fitted constant, and the only one: it is measured back out of
    // the render by the apparent-tone metric, so a wrong value shows up as a
    // bowed response rather than hiding.
    const INK_SPREAD = 0.12;
    const inkWidth = () => penWidth * (1 + INK_SPREAD);
    const areaAt = (pitch) => clamp(inkWidth() / Math.max(1e-6, pitch), 0, 0.98);
    // The apparent-tone envelope. BOTH ENDS ARE PHYSICAL and neither is chosen:
    // darkest = the plot floor, lightest = the O6 sparse bar (`litMaxPitchPen()`
    // x pen, the pitch past which the centre light has no ink for a highlight to
    // be blank against). On the shipped 0.3 mm pen that is 0.66 mm → 3.6 mm, so
    // the widest tone ramp any law can draw is 5.45 : 1 in pitch. Every ramp
    // number below should be read against that ceiling, not against infinity.
    let toneAmp = null;
    const apparentEnvelope = () => {
      if (toneAmp) return toneAmp;
      const env = toneEnvelope();
      const pDark = masterPitch > 1e-6 ? masterPitch / Math.max(1e-6, env.covDark) : floorPitch;
      const pLight = masterPitch > 1e-6 ? masterPitch / Math.max(1e-6, env.covLight) : litMaxPitchPen() * penWidth;
      toneAmp = { aDark: areaAt(pDark), aLight: areaAt(pLight), pDark, pLight };
      return toneAmp;
    };
    // Radiance → target ink area, such that PERCEIVED grey is linear in radiance.
    // Interpolate in L* (which is the perceptual axis), then invert back through
    // Y = 1 − a to get the area a ruling field must actually lay down.
    const areaForTone = (I, aDark, aLight) => {
      const Ld = Lstar(1 - clamp(aDark, 0, 0.98));
      const Ll = Lstar(1 - clamp(aLight, 0, 0.98));
      const L = Ld + (Ll - Ld) * clamp(finite(I, 0), 0, 1);
      return clamp(1 - invLstar(L), 0, 0.98);
    };
    const targetArea = (I) => { const e = apparentEnvelope(); return areaForTone(I, e.aDark, e.aLight); };
    // Target area → coverage AT THIS SAMPLE. Dividing by the measured local
    // pitch is what removes the projection from the answer (see (2) above).
    // Falls back to the master pitch where the frame is degenerate — a pole or
    // the silhouette, where "the pitch between adjacent rulings" has no answer.
    const covForArea = (area, localPitch) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      if (!(p > 1e-6)) return clamp(finite(area, 0), 0, 1);
      return clamp((clamp(finite(area, 0), 0, 0.98) * p) / inkWidth(), 0.005, 1);
    };
    // 'perceptualRamp'
    const perceptualCov = (I, localPitch) => covForArea(targetArea(I), localPitch);

    // ── 'nestedFineLadder' / 'phaseFineLadder' — 64 TONE LEVELS ──────────────
    //
    // Webb, Praun, Finkelstein & Hoppe, NPAR 2002 §3.1, on exactly this defect:
    // "If the set of TAM images is SUFFICIENTLY DENSE, the resulting rendering
    // will give the ILLUSION THAT STROKES ARE ADDED INDEPENDENTLY, RATHER THAN
    // ADDED IN BLENDED GROUPS." They went from 6 tone levels to 64. Banding is
    // the signature of too FEW levels, each of which switches a whole comb on —
    // `fineLadder` derived 8-32 rungs from the ladder's own coverage RANGE,
    // which is a different (and coarser) quantity.
    //
    // The tone TARGET is perceptualRamp's — L* linear in scene radiance, local
    // pitch divided out — so this law differs from law 6 only in that its
    // coverage is quantised and (for `nestedFineLadder`) selected by a nested
    // bit-reversed rank instead of by the phase accumulator. That is what makes
    // the three-way comparison read as one variable at a time.
    const NESTED_LEVELS = 64;
    const quantCov = (c) => {
      const env = toneEnvelope();
      const span = env.covDark - env.covLight;
      if (!(span > 1e-6)) return env.covDark;
      const x = clamp((clamp(finite(c, 0), env.covLight, env.covDark) - env.covLight) / span, 0, 1);
      return env.covLight + (Math.round(x * (NESTED_LEVELS - 1)) / (NESTED_LEVELS - 1)) * span;
    };
    const nestedCov = (I, localPitch) => quantCov(perceptualCov(I, localPitch));

    // ── 'forcedContrast' — THE DRAUGHTSMAN DOES NOT CHASE THE RADIANCE ────────
    //
    // Winkenbach & Salesin, SIGGRAPH 94 §2.2, surveying traditional practice:
    // "It is not necessary to depict each individual tone accurately; however,
    // presenting the correct ARRANGEMENT of tones among ADJACENT REGIONS is
    // essential", and "to disambiguate objects, it is sometimes important to
    // FORCE TONE by enhancing contrast or INVENTING SHADOWS." Hertzmann & Zorin
    // §6.1/§6.3 do the same thing geometrically: a thin UNHATCHED strip on the
    // near side of an overlap (a fabricated Mach band) and EXTRA-DENSE hatching
    // on the far side (an undercut).
    //
    // Two departures from the light, both deliberate:
    //   (a) a contrast stretch about the mid tone, so adjacent regions separate
    //       further than the radiance separates them;
    //   (b) at the SILHOUETTE, a bright halo on the lit limb and an undercut on
    //       the dark limb — see `fcLimb` in emitLine, which is where the
    //       distance to the ruling's own end is known.
    //
    // This law is EXPECTED to score worse on apparent-tone R² than the laws that
    // invert the same response honestly. That is not a defect of the law; it is
    // the measurement disagreeing with the practice, which is the thing worth
    // knowing.
    const FC_GAIN = 0.55;         // contrast stretch about the mid tone
    const FC_MACH_MM = 1.8;       // halo width on the lit limb
    const FC_UNDERCUT = 1.45;     // density multiplier on the dark limb
    const FC_LIMB_I = 0.5;        // which limb is "lit"
    const fcIntensity = (I) => clamp(0.5 + (clamp(finite(I, 0), 0, 1) - 0.5) * (1 + FC_GAIN), 0, 1);

    // 'deepFillTSP' — how deep into the shadow the traverse has taken over.
    // 0 at and above TSP_I (an ordinary ruled family), 1 at black (half the
    // rulings, each filling the doubled gap). One definition, read by the
    // coverage law and by the displacement.
    const TSP_I = 0.18;       // the darkest ~15 % of the radiance range
    const tspRamp = (I) => clamp((TSP_I - clamp(finite(I, 0), 0, 1)) / Math.max(1e-6, TSP_I), 0, 1);

    // 'crossFade' — layeredCross's three layers, un-gated and continuous.
    //
    // Which of the three families is emitting. Set by `emitCrossFade`; family A
    // is layer 0 and is the default, so a build that never reaches the cross
    // emitter behaves exactly as one family.
    let xfLayer = 0;
    // WHICH RULING IS BEING EMITTED. The three-pen laws substitute one pen for
    // the next across a handoff band, and the substitution has to be decided PER
    // RULING (a pen change mid-ruling is a pen lift) rather than per sample. The
    // sample-time functions do not receive the ruling index, so `emitLine`
    // publishes it here. Read only under a pen law; inert otherwise.
    let penLineIdx = 0;
    // The composed ceiling in the deepest shadow. Three families each at the
    // plot floor would compose to solid black, so the DARK end of crossFade's
    // envelope is stated as an area and split, never as three independent
    // floors. 0.72 is `Regions.TOTAL_DARK_CEIL`-shaped: dark enough to read as
    // the darkest tone on the form, short of a flooded blob.
    const XF_MAX_AREA = 0.72;
    // Each layer's WEIGHT at this radiance. Layer 0 runs everywhere; layer 1
    // fades in from just off the highlight; layer 2 from the mid-tones. The
    // fades are smootherstepped, so no layer has an edge anywhere — that is the
    // whole point, and it is what layeredCross's zone cuts could not do.
    const xfWeights = (I) => {
      const s = 1 - clamp(finite(I, 0), 0, 1);
      return [1, ease(clamp((s - 0.10) / 0.90, 0, 1)), ease(clamp((s - 0.45) / 0.55, 0, 1))];
    };
    const crossFadeCov = (I, localPitch) => {
      const e = apparentEnvelope();
      const total = areaForTone(I, XF_MAX_AREA, e.aLight);
      const w = xfWeights(I);
      const W = w[0] + w[1] + w[2];
      const share = W > 1e-9 ? clamp(w[clamp(Math.round(xfLayer), 0, 2)] / W, 0, 1) : 1;
      // Perceived coverage composes as 1 − Π(1 − a_k), so a_k = 1 − (1 − total)^share
      // makes the three families compose to EXACTLY `total`. Additive shares
      // would undershoot by a third; independent floors would flood.
      const a = 1 - Math.pow(1 - clamp(total, 0, 0.98), share);
      return covForArea(a, localPitch);
    };

    // 'fullLightingModel' — the whole shading anatomy, five terms, each its own.
    //
    // Everything above ramps DIFFUSE. This one renders the parts a draughtsman
    // actually names, so each reads distinctly on the page:
    //   (a) diffuse mid-tone       — plain Lambert
    //   (b) terminator             — the tone turns over fast HERE, so the ramp
    //                                steepens across the band where n·L ≈ 0
    //   (c) core shadow            — the darkest tone on the form sits just PAST
    //                                the terminator, not at the silhouette
    //   (d) reflected / bounce     — ground light lifting the shadow's far edge,
    //                                which is what stops a shadow reading as a
    //                                hole cut in the form
    //   (e) specular               — its own term with its own much tighter
    //                                falloff, SUBTRACTED from the diffuse tone
    //                                rather than folded into it
    // The signed (unclamped) Lambert is what makes (b), (c) and (d) separable at
    // all: `smp.I` is clamped, so the entire dark side of the form is I = 0 and
    // has no anatomy left in it.
    const FLM_CORE_AMPL = 0.30;
    const FLM_TERM_AMPL = 0.10;
    const FLM_BOUNCE_AMPL = 0.34;
    const FLM_SPEC_AMPL = 0.85;
    const FLM_SHININESS = 42;
    const flmDarkness = (smp) => {
      if (!smp) return 0.5;
      const I = clamp(finite(smp.I, 0), 0, 1);
      let D = 1 - I;                                   // (a) DIFFUSE
      const lights = zoneCtx ? zoneCtx.lights : null;
      const nl = (lights && typeof Regions.signedLambert === 'function')
        ? clamp(finite(Regions.signedLambert(smp.wN, smp.world, lights), 0), -1, 1)
        : (I > 0 ? I : -0.5);
      const w = clamp(finite(zoneCtx && zoneCtx.terminatorNL, finite(Regions.TERMINATOR_NL, 0.22)), 0.05, 0.6);
      D += FLM_TERM_AMPL * (1 - Math.abs(clamp(nl / w, -1, 1)));   // (b) TERMINATOR
      const u = (nl + 1.35 * w) / (0.85 * w);                      // (c) CORE SHADOW
      D += FLM_CORE_AMPL * Math.exp(-u * u);
      const lift = (typeof Regions.reflectedLift === 'function')   // (d) BOUNCE
        ? clamp(finite(Regions.reflectedLift(smp.wN, smp.world, zoneCtx && zoneCtx.ground), 0), 0, 1) : 0;
      D -= FLM_BOUNCE_AMPL * lift * ease(clamp((-nl - 2 * w) / Math.max(1e-6, 1 - 2 * w), 0, 1));
      if (lights && typeof Regions.specularTerm === 'function') {  // (e) SPECULAR
        D -= FLM_SPEC_AMPL * clamp(finite(Regions.specularTerm(smp.wN, smp.world, lights, opts.camAngles, FLM_SHININESS), 0), 0, 1);
      }
      return clamp(D, 0, 1);
    };
    const flmCov = (smp, localPitch) => {
      const e = apparentEnvelope();
      return covForArea(areaForTone(1 - flmDarkness(smp), e.aDark, e.aLight), localPitch);
    };

    // ── LAWS 12-16: THE TONE RIDES ON THE PEN, NOT ON THE PLACEMENT ────────────
    //
    // See the header block. These five hold the ruling's CONTINUITY absolutely —
    // the verdict is still one per ruling — and vary the stroke WIDTH instead,
    // which is a continuous quantity and cannot break a line.
    const W_MIN = 1;            // a plotter cannot draw thinner than its own pen
    const W_MAX = 6;            // scene3d.js clamps meta.weightScale to [0.1, 6]
    const W_LEVEL = 0.12;       // weight quantum at which a piece boundary opens
    const W_DEEP_AREA = 0.93;   // "near solid" — the deep-dark target ink area
    const W_FLOOD_AREA = 0.95;  // past this the ink is a blob; counted, not hidden
    const W_DITHER = 0.06;      // weightSmoothstep's low-discrepancy weight jitter
    const MP_MAX = 5;           // weightMultiPass — most strokes in one band
    const WEIGHT_LAWS = {
      weightAlongLine: 1, weightDeepDark: 1, weightPlusSpacing: 1,
      weightMultiPass: 1, weightSmoothstep: 1, weightCrossHandoff: 1,
      weightPlusSpacingTuned: 1, whiteBand: 1, isophoteWidth: 1,
      // ROUND 4 — all six sit on whiteBand's chassis (constant reserved width,
      // black core, white margins), so none of them can drop a ruling.
      nibAngle: 1, curvatureField: 1, screenAngles: 1,
      taperedEnds: 1, whiteLineInverse: 1, multiScale: 1,
      // SWEEP 2 — the two pre-warps, the signed width, the second pen, and the
      // transverse reserve that replaces the (no-op) parallel inversion.
      equilibrated: 1, signedWidth: 1, wideShadowPen: 1, transverseReserve: 1,
      // V5 — THE THREE-PEN LAWS. They are weight laws only in the mechanical
      // sense that the per-run width is where a pen assignment can be expressed;
      // every one of them emits exactly three widths and carries tone on
      // spacing. See the THREE-PEN CHASSIS block.
      penTiers: 1, penScreen: 1, penInterleave: 1, penStipple: 1, penOctaves: 1,
      penFacing: 1, penReserve: 1, penCross: 1, penPitchMatch: 1, penDepth: 1,
      // ROUND 5 — the nested-serpentine family. All ten are whiteBand-chassis
      // width laws; what they add is a CHART-SPACE lateral wave whose amplitude,
      // wavelength, phase and nesting depth are the tonal channels. See the
      // WV_ block for where their extra ink comes from.
      nestedSerpentine: 1, interlockWeave: 1, amplitudeOnly: 1, trochoidLoop: 1,
      waveToRuling: 1, nestedOctaves: 1, onePenDown: 1, hilbertDepth: 1,
      sfcHalftone: 1, tourScribble: 1,
      // ROUND 6 — the same chassis again. What changed is WHICH CHANNEL carries
      // the tone: never the amplitude. See the WV6 block.
      ampSpacing: 1, ampClearance: 1, ampLambda: 1, ampPasses: 1, ampPhaseWalk: 1,
      weaveNestPerp: 1, weaveDepth: 1, weaveOctaveEase: 1, weaveAmpEase: 1,
      weaveJitter: 1,
    };
    // ROUND 5 — the ten lozenge laws are whiteBand's chassis with a dissolution
    // below the hairline floor, so every one of them IS a weight law (see
    // `LOZ_LAWS`, declared below with the rest of the family's arithmetic).
    const isWeightLaw = () => WEIGHT_LAWS[TONE_ALGO] === 1 || isLoz();
    // ── BUCKET B — THE RIBBON LAWS ───────────────────────────────────────────
    //
    // The twelve laws whose tone rides on VARIABLE STROKE WIDTH, and which are
    // therefore delivered as a real pen-width RIBBON (outline + pen-pitched
    // fill, every path at weightScale 1) rather than as a chain of abutting
    // constant-width pieces. See `ribbonize`.
    //
    // THIS LIST IS EXPLICIT, AND IT IS DELIBERATELY NOT `isWeightLaw()`. Both
    // failure modes are real and both are one character away:
    //   1. 'weightModulated' is NOT in `WEIGHT_LAWS` — `isWeightLaw()` returns
    //      false for it — yet it sets `run.weightScale` from the run mean in
    //      `emitRun` below. Gating on `isWeightLaw()` would silently leave
    //      behind the one law whose ENTIRE tone channel is stroke width.
    //   2. `isWeightLaw()` is true for the ten THREE-PEN laws, whose whole
    //      claim is three genuinely different nibs. Widening the predicate
    //      would flatten exactly what they exist to prove.
    // Neither `isWeightLaw()` nor `splitsAlongLine()` is the right set, so the
    // set is written out.
    // The dict itself lives at module scope (see RIBBON_LAWS) so the namespace
    // can publish it to the UI; only the predicate is per-call, because
    // TONE_ALGO is.
    const isRibbonLaw = () => RIBBON_LAWS[TONE_ALGO] === 1;
    // `weightPlusSpacingTuned` is `weightPlusSpacing` at a different kappa and
    // nothing else, so every site that names the one names the other.
    const isWPS = () => TONE_ALGO === 'weightPlusSpacing' || TONE_ALGO === 'weightPlusSpacingTuned';
    // Which of them vary the weight ALONG the ruling, and therefore split it into
    // abutting pieces. `weightSmoothstep` deliberately does not: it is the
    // anti-banding study ON weightModulated's own per-run mean, and splitting it
    // would confound the two questions.
    const splitsAlongLine = () => TONE_ALGO === 'weightAlongLine'
      || TONE_ALGO === 'weightDeepDark' || isWPS()
      || TONE_ALGO === 'weightMultiPass' || TONE_ALGO === 'weightCrossHandoff'
      || TONE_ALGO === 'whiteBand' || TONE_ALGO === 'isophoteWidth'
      || TONE_ALGO === 'nibAngle' || TONE_ALGO === 'curvatureField'
      || TONE_ALGO === 'screenAngles' || TONE_ALGO === 'taperedEnds'
      || TONE_ALGO === 'whiteLineInverse' || TONE_ALGO === 'multiScale'
      || TONE_ALGO === 'equilibrated' || TONE_ALGO === 'signedWidth'
      || TONE_ALGO === 'wideShadowPen' || TONE_ALGO === 'transverseReserve'
      // The three-pen laws split along the ruling for a different reason than
      // the width laws do: a pen CHANGE mid-ruling has to become a piece
      // boundary, because one path can carry one pen and no fewer.
      || isPenLaw()
      || isLoz()
      // Round 5: every wave law varies width per sample EXCEPT 'onePenDown',
      // whose whole claim is one continuous stroke — a chain of abutting
      // sub-paths would be the exact opposite of it.
      || (isWaveLaw() && TONE_ALGO !== 'onePenDown');
    // WHERE THE WEIGHT LAWS ACTUALLY LANDED — the counterpart to `floorStat`.
    // The weight range is bounded at both ends by physics (you cannot draw
    // thinner than the pen, and past W_FLOOD_AREA the ink is a blob), so "did
    // the law reach the dark it asked for" is a measurement, not an assertion.
    const weightStat = {
      samples: 0, floods: 0, atMax: 0, wMin: Infinity, wMax: 0,
      askMax: 0, aMin: 1, aMax: 0, wSum: 0,
    };
    // The base coverage each weight law rules its even grid at.
    //   weightAlongLine / weightSmoothstep  weightModulated's own sparse end, so
    //     the three are directly comparable.
    //   weightDeepDark / weightMultiPass    the pitch at which the heaviest legal
    //     stroke saturates. Derived, not chosen: any wider and no legal pen can
    //     reach W_DEEP_AREA; any tighter and the light end stops being delicate.
    //   weightPlusSpacing                   varies with radiance — see `wpsCov`.
    const deepFlatCov = () => {
      const env = toneEnvelope();
      const c = (W_DEEP_AREA * masterPitch) / (W_MAX * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    // ── 'whiteBand' — RÖSSL & KOBBELT'S CONSTANT RESERVED WIDTH ──────────────
    //
    // "Define strokes to have a CONSTANT width w but only a certain portion
    // w' = (1−c)·w is drawn in black, where c ∈ [c_min, c_max] ⊂ [0,1] is the
    // local grey value (0 = black). Restricting the grey values to the interval
    // [c_min, c_max] GUARANTEES A MINIMUM WIDTH OF THE STROKES AND A MINIMUM
    // WIDTH OF THE WHITE SPACE BETWEEN STROKES." (PG 2000, §7.)
    //
    // Both ends of the tone range are therefore clamped by CONSTRUCTION and not
    // by a fitted curve, and — the property this law is really here for —
    // NOTHING IS EVER DROPPED. The ladder never runs: the geometry is one even
    // grid at the reserved pitch, and tone is entirely the black fraction of it.
    // A ruling cannot vanish in the highlight (it thins to the pen and stops
    // thinning) and a gap cannot close in the shadow (c_min holds it open), so
    // the two failure modes the ladder trades between are both unreachable.
    //
    // Rössl's own density regulation is by ERASURE — where the family crowds,
    // a later stroke's reserved band overpaints its neighbour's. A plotter has
    // no eraser, so the same regulation arrives as the `weightCovEff` floor
    // clamp: where the geometry crowds, the coverage the floor actually left is
    // smaller, the reserved width is correspondingly smaller, and the core
    // shrinks with it. Same effect, stated on the pen instead of on the paper.
    const WB_CMIN = 0.15;   // minimum white band, as a share of the reserved width
    const WB_CMAX = 0.85;   // minimum black core, ditto
    const wbFlatCov = () => {
      const env = toneEnvelope();
      const c = ((1 - WB_CMIN) * masterPitch) / (W_MAX * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    // ── ROUND 4 — THE SIX ────────────────────────────────────────────────────
    //
    // Every one of them keeps whiteBand's chassis: one even grid at a reserved
    // pitch, nothing ever dropped, tone carried by the black core's share of the
    // reserved width. What each changes is stated at its own constant block.
    //
    // 'whiteLineInverse' — BEWICK'S WHITE LINE. Rössl's band, run from the other
    // end. Instead of a base pitch chosen so the HEAVIEST legal pen leaves a
    // 15 % white margin (whiteBand: pitch = 6·ink/0.85 = 7.06·ink, so the darkest
    // tone any weight can reach is area 0.85), the base pitch is chosen so the
    // heaviest legal pen SATURATES it — pitch = 6·ink/0.94 = 6.38·ink — and the
    // transfer is stated on the WHITE, not on the ink: the margin opens from
    // WLI_MMIN in the core shadow to WLI_MMAX in the light. Mechanically it is
    // whiteBand with the core/margin relation inverted and the field near
    // saturation; it is the engraver carving light out of a laid ground rather
    // than adding ink to paper. Ink cost is high by construction and is reported.
    const WLI_DARK_AREA = 0.94;  // the laid ground: near-solid, just under flood
    const WLI_MMIN = 0.06;       // narrowest white margin (the core shadow)
    // THE WIDEST MARGIN IS NOT A CHOICE. On a ground pitched at 6·ink/0.94 the
    // narrowest mark any plotter can make is the pen itself, so the most white
    // the carver can open is 1 − 0.94/6 = 0.843 of the reserved width. Asking
    // for more than that does not lighten the drawing — it just parks the whole
    // lit half on the weight clamp, where tone stops tracking radiance
    // altogether. Measured with WLI_MMAX pinned at 0.86 (a hair past reach):
    // sphere·hatch R² 0.288, worst bin 17.4 % off the line. So the light anchor
    // is taken from `wLightArea()`, which IS that number, computed.
    const wliFlatCov = () => {
      const env = toneEnvelope();
      const c = (WLI_DARK_AREA * masterPitch) / (W_MAX * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    // ── ROUND 5: THE LOZENGE FAMILY — TEN WAYS TO SPEND A STIPPLE ─────────────
    //
    // WHY THE IDEA IS RIGHT AND THE FIRST EXECUTION WAS WRONG. Sterzik et al.
    // (TVCG 2024, Fig. 8b) measure single-direction hatching, STIPPLING and
    // triangles onto essentially ONE 1-D perceptual manifold (aligned by
    // Kabsch), while crosshatch sits in a separate cluster. So stipple is the
    // perceptually CONTINUOUS continuation of a hatch tone ramp, and a second
    // family is not. `lozengeStipple` (Round 3) spent the LADDER's residual —
    // it stippled the rulings the ladder had thrown away — and measured R²
    // 0.051, L* span 10.8, darkest 75.3. The residual of a discrete drop is a
    // coarse, lumpy quantity and the flicks inherited its lumpiness.
    //
    // THE CHASSIS IS whiteBand's, NOT THE LADDER'S. Rössl & Kobbelt's reserved
    // width never drops a ruling, so there is no residual to chase: the grid is
    // even everywhere and tone is the black core's share of it. That chassis has
    // exactly one dead end, and it is arithmetic, not aesthetic —
    //
    //     a ruling cannot get lighter than ONE PEN WIDTH at the reserved pitch.
    //
    // At the shipped 0.3 mm pen, uncapped, the reserved pitch is
    // masterPitch/wbFlatCov ≈ 2.37 mm and inkWidth is 0.336 mm, so the lightest
    // ink area a solid ruling can lay is 0.336/2.37 = 0.142 — L* 94. whiteBand's
    // own light clamp (WB_CMAX = 0.85 ⇒ area 0.15) sits within a whisker of it,
    // which is precisely WHY whiteBand's highlight flat-lines and why its
    // highlight falloff measured 6.07 L*/mm: the pen runs out of thinness before
    // the light runs out of brightness, and the drawing stops tracking.
    //
    // BELOW THE HAIRLINE FLOOR THERE IS EXACTLY ONE PLOTTER-LEGAL MOVE: draw
    // less of the ruling. Zander et al. (2004, §4.2-4.3): "real hatched drawings
    // use monochrome lines with two properties: VARIABLE WIDTH and the
    // possibility to DISSOLVE SOLID LINES INTO DOTS." So the whole family shares
    // one transfer and one handoff, and differs ONLY in how the dissolution is
    // placed and shaped:
    //
    //     aAsk(I)  = L*-linear from whiteBand's dark anchor to LZ_ALIGHT
    //     aSolid   = the area one W_MIN ruling lays here  (the hairline floor)
    //     weight   = aAsk / aSolid  where that is ≥ 1     (whiteBand, unchanged)
    //     duty     = aAsk / aSolid  where that is < 1     (the dissolution)
    //
    // The handoff is C0 BY CONSTRUCTION — duty and weight are the same ratio,
    // read on either side of 1 — so there is no seam to tune and no threshold to
    // pick. That is the "continuous ramp along one perceptual manifold" the
    // Sterzik result licenses, stated as arithmetic.
    //
    // AND EVERY MARK LIES ON A RULING. A dissolved mark is a SUB-RUN of a ruling
    // the emitter already proved front-facing, clipped by the same silhouette
    // bisection, so no mark can fall outside the silhouette by construction.
    // ('lozCross' is the one law that leaves the ruling, and it re-verifies the
    // displaced point against `sampleAt` before laying it — see there.)
    //
    // THE FREE-END NUMBER IS NOT REDEFINED. A flick has two ends in open
    // surface; that is what a flick IS. The harness keeps the incumbent metric
    // unchanged AND reports a second, separate number for whole-ruling ends, so
    // "a deliberate isolated mark" and "a ruling that stops mid-surface" are
    // told apart without either being hidden.
    //
    //   'lozDuty'      The family's minimal form. Fixed mark length, period
    //                  modulated by duty (a Sturmian phase accumulator, golden
    //                  phase per ruling). Zander B10, nothing added.
    //   'lozSwell'     The engraver's own mark. Longer flicks whose weight
    //                  follows an area-preserving raised sine — a TRUE lozenge:
    //                  an elongated diamond aligned to the ruling, tapering to
    //                  the pen at both tips. Callot's echoppe / Goltzius.
    //   'lozBlue'      lozDuty with the mark's phase JITTERED inside its own
    //                  period, keyed on ruling AND period index. Duty — and so
    //                  tone — is untouched; only the lattice is destroyed.
    //                  Deussen et al. "Floating Points" blue-noise property, at
    //                  1-D cost.
    //   'lozErrDiff'   Density from a REAL error-diffused target rather than
    //                  from a phase. A greedy accumulator carries the ink debt
    //                  along the ruling with exact residual carry, and pushes a
    //                  share of the residual sideways into a screen-space grid
    //                  the NEXT ruling consumes — Floyd-Steinberg's two-tap, on
    //                  the surface. Aperiodic by construction.
    //   'lozGrow'      Dissolution in reverse, and the only law here with NO
    //                  width channel at all: constant pen, grid AT the plot
    //                  floor, fixed period, and the mark GROWS from a dot to a
    //                  dash to a continuous ruling as tone deepens. Its dark end
    //                  is therefore capped at one family's saturation
    //                  (inkWidth/floorPitch = 0.509, L* ≈ 76) and that is
    //                  reported, not hidden — it is the physical fact the brief
    //                  states, drawn.
    //   'lozHighlight' Hatch carries the darks; stipple is the FADE-OUT and
    //                  nothing else. whiteBand verbatim until its own weight
    //                  reaches W_MIN, then a FIXED lattice whose mark SHRINKS
    //                  (dot size carries tone — Agnew's blade-pressure stipple)
    //                  instead of lozDuty's fixed mark at varying density. Same
    //                  transfer, same handoff, opposite geometry: the matched
    //                  pair that isolates "density vs size" in the highlight.
    //   'lozCapacity'  Balzer, Schlömer & Deussen (SIGGRAPH 2009): each site
    //                  owns an EQUAL-CAPACITY region. In 1-D along a ruling that
    //                  is exactly solvable — mark centres at equal cumulative
    //                  ink debt, each mark CENTRED on its interval rather than
    //                  started at its edge, so the half-mark placement bias
    //                  lozDuty carries is removed.
    //   'lozAniso'     lozCapacity plus ANISOTROPIC blue noise: the exclusion
    //                  disc is an ellipse elongated ALONG the ruling, so marks
    //                  may crowd along a ruling but are pushed apart ACROSS
    //                  rulings. Aimed squarely at scratchboard's named defect —
    //                  "alternating directions to avoid distracting stripes"
    //                  (Agnew) — i.e. dots lining up into phantom rows.
    //   'lozCross'     Dot-and-lozenge proper (Goltzius; RISD "The Brilliant
    //                  Line"). The flick is laid in the LOZENGE CENTRE — half a
    //                  pitch off the ruling, in the residual between rulings —
    //                  not on the ruling itself. The displaced point is
    //                  re-sampled through the chart and dropped unless it is
    //                  front-facing, so the "no mark outside the silhouette"
    //                  rule survives the one law that leaves the line.
    //   'lozBudget'    Pen-down cost, treated as the first-class constraint it
    //                  is on a plotter. lozErrDiff's placement with a QUANTUM
    //                  three times as long, and abutting quanta merged into one
    //                  stroke — roughly a third of the pen-downs. The tone cost
    //                  of that saving is the measurement.
    //
    // ── MEASURED (fillcmp/v5loz.mjs, app-default scene, uncapped, pen 0.3) ────
    //
    // sphere·hatch. `mkEnd`/`rlEnd` are the free-end metric UNCHANGED, split by
    // population: ends belonging to a deliberate flick, and ends belonging to a
    // ruling. `out` is emitted fill points more than 0.5 mm outside the front
    // surface — the defect Jay named, and it is zero for all twelve.
    //
    //   law              R²     span  dark  off%   HFALL  moiré  ink   pen  out
    //   whiteBand      0.512    29.0  51.4   5.8    6.07   8.93  1192  450   0
    //   lozengeStipple 0.051    10.8  75.3  42.8    7.61   8.63  2627  242   0
    //   lozDuty        0.475    30.5  51.5  13.6    7.34   8.91  1168  467   0
    //   lozSwell       0.469    29.3  51.5  11.6    7.03   8.87  1173  517   0
    //   lozBlue        0.471    29.5  51.4  11.8    7.34   8.90  1176  466   0
    //   lozErrDiff     0.526    31.8  51.6  14.5    5.58   8.33  1125  455   0
    //   lozGrow        0.007    15.9  75.3  80.4    8.68   9.75  2742   83   0
    //   lozHighlight   0.516    29.7  51.4   5.7    6.07   8.92  1179  452   0
    //   lozCapacity    0.497    30.8  51.5  13.2    6.77   8.66  1140  453   0
    //   lozAniso       0.515    31.7  51.6  14.3    6.16   8.49  1119  462   0
    //   lozCross       0.478    30.3  51.5  13.3    7.34   8.84  1170  468   0
    //   lozBudget      0.511    32.5  51.5  16.5    5.36   8.58  1115  450   0
    //
    // Over all FIVE cells (sphere/capsule/cylinder·hatch, sphere·crosshatch,
    // ellipsoid·contour), mean R² and mean highlight falloff, with the count of
    // RULING free ends past 1 mm — the defect that actually matters:
    //
    //   lozAniso      0.523  13.79   2      lozBlue        0.486  16.20   0
    //   lozErrDiff    0.520  14.63   7      lozDuty        0.478  16.15   0
    //   lozBudget     0.510  14.54   5      lozCross       0.478  15.80   0
    //   lozHighlight  0.508  15.50   0      lozSwell       0.469  15.33   0
    //   whiteBand     0.503  15.96   0      lozengeStipple 0.080  17.94  1189
    //   lozCapacity   0.500  15.92   1      lozGrow        0.056  15.48   1
    //
    // FOUR BEAT whiteBand on mean R² and all four beat it on highlight falloff,
    // which was the defect this round was aimed at. `lozHighlight` beats it with
    // ZERO ruling free ends on every cell and an off-the-line figure that is
    // whiteBand's own (5.7 % against 5.8 %) — it is whiteBand plus a fade-out
    // and costs nothing. `lozAniso` is the best drawing but carries 2 ruling
    // ends past 1 mm; `lozErrDiff` the next best and carries 7. Those are real
    // and are not hidden: they occur where a run happens to contain no
    // dissolved sample, so the `.loz` tag does not fire and its boundary is
    // classified as a ruling end. `lozengeStipple`'s own 23.75 mm sits in the
    // ruling column BY DEFAULT rather than by measurement — the Round-3 law
    // does not tag its flicks — so its split is uninformative, and its
    // incumbent number is quoted unchanged.
    //
    // `lozGrow` is the honest failure and worth keeping as the reference it is:
    // with no width channel at all a single family saturates at
    // inkWidth/floorPitch = 0.509, and it lands at exactly the predicted
    // darkest L* 75.3 with R² 0.007 — the arithmetic in this file's header,
    // drawn. It also has the cheapest plot on the board by a factor of five
    // (83 pen-downs against whiteBand's 450), which is the other thing it
    // proves: dissolution is a very cheap tone channel and a very weak one.
    const LOZ_LAWS = {
      lozDuty: 1, lozSwell: 1, lozBlue: 1, lozErrDiff: 1, lozGrow: 1,
      lozHighlight: 1, lozCapacity: 1, lozAniso: 1, lozCross: 1, lozBudget: 1,
    };
    const isLoz = () => LOZ_LAWS[TONE_ALGO] === 1;
    // The light anchor the dissolution runs down to. Not zero: an ink area of
    // 0.012 over a 3 mm perceptual window is about one 1 mm flick per 25 mm of
    // ruling, which is the sparsest mark a viewer still reads as tone rather
    // than as dirt. Below it the drawing should be bare paper, and is.
    const LZ_ALIGHT = 0.012;
    const LZ_MARK_MM = () => 3 * inkWidth();     // ~1.01 mm — a flick, not a dot
    const LZ_SWELL_MM = () => 8 * inkWidth();    // ~2.69 mm — room for a swell
    const LZ_PERIOD_MM = () => 7 * inkWidth();   // ~2.35 mm — the fixed lattice
    const LZ_BUDGET_MM = () => 9 * inkWidth();   // ~3.02 mm — the coarse quantum
    const LZ_SEP_MM = () => 5 * inkWidth();      // lozAniso's across-ruling disc
    const LZ_ED_BETA = 0.4;                      // share of the residual pushed sideways
    // A mark is a run bounded by two deliberate cuts, so `MIN_MARK_MM` (2 × pen)
    // is its own floor: shorter than that and the plotter draws a pen-down dot,
    // not a mark. Where the duty asks for less, the lattice cell is left EMPTY
    // and the debt is carried — which is how the ramp reaches bare paper.
    const lozAsk = (I) => areaForTone(I, 1 - WB_CMIN, LZ_ALIGHT);
    const lozSolid = (localPitch, cov) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      return clamp((clamp(finite(cov, 1), 1e-6, 1) * inkWidth()) / Math.max(1e-6, p), 1e-6, 0.98);
    };
    // whiteBand's own ask, kept verbatim so 'lozHighlight' is whiteBand until
    // the pen physically runs out of thinness.
    const wbAskAt = (I) => 1 - clamp(finite(I, 0), WB_CMIN, WB_CMAX);
    const lozDutyAt = (I, localPitch, cov) => {
      const solid = lozSolid(localPitch, cov);
      if (TONE_ALGO === 'lozHighlight' && wbAskAt(I) >= solid) return 1;
      return clamp(lozAsk(I) / Math.max(1e-9, solid), 0, 1);
    };
    const lozWeightArea = (I, localPitch, cov) => {
      const solid = lozSolid(localPitch, cov);
      if (TONE_ALGO === 'lozGrow') return solid;            // constant pen, always
      if (TONE_ALGO === 'lozHighlight') return Math.max(solid, wbAskAt(I));
      return Math.max(solid, lozAsk(I));
    };
    // WHERE THE DISSOLUTION LANDED. Counted for the same reason `floorStat` and
    // `weightStat` are: a stipple's cost is pen-downs and its risk is marks that
    // fall below the legal minimum, and both are measurements.
    const lozStat = {
      samples: 0, dissolved: 0, marks: 0, dutySum: 0, dutyMin: 1,
      tooShort: 0, offSurface: 0,
    };
    // THE TWO PIECES OF STATE THAT CROSS A RULING BOUNDARY, and the only ones.
    //   `lozED`    'lozErrDiff' / 'lozBudget' — the share of each ruling's ink
    //              residual pushed sideways for the NEXT ruling to consume.
    //              Keyed on a screen cell so the carry lands where the two
    //              rulings actually neighbour each other, not at an index.
    //   `lozSites` 'lozAniso' — the marks already laid, for the anisotropic
    //              exclusion test. Same cell key, so the lookup is O(1).
    const LOZ_CELL = 1.0;                      // mm, both grids
    const lozED = new Map();
    const lozSites = new Map();
    const lozKey = (x, y) => `${Math.round(x / LOZ_CELL)},${Math.round(y / LOZ_CELL)}`;
    // ── ROUND 6 — THE MARK FAMILY'S ARITHMETIC ────────────────────────────────
    //
    // Every quantity here is a LENGTH or a COUNT. There is no width channel and
    // no place one could be added: `isWeightLaw()` is false for all twelve, so
    // the emitter never calls `sink.noteW`, no run is ever handed a
    // `weightScale`, and `splitByWeight` is never reached. Single weight is a
    // structural property of these laws, not a setting.
    //
    // THE SCAFFOLD. One constant coverage, so the phase ladder keeps exactly
    // every third master ruling and the rows are even everywhere — no drift, no
    // rung, no step. The drawn row pitch is masterPitch / MK_ROW_COV, which
    // uncapped is 3 × the plot floor ≈ 2.0 mm: a cell tall enough for a mark to
    // be legible in, and short enough that a mark can span it and merge with its
    // neighbour.
    const MK_ROW_COV = 1 / 3;
    // The two anchors of the tone transfer, on the SAME L*-linear response every
    // law in this file uses. The dark anchor is "near solid" — reachable only by
    // merging, which is the point — and the light anchor is the sparsest mark a
    // viewer still reads as tone rather than as dirt (one ~1 mm flick per 25 mm
    // of row over a 3 mm perceptual window).
    const MK_DARK_AREA = 0.96;
    const MK_LIGHT_AREA = 0.012;
    const mkAsk = (I) => areaForTone(clamp(finite(I, 0), 0, 1), MK_DARK_AREA, MK_LIGHT_AREA);
    // How close two marks may sit before they are one blot. 1.1 ink widths is
    // BELOW the plot floor (2.2 × pen) on purpose: that is what "marks touching
    // to make pure black" means physically, and every sample where the mark
    // period crosses the floor is counted in `mkStat.flood` rather than hidden.
    const MK_PMIN = () => 1.1 * inkWidth();
    const MK_PMAX = 26;                 // mm — past this the ramp is bare paper
    const MK_MAX_PENS = 26000;          // pathological-input guard, reported
    const MK_CELL = 1.0;                // mm — the screen grid both lattices use
    const MK_ED_BETA = 0.4;             // share of the ink residual pushed sideways
    const mkStat = {
      marks: 0, pens: 0, ink: 0, tooShort: 0, offSurface: 0, noFrame: 0,
      samples: 0, flood: 0, rows: 0, budget: 0, pMin: Infinity, gMax: 0,
    };
    const mkSites = new Map();          // blue-noise / Poisson occupancy
    const mkED = new Map();             // error-diffusion sideways carry
    const mkKey = (x, y) => `${Math.round(x / MK_CELL)},${Math.round(y / MK_CELL)}`;

    // ── THE TWELVE, AS DATA ───────────────────────────────────────────────────
    // `chan` is the TONE CHANNEL and it is the axis that separates these laws
    // from each other more than any other single field:
    //   'size'   fixed count, the mark grows          (dot screen, lozenge, …)
    //   'count'  fixed size, the marks multiply       (tick, comma, radial flick)
    //   'elong'  fixed period, the mark CHANGES KIND  (the dissolution ramp)
    //   'amp'    one continuous stroke, amplitude and wavelength both move
    //   'alt'    alternating rows, a different channel on each
    // `lat` is the lattice, `or` the orientation, `P0`/`L0` the cell geometry in
    // units of the row pitch.
    const MK = {
      mkDotScreen:   { shape: 'disc',     chan: 'size',  lat: 'hex',     or: 'none',   P0: 1.00 },
      mkLozenge:     { shape: 'lozenge',  chan: 'size',  lat: 'brick',   or: 'along',  P0: 1.15 },
      mkDashRamp:    { shape: 'morph',    chan: 'elong', lat: 'row',     or: 'along',  P0: 1.25 },
      mkTick:        { shape: 'tick',     chan: 'count', lat: 'brick',   or: 'across', L0: 1.02 },
      mkChevron:     { shape: 'chevron',  chan: 'size',  lat: 'row',     or: 'iso',    P0: 1.20 },
      mkComma:       { shape: 'comma',    chan: 'count', lat: 'blue',    or: 'along',  L0: 1.30 },
      mkSFlick:      { shape: 'sflick',   chan: 'elong', lat: 'errdiff', or: 'along',  P0: 0.95 },
      mkCrossPlus:   { shape: 'cross',    chan: 'size',  lat: 'jitter',  or: 'diag',   P0: 1.10 },
      mkTriangle:    { shape: 'triangle', chan: 'size',  lat: 'poisson', or: 'iso',    P0: 0.95 },
      mkScribble:    { shape: 'scribble', chan: 'amp',   lat: 'row',     or: 'along',  P0: 1.25 },
      mkDotLozenge:  { shape: 'altrow',   chan: 'alt',   lat: 'altrow',  or: 'along',  P0: 1.15 },
      mkRadialFlick: { shape: 'dash',     chan: 'count', lat: 'blue',    or: 'radial', L0: 1.25 },
    };

    // ── THE MARK SHAPES ───────────────────────────────────────────────────────
    // Each builder is handed the total ink path length `L` the tone asked for
    // and the row pitch `R`, and returns sub-polylines in the ruling's own
    // (u = along, v = across) frame, in SCREEN millimetres. Every one of them
    // grows to a cap set by the row pitch and then REPLICATES at an inkWidth
    // offset — nested outlines, parallel passes, concentric arcs, extra arms —
    // which is the mechanism by which a single pen reaches solid.
    const mkArc = (cx, cy, r, a0, a1, n) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = a0 + (a1 - a0) * (i / n);
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
      return pts;
    };
    // WHAT THE CELL CAN ACTUALLY HOLD. A shape that is asked for more ink than
    // its own geometry can carry silently under-delivers, and — worse — an error
    // diffusion that subtracts the ASK rather than the DELIVERY loses the ink for
    // good. (Measured: `mkSFlick` at a 0.30 R arc radius came back at R² 0.062
    // with a 38 L*/mm highlight falloff, which is that bug and nothing else.) So
    // each shape states its capacity, the tone solve clamps to it, and a law that
    // saturates saturates honestly — visibly, in the numbers — instead of lying.
    const mkCap = (kind, R, w) => {
      const nCap = Math.max(1, Math.floor((0.98 * R) / w));
      if (kind === 'disc') { const r = 0.58 * R; return (Math.PI * r * r) / w; }
      if (kind === 'lozenge') {
        const k = 0.42; const A = (0.50 * R) / k; const per = 4 * Math.sqrt(1 + k * k);
        let acc = 0;
        for (let j = 0; j < nCap; j++) { const f = 1 - (j * w) / (k * A); if (f < 0.22) break; acc += per * A * f; }
        return acc;
      }
      if (kind === 'tick') return 1.02 * R * Math.max(1, Math.floor(1.4 * nCap));
      if (kind === 'chevron') return ((0.92 * R) / Math.cos((52 * Math.PI) / 180)) * nCap;
      if (kind === 'comma') {
        const SW = (100 * Math.PI) / 180; const r = 0.48 * R;
        let acc = 0;
        for (let j = 0; j < nCap; j++) { const rr = r - j * w; if (rr < 1.2 * w) break; acc += SW * rr; }
        return acc;
      }
      if (kind === 'sflick') return 2 * Math.PI * 0.45 * R * Math.min(4, nCap);
      if (kind === 'cross') return 1.15 * R * 6;
      if (kind === 'triangle') {
        const s = 1.35 * R; const inr = 0.2887 * s;
        let acc = 0;
        for (let j = 0; j < nCap; j++) { const f = 1 - (j * w) / inr; if (f < 0.25) break; acc += 3 * s * f; }
        return acc;
      }
      return 1.30 * R * nCap;                       // 'dash' — parallel passes
    };
    const mkShape = (kind, L, R, w) => {
      const polys = [];
      const nCap = Math.max(1, Math.floor((0.98 * R) / w));   // passes that fit the cell
      if (kind === 'disc') {
        // Archimedean spiral at an inkWidth turn pitch — a pen-down loop that
        // FILLS. Length of the spiral to angle φ is w·φ²/(4π), so the radius the
        // tone asks for inverts in closed form; the cap is half the row pitch,
        // at which point neighbouring discs touch and the field is solid.
        const rMax = 0.58 * R;
        let phi = Math.sqrt((4 * Math.PI * Math.max(0, L)) / w);
        if ((w * phi) / (2 * Math.PI) > rMax) phi = (2 * Math.PI * rMax) / w;
        if (phi < Math.PI) return [[[-L / 2, 0], [L / 2, 0]]];   // a dot, not a disc
        const pts = [];
        const dphi = Math.PI / 7;
        for (let t = 0; t <= phi; t += dphi) {
          const r = (w * t) / (2 * Math.PI);
          pts.push([r * Math.cos(t), r * Math.sin(t)]);
        }
        return [pts];
      }
      if (kind === 'lozenge') {
        const k = 0.42;                       // width/length of the diamond
        const per = 4 * Math.sqrt(1 + k * k); // perimeter per unit half-length
        const Amax = (0.50 * R) / k;
        let A = L / per;
        if (A <= Amax) {
          return [[[-A, 0], [0, -k * A], [A, 0], [0, k * A], [-A, 0]]];
        }
        // NESTED — the burin's own fill for a lozenge.
        A = Amax;
        let acc = 0; let j = 0;
        while (acc < L && j < nCap) {
          const f = 1 - (j * w) / (k * A);
          if (f < 0.22) break;
          const a = A * f;
          polys.push([[-a, 0], [0, -k * a], [a, 0], [0, k * a], [-a, 0]]);
          acc += per * a; j += 1;
        }
        return polys.length ? polys : [[[-A, 0], [0, -k * A], [A, 0], [0, k * A], [-A, 0]]];
      }
      if (kind === 'dash') {
        const Lc = Math.min(L, 1.30 * R);
        const n = clamp(Math.round(L / Math.max(1e-6, Lc)), 1, nCap);
        const each = L / n;
        for (let j = 0; j < n; j++) {
          const off = (j - (n - 1) / 2) * w;
          polys.push([[-each / 2, off], [each / 2, off]]);
        }
        return polys;
      }
      if (kind === 'tick') {
        const Lc = Math.min(L, 1.02 * R);
        const n = clamp(Math.round(L / Math.max(1e-6, Lc)), 1, Math.max(1, Math.floor(1.4 * nCap)));
        const each = L / n;
        for (let j = 0; j < n; j++) {
          const off = (j - (n - 1) / 2) * w;
          polys.push([[off, -each / 2], [off, each / 2]]);
        }
        return polys;
      }
      if (kind === 'chevron') {
        const th = (52 * Math.PI) / 180;
        const sMax = (0.92 * R) / Math.cos(th);
        const s = Math.min(L, sMax);
        const n = clamp(Math.round(L / Math.max(1e-6, s)), 1, nCap);
        const each = s;
        for (let j = 0; j < n; j++) {
          const off = j * w;
          const cx = (each / 2) * Math.sin(th);
          const cy = (each / 2) * Math.cos(th);
          polys.push([[-cx, -cy + off], [0, off], [cx, -cy + off]]);
        }
        return polys;
      }
      if (kind === 'comma') {
        // A quarter-turn flick — the teardrop's spine. Nests CONCENTRICALLY, so
        // a dark comma is a thickened comma and not a bundle of separate ones.
        const SWEEP = (100 * Math.PI) / 180;
        const rMax = 0.48 * R;
        let r = L / SWEEP;
        if (r <= rMax) return [mkArc(0, -r * 0.35, r, -SWEEP / 2, SWEEP / 2, 7)];
        r = rMax;
        let acc = 0; let j = 0;
        while (acc < L && j < nCap) {
          const rr = r - j * w;
          if (rr < 1.2 * w) break;
          polys.push(mkArc(0, -r * 0.35, rr, -SWEEP / 2, SWEEP / 2, 7));
          acc += SWEEP * rr; j += 1;
        }
        return polys.length ? polys : [mkArc(0, -r * 0.35, r, -SWEEP / 2, SWEEP / 2, 7)];
      }
      if (kind === 'sflick') {
        // Two opposed quarter arcs. Bundles into parallel S's when the tone asks
        // for more ink than one S of the cell's size can carry.
        // TWO half-circles, so the S is 2*pi*r long — not pi*r. Getting this
        // wrong laid double the ink the tone asked for and cost R^2 0.062.
        const rMax = 0.45 * R;
        let r = L / (2 * Math.PI);
        let n = 1;
        if (r > rMax) { r = rMax; n = clamp(Math.round(L / (2 * Math.PI * r)), 1, Math.min(4, nCap)); }
        for (let j = 0; j < n; j++) {
          const off = (j - (n - 1) / 2) * w;
          const a = mkArc(-r, off, r, -Math.PI / 2, Math.PI / 2, 6);
          const b = mkArc(r, off, r, Math.PI / 2, (3 * Math.PI) / 2, 6).reverse();
          polys.push(a.concat(b.slice(1)));
        }
        return polys;
      }
      if (kind === 'cross') {
        // A saltire that GROWS ARMS: 2 → 3 → 4 → 6. A cross becoming an asterisk
        // becoming a rosette, and the rosettes overlap into a mesh at black.
        const dMax = 1.15 * R;
        let arms = clamp(Math.round(L / dMax), 1, 6);
        if (arms === 5) arms = 6;
        const d = Math.min(dMax, L / arms);
        for (let j = 0; j < arms; j++) {
          const th = (Math.PI / 4) + (j * Math.PI) / arms;
          const cx = (d / 2) * Math.cos(th); const cy = (d / 2) * Math.sin(th);
          polys.push([[-cx, -cy], [cx, cy]]);
        }
        return polys;
      }
      if (kind === 'triangle') {
        const sMax = 1.35 * R;
        let s = L / 3;
        if (s <= sMax) {
          const h = s * 0.5774;
          return [[[0, h], [-s / 2, -h / 2], [s / 2, -h / 2], [0, h]]];
        }
        s = sMax;
        const inr = 0.2887 * s;
        let acc = 0; let j = 0;
        while (acc < L && j < nCap) {
          const f = 1 - (j * w) / inr;
          if (f < 0.25) break;
          const ss = s * f; const h = ss * 0.5774;
          polys.push([[0, h], [-ss / 2, -h / 2], [ss / 2, -h / 2], [0, h]]);
          acc += 3 * ss; j += 1;
        }
        return polys;
      }
      return [[[-L / 2, 0], [L / 2, 0]]];
    };
    const weightBaseCov = () => {
      // 'lozGrow' has no width channel, so its grid must sit AT the plot floor —
      // that is the only place a constant pen can reach a usable dark at all.
      if (TONE_ALGO === 'lozGrow') return 1;
      if (isLoz()) return wbFlatCov();
      if (TONE_ALGO === 'weightDeepDark' || TONE_ALGO === 'weightMultiPass') return deepFlatCov();
      if (TONE_ALGO === 'whiteLineInverse') return wliFlatCov();
      if (TONE_ALGO === 'transverseReserve') return trFlatCov();
      // Round 5 rules WIDER than whiteBand on purpose — the elongation pays for
      // it (see the WV_ block). `amplitudeOnly` rules tighter, because it has no
      // pen to spend and only arc length to spend it with.
      if (isWaveLaw()) return wvFlatCov();
      if (TONE_ALGO === 'whiteBand' || TONE_ALGO === 'isophoteWidth'
        || TONE_ALGO === 'nibAngle' || TONE_ALGO === 'curvatureField'
        || TONE_ALGO === 'screenAngles' || TONE_ALGO === 'taperedEnds'
        || TONE_ALGO === 'multiScale' || TONE_ALGO === 'equilibrated'
        || TONE_ALGO === 'signedWidth' || TONE_ALGO === 'wideShadowPen') return wbFlatCov();
      return flatCov();
    };

    // ── V5 — THE ADJACENT-PASS FAMILY. ONE PEN, ONE NIB, NO WIDTH LAW ─────────
    //
    // Jay's brief, verbatim: "ten unique ideas that do not vary stroke width but
    // are safe to allow a pen to travel back and forth immediately adjacent to
    // itself to give the perception of a wider stroke."
    //
    // So every path these ten emit carries weightScale 1 — they are NOT weight
    // laws and they never touch `noteW` or `splitByWeight`. Apparent weight is
    // physical: the pen retraces parallel passes about a nib apart, and two,
    // three or six of them read as one heavier stroke. Tone is then (a) how many
    // adjacent passes a ruling gets and (b) the white gap that leaves between
    // one bundle and the next. This is what a ballpoint photorealist does by
    // hand, and — the point of the family — it costs plot TIME, not pen changes.
    //
    // WHY NOTHING CAN LAND OFF THE FORM. Jay named "lines jutting out beyond the
    // exterior of the sphere" as a judged defect, and a return pass at a bundle
    // end is the obvious way to earn one. So a pass is NOT a screen-space offset
    // of the finished polyline. Each pass is an ordinary ruling in its own
    // right: `emitLine` is called once per pass with the family's own parameter
    // step scaled to the offset that pass wants, so the pass is SAMPLED ON THE
    // CHART and every guard already in this file — back-face culling, HLR, the
    // boundary refinement, MIN_MARK_MM — applies to it unchanged. A pass that
    // would leave the surface simply has no samples out there. The only
    // screen-space geometry any of these ten adds is the serpentine connector,
    // and that one is validated by re-sampling the chart along it (see
    // `adjConnectorOk`) before it is allowed to exist.
    const ADJ_LAWS = {
      bundleCount: 1, bundleWhole: 1, bundleSerpentine: 1, bundleToShadow: 1,
      bundleSubNib: 1, bundleEased: 1, bundleDither: 1, bundleLozenge: 1,
      bundleHandoff: 1, bundleSnake: 1,
    };
    const isAdjLaw = () => ADJ_LAWS[TONE_ALGO] === 1;
    // Passes are co-extensive with the ruling (one N for the whole span) in the
    // laws that stitch, because a serpentine whose passes stop at different
    // places would have to traverse the form to reach the next one.
    const adjWholeRuling = () => TONE_ALGO === 'bundleWhole'
      || TONE_ALGO === 'bundleSerpentine' || TONE_ALGO === 'bundleSnake';
    const adjStitches = () => TONE_ALGO === 'bundleSerpentine' || TONE_ALGO === 'bundleSnake';
    // Most passes any bundle may hold. DERIVED, not chosen. The bundle pitch is
    // `stride x masterPitch` and the darkest legal ink area is ADJ_DARK_AREA, so
    // the fullest bundle holds 1 + (ADJ_DARK_AREA x pitch − ink) / step passes,
    // and the stride is in turn chosen from this ceiling — the two are solved
    // together so that the deepest shadow lands ON the dark bar rather than just
    // under it. At the shipped 0.3 mm pen the pair comes out stride 4 (a 2.65 mm
    // bundle pitch) and 7 passes of the 8 allowed, for ink area 0.888.
    // Measured with the ceiling at 6: the quantum was coarse enough that the
    // darkest bundle could only reach area 0.846, and the shadow stopped 8 L*
    // short of its own target.
    // `bundleSubNib` needs far more of them because each of its steps buys only
    // 0.55 of a nib — that is the whole demonstration, and its plot time is the
    // price it pays for the extra 10 L* of black.
    const ADJ_MAX = 8;
    const ADJ_SUB_MAX = 13;
    const adjMax = () => (TONE_ALGO === 'bundleSubNib' ? ADJ_SUB_MAX : ADJ_MAX);
    // THE STEP. One ink width is the honest "immediately adjacent" — the two
    // passes abut, the band is solid, and no ink is laid twice. `bundleSubNib`
    // deliberately breaks that to close the ink gap and is reported as flooding
    // for exactly as many samples as it does so.
    const ADJ_SUB_STEP = 0.55;
    const adjStep = () => inkWidth() * (TONE_ALGO === 'bundleSubNib' ? ADJ_SUB_STEP : 1);
    // The black a bundle of n passes lays: the passes abut at step ≥ ink, and
    // overlap (so buy less) below it. Both cases are the same expression.
    const adjBandWidth = (n) => (Math.max(1, n) - 1) * adjStep() + inkWidth();
    const ADJ_DARK_AREA = 0.93;      // the fullest bundle, still with a white gap
    const ADJ_SUB_DARK_AREA = 0.97;  // sub-nib: the gap is what is left of it
    const adjDarkArea = () => (TONE_ALGO === 'bundleSubNib' ? ADJ_SUB_DARK_AREA : ADJ_DARK_AREA);
    // THE BASE GRID, AND IT IS THE ONLY GRID — AND IT IS NOT THE LADDER'S.
    //
    // Measured, and it is why this is a STRIDE and not a coverage. Handed a
    // coverage the way the weight laws are, the phase ladder takes ONE VERDICT
    // PER `emitLine` CALL — and a bundle is several of those. A six-pass bundle
    // then had six independent 30 % coin-flips: two passes survived on average,
    // and a ruling whose CENTRE pass lost the flip still drew its +1 nib pass,
    // one ink width off the grid. Measured on sphere·hatch: 86 of 103 rulings
    // drew instead of 31, spacing CoV 0.42 with adjacent gaps in the ratio 4:1,
    // and the form went solid black (darkest L* 4.5). The ladder is a SELECTOR
    // and this family has nothing for it to select.
    //
    // So the ladder is handed coverage 1 — keep everything you are given — and
    // the decimation to the bundle pitch is done by the emitter itself, by
    // taking every STRIDE-th ruling. Deterministic, so the gaps are all exactly
    // equal: spacing regularity becomes a constant of the family rather than a
    // result of it, which is what "the maximally even law" has to mean.
    const adjStride = () => {
      if (!(masterPitch > 1e-6)) return 1;
      const m = adjBandWidth(adjMax()) / (adjDarkArea() * masterPitch);
      return clamp(Math.round(finite(m, 1)), 1, 24);
    };
    const adjFlatCov = () => 1;
    const adjNomPitch = () => (masterPitch > 1e-6
      ? masterPitch * adjStride() : litMaxPitchPen() * penWidth);
    // The light end is one pass on the base grid — the same anchor whiteBand
    // uses, so the two are comparable at the delicate end.
    const adjLightArea = () => areaAt(adjNomPitch());
    const ADJ_GAP_MIN = 0.35;   // 'bundleEased' — the darkest gap, in ink widths
    // Radiance → the ink area the bundle should lay, on the same L*-linear
    // response every other law in this file states its target on.
    const adjArea = (I) => {
      const Ic = clamp(finite(I, 0), 0, 1);
      // 'bundleEased' states the transfer on the WHITE GAP instead of on the
      // ink, which is Jay's own sentence: lines sit right against each other for
      // pure black, then the gaps open EVENLY and eased toward the highlight and
      // close again into shadow on the far side. Smootherstep, so there is no
      // knee at either end — and because the gap is what is eased, the thing the
      // eye actually measures between two bundles is what moves smoothly.
      if (TONE_ALGO === 'bundleEased') {
        const P = adjNomPitch();
        const gMin = ADJ_GAP_MIN * inkWidth();
        const gMax = Math.max(gMin, P - inkWidth());
        return clamp(1 - (gMin + (gMax - gMin) * ease(Ic)) / Math.max(1e-6, P), 0, 0.98);
      }
      return areaForTone(Ic, adjDarkArea(), adjLightArea());
    };
    // 'bundleHandoff' — the AM/FM allocation policy, stated as a cap rather than
    // as a switch. Above the terminator the drawing is ONE pass at a constant
    // pitch (the periodic family owning the mid-tones, which is what print
    // practice reserves it for); below it the bundle ramps in by partial length,
    // so the second pass enters as a lengthening mark and not as a new texture.
    const ADJ_HANDOFF_I = 0.55;
    // How many passes this sample is asking for, against the pitch the ruling is
    // REALLY at here. Dividing by the local pitch is what takes the chart's
    // foreshortening out of the answer, exactly as `covForArea` does; capping by
    // it again is the plot floor, charged where the geometry actually crowds (a
    // sphere's meridians converge to nothing at the poles) rather than on an
    // average.
    const adjAskN = (I, localPitch) => {
      const Ic = clamp(finite(I, 0), 0, 1);
      const P = (Number.isFinite(localPitch) && localPitch > 1e-6)
        ? localPitch * adjStride() : adjNomPitch();
      if (!(P > inkWidth())) return 1;
      let a = adjArea(Ic);
      if (TONE_ALGO === 'bundleHandoff' && Ic >= ADJ_HANDOFF_I) a = adjLightArea();
      // The bundle may never grow past the white gap the base grid reserves for
      // it, whatever the transfer asked for.
      const band = Math.min(clamp(a, 0, 0.995) * P, adjDarkArea() * P);
      const n = 1 + (band - inkWidth()) / Math.max(1e-9, adjStep());
      return clamp(n, 1, adjMax());
    };
    // WHERE THE PASSES SIT. Pass 0 is the ruling itself and always draws, so the
    // family cannot lose a line however light the tone gets. The rest alternate
    // either side of it, so the band grows symmetrically about the ruling and
    // the tonal centroid does not migrate.
    //
    // 'bundleToShadow' is the deliberate exception: every extra pass is laid on
    // the SHADOW side, so the band grows out of the light and the centroid walks
    // down-gradient. The sign is measured per ruling, not assumed — see
    // `adjShadowSign`.
    const adjOffsetMul = (k, shadowSign) => {
      if (k <= 0) return 0;
      if (TONE_ALGO === 'bundleToShadow') return k * (shadowSign || 1);
      return (k % 2 ? 1 : -1) * Math.ceil(k / 2);
    };
    // THE LEVEL BOUNDARY — where pass k switches on. Plain rounding puts it at
    // k + ½ and the boundary is then a smooth iso-radiance contour, which is the
    // classic band. One of the ten moves it deliberately:
    //   'bundleDither' rides the boundary on a smooth low-frequency wave in
    //                  (ruling index, arc length) — the ruling index enters at
    //                  the golden angle, so neighbouring rulings never share a
    //                  phase and the N → N+1 contour is a ragged curve instead
    //                  of a traceable one. Smooth, not hashed: a hashed
    //                  threshold chatters the pass into specks.
    const ADJ_DITHER_AMPL = 0.4;
    const ADJ_DITHER_MM = 14;
    const adjThreshold = (k, lineIndex, arc) => {
      const base = k + 0.5;
      if (TONE_ALGO !== 'bundleDither') return base;
      const ph = (Number(lineIndex) || 0) * 0.6180339887498949
        + (finite(arc, 0) / ADJ_DITHER_MM);
      return base + ADJ_DITHER_AMPL * Math.sin(ph * Math.PI * 2);
    };
    // 'bundleLozenge' — the END geometry, made explicit. Pass k is inset k steps
    // from BOTH ends of its ruling, so the bundle closes to the single centre
    // line at each end instead of stopping square. Nothing can overshoot the
    // ruling's own extent by construction, the free ends are staggered by a nib
    // apiece rather than stacked on one contour, and the mark reads as the
    // engraver's lozenge.
    const adjEndInset = (k) => (TONE_ALGO === 'bundleLozenge' ? k * adjStep() : 0);
    // Bundles that nearly touch may be stitched to their neighbour ('bundleSnake'):
    // the connector is then short and lands in surface that is nearly solid
    // anyway. Above this gap the traverse would be a visible line across white
    // paper — ink the tone did not budget for — so it is not made.
    const ADJ_SNAKE_GAP = 1.4;   // ink widths of white between bundles
    const adjStat = {
      bundles: 0, passes: 0, nMin: Infinity, nMax: 0, nSum: 0,
      floodSamples: 0, samples: 0, stitches: 0, stitchRejects: 0, penDownSaved: 0,
      askMax: 0, pitchMin: Infinity, pitchMax: 0, drew: 0,
    };
    // 'bundleSnake' only — the bundle the walk is currently inside, so the
    // next ruling can be carried on into the same pen-down. Cleared whenever a
    // new family opens: two families are two different walks.
    let adjPrevSnake = null;
    // ── 'isophoteWidth' — GOODWIN, VOLLICK & HERTZMANN'S ISOPHOTE DISTANCE ────
    //
    // "Thickness can be determined as a function of HOW QUICKLY THE SHADING
    // 'FALLS OFF' FROM THE CURVE" (NPAR 2007). The isophote distance d(p) is the
    // image-space distance from p to the level set of the shading at a chosen
    // threshold; the paper gives a closed form in radial curvature and depth,
    // but the quantity it approximates is available directly here, because the
    // emitter can measure ‖∇I‖ on the surface it is already sampling:
    //
    //     d = (I_iso − I) / ‖∇_screen I‖        millimetres to the isophote
    //     T = α · d,  α = 0.4                    the paper's own alpha
    //
    // Slow falloff (a broad terminator, a large cylindrical part, a bulge) ⇒ a
    // wide dark band ⇒ a thick stroke. Fast falloff ⇒ thin. Past the isophote,
    // on the lit side, d = 0 and the stroke thins to the pen — so the highlight
    // empties for a physical reason rather than by a tuned taper. This is the
    // per-sample number Rössl's white band asks for, chosen by shading rather
    // than fitted, which is why the two share a base grid.
    const ISO_THRESH = 0.55;
    const ISO_ALPHA = 0.4;
    const isoReserve = () => (masterPitch > 1e-6
      ? masterPitch / Math.max(1e-6, wbFlatCov()) : litMaxPitchPen() * penWidth);
    const isoWidthArea = (I, gradI) => {
      const w = Math.max(1e-6, isoReserve());
      const below = clamp(ISO_THRESH - clamp(finite(I, 0), 0, 1), 0, 1);
      const g = Math.max(1e-4, Math.abs(finite(gradI, 0)));
      return clamp((ISO_ALPHA * (below / g)) / w, inkWidth() / w, 1 - WB_CMIN);
    };
    // The light end never moves: weight 1 on the base grid. That is what "the
    // light end stays delicate" means arithmetically.
    const wLightArea = () => {
      const p = masterPitch > 1e-6
        ? masterPitch / Math.max(1e-6, weightBaseCov())
        : litMaxPitchPen() * penWidth;
      return areaAt(p);
    };
    const wDarkArea = () => {
      if (TONE_ALGO === 'weightAlongLine' || TONE_ALGO === 'weightSmoothstep') {
        const env = toneEnvelope();
        const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, W_MAX);
        return clamp(wLightArea() * top, 0, 0.98);
      }
      return W_DEEP_AREA;
    };
    // The tone target, on the SAME perceptual response laws 6-10 invert: L* is
    // linear in scene radiance between the two ends.
    const wTargetArea = (I) => areaForTone(I, wDarkArea(), wLightArea());

    // ── ROUND 4, THE ARITHMETIC ───────────────────────────────────────────────

    // 'whiteLineInverse'. The transfer is on the WHITE: margin m(I) opens from
    // WLI_MMIN to WLI_MMAX on the same L*-linear response every other law here
    // uses, and the ink area is what is left. Written as an area so it goes
    // through `weightForArea` unchanged — the inversion is in the ANCHORS, which
    // is the whole of it.
    const wliArea = (I) => areaForTone(I, 1 - WLI_MMIN, wLightArea());

    // 'nibAngle' — A BROAD NIB, AND THE TONE THE DIRECTION GIVES FOR FREE.
    //
    // A calligraphic nib is a straight edge held at a fixed angle. The mark it
    // leaves is widest when the stroke runs across the edge and narrowest when
    // it runs along it: w_eff = w · |sin(θ_stroke − θ_nib)|, floored at
    // NIB_FLOOR (a real nib has a corner, so it never vanishes entirely).
    //
    // On a curved form the ruling's SCREEN direction rotates continuously — a
    // sphere's meridians fan from the pole, a capsule's rulings shear round the
    // cap — so the nib modulates tone with the form's own turning, at no
    // coverage cost and with no decision taken anywhere. That is the claim being
    // tested: a tone channel that is free.
    //
    // It is MEAN-NORMALISED. |sin| averages 2/π over a half-turn, so dividing by
    // (NIB_FLOOR + (1−NIB_FLOOR)·2/π) leaves the law's average tone exactly
    // whiteBand's and makes the difference between them purely directional. An
    // un-normalised nib would just be whiteBand a third lighter, which measures
    // as a worse whiteBand and says nothing about direction.
    const NIB_DEG = 45;          // the nib axis, in SCREEN space (the calligraphic 45°)
    const NIB_FLOOR = 0.35;      // the nib's corner: the narrowest mark it can make
    const NIB_MEAN = NIB_FLOOR + (1 - NIB_FLOOR) * (2 / Math.PI);
    const nibFactor = (theta) => {
      if (!Number.isFinite(theta)) return 1;
      const d = theta - (NIB_DEG * Math.PI) / 180;
      const f = NIB_FLOOR + (1 - NIB_FLOOR) * Math.abs(Math.sin(d));
      return clamp(f / NIB_MEAN, 0.2, 2.2);
    };

    // 'taperedEnds' — NO STROKE STARTS OR STOPS AT FULL WIDTH.
    //
    // Two tapers, and they are aimed at two different hard edges.
    //
    //   THE END TAPER. Within TAPER_MM of a run's own end the width eases to
    //   TAPER_FLOOR of what the tone asked for, on a smootherstep (zero first
    //   AND second derivative at both ends). A run ends at the silhouette or at
    //   a pole — both legal places — but it ends there at full width in every
    //   other law, which is the blunt stop the eye reads as a cut edge.
    //
    //   THE LIGHT TAPER. whiteBand HARD-CLAMPS the grey to [WB_CMIN, WB_CMAX];
    //   at the lit end that clamp is a corner in the transfer, so the width
    //   stops shrinking abruptly and the drawing shows a boundary where the
    //   rulings "arrive" at the pen. Here the same clamp is made SOFT — a
    //   log-sum-exp min/max whose derivative is continuous — so the approach to
    //   the pen has no knee at all. This is the one the highlight-falloff metric
    //   is measuring.
    //
    // Nothing is dropped and no run is shortened: a taper is a width, so the
    // ruling still runs end to end and the free-end count stays at zero.
    const TAPER_MM = 3.5;        // how far in from a run's own end the taper reaches
    const TAPER_FLOOR = 0.42;    // width at the very end, as a share of the tone's ask
    const TAPER_SOFT = 0.09;     // softness of the light-end clamp, in grey units
    const softClamp = (v, lo, hi) => {
      // Smooth max then smooth min, both by the log-sum-exp softening. k is in
      // grey units, so the corner is rounded over TAPER_SOFT of the range.
      const k = Math.max(1e-4, TAPER_SOFT);
      const smax = lo + k * Math.log(1 + Math.exp((v - lo) / k));
      return hi - k * Math.log(1 + Math.exp((hi - smax) / k));
    };
    const taperFactor = (endMM) => {
      if (!Number.isFinite(endMM) || endMM >= TAPER_MM) return 1;
      const u = clamp(endMM / TAPER_MM, 0, 1);
      const e = u * u * u * (u * (6 * u - 15) + 10);
      return TAPER_FLOOR + (1 - TAPER_FLOOR) * e;
    };
    const taperArea = (I, endMM) => {
      const c = softClamp(clamp(finite(I, 0), 0, 1), WB_CMIN, WB_CMAX);
      return clamp((1 - c) * taperFactor(endMM), 0.01, 1 - WB_CMIN);
    };

    // 'multiScale' — A HATCHING PYRAMID, TWO OCTAVES.
    //
    // The COARSE family rules at twice the reserved pitch (it is emitted with
    // half the line count, so its own `localPitch` is 2× and every downstream
    // pitch-correct quantity follows automatically). It carries the broad form
    // and is present everywhere, so the LIGHT end gets lighter than any single
    // family can manage: at the pen's own weight it lays ink/(2p), half a single
    // family's floor.
    //
    // The FINE family rules at the reserved pitch and enters BY DENSITY from
    // nothing, exactly where the coarse family runs out of legal pen. No
    // threshold, no traceable edge — the same construction weightCrossHandoff
    // uses for its second direction, applied to SCALE instead.
    //
    // The two are composed ADDITIVELY, not by 1−(1−a)(1−b). They run at the same
    // angle, so where both are heavy their bands abut rather than overlap, and
    // the multiplicative form would under-report the ink by exactly the overlap
    // that does not happen. The additive total is capped at MS_DEEP_AREA, which
    // is under the flood bar; floods are counted, as always.
    const MS_DEEP_AREA = 0.93;
    const msTotal = (I) => areaForTone(I, MS_DEEP_AREA, wLightArea() / 2);
    // The most the coarse family alone may lay: heaviest legal pen on ITS pitch,
    // held to a minimum white margin so the coarse band never closes.
    const msCoarseCap = (localPitch) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const drawn = p / Math.max(1e-6, weightBaseCov());
      return clamp(Math.min(1 - WB_CMIN, (W_MAX * inkWidth()) / drawn), 0.02, 0.98);
    };
    const msAreaCoarse = (I, localPitch) => Math.min(msTotal(I), msCoarseCap(localPitch));
    const msAreaFine = (I, localPitch) => {
      // The coarse pitch is twice the fine one, so the coarse family's own cap
      // has to be restated on ITS pitch, not on the fine family's.
      const cap = msCoarseCap(localPitch * 2);
      return clamp(msTotal(I) - Math.min(msTotal(I), cap), 0, 0.98);
    };
    const msCovFine = (I, localPitch) => clamp(
      covForArea(msAreaFine(I, localPitch), localPitch), 0.001, weightBaseCov(),
    );

    // 'screenAngles' — THE ANGLES COME FROM HALFTONE SCREEN THEORY.
    //
    // This file's crossed families sit at +65° and +32° (separations 65°, 33°,
    // 82°) — three numbers picked for "not 90°, which reads as a square grid".
    // Screen-angle theory gives the number instead of guessing it.
    //
    // A HALFTONE DOT screen has 90° rotational symmetry, so three screens are
    // maximally separated at 30° apart, which is where 15° / 45° / 75° comes
    // from (45° is given to the strongest ink because a 45° screen is the least
    // visible to the eye, and 0°/90° is left to the weakest, yellow).
    //
    // A LINE screen — which is what a ruled hatch family is — has 180°
    // symmetry, not 90°: rotating a set of parallel lines by 90° gives a
    // genuinely different screen, while rotating a dot lattice by 90° gives the
    // same one. So the line-screen analogue of "30° apart under 90° symmetry" is
    // 60° APART UNDER 180° SYMMETRY, and the three families go to base+0°,
    // base+60°, base+120°. The pairwise separations are 60/60/60 against the
    // current 65/33/82, and the worst pair goes from 33° to 60° — the beat
    // wavelength of a pair scales as 1/sin(Δθ/2) at equal pitch, so the worst
    // pair's beat shortens by sin(30°)/sin(16.5°) = 1.76×, i.e. the coarsest
    // interference pattern in the drawing is 1.76× finer and correspondingly
    // less visible. That is the prediction; the harness measures it.
    //
    // The angles are taken in the SCREEN frame (`emitScreenCross`), because a
    // screen angle is a statement about what the eye sees, and a parameter-frame
    // angle is only equal to it where the chart happens to be conformal.
    const SA_DEEP_AREA = 0.85;
    const SA_SEP_DEG = 60;
    const saTotal = (I) => areaForTone(I, SA_DEEP_AREA, wLightArea());
    const saCap = (localPitch) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const drawn = p / Math.max(1e-6, weightBaseCov());
      return clamp(Math.min(1 - WB_CMIN, (W_MAX * inkWidth()) / drawn), 0.02, 0.98);
    };
    // Layer k's share, by composition: each family fills to its own cap and hands
    // the rest on, so family k+1 enters at zero exactly where family k saturates.
    const saAreaAt = (I, localPitch, layer) => {
      const t = clamp(saTotal(I), 0, 0.98);
      const cap = saCap(localPitch);
      let rest = t;
      let a = 0;
      for (let k = 0; k <= clamp(Math.round(layer), 0, 2); k++) {
        a = Math.min(rest, cap);
        rest = clamp(1 - (1 - rest) / Math.max(1e-6, 1 - a), 0, 0.98);
      }
      return a;
    };
    const saCovAt = (I, localPitch, layer) => (layer === 0
      ? weightBaseCov()
      : clamp(covForArea(saAreaAt(I, localPitch, layer), localPitch), 0.001, weightBaseCov()));

    // ── SWEEP 2: THE PRE-WARPS. NO INK, NO PLOT TIME, EVERY LAW ──────────────
    //
    // 'equilibrated' = whiteBand, with two calibrations in front of it. Both are
    // pure maps from radiance to the area asked for; neither adds a stroke, a
    // pen-down or a millimetre of travel.
    //
    // (1) THE PERCEPTUAL SIGMOID. Sterzik, Meuschke, Cunningham & Lawonn, IEEE
    //     TVCG 30(1) 2024, fit a psychometric curve to crowd-sourced pairwise
    //     comparisons of illustrative textures:
    //         f(x) = 1 / (1 + (1/a − 1)·(1/x − 1)^b)
    //     with a = 0.4753, b = 1.5918 FOR HATCHING (stipple 0.5644/1.7361;
    //     triangles 0.5859/1.8120 — different textures, different curves, which
    //     is itself the finding). b > 1 and a < 0.5 mean perceived tone rises
    //     FASTER than density in the lights and SATURATES in the darks — which
    //     is the exact shape of the two complaints this branch keeps measuring
    //     (the highlight stops too abruptly; the darks go flat). Every law here
    //     so far has been uniform in INK AREA, which is not the axis the eye is
    //     on. So the perceived darkness is made linear in radiance and the
    //     DENSITY is the inverse curve's answer.
    //
    // (2) THE EQUILIBRATION TABLE. Ostromoukhov, "Digital Facial Engraving",
    //     SIGGRAPH 1999, §2.3: dither → dot-gain → HVS low-pass → correct the
    //     tone-to-parameter map LOCALLY at 16 levels → iterate. Explicitly not a
    //     histogram equalisation, "because of its GLOBAL nature". This is the
    //     standard fix for exactly the anomaly this branch measured and could
    //     not explain — one family under-delivers (0.408 against a predicted
    //     0.509) while a crossed pair over-delivers (XH_DEEP_AREA had to be
    //     MEASURED at 0.72 against a predicted 0.85). Individually-linear layers
    //     do not superpose linearly, and no amount of arithmetic in this file
    //     will make them; the correction has to come back from the render.
    //
    //     EQ_TABLE is 16 gains on the asked ink area, indexed by radiance. The
    //     identity table below is the UNCALIBRATED law; the harness runs the
    //     loop (render → measure apparent L* per level → gain = area needed /
    //     area delivered → rewrite this array → re-render) and each pass is
    //     reported separately, so the correction is visible rather than baked.
    const PS_A = 0.4753;
    const PS_B = 1.5918;
    const psInv = (y) => {
      const t = clamp(finite(y, 0.5), 1e-4, 1 - 1e-4);
      return clamp(1 / (1 + Math.pow((1 / t - 1) / (1 / PS_A - 1), 1 / PS_B)), 0, 1);
    };
    const EQ_TABLE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const eqGain = (I) => {
      const n = EQ_TABLE.length;
      const t = clamp(finite(I, 0), 0, 1) * (n - 1);
      const i = Math.min(n - 2, Math.floor(t));
      return clamp(EQ_TABLE[i] + (EQ_TABLE[i + 1] - EQ_TABLE[i]) * (t - i), 0.2, 5);
    };
    const eqArea = (I) => {
      const aMin = wLightArea();
      const aMax = 1 - WB_CMIN;
      const u = psInv(1 - clamp(finite(I, 0), 0, 1));
      return clamp((aMin + (aMax - aMin) * u) * eqGain(I), 0.01, 0.98);
    };

    // ── 'signedWidth' — ZANDER'S TAPER-THEN-SHORTEN ───────────────────────────
    //
    // Zander, Isenberg, Schlechtweg & Strothotte, "High Quality Hatching", CGF
    // 23(3) 2004, §4.3: let the per-sample width be SIGNED. Positive, draw at
    // that width; approaching zero, taper to a hairline; NEGATIVE, and the
    // visible portion shortens — the stroke's end lands wherever the width
    // crosses zero, which is in general MID-SEGMENT. "This decouples the visual
    // occurrence of a line end from the positions of the individual stroke
    // vertices."
    //
    // Under whiteBand the black core ALREADY is a per-sample width, so allowing
    // it to go negative is a small change with a large payoff at the light end:
    // the tone target is anchored BELOW the pen (SW_LIGHT_FRAC of what the pen
    // alone would lay), so in the highlight the ask falls under SW_CUT and the
    // stroke retracts along its own length instead of arriving at the pen floor
    // and stopping dead. There is no cull decision anywhere and no quantised
    // length ladder — the end is where the arithmetic says it is.
    //
    // THIS LAW DELIBERATELY BREACHES THE FREE-END INVARIANT, and it is the only
    // one in this round that does. The ends it creates are in the HIGHLIGHT, by
    // construction (the width only goes negative where the tone is nearly
    // white), which is where Ostromoukhov's own MAX-merge argument says
    // fragmentation belongs — "produces continuous lines in the dark areas, and
    // discontinuous ones in highlights". The count is measured and reported, not
    // hidden, and the law is offered as an EXTENSION to whiteBand's light end
    // rather than as a replacement for it.
    const SW_LIGHT_FRAC = 0.40;  // the light anchor, as a share of the pen's own floor
    const SW_CUT = 0.72;         // pen units: below this the stroke is not on the paper
    const swArea = (I) => areaForTone(I, 1 - WB_CMIN, wLightArea() * SW_LIGHT_FRAC);
    // The width the tone asks for, in PEN UNITS, before any clamp — the signed
    // quantity itself. `weightForArea` would clamp it at W_MIN, which is exactly
    // the cliff this law exists to remove, so the ask is recomputed here.
    const swAsk = (I, localPitch) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      if (!(p > 1e-6)) return W_MIN;
      const c = clamp(weightCovEff(clamp(finite(I, 0), 0, 1), p), 1e-6, 1);
      return (swArea(clamp(finite(I, 0), 0, 1)) * p) / (c * inkWidth());
    };

    // ── 'wideShadowPen' — THE CHEAPEST REAL BLACK ON THE LIST ─────────────────
    //
    // A two-pen plot. Lights and mids stay on the fine nib; the SHADOW family
    // alone goes on a physically wider pen at its own spacing. A 0.9 mm nib
    // reaches a given ink area with about a third the line count and a third the
    // plot time of the 0.3 mm nib, and — the part that matters here — the
    // engine's weightScale ceiling of 6 is a ceiling on the FINE pen, so a
    // family drawn with a 3× nib clears the same ink area at a third the ask.
    //
    // The fine family is held to WSP_FINE_CAP and never asked to carry the
    // shadow at all; the wide family enters BY DENSITY from nothing on the
    // remainder, so there is no threshold and no traceable onset. Its weight is
    // FLOORED at WSP_MUL, because a physically wider pen cannot draw thinner
    // than itself — that is what makes this a two-pen plot and not a re-labelled
    // weight law, and it is why the density ramp does the entering.
    //
    // The number to read is not darkest L* alone but darkest L* PER MILLIMETRE
    // OF TRAVEL, which is what the harness's ink/paths columns carry.
    // MEASURED, AND THE REASON THIS IS A HANDOVER AND NOT AN ADDITION. The first
    // cut had the fine family HOLD its cap while the wide pen added on top. Both
    // families then crowd together wherever the chart does (a sphere's meridians
    // converge to nothing at the poles) and the pair composed past solid:
    // sphere-hatch came back with a 5th-percentile L* of 4.5 — a black cap on a
    // lit ball — R² 0.076, and 1792 mm of ink against whiteBand's 1192. It also
    // threw away the whole point, which is COST: two families drawn everywhere
    // is more travel, not less.
    //
    // A two-pen plot is a HANDOVER. The fine pen carries the lights and mids and
    // then FADES OUT by density as the wide pen comes in, so the core shadow is
    // drawn by the wide pen essentially alone — a third of the line count for
    // the same ink area, which is B14's actual claim.
    const WSP_MUL = 3.0;            // the shadow nib, as a multiple of the fine one
    const WSP_DEEP_AREA = 0.90;
    const WSP_FINE_CAP = 0.40;      // the most the fine pen is ever asked for
    const wspTotal = (I) => areaForTone(I, WSP_DEEP_AREA, wLightArea());
    const wspHand = (I) => {
      const t = clamp((wspTotal(I) - WSP_FINE_CAP) / Math.max(1e-6, WSP_DEEP_AREA - WSP_FINE_CAP), 0, 1);
      return t * t * t * (t * (6 * t - 15) + 10);
    };
    const wspAreaFine = (I) => clamp(Math.min(wspTotal(I), WSP_FINE_CAP) * (1 - wspHand(I)), 0, 0.98);
    const wspAreaWide = (I) => clamp(wspTotal(I) - wspAreaFine(I), 0, 0.98);
    const wspCovWide = (I, localPitch) => clamp(
      covForArea(wspAreaWide(I), localPitch), 0.001, weightBaseCov(),
    );

    // ── 'transverseReserve' — BEWICK'S WHITE LINE, DONE PROPERLY ──────────────
    //
    // THE CORRECTION THAT MADE THIS LAW NECESSARY. The obvious inversion —
    // "whiteBand, but carve white out of a near-solid ground" — is not a new
    // law at all. whiteBand IS the parallel white-line model: its white reserves
    // already run ALONG the rulings, and changing which end the transfer is
    // anchored at only re-parameterises it. Measured, exactly as predicted:
    // `whiteLineInverse` on sphere·hatch is whiteBand with a tighter reserved
    // pitch and a deeper anchor, and it moves darkest L* 51.4 → 31.3 purely
    // because of that re-pitching, not because of any inversion.
    //
    // Bewick's tonal range did not come from parallel whites. It came from white
    // lines that CROSS the black — cut ACROSS the burin's own strokes, so the
    // reserve is TRANSVERSE. That is not reachable by any continuous width law,
    // which is what makes it genuinely new here.
    //
    // Construction. The family rules at a pitch the heaviest legal pen can CLOSE
    // (trFlatCov: pitch = W_MAX·ink, so weight 6 lays a solid field). Tone is
    // then two axes, exactly as the engraver has: the black core's width, and
    // the width of a transverse white ruling cut across it. The width axis
    // carries the lights and mids alone; past TR_WCAP the core goes solid and
    // the transverse reserve opens, so the two hand over continuously in
    // DELIVERED AREA (aw·(1−d) is continuous through the crossover) while the
    // texture changes from a hatch to an engraved field.
    //
    // PHASE ALIGNMENT IS THE ENTIRE TRICK. The gaps are cut symmetrically about
    // the SAME sweep parameter on every ruling — the gate is |frac(tt/T) − ½| ≥
    // d/2, so the reserve's centre is at a fixed tt regardless of how wide it is
    // — which makes the whites line up into a coherent cross-ruling running
    // perpendicular to the black family. Unaligned gaps read as a broken hatch,
    // which is the failure mode this branch exists to prevent; aligned ones read
    // as deliberate cuts, which is what an engraving is.
    //
    // FREE ENDS: two per reserve per ruling, by construction. Reported.
    const TR_DARK_AREA = 0.92;
    const TR_WCAP = 0.45;        // where the core stops widening and the white opens
    const TR_TT_PERIOD = 1 / 13; // transverse reserves per sweep
    const TR_DUTY_MAX = 0.88;
    const trFlatCov = () => {
      const env = toneEnvelope();
      const c = masterPitch / (W_MAX * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    const trTotal = (I) => areaForTone(I, TR_DARK_AREA, wLightArea());
    // The crossover, as a smootherstep on the area itself: 0 while the width
    // axis can still carry the tone, 1 once the core has gone solid.
    const trBlend = (A) => {
      const t = clamp((A - TR_WCAP) / Math.max(1e-6, TR_DARK_AREA - TR_WCAP), 0, 1);
      return t * t * t * (t * (6 * t - 15) + 10);
    };
    const trAreaWidth = (I) => {
      const A = clamp(trTotal(I), 0, 0.98);
      return clamp(A + (1 - A) * trBlend(A), 0.01, 1);
    };
    const trDuty = (I) => {
      const A = clamp(trTotal(I), 0, 0.98);
      const aw = trAreaWidth(I);
      return clamp(1 - A / Math.max(1e-6, aw), 0, TR_DUTY_MAX);
    };
    // ═══ V5: THREE PENS, THREE REAL NIB WIDTHS ═══════════════════════════════
    //
    // Jay: "Give me ten unique ideas that allow for three separate pens and
    // therefore three separate pen thicknesses."
    //
    // THE PEN SET, AND THE FACT THAT A NIB WIDTH IS A MEASUREMENT. The barrel
    // says 0.25 / 0.5 / 0.9; what those nibs actually lay on plotter paper is
    // about 0.26 / 0.52 / 0.93 mm. The measured numbers are the ones used here;
    // the labels are only labels, and every quantity below is stated against the
    // measurement. `INK_SPREAD` is applied on top, exactly as it is for the
    // document pen, so `penInk(k)` is the width of the mark, not of the nib.
    const PEN_MM = [0.26, 0.52, 0.93];
    const PEN_LABEL = ['0.25 fine', '0.5 medium', '0.9 broad'];
    //
    // WHAT A REAL PEN CANNOT DO IS VARY ITS WIDTH. That single fact is what
    // separates this round from every weight law before it. `weightAtSample`
    // returns one of exactly three multipliers and `splitByWeight`'s output is
    // SNAPPED back onto that set, so no run can leave here at 1.7× a nib that
    // does not exist. Tone therefore has to be carried by SPACING and by WHICH
    // PEN — which is precisely the direction Jay asked for in the same breath:
    // lines touching for pure black, the gaps opening evenly and eased along the
    // form's contour toward the highlight, closing again into shadow beyond.
    const penIdx = (k) => clamp(Math.round(finite(k, 0)), 0, 2);
    const penMul = (k) => PEN_MM[penIdx(k)] / Math.max(1e-6, penWidth);
    const penInk = (k) => PEN_MM[penIdx(k)] * (1 + INK_SPREAD);
    //
    // EACH PEN HAS ITS OWN PLOT FLOOR, AND THAT IS THE WHOLE OPPORTUNITY.
    // `PLOT_FLOOR_PEN` is 2.2 × the nib, so the three own-floors are 0.57 /
    // 1.14 / 2.05 mm, and the pitch at which a nib's marks TOUCH — pure black,
    // no overlap — is its ink width: 0.29 / 0.58 / 1.04 mm. The engine's floor
    // is stated against the DOCUMENT pen (2.2 × 0.3 = 0.66 mm) and is enforced
    // downstream in `covAtSample`; nothing here relaxes it. The consequences are
    // worth stating plainly, because they are the reason a three-pen plot
    // reaches a black a one-pen plot cannot:
    //   · the FINE nib can NEVER touch — 0.66 mm is 2.3 × its ink width — so it
    //     is floor-bound at area 0.44, and that is its darkest possible tone;
    //   · the MEDIUM nib touches at 0.58 mm, just inside the engine floor, so at
    //     the floor it reaches area 0.88;
    //   · the BROAD nib's marks OVERLAP at 0.66 mm (area 1.58) — it is solid
    //     black there, and its useful pitch range starts ABOVE the engine floor.
    // So "respect each pen's own floor" is a real, asymmetric constraint: it
    // binds the fine pen everywhere and the broad pen nowhere. Both are counted.
    const penOwnFloor = (k) => PLOT_FLOOR_PEN * PEN_MM[penIdx(k)];
    const penTouchPitch = (k) => penInk(k);
    // The tightest pitch this pen may rule at: its own touch pitch (Jay's "lines
    // may touch for pure black") or the engine's floor, whichever is WIDER.
    // Nothing here can rule tighter than the engine already allows.
    const penMinPitch = (k) => Math.max(penTouchPitch(k), floorPitch > 1e-6 ? floorPitch : 0);
    const penMaxArea = (k) => clamp(penInk(k) / Math.max(1e-6, penMinPitch(k)), 0.02, 0.98);
    // WHERE EACH PEN BOUND, published for the harness. Three counters, because
    // "the floor binds" means something different for each nib.
    const penStat = {
      samples: 0,
      floorBound: [0, 0, 0],   // asked to rule tighter than this pen's own floor
      ownFloorBound: [0, 0, 0], // ...tighter than 2.2 × its own nib (the conservative bar)
      flood: [0, 0, 0],        // asked for more area than its marks can lay without overlap
      picks: [0, 0, 0],
    };
    // Coverage that lays `area` with pen k on a grid of this local pitch, capped
    // by that pen's own minimum pitch. Same arithmetic as `covForArea`, with the
    // pen's ink width in place of the document pen's.
    const penCov = (area, localPitch, k) => {
      const kk = penIdx(k);
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const a = clamp(finite(area, 0), 0, 0.98);
      if (!(p > 1e-6)) return clamp(a, 0.005, 1);
      const c = (a * p) / penInk(kk);
      const cap = clamp(p / Math.max(1e-6, penMinPitch(kk)), 0.005, 1);
      const capOwn = clamp(p / Math.max(1e-6, penOwnFloor(kk)), 0.005, 1);
      penStat.samples += 1;
      penStat.picks[kk] += 1;
      if (c > cap + 1e-9) penStat.floorBound[kk] += 1;
      if (c > capOwn + 1e-9) penStat.ownFloorBound[kk] += 1;
      if (a > penMaxArea(kk) + 1e-9) penStat.flood[kk] += 1;
      return clamp(Math.min(c, cap), 0.005, 1);
    };
    // THE TONE ENVELOPE, IN PEN TERMS. Both ends physical, neither chosen:
    // lightest is the FINE nib at the O6 sparse bar (`litMaxPitchPen` × pen =
    // 3.6 mm, the pitch past which the centre light has no ink for a highlight
    // to be blank against); darkest is the BROAD nib with its marks touching.
    // The transfer between them is `areaForTone` — L* linear in radiance — which
    // is what makes the gaps open EVENLY and eased along the form rather than in
    // proportion to ink.
    // MEASURED, AND IT IS THE DEPTH-VERSUS-LINEARITY TRADE STATED AS ONE
    // NUMBER. The first cut anchored the dark end at the broad nib's true touch
    // pitch — area 0.98, solid black. Under an L*-linear transfer that puts the
    // whole lower half of the form into near-black, where the delivered tone
    // CANNOT vary because it is already solid: sphere-hatch came back with the
    // bottom of its response flat, R² 0.153 and 37.6 % off the line. 0.93 is the
    // same "near solid, short of a flooded blob" bar `W_DEEP_AREA` uses; the
    // broad nib reaches it at a 1.12 mm pitch, which is inside the engine floor
    // and inside its own ink width, so the marks still touch — they just are not
    // asked to overlap.
    const PEN_DEEP_AREA = 0.93;
    const penLightArea = () => clamp(penInk(0) / Math.max(1e-6, litMaxPitchPen() * penWidth), 0.005, 0.98);
    const penDarkArea = () => clamp(Math.min(penMaxArea(2), PEN_DEEP_AREA), 0.02, 0.98);
    const penTarget = (I) => areaForTone(I, penDarkArea(), penLightArea());
    //
    // THE TIER COORDINATE, AND WHY IT IS REAL-VALUED. `penTierU` returns a
    // continuous 0…2: 0 = fine alone, 1 = medium alone, 2 = broad alone, and the
    // fractional part is the SHARE OF RULINGS that take the next pen up. A hard
    // switch at a threshold is a texture-family change with a step the coverage
    // match cannot remove (the perceptual literature is explicit about this, and
    // it is the failure mode Jay named). Substituting one ruling in five, then
    // two in five, then three, spreads that change over a band of the form
    // instead of putting it on a line. The window is the last PEN_BLEND of each
    // pen's usable range, so the handoff happens where the outgoing pen is
    // already at its own floor and has nothing left to give.
    const PEN_BLEND = 0.18;
    const smooth5 = (t) => { const u = clamp(t, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };
    const penTierU = (A) => {
      const a = clamp(finite(A, 0), 0, 0.99);
      const h0 = penMaxArea(0);
      const h1 = penMaxArea(1);
      if (a <= h0) return smooth5((a - h0 * (1 - PEN_BLEND)) / Math.max(1e-6, h0 * PEN_BLEND));
      if (a <= h1) return 1 + smooth5((a - h1 * (1 - PEN_BLEND)) / Math.max(1e-6, (h1 - h0) * PEN_BLEND + 1e-6));
      return 2;
    };
    // Which ruling takes the substitution. A golden-ratio phase on the ruling
    // index is the sequence that stays furthest from lining up with itself at
    // every count, so no small run of rulings ever falls into phase and the
    // substitution reads as a mix rather than as a stripe.
    // MEASURED. The first cut used the golden-ratio phase, which is the right
    // choice for a sequence that must never fall into step with itself — but the
    // substitution is not that problem. Two adjacent rulings drawn with nibs
    // 3.6x apart in ink is a large local swing whatever order they come in, so
    // what matters is that the substituted rulings are as EVENLY SPREAD as an
    // integer subset can be. That is Bresenham's rule (the Sturmian word of
    // density f), the same construction the ladder itself uses, and its gaps are
    // exactly floor(1/f) and ceil(1/f) — two consecutive integers, never a run.
    // Golden-phase substitution measured a moire RMS of 0.322 ink-area on
    // sphere-hatch against Bresenham's; the pairs it happened to put together
    // were what the eye was reading.
    const penDitherTier = (u) => {
      const uu = clamp(finite(u, 0), 0, 2);
      const base = Math.floor(uu);
      const f = uu - base;
      const i = Number(penLineIdx) || 0;
      const up = Math.floor((i + 1) * f) > Math.floor(i * f);
      return penIdx(base + (up ? 1 : 0));
    };
    // ── THE GRID MUST NOT KNOW ABOUT THE SUBSTITUTION ────────────────────────
    //
    // MEASURED, AND IT IS THE WHOLE LESSON OF THIS ROUND. The first cut stated
    // each ruling's coverage against the pen that ruling had been dealt —
    // `penCov(A, p, penDitherTier(u))`. The broad nib's ink is 3.6× the fine
    // one's, so two neighbouring rulings on either side of a substitution asked
    // for coverages 3.6× apart, the ladder's phase accumulator duly kept them at
    // 3.6× the spacing, and the field came out with a spacing CoV of 0.641 and a
    // largest adjacent step of 3.25× (whiteBand: 0.31 and 1.67×). R² collapsed
    // to 0.122. The substitution had been allowed to move the GEOMETRY.
    //
    // The fix is to state the grid against the MIX and the width against the
    // draw. `penInkU` is the ink width of the blend — what a field of these
    // rulings lays per unit length ON AVERAGE — so the coverage, and therefore
    // the spacing, is CONTINUOUS in u even though the pen in the holder is not.
    // The pen substitution then rides on an even field and changes only which
    // nib draws each already-placed ruling. That is what "a broad and a fine
    // alternating give an intermediate apparent weight with no width variation"
    // has to mean arithmetically.
    const penInkU = (u) => {
      const uu = clamp(finite(u, 0), 0, 2);
      const b = Math.floor(uu);
      if (b >= 2) return penInk(2);
      return penInk(b) + (penInk(b + 1) - penInk(b)) * (uu - b);
    };
    // Coverage for the blended field, floored by the pen that will actually
    // carry the darkest share of it (the wider nib of the pair — it is the one
    // that floods first, so it owns the floor).
    const penCovU = (area, localPitch, u) => {
      const uu = clamp(finite(u, 0), 0, 2);
      const kFloor = penIdx(Math.ceil(uu - 1e-9));
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const a = clamp(finite(area, 0), 0, 0.98);
      if (!(p > 1e-6)) return clamp(a, 0.005, 1);
      const c = (a * p) / Math.max(1e-6, penInkU(uu));
      const cap = clamp(p / Math.max(1e-6, penMinPitch(kFloor)), 0.005, 1);
      const capOwn = clamp(p / Math.max(1e-6, penOwnFloor(kFloor)), 0.005, 1);
      penStat.samples += 1;
      penStat.picks[kFloor] += 1;
      if (c > cap + 1e-9) penStat.floorBound[kFloor] += 1;
      if (c > capOwn + 1e-9) penStat.ownFloorBound[kFloor] += 1;
      if (a > penMaxArea(kFloor) + 1e-9) penStat.flood[kFloor] += 1;
      return clamp(Math.min(c, cap), 0.005, 1);
    };
    // The SMALLEST pen that can deliver this area without breaching its own
    // floor. The hard switch — the control against which the eased handoffs are
    // measured. ('penPitchMatch'.)
    const penExact = (A) => {
      const a = clamp(finite(A, 0), 0, 0.99);
      if (a <= penMaxArea(0)) return 0;
      if (a <= penMaxArea(1)) return 1;
      return 2;
    };
    // Snap a mean weight back onto the pen set. `splitByWeight` averages the
    // per-sample weights over a piece, and a piece that straddles a pen change
    // would otherwise come out at a width no nib in the tray can draw. Every run
    // this file emits under a pen law leaves at EXACTLY one of three widths.
    const penSnap = (w) => {
      let best = 0; let bd = Infinity;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(penMul(k) - finite(w, 1));
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    // EQUAL SHARES, NOT A CASCADE — MEASURED. The cascade (layer k fills to its
    // own pen's cap and hands the remainder on) is right when the layers are a
    // handoff, and wrong when they are a SCREEN. Family A is the finest-pitched
    // family and was therefore dealt the fine nib; under the cascade it filled
    // to that nib's cap of 0.441 EVERYWHERE, which is 2773 mm of 0.26 mm ink on
    // one sphere — 3797 mm total against whiteBand's 1192 — while the broad nib
    // drew 9 paths and 200 mm. Tone flattened with it: R² 0.003, 76 % off the
    // line, and the whole cost argument for a broad nib inverted.
    //
    // Three screens compose as 1 − (1 − a)³, so the share that lands each family
    // on the target is a = 1 − (1 − A)^(1/n). Every family then carries the same
    // tonal responsibility and differs only in the nib that draws it — which is
    // what a screen IS, and it is the construction the 0/60/120 separation was
    // chosen for. Capped by each pen's own maximum, so a nib is never asked for
    // more area than its floor allows.
    // ...AND THE PROBABILISTIC UNION IS THE WRONG COMPOSITION FOR RULED
    // FAMILIES. MEASURED, TWICE. 1 − (1 − a)^n assumes the layers overlap at
    // random; crossed RULINGS do not — this file already had to measure
    // `XH_DEEP_AREA` at 0.72 against a predicted 0.85 for exactly that reason.
    // Sharing by the union put every multi-family pen law solid: penScreen,
    // penOctaves and penCross all came back with a 5th-percentile L* of 4.5 (a
    // black ball), 4216 / 4565 / 2485 mm of ink, and R² 0.003 / 0.385 / 0.127.
    // Additive shares with a composed ceiling is the model that lands: the
    // families are sparse at the shares involved, their bands abut far more
    // often than they overlap, and the ceiling is the same measured 0.85 the
    // crossed laws use rather than a predicted union.
    const PEN_MULTI_CEIL = 0.85;
    const penShareArea = (A, n, tier) => {
      const a = Math.min(clamp(finite(A, 0), 0, 0.98), PEN_MULTI_CEIL);
      const k = Math.max(1, Math.round(finite(n, 1)));
      return clamp(Math.min(a / k, penMaxArea(tier)), 0.005, 0.98);
    };
    // Composition across layers, each layer capped by ITS OWN pen. Layer k+1
    // enters at zero exactly where layer k saturates, so a family appears by
    // density from nothing and there is no threshold to trace.
    const penLayerArea = (A, layer, tierOf) => {
      let rest = clamp(finite(A, 0), 0, 0.98);
      let a = 0;
      for (let k = 0; k <= clamp(Math.round(finite(layer, 0)), 0, 2); k++) {
        a = Math.min(rest, penMaxArea(tierOf(k)));
        rest = clamp(1 - (1 - rest) / Math.max(1e-6, 1 - a), 0, 0.98);
      }
      return a;
    };
    // The object's own camera-depth range, for 'penDepth'. Sampled once from the
    // chart on a coarse grid, so it is deterministic and costs 121 projections.
    let penZR = null;
    const penZRange = () => {
      if (penZR) return penZR;
      let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          const smp = sampleAt(i / 10, j / 10);
          if (!smp || !Number.isFinite(smp.z)) continue;
          if (smp.z < lo) lo = smp.z;
          if (smp.z > hi) hi = smp.z;
        }
      }
      penZR = Number.isFinite(lo) && hi > lo ? { lo, hi } : { lo: 0, hi: 1 };
      return penZR;
    };
    // 'penStipple' — the fine nib's duty cycle in the highlight fade. The ruled
    // grid stays put and the MARKS shorten, which is the hatch→stipple move the
    // perceptual work says is free (hatch and stipple share one manifold; it is
    // CROSSHATCH that sits in a separate cluster, which is why 'penCross' puts
    // its register change in the darks and this one does not).
    const PSTIP_REF = 4;         // the fine tier's reference density, in light-areas
    const PSTIP_PERIOD = 1 / 26; // marks per sweep
    const pstipCov = (p) => penCov(clamp(penLightArea() * PSTIP_REF, 0.01, 0.98), p, 0);
    const pstipDuty = (A, p) => {
      const c = pstipCov(p);
      const laid = (c * penInk(0)) / Math.max(1e-6, (Number.isFinite(p) && p > 1e-6) ? p : masterPitch);
      return clamp(clamp(finite(A, 0), 0, 0.98) / Math.max(1e-6, laid), 0.05, 1);
    };
    // 'penReserve' — Bewick's transverse white, cut across a broad-pen ground.
    // The reserve's centre sits at a FIXED sweep parameter on every ruling
    // (|frac(tt/T) − ½| ≥ d/2), so the whites line up into a coherent
    // cross-ruling instead of reading as a broken hatch. The FINE pen then rules
    // a crossing family INSIDE those reserves — which is the part a width law
    // cannot reach, and the reason this needs three pens rather than two.
    const PRES_PERIOD = 1 / 12;
    const PRES_DUTY_MAX = 0.6;
    const presDuty = (A) => {
      const h1 = penMaxArea(1);
      const t = clamp((clamp(finite(A, 0), 0, 0.99) - h1) / Math.max(1e-6, penMaxArea(2) - h1), 0, 1);
      // Darkest ⇒ narrowest white. The reserve opens as the broad ground lightens.
      return clamp(PRES_DUTY_MAX * (1 - smooth5(t)), 0, PRES_DUTY_MAX);
    };
    //
    // ── THE TEN ───────────────────────────────────────────────────────────────
    // Each changes ONE thing about how three nibs are assigned. Every one of
    // them emits three widths and only three.
    //
    //  1 'penTiers'      Tone tiers. Broad carries the darks, medium the mids,
    //                    fine the highlights, one family and one angle, with the
    //                    handoffs eased by per-ruling pen substitution.
    //  2 'penScreen'     Three families at 0/60/120 — the LINE-screen angles
    //                    (line screens have 180° symmetry, so three families
    //                    want 60° apart, not the CMYK 30°) — one pen per family,
    //                    composed. No tier boundary exists: all three families
    //                    are present everywhere and only the mix changes.
    //  3 'penInterleave' ONE even grid at the medium pen's own floor; tone is
    //                    carried by the pen MIX alone. A broad and a fine
    //                    alternating give an intermediate apparent weight with
    //                    no width variation anywhere.
    //  4 'penStipple'    Broad ruled darks, medium hatch mid, and the FINE nib
    //                    stippling the highlight fade by shortening its marks.
    //  5 'penOctaves'    Three tonal octaves of a pyramid: broad at 4× pitch,
    //                    medium at 2×, fine at 1×, each entering by density as
    //                    the octave above it saturates.
    //  6 'penFacing'     Pen per SURFACE REGION, not per tone: the facing ratio
    //                    nz (1 at the centre, 0 on the silhouette) picks the nib,
    //                    so the limb is broad and the crown is fine whatever the
    //                    light is doing. Tone stays entirely on spacing.
    //  7 'penReserve'    The darkest region drawn by the BROAD pen at its own
    //                    floor, with transverse white reserves cut across it and
    //                    the FINE pen ruling detail inside them.
    //  8 'penCross'      The register change is put where the perceptual
    //                    clusters already separate: fine hatch in the lights,
    //                    medium hatch through the mids, and medium × broad
    //                    CROSSHATCH in the darks.
    //  9 'penPitchMatch' One eased pitch field; the pen is simply the smallest
    //                    that can deliver the local area without breaching its
    //                    own floor. The HARD switch — the control for 1 and 3.
    // 10 'penDepth'      Pen by camera DEPTH over the object's own z range:
    //                    near = fine, far = broad, independent of both tone and
    //                    silhouette. Tone stays on spacing.
    // ── WHAT THE TEN MEASURED, sphere-hatch, uncapped, against whiteBand ─────
    //
    // whiteBand (the reference, and NOT a pen plot — 439 of its 450 paths are at
    // a width no nib in the tray can draw):
    //   R² 0.512 · off-line 5.8 % · L* span 29 · darkest L* 51.4 · CoV 0.31 ·
    //   step 1.67x · ink 1192 mm · 450 paths
    //
    //   law             R²     off-line  span  darkest  CoV    step   seam   ink   paths  chg
    //   penPitchMatch   0.229   22.0 %   32.1   41.2    0.724  3.25x   9.3   1893   119    2
    //   penTiers        0.187   28.8 %   30.4   44.6    0.703  3.5x   10.4   1675   127    2
    //   penStipple      0.170   31.4 %   31.7   42.3    0.659  4.33x   9.9   1685   134    2
    //   penInterleave   0.154   36.5 %   29.2   41.7    0.677  3.5x   11.4   1634   273    2
    //   penReserve      0.100   34.4 %   14.3   48.4    0.513  3.5x   28.2   2249   254    2
    //   penOctaves      0.035   39.6 %   15.3   46.0    0.426  2.17x  40.5   2884    96    2
    //   penScreen       0.023   37.7 %   12.1   36.4    0.528  2.8x   37.6   2908    74    2
    //   penCross        0.003   67.0 %    6.6   62.2    0.552  2.8x   53.8   1652    65    1
    //   penDepth        0.001   79.7 %    8.7   77.8    0.767  2.33x  29.3   2692   546    1
    //   penFacing       0.000   64.4 %    4.4   43.1    0.876  2.8x   43.1   2332   438    2
    //
    // ALL TEN: zero marks outside the silhouette, zero off-pen widths, and 2 pen
    // changes when the work is grouped by nib (a pen law that is plotted in
    // EMISSION order costs 60–450 changes — the grouping is worth two orders of
    // magnitude and costs nothing, because a pen assignment is per-run).
    //
    // NONE OF THEM BEATS whiteBand ON LINEARITY, and the reason is structural
    // rather than tuning. whiteBand rules ONE even grid and never drops a
    // ruling; its tone is entirely the black fraction of a constant reserved
    // width, so the chart's foreshortening — a sphere's meridians converging to
    // nothing at the poles — cannot touch it. A three-pen plot may not vary its
    // width, so its ONLY tone channel is spacing, and spacing is exactly the
    // quantity the chart is already distorting. That is the price of the
    // request, and it is visible as the spacing CoV: 0.31 for whiteBand against
    // 0.65–0.88 here. Every one of the ten is nonetheless DARKER than whiteBand
    // (41–48 against 51.4) at a comparable or lower ink cost, which is the
    // broad nib's actual contribution: the same ink area for a third of the
    // travel.
    const PEN_LAWS = {
      penTiers: 1, penScreen: 1, penInterleave: 1, penStipple: 1, penOctaves: 1,
      penFacing: 1, penReserve: 1, penCross: 1, penPitchMatch: 1, penDepth: 1,
    };
    const isPenLaw = () => PEN_LAWS[TONE_ALGO] === 1;
    // The extra families each law emits, beyond family A (which the mapper
    // already emits at the full line count). `div` divides the line count, so a
    // family at div 2 rules at twice the pitch and every pitch-correct quantity
    // downstream follows without being told.
    const PEN_FAMILIES = {
      penScreen: [{ layer: 1, deg: 60, div: 1 }, { layer: 2, deg: 120, div: 1 }],
      penOctaves: [{ layer: 1, deg: 0, div: 2 }, { layer: 2, deg: 0, div: 4 }],
      penCross: [{ layer: 1, deg: 60, div: 2 }],
      penReserve: [{ layer: 1, deg: 90, div: 1 }],
    };
    // The pen each LAYER of a multi-family law draws with.
    const penLayerTier = (layer) => {
      const l = clamp(Math.round(finite(layer, 0)), 0, 2);
      if (TONE_ALGO === 'penScreen') return l;             // fine / medium / broad
      if (TONE_ALGO === 'penOctaves') return l;            // fine 1× / medium 2× / broad 4×
      if (TONE_ALGO === 'penCross') return l === 0 ? 1 : 2; // medium base, broad cross
      if (TONE_ALGO === 'penReserve') return l === 0 ? 2 : 0; // broad ground, fine detail
      return 0;
    };
    // ONE PLAN PER SAMPLE: which nib, and what coverage that nib rules at here.
    // Both `weightCovAt` (the geometry) and `weightAtSample` (the width) read
    // this same function, so the two can never disagree about which pen is in
    // the holder — a disagreement would state the tone against one nib and draw
    // it with another, which is how a "pen law" quietly becomes a weight law.
    const penPlan = (I, localPitch, smp) => {
      const Ic = clamp(finite(I, 0), 0, 1);
      const A = penTarget(Ic);
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const layer = clamp(Math.round(finite(xfLayer, 0)), 0, 2);
      switch (TONE_ALGO) {
        case 'penScreen':
        case 'penOctaves':
        case 'penCross': {
          const tier = penLayerTier(layer);
          const n = (PEN_FAMILIES[TONE_ALGO] || []).length + 1;
          return { tier, cov: penCov(penShareArea(A, n, tier), p, tier) };
        }
        case 'penReserve': {
          if (layer === 1) {
            // The fine detail family lives only where the broad ground has gone
            // solid and the transverse reserves have opened. It enters by
            // density on the reserve's own width, so it appears from nothing.
            const d = presDuty(A);
            return { tier: 0, cov: penCov(clamp(penLightArea() * 6 * d, 0.005, 0.6), p, 0) };
          }
          const u = penTierU(A);
          return { tier: penDitherTier(u), cov: penCovU(A, p, u) };
        }
        case 'penInterleave': {
          // ONE EVEN GRID, at the medium nib's own plot floor. Tone is the pen
          // mix and nothing else — until the mix runs out of range at the light
          // end, where the fine nib is alone and the grid has to open. That
          // crossover is stated here rather than hidden: below `penInk(0)` of
          // required mark width there is no mix left to thin, so the law falls
          // back to opening the pitch, exactly as every other law does.
          const covE = clamp(p / Math.max(1e-6, penOwnFloor(1)), 0.005, 1);
          const need = (A * p) / Math.max(1e-6, covE);
          if (need <= penInk(0)) return { tier: 0, cov: penCov(A, p, 0) };
          let u;
          if (need <= penInk(1)) u = (need - penInk(0)) / Math.max(1e-6, penInk(1) - penInk(0));
          else u = 1 + clamp((need - penInk(1)) / Math.max(1e-6, penInk(2) - penInk(1)), 0, 1);
          return { tier: penDitherTier(u), cov: covE };
        }
        case 'penStipple': {
          const u = penTierU(A);
          const tier = penDitherTier(u);
          if (tier === 0) return { tier: 0, cov: pstipCov(p) };
          return { tier, cov: penCovU(A, p, u) };
        }
        case 'penFacing': {
          const nz = clamp(finite(smp && smp.nz, 1), 0, 1);
          // Eased across the two region boundaries by the same per-ruling
          // substitution the tone tiers use, so the region change is a band and
          // not a contour line.
          const u = 2 - 2 * smooth5(clamp((nz - 0.10) / 0.75, 0, 1));
          return { tier: penDitherTier(u), cov: penCovU(A, p, u) };
        }
        case 'penDepth': {
          const zr = penZRange();
          const t = clamp((finite(smp && smp.z, zr.hi) - zr.lo) / Math.max(1e-6, zr.hi - zr.lo), 0, 1);
          const u = 2 - 2 * smooth5(t);                    // near (large z) ⇒ fine
          return { tier: penDitherTier(u), cov: penCovU(A, p, u) };
        }
        case 'penPitchMatch': {
          const tier = penExact(A);
          return { tier, cov: penCov(A, p, tier) };
        }
        default: {
          const u = penTierU(A);
          return { tier: penDitherTier(u), cov: penCovU(A, p, u) };
        }
      }
    };

    // ── ROUND 5 — THE NESTED SERPENTINE, AND WHERE THE EXTRA INK COMES FROM ───
    //
    // Jay, in his own words: "wavy lines nest within each other in the darkest
    // areas of shadow to minimize open space, and the amplitude gradually
    // lessens, creating more whitespace."
    //
    // THE ARITHMETIC FIRST, because a previous round already proved the naive
    // version is a no-op. `deepFillTSP` v1 displaced a ruling laterally into
    // "its own gap" and measured BYTE-IDENTICAL to `perceptualRamp`: at the
    // plot floor there is no gap to displace into. A space-filling curve
    // REDISTRIBUTES ink; it cannot ADD it. So every law in this round has to
    // say where its ink comes from, and this is the answer:
    //
    //   IT COMES FROM ARC LENGTH. A ruling that serpentines with peak-to-peak
    //   2A at wavelength L is longer than the straight ruling it replaces by
    //     e = sqrt(1 + (2*pi*A/L)^2 / 2)     (RMS over one period; exactly
    //                                         sqrt(1 + (4A/L)^2) for a triangle)
    //   and a pen lays ink per unit of PATH, not per unit of surface. At the
    //   same reserved pitch and the same maximum pen — the engine clamps
    //   weightScale at 6 — a serpentine family therefore delivers e times the
    //   ink area of a straight one. The pen genuinely travels farther; this is
    //   an addition, not a redistribution.
    //
    // AND IT IS BOUNDED, not free. The wave's own successive limbs are
    // L / sqrt(1 + (4A/L)^2) apart; once THAT falls under the plot floor the
    // band has gone solid and no further amplitude buys anything. `wvElongCap`
    // enforces exactly that bound, so the elongation a law may claim is the
    // elongation the paper will actually take.
    //
    // WHAT THE ELONGATION IS SPENT ON — and this is the design decision, not an
    // accident. NOT a deeper black: `transverseReserve` already reaches darkest
    // L* 23.6 by pitching so weight 6 lays solid, and no amount of waviness
    // improves on solid. The elongation is spent on a WIDER RESERVED PITCH. At
    // e ~ 1.5 the family can rule at 10 x pen and still reach ink area 0.92 in
    // the core shadow, where `whiteBand` needs 7.06 x pen to do it. That extra
    // 40 % of pitch IS the whitespace, and it lands exactly where Jay asked for
    // it: in the lights, where the amplitude has eased to zero and the ruling is
    // straight, wide apart and delicate.
    //
    // THE TONE IS STATED ON THE DELIVERED AREA, so elongation is DIVIDED OUT of
    // the ask. `weightForArea` knows nothing about arc length, so asking it for
    // area A on a path e times longer would deliver A*e and the drawing would
    // darken wherever the wave deepens — a tone error keyed to the texture,
    // which is the worst kind. Dividing keeps the response linear THROUGH the
    // transition; the wave then shows up as headroom on the pen, not as tone.
    //
    // NOTHING LEAVES THE SILHOUETTE. The displacement is made in the CHART, not
    // on the screen: a wave point is `sampleAt(a + da, b + db)`, i.e. a genuine
    // point of the surface, re-tested for front-facing before it is used, and
    // where that test fails the amplitude is zero and the ruling runs straight.
    // A crest therefore cannot hang off the limb — the defect Jay named. On top
    // of that the amplitude is tapered to nothing over WV_TAPER_MM of each run's
    // own end, so the wave dies BEFORE the silhouette rather than at it.
    const WV_PITCH_PEN = 10;      // reserved pitch, in pen widths (whiteBand: 7.06)
    const WV_DARK_AREA = 0.92;    // the core shadow's delivered ink area
    const WV_LAMBDA_PEN = 7.3;    // wavelength, in pen widths (2.2 mm at 0.3)
    const WV_AMAX = 0.42;         // peak amplitude, as a share of the reserved pitch
    const WV_I0 = 0.62;           // radiance above which the family is a plain ruling
    const WV_TAPER_MM = 2.0;      // the wave eases to nothing this far from a run end
    const WV_CLEAR_FLOOR = 1.0;   // interlock: minimum clearance, in plot floors
    const WV_TROCH_AMAX = 0.48;   // trochoidLoop: the rolling circle's radius share
    const WV_SCRIB_AMAX = 0.85;   // tourScribble: past 0.5 the neighbours interpenetrate
    const WV_AO_PITCH_PEN = 4;    // amplitudeOnly rules tighter — it has no pen to spend
    const WV_LINK_MAX_MM = 14;    // onePenDown: the longest bridge worth drawing
    // ── ROUND 6 — WAVINESS EVERYWHERE, AND THE TONE FROM SOMEWHERE ELSE ───────
    //
    // Round 5 measured the fact that decides this round. `amplitudeOnly` — the
    // pen pinned, every scrap of tone asked of arc length — came back R² 0.005
    // over an L* span of 7.2 on 2113 mm of ink. A single-valued serpentine's
    // elongation runs 1.0 to about 1.5, and at a fixed pen AND a fixed pitch the
    // delivered area is e × inkWidth / pitch, so that 1.5× IS the whole range
    // available. There is no ramp in it. The conclusion is not that the wave is
    // wrong; it is that AMPLITUDE IS NOT A TONE CHANNEL — and asking it to be
    // one is exactly what made Round 5's waves straighten in the light, because
    // `k = wvRamp(I)` multiplies the amplitude to ZERO above WV_I0. A plain
    // ruling in the highlight is the defect Jay named, not a feature.
    //
    // So all ten laws here separate the two jobs:
    //
    //   TEXTURE   the amplitude never leaves a FLOOR. `aFlo` is a share of the
    //             DRAWN pitch, not a millimetre, so the wave stays proportionate
    //             as the spacing opens: the light end is a wide lazy serpentine
    //             rather than a straight rule, and the waviness survives across
    //             the whole form. `waveStat.litAmpSum` counts what survived.
    //
    //   TONE      the SPACING FIELD, computed from the ordinary L*-linear tone
    //             target and eased in pitch space, with the PEN picking up the
    //             remainder — automatically, and with no branch, because
    //             `weightCovEff` clamps coverage at the plot floor and
    //             `weightForArea` then divides the same target by the CLAMPED
    //             coverage. Where the spacing can carry the tone the weight
    //             comes out at exactly 1; where the floor stops it, the pen
    //             takes over continuously. That is `wideShadowPen`'s handover
    //             (ecc85b6) restated on one pen instead of two.
    //             Two laws take a different channel on purpose, as controls:
    //             'ampPasses' (pass count) and 'weaveAmpEase' (a geometric
    //             split between pen and spacing).
    //
    // AND THE CLEARANCE IS MEASURED PERPENDICULAR TO THE STROKE, which Round 5
    // had backwards. Two neighbouring serpentines IN PHASE are vertical
    // translates of one another, so the distance between them measured ACROSS
    // the stroke is d·cos(theta) with theta the local slope — closest approach
    // d / sqrt(1 + q²), NOT d. ANTI-PHASE the crest meets the trough where the
    // slope is zero, so the closest approach is exactly d − 2A. Measured on the
    // paper last round: the in-phase nest closed to 1.05 mm while the anti-phase
    // weave stayed OPEN at 1.30 mm — the opposite of the intuition. The useful
    // consequence falls straight out of the formula: an in-phase nest at a fixed
    // amplitude SHARE can never open a perpendicular gap wider than
    // lambda / (2·pi·f), however wide the ruling pitch gets. At the shipped
    // lambda and f = 0.30 that ceiling is 1.16 mm — so the white the eye can
    // find is bounded by the TEXTURE and not by the spacing, which is the whole
    // mechanism behind "remove unintentional white gaps".
    const WV6_JIT = 0.35;         // 'weaveJitter': the golden walk on top of anti-phase
    const WV6_AFLOOR_MIN = 0.10;  // no law may straighten below this share, ever
    // A TEXTURE HAS A FIXED VISUAL SCALE. Measured the other way first, and it
    // is the round's worst trap: with the amplitude stated ONLY as a share of
    // the drawn pitch, a spacing-tone law swings the pitch from the plot floor
    // (0.66 mm) to 22 mm across one sphere, so the wave swings from 0.20 mm to
    // 2.43 mm with it. The big end is the problem — a crest 2.4 mm off its own
    // ruling samples a radiance 5 mm away from where the tone was read, and the
    // drawing acquires a texture-keyed tone error it cannot recover from:
    // sphere·crosshatch came back R² 0.115 with the worst bin 86.6 % off the
    // line and 23.2 L* of moiré. Bounding the excursion in MILLIMETRES makes
    // the serpentine the same size everywhere — which is what a texture is —
    // and leaves the share to decide only how much of the band it uses.
    const WV6_AMP_MAX_MM = 0.80;  // no crest wanders further than this from its ruling
    const WV6_AMP_MIN_MM = 0.34;  // ...and none is smaller than this while there is room
    const WV6 = {
      // aFlo/aMax  amplitude share of the drawn pitch, at the light / dark end
      // amp        'ramp' takes the radiance ramp; 'perp' solves the share from
      //            the eased PERPENDICULAR clearance target
      // tone       'space' | 'pass' | 'split'
      // ph         'in' | 'anti' | 'jit' | 'walk'
      // lam        1 = the wavelength eases instead of the amplitude
      // dep        1 = nesting depth eases (1 wave in the light, 3 in the core)
      // cFlo       clearance floor, in plot floors
      // steps      samples per ruling — a law that shortens its wavelength MUST
      //            raise this or the polyline corner-cuts the crests and the
      //            elongation the tone paid for never arrives (nestedOctaves).
      ampSpacing:      { aFlo: 0.30, aMax: 0.40, amp: 'ramp', tone: 'space', ph: 'in',   lam: 0, dep: 0, cFlo: 1.0, steps: 260 },
      ampClearance:    { aFlo: 0.30, aMax: 0.30, amp: 'ramp', tone: 'space', ph: 'in',   lam: 0, dep: 0, cFlo: 1.4, steps: 260 },
      ampLambda:       { aFlo: 0.26, aMax: 0.34, amp: 'ramp', tone: 'space', ph: 'in',   lam: 1, dep: 0, cFlo: 1.0, steps: 380 },
      ampPasses:       { aFlo: 0.32, aMax: 0.32, amp: 'ramp', tone: 'pass',  ph: 'in',   lam: 0, dep: 0, cFlo: 1.0, steps: 260 },
      ampPhaseWalk:    { aFlo: 0.30, aMax: 0.40, amp: 'ramp', tone: 'space', ph: 'walk', lam: 0, dep: 0, cFlo: 1.0, steps: 260 },
      weaveNestPerp:   { aFlo: 0.22, aMax: 0.44, amp: 'perp', tone: 'space', ph: 'in',   lam: 0, dep: 0, cFlo: 1.0, steps: 300 },
      weaveDepth:      { aFlo: 0.14, aMax: 0.46, amp: 'perp', tone: 'space', ph: 'anti', lam: 0, dep: 0, cFlo: 0.8, steps: 300 },
      weaveOctaveEase: { aFlo: 0.22, aMax: 0.40, amp: 'ramp', tone: 'space', ph: 'anti', lam: 0, dep: 1, cFlo: 1.0, steps: 520 },
      weaveAmpEase:    { aFlo: 0.18, aMax: 0.44, amp: 'ramp', tone: 'split', ph: 'anti', lam: 0, dep: 0, cFlo: 1.0, steps: 300 },
      weaveJitter:     { aFlo: 0.24, aMax: 0.40, amp: 'ramp', tone: 'space', ph: 'jit',  lam: 0, dep: 0, cFlo: 1.0, steps: 320 },
    };
    const wv6 = () => WV6[TONE_ALGO] || null;
    const isWv6 = () => WV6[TONE_ALGO] != null;
    // 'jit' is anti-phase with a walk ON TOP, so its closest approach is still
    // governed by the crest-into-trough geometry. Stated once, read everywhere.
    const wv6Anti = () => { const c = wv6(); return !!c && (c.ph === 'anti' || c.ph === 'jit'); };
    const wvOctaveLaw = () => TONE_ALGO === 'hilbertDepth' || TONE_ALGO === 'nestedOctaves'
      || (isWv6() && wv6().dep === 1);
    // 'onePenDown' does NOT split along the line — a chain of abutting sub-paths
    // is the opposite of one pen-down — so it takes the run mean, like
    // `weightModulated`. Every other wave law is a full per-sample width law.
    const WV_LAWS = {
      nestedSerpentine: 1, interlockWeave: 1, amplitudeOnly: 1, trochoidLoop: 1,
      waveToRuling: 1, nestedOctaves: 1, onePenDown: 1, hilbertDepth: 1,
      sfcHalftone: 1, tourScribble: 1,
      ampSpacing: 1, ampClearance: 1, ampLambda: 1, ampPasses: 1, ampPhaseWalk: 1,
      weaveNestPerp: 1, weaveDepth: 1, weaveOctaveEase: 1, weaveAmpEase: 1,
      weaveJitter: 1,
    };
    const isWaveLaw = () => WV_LAWS[TONE_ALGO] === 1;
    // WHERE THE WAVE ACTUALLY LANDED — the counterpart to `weightStat`. Both the
    // amplitude range and the realised clearance are claims about the paper, so
    // they are counted rather than asserted.
    // ROUND 6 adds the three numbers this round is actually about:
    //   lit*      the amplitude that SURVIVED into the lit region, as the raw
    //             mean and (in the report) as a fraction of the shadow mean —
    //             the "waviness throughout" number, which must not approach 0;
    //   realLen / baseLen   the elongation the POLYLINE delivered against the
    //             elongation the tone arithmetic already divided out. This is
    //             the check `nestedOctaves` failed: its model claimed 1.8× and
    //             the drawn path gave 1.13×, so the drawing came back a third
    //             too light. Modelled/realised are reported side by side.
    const waveStat = {
      samples: 0, ampMin: Infinity, ampMax: 0, ampSum: 0,
      elongMin: Infinity, elongMax: 0, elongSum: 0,
      clearMin: Infinity, darkSamples: 0, darkClearMin: Infinity, darkAmpSum: 0,
      offSurface: 0, elongCapped: 0, lambdaMin: Infinity, lambdaMax: 0,
      litSamples: 0, litAmpSum: 0, litClearMin: Infinity, litClearSum: 0,
      darkClearSum: 0, realLen: 0, baseLen: 0, floorBound: 0,
    };
    const wvPitchPen = () => (TONE_ALGO === 'amplitudeOnly' ? WV_AO_PITCH_PEN : WV_PITCH_PEN);
    const wvFlatCov = () => {
      const env = toneEnvelope();
      const c = masterPitch / (wvPitchPen() * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    // 0 at and above WV_I0 (a plain ruling), 1 at black. One definition, read by
    // the amplitude, by the wavelength ramp and by the octave count.
    const wvRamp = (I) => {
      const t = clamp((WV_I0 - clamp(finite(I, 0), 0, 1)) / WV_I0, 0, 1);
      return t * t * (3 - 2 * t);
    };
    // 'waveToRuling' — the WAVELENGTH is a tonal channel too. Four times the base
    // in the light and the base itself in the core shadow, so the serpentine does
    // not merely flatten as it lightens, it also stretches: the crests walk
    // apart before they stop happening. That is the continuous transition from an
    // interlocked serpentine to a plain ruling, with no switch anywhere.
    const wvLambda = (I) => {
      const base = WV_LAMBDA_PEN * penWidth;
      if (TONE_ALGO === 'waveToRuling') return base * (1 + 3 * (1 - wvRamp(I)));
      // 'ampLambda' — the WAVELENGTH eases and the amplitude does not. A long
      // lazy serpentine in the light tightening to the base wavelength in the
      // core shadow: the wave is fully present at BOTH ends, only its rate
      // changes. Unlike `waveToRuling` it never straightens, and unlike
      // `nestedOctaves` it never goes below the base wavelength, so its sample
      // budget (380) is comfortably above the corner-cutting threshold.
      const c = wv6();
      if (c && c.lam) return base * (1 + 1.6 * (1 - wvRamp(I)));
      return base;
    };
    // The amplitude each law asks for, as a share of the DRAWN pitch. 0.5 would
    // put a crest exactly on the neighbouring ruling's centreline.
    const wvAmpAsk = (I) => {
      const k = wvRamp(I);
      // ROUND 6 — THE FLOOR. `k` is zero above WV_I0, so `k × const` is a plain
      // ruling in the highlight. Interpolating from a FLOOR instead keeps the
      // serpentine at aFlo of the drawn pitch wherever the light is, which is
      // the whole of "keep waviness throughout the fill lines". ('perp' laws
      // have this overridden by the clearance solve in the emitter, and are
      // clamped back into [aFlo, aMax] there, so they too keep the floor.)
      const c6 = wv6();
      if (c6) return Math.max(WV6_AFLOOR_MIN, c6.aFlo + (c6.aMax - c6.aFlo) * k);
      if (TONE_ALGO === 'interlockWeave') return k * WV_AMAX;
      if (TONE_ALGO === 'trochoidLoop') return k * WV_TROCH_AMAX;
      if (TONE_ALGO === 'tourScribble') return k * WV_SCRIB_AMAX;
      if (TONE_ALGO === 'amplitudeOnly') return k * 0.46;
      return k * WV_AMAX;
    };
    // ANTI-PHASE, OR IN PHASE — the difference between a weave and a nest.
    //
    // In phase, two neighbouring serpentines are TRANSLATES of one another, so
    // the clearance between them is exactly the drawn pitch at every point: the
    // waves nest, and the white between them is a constant-width ribbon that
    // narrows only as the pen widens. Anti-phase, each crest points into its
    // neighbour's trough — the interlock Jay described — and the clearance runs
    // from pitch - 2A at the crests to pitch + 2A between them.
    //
    // The phase has to alternate per KEPT ruling, not per master-grid index: the
    // ladder keeps roughly `baseCov` of the grid, so parity of `lineIndex` is
    // not parity of what is drawn. `lineIndex * baseCov`, rounded, is the kept
    // ordinal, and that is what the alternation is keyed on.
    const wvLinePhase = (lineIndex) => {
      const ord = Math.round((Number(lineIndex) || 0) * wvFlatCov());
      const c6 = wv6();
      if (c6) {
        if (c6.ph === 'anti') return Math.PI * ord;
        // 'weaveJitter' — anti-phase PLUS a bounded golden walk. Strict
        // alternation makes the crest rows PERIODIC, and a periodic crest row
        // is a periodic white lozenge between it and its neighbour: the eye
        // finds a lattice even where no single gap is wide. The walk is capped
        // at WV6_JIT of a period so the interlock survives it.
        if (c6.ph === 'jit') return Math.PI * ord + 2 * Math.PI * WV6_JIT * ((ord * GOLDEN_STEP) % 1);
        // 'ampPhaseWalk' — no alternation at all, only decorrelation. Every
        // ruling starts somewhere else in the period, so neighbouring crests
        // are never in register and the residual white cannot line up.
        if (c6.ph === 'walk') return 2 * Math.PI * ((ord * GOLDEN_STEP) % 1);
        return 0;
      }
      if (TONE_ALGO === 'interlockWeave') return Math.PI * ord;
      // 'tourScribble' interpenetrates deliberately AND must never lattice, so
      // it takes the anti-phase alternation plus a golden-ratio walk on top.
      if (TONE_ALGO === 'tourScribble') return Math.PI * ord + 2 * Math.PI * ((ord * GOLDEN_STEP) % 1);
      return 0;
    };
    // The waveform, as a SCREEN displacement in units of the amplitude:
    // `n` across the ruling, `t` along it. Only the trochoid uses `t` — it is
    // a circle of radius A rolling along the ruling, which is exactly what makes
    // its crests LOOP once A exceeds L/2*pi, laying a chain of near-circles that
    // closes the band far faster than any single-valued wave can.
    const wvForm = (ph) => {
      if (TONE_ALGO === 'trochoidLoop') return { n: -Math.cos(ph), t: -Math.sin(ph) };
      if (TONE_ALGO === 'amplitudeOnly' || TONE_ALGO === 'sfcHalftone') {
        // A TRIANGLE: constant lateral speed, so the traverse fills its band
        // evenly instead of dwelling at the turns, and its elongation is exact.
        return { n: (2 / Math.PI) * Math.asin(Math.sin(ph)), t: 0 };
      }
      if (wvOctaveLaw()) {
        // NESTING DEPTH AS THE TONAL CHANNEL. Octave k has half the wavelength
        // and half the amplitude of octave k-1, so each rides INSIDE its parent
        // — a Takagi/blancmange refinement of the same curve, which is the
        // 1-D form of a Hilbert order increase. `wvDepth` decides how many
        // octaves are on at this radiance and fades the newest one in, so the
        // depth rises continuously and never steps.
        let v = 0; let nrm = 0;
        for (let k = 0; k < 4; k++) {
          const g = clamp(wvDepthGain(k), 0, 1);
          if (g <= 0) break;
          v += g * Math.sin(ph * Math.pow(2, k)) / Math.pow(2, k);
          nrm += g / Math.pow(2, k);
        }
        // Round 5's two laws normalise by the FOUR-octave constant 1.875, so a
        // 1-octave sample only reaches 0.53 of the amplitude it asked for — the
        // wave visibly shallows in the light for a reason that has nothing to do
        // with the design. 'weaveOctaveEase' normalises by the LIVE gain sum, so
        // the envelope is the amplitude at every depth and only the ROUGHNESS
        // changes. The two reference laws keep the constant they were measured on.
        if (isWv6()) return { n: clamp(v / Math.max(1e-6, nrm), -1, 1), t: 0 };
        return { n: clamp(v / 1.875, -1, 1), t: 0 };
      }
      return { n: Math.sin(ph), t: 0 };
    };
    // How much of octave k is on. Set per sample by `wvDepthAt` before `wvForm`
    // is called — the octave count is a function of radiance and nothing else.
    let wvDepthLevels = 0;
    const wvDepthGain = (k) => clamp(wvDepthLevels - k, 0, 1);
    const wvDepthAt = (I) => {
      const k = wvRamp(I);
      // 'weaveOctaveEase' — 1 wave in the light easing to 3 nested in the core.
      // It stops at THREE, not four: the fourth octave's wavelength is
      // lambda/8 = 0.27 mm, which at MAX_LINE_STEPS IS the sample spacing, and
      // that is precisely how `nestedOctaves` and `hilbertDepth` came back a
      // third too light. Three octaves bottom out at lambda/4 = 0.55 mm, and
      // this law raises its own budget to 520 steps so even that is carried at
      // four samples a period.
      if (isWv6()) { wvDepthLevels = wv6().dep ? 1 + 2 * k : 1; return; }
      // nestedOctaves: 1 wave in the light, 3 nested in the core shadow.
      // hilbertDepth: 1 -> 4, i.e. one more level of refinement.
      wvDepthLevels = (TONE_ALGO === 'hilbertDepth' ? 1 + 3 * k : 1 + 2 * k);
    };
    // The elongation the waveform delivers, and the elongation the PAPER will
    // take. `q` is the classic waviness ratio 2*pi*A/L; the cap comes from the
    // wave's own limb separation L/e falling to the plot floor.
    const wvElongCap = (lam) => (floorPitch > 1e-6 ? Math.max(1, lam / floorPitch) : 8);
    // Split in two so the ROUND 6 spacing solve can ask for the elongation
    // without booking a cap event against a sample that was never drawn.
    const wvElongRaw = (amp, lam) => {
      if (!(lam > 1e-6) || !(amp > 1e-9)) return 1;
      const q = (2 * Math.PI * amp) / lam;
      if (TONE_ALGO === 'trochoidLoop') return Math.sqrt(1 + q * q);
      if (TONE_ALGO === 'amplitudeOnly' || TONE_ALGO === 'sfcHalftone') {
        const qt = (4 * amp) / lam;
        return Math.sqrt(1 + qt * qt);
      }
      if (wvOctaveLaw()) {
        // Each octave contributes its own (2*pi*A_k/L_k)^2 = (2q)^0 ... the
        // halving of A and of L cancel, so every live octave adds the SAME q^2.
        let s = 0;
        for (let k = 0; k < 4; k++) { const g = wvDepthGain(k); if (g <= 0) break; s += g * q * q; }
        return Math.sqrt(1 + s / 2);
      }
      return Math.sqrt(1 + (q * q) / 2);
    };
    const wvElong = (amp, lam) => {
      const e = wvElongRaw(amp, lam);
      const cap = wvElongCap(lam);
      if (e > cap) { waveStat.elongCapped += 1; return cap; }
      return e;
    };
    // The tone target. Same L*-linear response as every other law here; the wave
    // laws differ only in that the ask is divided by the elongation.
    const wvArea = (I) => areaForTone(I, WV_DARK_AREA, wLightArea());
    // 'amplitudeOnly' — THE CONTROL EXPERIMENT. The pen is pinned at the width
    // the LIGHT end needs and never moves, so every scrap of the tone ramp has to
    // come from arc length. It is here to measure how far elongation alone can
    // carry a drawing, which is the number the rest of the round is spending.
    const wvAOArea = () => wLightArea();
    // 'sfcHalftone' — VELHO & GOMES, SIGGRAPH '91. Tone along a space-filling
    // traverse is laid by CLUSTERING, not by a continuous width: the curve is
    // walked, the local target is accumulated, and the pen is switched between
    // two states so the running mean is exact. The error is carried ALONG THE
    // CURVE, which is what makes the texture aperiodic — the cluster boundaries
    // cannot line up across the family because the curve visits them in a
    // different phase every time. Reset per ruling by the emitter.
    let sfcErr = 0;
    const sfcArea = (I, e) => {
      const aLo = wLightArea();
      const aHi = clamp(WV_DARK_AREA / Math.max(1, e), aLo + 1e-3, 0.98);
      const want = clamp(wvArea(I) / Math.max(1, e), 0, 0.98) + sfcErr;
      const pick = (want >= (aLo + aHi) / 2) ? aHi : aLo;
      sfcErr = clamp(want - pick, -0.4, 0.4);
      return pick;
    };
    // The per-sample area every wave law asks `weightForArea` for. `e` is this
    // sample's elongation, and dividing by it is what keeps the tone linear.
    const wvAreaAsk = (I, e) => {
      if (TONE_ALGO === 'amplitudeOnly') return wvAOArea();
      if (TONE_ALGO === 'sfcHalftone') return sfcArea(I, e);
      return clamp(wvArea(I) / Math.max(1, e), 0.005, 0.98);
    };

    // ── ROUND 6 — THE CLEARANCE GEOMETRY, AND THE SPACING FIELD ───────────────
    //
    // `wv6ClearAt` is the closest approach of two NEIGHBOURING rulings drawn at
    // pitch `drawn` with amplitude share `f` and wavelength `lam`, measured
    // PERPENDICULAR TO THE STROKE. `wv6ShareFor` is its inverse: the largest
    // share that still leaves `C` open. Both are exact for the two phasings:
    //
    //   in phase    the curves are translates, so the perpendicular distance is
    //               d·cos(theta); the minimum is at the steepest point, where
    //               cos(theta) = 1/sqrt(1 + q²) and q = 2·pi·f·d / lam.
    //   anti-phase  the crest meets the trough at a point where BOTH tangents
    //               are along the ruling, so perpendicular = vertical there and
    //               the closest approach is exactly d − 2A = d(1 − 2f).
    //
    // The ceiling this puts on an in-phase nest — C ≤ lam/(2·pi·f), independent
    // of the pitch — is the reason the `in` laws close their gaps without any
    // spacing help at all.
    const wv6ClearAt = (drawn, lam, f) => {
      const d = Math.max(1e-6, finite(drawn, 0));
      const ff = clamp(finite(f, 0), 0, 0.49);
      if (wv6Anti()) return d * (1 - 2 * ff);
      const q = (2 * Math.PI * ff * d) / Math.max(1e-6, finite(lam, 1));
      return d / Math.sqrt(1 + q * q);
    };
    const wv6ShareFor = (C, drawn, lam) => {
      const d = Math.max(1e-6, finite(drawn, 0));
      const c = Math.max(0, finite(C, 0));
      if (wv6Anti()) return clamp(0.5 * (1 - Math.min(1, c / d)), 0, 0.49);
      if (!(c > 1e-6)) return 0.49;
      const r = (d / c) * (d / c) - 1;
      if (!(r > 0)) return 0;
      return clamp((finite(lam, 1) * Math.sqrt(r)) / (2 * Math.PI * d), 0, 0.49);
    };
    // The clearance floor this law will not knowingly go below: `cFlo` plot
    // floors, and never tighter than a hair over one ink width (two strokes
    // closer than their own nib are one stroke, not two).
    const wv6ClearFloorMM = () => {
      const c = wv6();
      return Math.max((c ? c.cFlo : 1) * floorPitch, 1.05 * inkWidth());
    };
    // THE EASE, AND WHERE IT IS APPLIED. Smootherstep on radiance between the
    // clearance a FLOOR-amplitude nest already gives at this pitch (the light
    // end) and the plot floor (the dark end) — zero first AND second derivative
    // at both ends, so neither the spacing field nor the wave shows a knee.
    const wv6TargetClear = (I, drawn, lam) => {
      const c = wv6(); if (!c) return 0;
      const cD = wv6ClearFloorMM();
      const cL = wv6ClearAt(drawn, lam, c.aFlo);
      const t = ease(clamp(finite(I, 0), 0, 1) / Math.max(1e-6, WV_I0));
      return cD + Math.max(0, cL - cD) * t;
    };
    // THE SPACING FIELD. The ordinary L*-linear tone target, divided by the
    // elongation the wave will deliver here, turned into coverage by the same
    // `covForArea` laws 6-10 use. Two fixed-point passes, because the amplitude
    // is a share of the DRAWN pitch and the drawn pitch is what is being solved
    // for; the second pass moves the answer by under a per cent.
    //
    // Nothing pins the pen. Where this coverage is achievable the pen comes out
    // at exactly 1 (weightForArea divides the same target by the same
    // coverage); where `weightCovEff` clamps it at the plot floor, the pen picks
    // up precisely the shortfall. One continuous handover, no branch, no seam.
    const wv6SpaceCov = (I, localPitch) => {
      const lp = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const flat = wvFlatCov();
      if (!(lp > 1e-6)) return flat;
      wvDepthAt(I);
      const lam = wvLambda(I);
      const cap = wvElongCap(lam);
      const target = wvArea(I);
      let cov = flat;
      for (let it = 0; it < 2; it++) {
        const f = wvAmpAsk(I);
        const e = Math.min(cap, wvElongRaw(f * (lp / Math.max(1e-6, cov)), lam));
        cov = clamp(covForArea(target / Math.max(1, e), lp), 0.005, 1);
      }
      return cov;
    };
    // 'weaveAmpEase' — THE CONTROL ON THE SPLIT. The amplification is shared
    // geometrically between the pen and the spacing (kappa = 0.5), exactly as
    // `weightPlusSpacing` does it, so the same amplitude law can be read against
    // a spacing-only sibling and the difference attributed.
    const wv6SplitCov = (I) => {
      const flat = wvFlatCov();
      const aL = wLightArea();
      const amp = aL > 1e-9 ? Math.max(1, wvArea(I) / aL) : 1;
      const env = toneEnvelope();
      return clamp(flat * Math.sqrt(amp), flat, Math.max(flat, env.covDark));
    };
    const wv6Cov = (I, localPitch) => {
      const c = wv6();
      if (!c) return wvFlatCov();
      if (c.tone === 'space') return wv6SpaceCov(I, localPitch);
      if (c.tone === 'split') return wv6SplitCov(I);
      return wvFlatCov();   // 'pass' rules an even grid; the tone is overdraw.
    };

    // How much more ink than the light end this radiance asks for.
    const wAmp = (I) => {
      const aL = wLightArea();
      return aL > 1e-9 ? Math.max(1, wTargetArea(I) / aL) : 1;
    };
    // 'weightPlusSpacing' — the amplification split geometrically between the two
    // channels. kappa = 0.5 is the even split: spacing carries sqrt(A) and weight
    // carries sqrt(A), so a channel that would have had to quantise a 4x range
    // now quantises a 2x one, and the product still lands exactly on A.
    // ...AND `weightPlusSpacingTuned` MOVES THE SPLIT. Round 2 measured the even
    // split spending 2036 mm of ink against weightDeepDark's 1290 for a DARKER
    // 5th-percentile L* (49.2 against 41.1), and carrying a spacing CoV of 0.561
    // against 0.346 — i.e. the spacing channel was buying the least and costing
    // the most. kappa 0.35 pushes amplification off the spacing and onto the pen,
    // which is the channel that costs no travel and cannot open a gap.
    const WPS_KAPPA = TONE_ALGO === 'weightPlusSpacingTuned' ? 0.35 : 0.5;
    const wpsCov = (I) => {
      const env = toneEnvelope();
      const base = flatCov();
      return clamp(base * Math.pow(wAmp(I), WPS_KAPPA), base, Math.min(1, env.covDark));
    };
    // ── 'weightCrossHandoff' — THE C0 CROSS-HATCH HANDOFF ON OFFSET GREY ───────
    //
    // Rössl & Kobbelt (Pacific Graphics 2000), §7. THE ARITHMETIC FIRST, because
    // it is what makes every other weight law's dark end a foregone conclusion:
    // spacing-to-tone is `pitch = 2 x nib / tone`, so ONE ruling family saturates
    // at a spacing of about twice the nib — which is this repo's own
    // PLOT_FLOOR_PEN (2.2 x pen). At the shipped 0.3 mm pen a single family with
    // a pen-width stroke therefore tops out at inkWidth/floorPitch = 0.509 ink
    // area, L* 76, and NO spacing law can go darker. Measured: weightAlongLine
    // hit 0.509 exactly. Past it there are only three moves — a wider stroke
    // (weightDeepDark), a second family (this), or an overdraw (weightMultiPass).
    //
    // The second family is added WITHOUT a threshold, which is the whole point.
    // It is computed on the OFFSET grey — the tone left over once family A has
    // laid all it can — so it enters at zero exactly where A saturates and grows
    // from there. No cut, no traceable band edge. A pen cannot enter at zero
    // WIDTH (W_MIN is the pen itself), so it enters at zero DENSITY instead:
    // family B's coverage ramps up from nothing, and only once that coverage has
    // reached the base grid does its weight start to climb.
    const XH_CMIN = 0.30;       // Rössl's minimum white band, as a share of the pitch
    // MEASURED, NOT DERIVED (Salisbury et al. 1997's "lightening factor", and the
    // reason it has to be measured): where strokes CROSS, the analytic
    // Murray-Davies area double-counts the overlap in the opposite direction from
    // a single family — one family measured 0.408 against a predicted 0.509 (it
    // under-delivers, the nib spread not withstanding), but a crossed PAIR
    // measured solid black over 5 % of the form against a predicted 0.85 (it
    // over-delivers). 0.72 is the value that lands; it is also `XF_MAX_AREA`,
    // which crossFade arrived at from the same direction.
    const XH_DEEP_AREA = 0.72;
    const xhPitchA = () => (masterPitch > 1e-6
      ? masterPitch / Math.max(1e-6, flatCov()) : litMaxPitchPen() * penWidth);
    // The most family A alone may lay: its stroke may fill its own pitch only up
    // to the minimum white band, and it may not exceed the heaviest legal pen.
    const xhCapA = () => clamp(Math.min(1 - XH_CMIN, (W_MAX * inkWidth()) / xhPitchA()), 0.02, 0.98);
    const xhTotal = (I) => areaForTone(I, XH_DEEP_AREA, wLightArea());
    const xhAreaA = (I) => Math.min(xhTotal(I), xhCapA());
    // COMPOSITION, NOT SUBTRACTION. The two families overlap, so the pair reads
    // 1 − (1 − aA)(1 − aB); solving that for aB is what makes them land exactly
    // on the target instead of a third short of it.
    const xhAreaB = (I) => {
      const t = clamp(xhTotal(I), 0, 0.98);
      const aA = xhAreaA(I);
      return clamp(1 - (1 - t) / Math.max(1e-6, 1 - aA), 0, 0.98);
    };
    const xhCovB = (I, localPitch) => clamp(covForArea(xhAreaB(I), localPitch), 0.001, flatCov());
    // The coverage a weight law is ruling at, at this radiance — the divisor the
    // weight has to be stated against.
    const weightCovAt = (I, localPitch, smp) => {
      // V5 — the three-pen laws state the geometry against the nib that is
      // actually going to draw it. `penPlan` is the single source for both.
      if (isPenLaw()) return penPlan(I, localPitch, smp).cov;
      if (isWPS()) return wpsCov(I);
      // ROUND 6 — the tone lives HERE, in the spacing, and not in the amplitude.
      if (isWv6()) return wv6Cov(clamp(finite(I, 0), 0, 1), localPitch);
      if (TONE_ALGO === 'weightCrossHandoff') {
        return xfLayer === 0 ? flatCov() : xhCovB(clamp(finite(I, 0), 0, 1), localPitch);
      }
      // 'multiScale' — layer 1 is the COARSE family and runs full (its pitch is
      // already twice the reserved one, because it is emitted at half the line
      // count); layer 0 is the FINE family and enters by density from nothing.
      if (TONE_ALGO === 'multiScale') {
        return xfLayer === 0
          ? msCovFine(clamp(finite(I, 0), 0, 1), localPitch)
          : weightBaseCov();
      }
      // 'wideShadowPen' — layer 1 is the WIDE pen and enters by density on the
      // remainder the fine pen is not allowed to carry.
      if (TONE_ALGO === 'wideShadowPen') {
        const Ic = clamp(finite(I, 0), 0, 1);
        return xfLayer === 0
          ? clamp(covForArea(wspAreaFine(Ic), localPitch), 0.001, weightBaseCov())
          : wspCovWide(Ic, localPitch);
      }
      // 'screenAngles' — family A runs full, B and C enter by density.
      if (TONE_ALGO === 'screenAngles') {
        return saCovAt(clamp(finite(I, 0), 0, 1), localPitch, xfLayer);
      }
      return weightBaseCov();
    };
    // ...AND THE COVERAGE THE FLOOR ACTUALLY LEFT. `covAtSample` clamps coverage
    // to `localPitch / floorPitch` wherever the geometry crowds (a sphere's
    // meridians converge to nothing at the poles), so the grid that is really on
    // the paper there is SPARSER than the law asked for. A weight stated against
    // the nominal coverage is then wrong by exactly that factor, and it is wrong
    // in the worst direction: measured without this, the poles took weight 5x on
    // a grid the floor had already thinned, and flooded to L* 4.5 — a black cap
    // on a lit sphere. Same clamp, same expression, one place later.
    const weightCovEff = (I, localPitch) => {
      const c = weightCovAt(I, localPitch);
      if (!(TONE_UNCAPPED && Number.isFinite(localPitch) && localPitch > 1e-6 && floorPitch > 1e-6)) return c;
      return Math.min(c, clamp(localPitch / floorPitch, 0.005, 1));
    };
    // Weight that lays `area` at this sample. area = w x cov x inkWidth /
    // localPitch: `cov` is in it because the ladder keeps only that fraction of
    // the master grid, so the pitch the stroke actually sits at is
    // localPitch / cov. Dividing by the LOCAL pitch is what takes the chart's
    // foreshortening out of the tone, exactly as `covForArea` does for laws 6-10
    // — and it is why a weight law can be pitch-correct where a coverage law
    // could only be pitch-correct on average.
    const weightForArea = (area, localPitch, cov) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const c = clamp(finite(cov, 1), 1e-6, 1);
      if (!(p > 1e-6)) return W_MIN;
      const ask = (clamp(finite(area, 0), 0, 0.995) * p) / (c * inkWidth());
      const w = clamp(ask, W_MIN, W_MAX);
      const got = (w * c * inkWidth()) / p;
      weightStat.samples += 1;
      weightStat.wSum += w;
      if (ask > weightStat.askMax) weightStat.askMax = ask;
      if (w < weightStat.wMin) weightStat.wMin = w;
      if (w > weightStat.wMax) weightStat.wMax = w;
      if (got < weightStat.aMin) weightStat.aMin = got;
      if (got > weightStat.aMax) weightStat.aMax = got;
      if (w >= W_MAX - 1e-9) weightStat.atMax += 1;
      if (got > W_FLOOD_AREA) weightStat.floods += 1;
      return w;
    };
    // 7th-order smoothstep — zero first, second AND third derivative at both
    // ends. `weightSmoothstep`'s whole hypothesis is that the visible step is in
    // the TRANSFER and not in the quantisation.
    const ease7 = (t) => {
      const u = clamp(t, 0, 1); const u2 = u * u;
      return u2 * u2 * (35 - 84 * u + 70 * u2 - 20 * u2 * u);
    };
    // Golden-ratio (low-discrepancy) dither on the WEIGHT, keyed on the ruling.
    // A quantisation step that lands on the same value for every neighbouring
    // ruling is what reads as a band; one that walks is a texture.
    const wDithered = (w, lineIndex) => {
      const u = ((Number(lineIndex) || 0) * 0.6180339887498949) % 1;
      return clamp(w * (1 + W_DITHER * (u - 0.5) * 2), W_MIN, W_MAX);
    };
    // The per-sample weight the emitter records.
    const weightAtSample = (smp, localPitch, gradI, ctx) => {
      const I = clamp(finite(smp && smp.I, 0), 0, 1);
      // V5 — A REAL PEN HAS ONE WIDTH. The three-pen laws return one of exactly
      // three multipliers and never anything between them; `weightForArea` (and
      // its continuous clamp) is deliberately not on this path.
      if (isPenLaw()) return penMul(penPlan(I, localPitch, smp).tier);
      if (TONE_ALGO === 'weightSmoothstep') {
        const env = toneEnvelope();
        const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, W_MAX);
        return clamp(top + (1 - top) * ease7(I), W_MIN, W_MAX);
      }
      if (TONE_ALGO === 'weightCrossHandoff') {
        // Each family is stated against its OWN area and its own coverage, so
        // neither is asked to carry the other's share.
        return weightForArea(xfLayer === 0 ? xhAreaA(I) : xhAreaB(I), localPitch,
          weightCovEff(I, localPitch));
      }
      // ROUND 5 — the lozenge family. The WIDTH half of the split only; the
      // dissolution below the hairline floor is the emit loop's gate, because a
      // width cannot express "draw less of the line".
      if (isLoz()) {
        const cv = weightCovEff(I, localPitch);
        return weightForArea(lozWeightArea(I, localPitch, cv), localPitch, cv);
      }
      // 'whiteBand' — the black FRACTION of the reserved width IS the ink area,
      // because the reserved width is the pitch (nothing is dropped). So the
      // area asked for is literally (1 − c), clamped at both ends.
      if (TONE_ALGO === 'whiteBand') {
        return weightForArea(1 - clamp(I, WB_CMIN, WB_CMAX), localPitch, weightCovEff(I, localPitch));
      }
      // ── ROUND 4 ─────────────────────────────────────────────────────────────
      // 'curvatureField' is whiteBand's WIDTH law on a different DIRECTION field
      // (see `curvDir`), so it shares this branch verbatim — the comparison is
      // then purely about where the rulings run.
      if (TONE_ALGO === 'curvatureField') {
        return weightForArea(1 - clamp(I, WB_CMIN, WB_CMAX), localPitch, weightCovEff(I, localPitch));
      }
      // 'nibAngle' — whiteBand's core, times the broad nib's directional factor.
      if (TONE_ALGO === 'nibAngle') {
        const a = (1 - clamp(I, WB_CMIN, WB_CMAX)) * nibFactor(ctx && ctx.theta);
        return weightForArea(clamp(a, 0.01, 0.98), localPitch, weightCovEff(I, localPitch));
      }
      // 'taperedEnds' — whiteBand's core through a soft clamp, tapered at ends.
      if (TONE_ALGO === 'taperedEnds') {
        return weightForArea(taperArea(I, ctx && ctx.endMM), localPitch, weightCovEff(I, localPitch));
      }
      if (TONE_ALGO === 'whiteLineInverse') {
        return weightForArea(wliArea(I), localPitch, weightCovEff(I, localPitch));
      }
      if (TONE_ALGO === 'multiScale') {
        return weightForArea(xfLayer === 0 ? msAreaFine(I, localPitch) : msAreaCoarse(I, localPitch),
          localPitch, weightCovEff(I, localPitch));
      }
      if (TONE_ALGO === 'screenAngles') {
        return weightForArea(saAreaAt(I, localPitch, xfLayer), localPitch, weightCovEff(I, localPitch));
      }
      // 'equilibrated' — whiteBand's core through the perceptual sigmoid and the
      // 16-level equilibration table. No geometry change at all.
      if (TONE_ALGO === 'equilibrated') {
        return weightForArea(eqArea(I), localPitch, weightCovEff(I, localPitch));
      }
      // 'signedWidth' — the clamp at W_MIN is the cliff; the retraction that
      // replaces it happens in the emit loop, so the width itself is ordinary.
      if (TONE_ALGO === 'signedWidth') {
        return weightForArea(swArea(I), localPitch, weightCovEff(I, localPitch));
      }
      // 'wideShadowPen' — the wide family's weight is FLOORED at its own nib: a
      // 0.9 mm pen cannot draw a 0.3 mm line, and pretending otherwise would
      // turn a two-pen plot back into a one-pen weight law.
      if (TONE_ALGO === 'wideShadowPen') {
        const w = weightForArea(xfLayer === 0 ? wspAreaFine(I) : wspAreaWide(I),
          localPitch, weightCovEff(I, localPitch));
        return xfLayer === 0 ? w : clamp(Math.max(WSP_MUL, w), WSP_MUL, W_MAX);
      }
      // 'transverseReserve' — the CORE's width only. The transverse white is cut
      // by the emit loop's gate, not by the pen.
      if (TONE_ALGO === 'transverseReserve') {
        return weightForArea(trAreaWidth(I), localPitch, weightCovEff(I, localPitch));
      }
      // ── ROUND 5 — the wave laws ─────────────────────────────────────────────
      // The width is whiteBand's, stated on the DELIVERED area: the ask is the
      // tone target divided by this sample's own elongation, which the emitter
      // measured when it displaced the point. Without that division the drawing
      // would darken wherever the wave deepens — a tone error keyed to texture.
      if (isWaveLaw()) {
        return weightForArea(wvAreaAsk(I, (ctx && ctx.elong) || 1), localPitch,
          weightCovEff(I, localPitch));
      }
      // 'isophoteWidth' — the width comes from the SHADING GRADIENT, measured on
      // the ruling itself (see `isoWidthArea`); the sampler hands it in.
      if (TONE_ALGO === 'isophoteWidth') {
        return weightForArea(isoWidthArea(I, gradI), localPitch, weightCovEff(I, localPitch));
      }
      return weightForArea(wTargetArea(I), localPitch, weightCovEff(I, localPitch));
    };

    // ── ROUND 5 — THE CONTINUOUS SPACING FIELD ────────────────────────────────
    //
    // See the header block. Everything here answers ONE question: at this point
    // on the form, how many millimetres of clearance does the light want between
    // this ruling and the next? Nothing here decides whether a ruling is drawn —
    // every ruling of a `contField*` family is drawn WHOLE — so none of it can
    // band, chatter, or leave a free end. The spacing is the entire tone.
    const CONT_LAWS = {
      contFieldPitch: 1, contFieldEase: 1, contFieldSigmoid: 1,
      contFieldMeasured: 1, contFieldEquil: 1, contFieldAniso: 1,
      contFieldSurface: 1, contFieldFore: 1, contFieldTouch: 1, contFieldQuant: 1,
    };
    const isContField = () => CONT_LAWS[TONE_ALGO] === 1;
    // ── THE TWENTY MONOLINE LAWS (v7) ────────────────────────────────────────
    // They live in `surface-fill-mono.js` and own family A on every line mapper.
    // NONE of them appears in WEIGHT_LAWS, ADJ_LAWS, PEN_LAWS or CONT_LAWS, and
    // none of them sets `weightScale`, so `isWeightLaw()` and `splitsAlongLine()`
    // are FALSE for every one of them and the width path is never entered.
    const MonoFill = () => (Vectura.Scene3D && Vectura.Scene3D.SurfaceFillMono) || null;
    const isMonoLaw = () => { const M = MonoFill(); return Boolean(M && M.isMono(TONE_ALGO)); };
    // Sterzik, Vollmer & Vollmer, CGF 2024 — the perceptual transfer they FITTED
    // to hatching (not to dots, not to greys): the two constants are theirs.
    const CF_STERZIK_A = 0.4753;
    const CF_STERZIK_B = 1.5918;
    const sterzik = (x) => {
      const u = clamp(finite(x, 0), 1e-4, 1 - 1e-4);
      return clamp(1 / (1 + (1 / CF_STERZIK_A - 1) * Math.pow(1 / u - 1, CF_STERZIK_B)), 0, 1);
    };
    // THE TWO ENDS OF THE CLEARANCE RANGE.
    //   tight end — the plot floor (2.2 × pen), EXCEPT under 'contFieldTouch',
    //               where Jay's "right up against each other to render pure
    //               black" is taken literally: one ink width, at which adjacent
    //               rulings abut and the area is solid. That is the intended
    //               black; the flood counter reports where it lands.
    //   open end  — the O6 sparse bar, the widest pitch that still reads as a
    //               hatched surface rather than as stray lines on paper.
    const cfTightPitch = () => (TONE_ALGO === 'contFieldTouch'
      ? inkWidth()
      : Math.max(floorPitch > 1e-6 ? floorPitch : PLOT_FLOOR_PEN * penWidth, inkWidth()));
    const cfOpenPitch = () => Math.max(cfTightPitch() * 1.05, litMaxPitchPen() * penWidth);
    // The same L*-linear inversion `areaForTone` states, with the 0.98 area clamp
    // lifted: 'contFieldTouch' has to be able to ASK for a solid, or the whole
    // point of it is clamped away one line before it is measured.
    const cfAreaForTone = (I, aDark, aLight) => {
      const Ld = Lstar(1 - clamp(aDark, 0, 0.999));
      const Ll = Lstar(1 - clamp(aLight, 0, 0.999));
      const L = Ld + (Ll - Ld) * clamp(finite(I, 0), 0, 1);
      return clamp(1 - invLstar(L), 0.002, 0.999);
    };
    // THE FIELD ITSELF: radiance → wanted clearance, in millimetres of screen.
    // Continuous everywhere, monotone in I by construction (every branch is a
    // monotone map of a monotone map), and it is the ONLY place tone is decided.
    const cfWantedPitch = (I) => {
      const pMin = cfTightPitch();
      const pMax = cfOpenPitch();
      const x = clamp(finite(I, 0), 0, 1);
      if (TONE_ALGO === 'contFieldEase') return pMin + (pMax - pMin) * ease(x);
      if (TONE_ALGO === 'contFieldSigmoid') return pMin + (pMax - pMin) * sterzik(x);
      const a = cfAreaForTone(x, inkWidth() / pMin, inkWidth() / pMax);
      return clamp(inkWidth() / Math.max(1e-6, a), pMin, pMax);
    };
    // 'contFieldQuant' — the control. The SAME field, with the gap allowed only
    // CF_LEVELS distinct values. Quantised in pitch (which is what the eye
    // measures), not in coverage.
    const cfQuantise = (p) => {
      const pMin = cfTightPitch(); const pMax = cfOpenPitch();
      const n = Math.max(2, Math.round(CF_LEVELS));
      const u = clamp((p - pMin) / Math.max(1e-6, pMax - pMin), 0, 1);
      return pMin + (Math.round(u * (n - 1)) / (n - 1)) * (pMax - pMin);
    };
    // ── THE TWO CALIBRATED LAWS ──────────────────────────────────────────────
    // Both need to know what the LAST pass actually put on the paper, so both
    // rasterise it. One 0.75 mm screen grid, ink stamped along every placed
    // ruling, then two smoothing passes: DOT GAIN (the nib is wider than the
    // path — a 3 × 3 box at this cell size is one ink width) and the HVS
    // low-pass (a 3 mm window, the scale at which the eye stops resolving
    // rulings and starts reading a grey).
    const CF_CELL = 0.75;
    const CF_HVS = 3.0;
    const cfMakeField = () => ({ ink: new Map(), rad: new Map(), n: new Map() });
    const cfKey = (x, y) => `${Math.round(x / CF_CELL)},${Math.round(y / CF_CELL)}`;
    const cfAddInk = (fld, x0, y0, x1, y1) => {
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (!(L > 1e-9)) return;
      const m = Math.max(1, Math.ceil(L / (CF_CELL * 0.5)));
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5) / m;
        const key = cfKey(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
        fld.ink.set(key, finite(fld.ink.get(key), 0) + L / m);
      }
    };
    const cfAddRad = (fld, x, y, I) => {
      const key = cfKey(x, y);
      fld.rad.set(key, finite(fld.rad.get(key), 0) + clamp(finite(I, 0), 0, 1));
      fld.n.set(key, finite(fld.n.get(key), 0) + 1);
    };
    // Box-blur a sparse cell map by `r` cells. Two passes of a box is a good
    // enough Gaussian for a low-pass whose only job is to stop the measurement
    // seeing individual rulings.
    const cfBlur = (map, r) => {
      let cur = map;
      for (let pass = 0; pass < 2; pass++) {
        const nxt = new Map();
        cur.forEach((v, key) => {
          const parts = key.split(',');
          const cx = Number(parts[0]); const cy = Number(parts[1]);
          for (let j = -r; j <= r; j++) {
            for (let i = -r; i <= r; i++) {
              const k2 = `${cx + i},${cy + j}`;
              nxt.set(k2, finite(nxt.get(k2), 0) + v / ((2 * r + 1) * (2 * r + 1)));
            }
          }
        });
        cur = nxt;
      }
      return cur;
    };
    // achieved ink area vs the area the light asked for, cell by cell.
    const cfResidual = (fld) => {
      const r = Math.max(1, Math.round(CF_HVS / CF_CELL / 2));
      const inkB = cfBlur(fld.ink, r);
      const radB = cfBlur(fld.rad, r);
      const cntB = cfBlur(fld.n, r);
      const cellA = CF_CELL * CF_CELL;
      const out = new Map();
      const byBin = [];
      for (let b = 0; b < 8; b++) byBin.push({ want: 0, got: 0, n: 0 });
      cntB.forEach((cnt, key) => {
        if (!(cnt > 0.25)) return;
        const I = clamp(finite(radB.get(key), 0) / cnt, 0, 1);
        const got = clamp((finite(inkB.get(key), 0) * inkWidth()) / cellA, 1e-4, 1.2);
        const want = clamp(inkWidth() / Math.max(1e-6, cfWantedPitch(I)), 1e-4, 1.2);
        out.set(key, { want, got, I });
        const bi = clamp(Math.floor(I * 8), 0, 7);
        byBin[bi].want += want; byBin[bi].got += got; byBin[bi].n += 1;
      });
      return { cells: out, byBin };
    };
    // 'contFieldMeasured' — ONE global LUT over radiance, inverted from the
    // measurement. If the drawing came out lighter than the light asked at this
    // radiance, the field tightens there next pass, and vice versa.
    let cfLut = null;
    const cfLutGain = (I) => {
      if (!cfLut) return 1;
      const x = clamp(finite(I, 0), 0, 1) * (cfLut.length - 1);
      const k = Math.min(cfLut.length - 2, Math.floor(x));
      const u = x - k;
      return cfLut[k] + (cfLut[k + 1] - cfLut[k]) * u;
    };
    const cfBuildLut = (res) => {
      const g = res.byBin.map((b) => (b.n >= 3 && b.got > 1e-9
        ? clamp(b.want / b.got, 0.55, 1.8) : 1));
      // Smooth the LUT — a per-bin gain with a step in it would put a step
      // straight back into the field this law exists to keep step-free.
      const s = g.map((v, i) => {
        const a = g[Math.max(0, i - 1)]; const c = g[Math.min(g.length - 1, i + 1)];
        return (a + 2 * v + c) / 4;
      });
      cfLut = s;
    };
    // 'contFieldEquil' — Ostromoukhov's LOCAL correction. Same residual, kept
    // per cell instead of collapsed onto radiance, and quantised to 16 levels
    // (his table size) so the correction is a discrete equilibration rather than
    // an unbounded feedback term.
    const CF_EQ_LEVELS = 16;
    let cfCorr = null;
    const cfBuildCorr = (res) => {
      const m = new Map();
      res.cells.forEach((v, key) => {
        const raw = clamp(v.want / Math.max(1e-6, v.got), 0.6, 1.7);
        const u = clamp((raw - 0.6) / 1.1, 0, 1);
        m.set(key, 0.6 + (Math.round(u * (CF_EQ_LEVELS - 1)) / (CF_EQ_LEVELS - 1)) * 1.1);
      });
      cfCorr = cfBlur(m, 2);
      // cfBlur normalises by the kernel, so a cell with no neighbours reads low;
      // re-scale against a blurred indicator so the correction stays a RATIO.
      const ind = new Map(); m.forEach((v, key) => ind.set(key, 1));
      const indB = cfBlur(ind, 2);
      const fixed = new Map();
      cfCorr.forEach((v, key) => {
        const w = finite(indB.get(key), 0);
        if (w > 1e-3) fixed.set(key, clamp(v / w, 0.6, 1.7));
      });
      cfCorr = fixed;
    };
    const cfCorrAt = (x, y) => (cfCorr ? clamp(finite(cfCorr.get(cfKey(x, y)), 1), 0.6, 1.7) : 1);
    // How many placement passes this law takes. One is the plain field; the
    // calibrated laws re-place with what they measured.
    const cfPasses = () => {
      if (TONE_ALGO === 'contFieldMeasured') return 2;
      if (TONE_ALGO === 'contFieldEquil') return 3;
      return 1;
    };
    // The floor and flood counters. `contFieldTouch` is EXPECTED to flood; the
    // number is the report, not a failure.
    const cfStat = { placed: 0, atFloor: 0, flooded: 0, minPitch: Infinity, maxPitch: 0 };

    // The one entry point the emitter asks. `ladder` never reaches it.
    // `isCross` is true on a zone-gated pass, which only 'layeredCross' emits.
    // Those passes draw FULLY: an added family is the tone, so laddering it
    // would thin the very thing that is supposed to darken the zone. Measured
    // before this: the +65° family builds 13 rulings over the object, the gate
    // keeps the ones that reach the zone and the ladder at 0.41 then took the
    // survivors to ZERO — the mid-tone cross did not appear at all.
    const algoCoverage = (I, isCross, smp, localPitch) => {
      // ROUND 6 — the twelve mark languages rule ONE even scaffold and never
      // drop a row. The whole tone ramp is carried by the marks strung on it, so
      // the coverage they hand back is a constant.
      if (isMarkLaw()) return MK_ROW_COV;
      if (TONE_ALGO === 'continuousPitch') return contPitchCov(I);
      if (TONE_ALGO === 'fineLadder') return fineLadderCov(I);
      if (TONE_ALGO === 'layeredCross') return isCross ? 1 : flatCov();
      if (TONE_ALGO === 'weightModulated') return flatCov();
      // 6, 8 and 9 share ONE tone target and differ only in placement —
      // perceptualRamp rules straight families, contourFlow rules streamlines of
      // the light, errorDiffused changes the selection rule. Holding the target
      // fixed is what makes the three comparable at all.
      if (TONE_ALGO === 'perceptualRamp' || TONE_ALGO === 'contourFlow' || TONE_ALGO === 'errorDiffused') {
        return perceptualCov(I, localPitch);
      }
      // The 64-level pair, and `strokesGrow`/`lozengeStipple`, all state the
      // SAME target as law 6 — only the selection differs, which is the whole
      // point of running them against it.
      if (TONE_ALGO === 'nestedFineLadder' || TONE_ALGO === 'phaseFineLadder') return nestedCov(I, localPitch);
      if (TONE_ALGO === 'strokesGrow' || TONE_ALGO === 'lozengeStipple'
        || TONE_ALGO === 'importanceGreedy') {
        return perceptualCov(I, localPitch);
      }
      // 'deepFillTSP' — THE RULINGS THIN SO THE TRAVERSE HAS A GAP TO FILL.
      //
      // MEASURED, AND IT IS WHY THIS LINE EXISTS. The first cut left the
      // coverage alone and displaced the ruling laterally into "its own gap".
      // At the plot floor there IS no gap: uncapped, the master grid rules AT
      // `floorPitch` and `covAtSample` clamps coverage to `localPitch/floorPitch`
      // wherever the geometry crowds, so the drawn pitch in the darkest zone is
      // exactly the floor and the amplitude came out zero on every sample. The
      // law measured byte-identical to `perceptualRamp` (ink 2341.3 against
      // 2341.3) — a no-op dressed as a variant.
      //
      // A space-filling fill is not an ADDITION to a ruled family; it REPLACES
      // it. So the darkest zone rules at HALF the density and the traverse
      // spends the freed gap, which lands the same ink through one continuous
      // aperiodic path instead of two straight ones.
      if (TONE_ALGO === 'deepFillTSP') {
        return clamp(perceptualCov(I, localPitch) / (1 + tspRamp(I)), 0.005, 1);
      }
      // 'forcedContrast' — the same target, on a tone field the draughtsman has
      // deliberately pushed apart (see `fcIntensity`).
      if (TONE_ALGO === 'forcedContrast') return perceptualCov(fcIntensity(I), localPitch);
      // 'evenStreamlines' places by spacing, so every traced curve draws whole:
      // the ladder is handed 1 and takes no verdict at all.
      if (TONE_ALGO === 'evenStreamlines') return 1;
      // The `contField*` family likewise. The spacing IS the tone and it was
      // already spent when the ruling was PLACED, so there is nothing left for a
      // selection rule to decide and handing the ladder anything below 1 would
      // charge the tone twice — once as a gap, once as a drop.
      if (isContField()) return 1;
      if (TONE_ALGO === 'crossFade') return crossFadeCov(I, localPitch);
      if (TONE_ALGO === 'fullLightingModel') return flmCov(smp, localPitch);
      // The weight laws state their tone on the pen, so the coverage they hand
      // back is the GEOMETRY they want and nothing else — flat for four of them,
      // and the spacing half of the split for `weightPlusSpacing`.
      // MERGE (v5): the three-pen laws are WEIGHT_LAWS too, and `penPlan` needs
      // the sample to pick a nib, so the call carries `smp`. The adjacent-pass
      // arm below is unaffected — ADJ_LAWS and WEIGHT_LAWS are disjoint.
      if (isWeightLaw()) return weightCovAt(clamp(finite(I, 0), 0, 1), localPitch, smp);
      // The adjacent-pass family rules at ONE constant pitch and states its tone
      // entirely on how many passes a bundle gets, so the coverage it hands back
      // is a constant — the geometry, and nothing else. That is what makes
      // spacing regularity a property of the family instead of a result of it.
      if (isAdjLaw()) return adjFlatCov();   // 1 — see `adjStride`
      return coverageForSample(I);
    };

    // ── FORM ZONES on the curved path ──────────────────────────────────────────
    // The ladder's own coverage numbers cannot express T > F > R (Lambert is
    // clamped, so T, F and R are all I = 0), so the zone classifier in Regions
    // owns the dark end and the ladder's coverage keeps owning the lit end. Both
    // fill implementations call the SAME classifier — that is the I27 parity
    // contract, and it is why a cube, a low-poly sphere and this capsule under
    // one light now land in the same zones.
    const zoneCtx = opts.formZone || null;
    const zonesOn = Boolean(STAGE.toneZones && useLadder && zoneCtx && typeof Regions.formZone === 'function');
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
      // 'layeredCross' owns the zone channel outright: its three families need a
      // per-sample gate and this is the gate the emitter already has. Derived
      // from intensity (see `xcZoneOf`) — `HL_STAGE.toneZones` stays off and
      // `Regions.formZone` is never called, so nothing of Stage 2 leaks in.
      if (TONE_ALGO === 'layeredCross' && toneOn) return xcZoneOf(smp);
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
    // A zone gate is one zone name, as it always was. 'layeredCross' needs a
    // family to span TWO zones (its mid-tone cross also runs through the darks),
    // and splitting that into two gated families would re-phase the ladder at
    // the zone edge and put a seam exactly where the tone is smoothest. So a
    // gate may also be a LIST. A string gate takes the identical branch it
    // always took, so the committed default is byte-identical.
    const gateAllows = (g, z) => (Array.isArray(g) ? g.indexOf(z) >= 0 : z === g);
    const SHADOW_TH = 0.5; // intensity below which the dark-grading infill engages

    // I8 — LIGHT-DRIVEN highlight: the highlight region is where the per-sample
    // specular term S is high (a glint that spans faces near a point light), not
    // the top tone band. `sensitivity` stages the drop: 1 = binary (uniform
    // treatment across the region), N = a gradient (brightest = blankest). When
    // engaged the perFace band-treatment dispatch is disabled (they are mutually
    // exclusive within one fill). Default off ⇒ every branch below is inert.
    const hlCfg = opts.highlight || null;
    const specularFn = opts.specularFn || null;
    const ldOn = Boolean(STAGE.lightDriven && hlCfg && hlCfg.lightDriven && typeof specularFn === 'function' && Regions
      && typeof Regions.highlightStage === 'function');
    const ld = ldOn ? {
      treatment: hlCfg.treatment || 'blank',
      sensitivity: clamp(Math.round(finite(hlCfg.sensitivity, 1)), 1, 6),
    } : null;
    const LD_REG = 0.025; // specular threshold for "in the glint" (matches faceted)

    // ══ WHICH WAY IS OUT? DECIDED ONCE FOR THE CHART, NOT ONCE PER SAMPLE ══
    //
    // `cross(dPa, dPb)` gives the normal up to a sign, and that sign is a
    // property of the CHART's parameter handedness — one constant for the whole
    // surface. `sampleAt` used to recover it per sample with `dot(n, p0) < 0`
    // ("charts centre near origin"), which is a statement about STAR-SHAPEDNESS,
    // not about handedness. It holds for every convex chart here and fails on
    // the first one that is not: on a torus
    //
    //     dot(n, p) = major·cos(2πv) + minor
    //
    // which goes NEGATIVE across the inner third of the tube. Measured on the
    // factory torus: 6837 of 24779 samples (27.6%) came back with an INVERTED
    // normal — sphere, capsule and cylinder: 0. So `front` flipped across the
    // locus cos(2πv) = -minor/major (v = 0.294 / 0.705 there), the region tracer
    // read that locus as two more silhouettes and traced them (signed areas
    // -422.77 and -464.05 beside the true outer silhouette's +1282.37), and
    // containment classified both as HOLES: the ribbon clip region collapsed
    // from 1282.4 mm² to 399.6 mm², 12.6% of the fill vertices the front test
    // had itself proved on-surface fell outside their own clip region, and every
    // one of the twelve variable-width laws refused 40-58% of its wide stretches
    // as `clipEmpty`/`erodeEmpty` and shipped bare centrelines.
    //
    // The handedness is recovered globally instead, by the divergence theorem:
    // ∮ p · n dA is +6V for an outward normal and -6V for an inward one, so its
    // SIGN is the answer for any closed chart, star-shaped or not. One coarse
    // pass, memoized, and it agrees with the old per-sample test everywhere the
    // old test was right (a convex chart has dot(n, p) > 0 at every sample, so
    // its integral cannot disagree with any of them).
    let chartOrientMemo = 0;
    const chartOrientation = () => {
      if (chartOrientMemo) return chartOrientMemo;
      const M = 24;
      let vol = 0;
      for (let i = 0; i < M; i++) {
        // Cell CENTRES: the forward difference below needs room, and a chart's
        // domain edge is exactly where it has none.
        const a = (i + 0.5) / M;
        for (let j = 0; j < M; j++) {
          const b = (j + 0.5) / M;
          const q0 = chart(a, b);
          const qa = chart(a + EPS, b);
          const qb = chart(a, b + EPS);
          if (!q0 || !qa || !qb) continue;
          // No normalization: |cross| IS the area element, which is exactly the
          // weight the surface integral wants.
          vol += dot(q0, cross(sub(qa, q0), sub(qb, q0)));
        }
      }
      chartOrientMemo = vol < 0 ? -1 : 1;
      return chartOrientMemo;
    };

    // Sample the surface at (a,b) → screen point + front flag + Lambert intensity.
    const sampleAt = (a, b) => {
      const aa = clamp(a, 0, 1);
      const bb = clamp(b, 0, 1);
      const p0 = chart(aa, bb);
      // FORWARD DIFFERENCE, WITH A BACKWARD FALLBACK ON THE DOMAIN EDGE.
      //
      // The partner samples used to be `chart(clamp(aa + EPS, 0, 1), …)`. At
      // aa = 1 (or bb = 1) the clamp puts the partner ON TOP OF p0, the cross
      // product collapses, and the whole sample returned null — so the LAST
      // sample of every sweep was silently dropped. On a chart whose `b` is the
      // periodic wind seam that is a hole exactly one step wide, on the seam,
      // at every ruling: a contour ring lost its closing segment and came back
      // as two pieces with a visible notch at longitude 0 (screen right on a
      // yaw-0 camera). Stepping BACKWARD off the edge measures the same tangent
      // (the sign is restored below), so the seam sample is a real sample again.
      const aFwd = aa + EPS <= 1;
      const bFwd = bb + EPS <= 1;
      const sgnA = aFwd ? 1 : -1;
      const sgnB = bFwd ? 1 : -1;
      const pa = chart(aFwd ? aa + EPS : aa - EPS, bb);
      const pb = chart(aa, bFwd ? bb + EPS : bb - EPS);
      if (!p0 || !pa || !pb) return null;
      let dPa = mul(sub(pa, p0), sgnA);
      let dPb = mul(sub(pb, p0), sgnB);
      let nLocal = cross(dPa, dPb);
      let nl = Math.hypot(nLocal.x, nLocal.y, nLocal.z);
      if (nl < 1e-9) {
        // A GENUINE CHART SINGULARITY, not an edge artefact: at a sphere's pole
        // every `b` names the same point, so the b-tangent is zero there however
        // it is measured. The POINT is still valid and the surface still has a
        // normal — take the frame a hair inside the domain and keep p0 where it
        // is, so meridians close on the pole instead of stopping a step short.
        const ai = clamp(aa, EPS * 2, 1 - EPS * 2);
        const bi = clamp(bb, EPS * 2, 1 - EPS * 2);
        const q0 = chart(ai, bi);
        const qa = chart(clamp(ai + EPS, 0, 1), bi);
        const qb = chart(ai, clamp(bi + EPS, 0, 1));
        if (!q0 || !qa || !qb) return null;
        dPa = sub(qa, q0); dPb = sub(qb, q0);
        nLocal = cross(dPa, dPb);
        nl = Math.hypot(nLocal.x, nLocal.y, nLocal.z);
        if (nl < 1e-9) return null;
      }
      nLocal = mul(nLocal, 1 / nl);
      if (chartOrientation() < 0) nLocal = mul(nLocal, -1); // outward (see chartOrientation)
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
          // Same backward-step sign restoration as the tangents above, so the
          // pitch this feeds (perpPitch, C15) keeps pointing the way the family
          // actually advances on the domain edge.
          dA = { x: ((sa.x - scr.x) / EPS) * sgnA, y: ((sa.y - scr.y) / EPS) * sgnA };
          dB = { x: ((sb.x - scr.x) / EPS) * sgnB, y: ((sb.y - scr.y) / EPS) * sgnB };
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
    // WHERE THE PLOT FLOOR BINDS. In uncapped mode the floor is the only limit
    // left, so it is the only thing standing between the tone law and the
    // lighting — and it has to be reported, not assumed. Counted per sample and
    // per ruling; `worst` is the deepest overdraw the law asked for, as a
    // multiple of the coverage the floor allowed.
    const floorStat = { samples: 0, clamped: 0, rulings: new Set(), touched: new Set(), worst: 1 };
    const penWidth = Math.max(0.02, finite(opts.penWidth, 0.3));
    if (STAGE.masterGrid && useLadder && opts.penWidth != null) {
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
        // ── WHERE THE GRID IS CALIBRATED, AND WHY UNCAPPED MOVES IT ───────────
        //
        // The capped build calibrates on the MEDIAN local pitch, for the reason
        // stated above: a budgeted grid sized off the crowded end would put the
        // whole ladder on the plot floor and flatten it.
        //
        // With the budget lifted that trade is gone, and the median becomes the
        // thing standing between the law and the lighting. A tone law asks for a
        // spacing; it gets `localPitch / cov`, and coverage cannot exceed 1 — so
        // the DARKEST tone is reachable only where `localPitch` is at or below
        // the darkest target pitch. Calibrated on the median, that is half the
        // surface, and the other half saturates at coverage 1 and simply cannot
        // go darker. Measured, first cut: the perceptual ramp came back with an
        // apparent-tone span of 6.1 L* against a designed 16, and an R² of
        // 0.008 — the drawing had no ramp in it at all, and the law was not the
        // reason.
        //
        // So uncapped calibrates on the 90th percentile: the grid is fine enough
        // that 90 % of the surface can reach the floor, and the crowded tenth is
        // handled where crowding belongs — by the floor clamp, which is counted.
        const calib = TONE_UNCAPPED
          ? widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.9))]
          : median;
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
        // `opts.masterFloorPen` (opt-in, pen-multiple) lets the ONE direct
        // density→line-count caller relax this master-grid floor below the
        // conservative PLOT_FLOOR_PEN default (scene3d.js's
        // `curvedMasterFloorPen`, threaded only past Density 100 so every
        // d<=100 document — and every other caller, which never passes this
        // option at all — keeps PLOT_FLOOR_PEN and stays byte-identical).
        // This does NOT touch `floorPitch` below: that is the module-scope
        // plot-safety floor read throughout the rest of this closure (per-
        // sample coverage capping, crosshatch separation, mark-length
        // safety, …) and it always reads PLOT_FLOOR_PEN, unrelaxed.
        const floorPenMult = Number.isFinite(opts.masterFloorPen) && opts.masterFloorPen > 0
          ? opts.masterFloorPen : PLOT_FLOOR_PEN;
        const floorPen = floorPenMult * penWidth;
        if (TONE_UNCAPPED) {
          // THE BUDGET IS OFF. The master grid is ruled at the plot floor
          // itself, which is the finest grid ink allows, so the tone law can ask
          // for any pitch from the floor upward and get it. Density's own pitch
          // (`tonePitch`) and the O6 sparse-end pitch no longer choose the grid
          // — the first is a budget, the second is a bar the LAW must clear and
          // still does, through `litFloorCov` at the sparse end of the envelope.
          // No overflow: there is no excess to spill when the grid IS the floor.
          masterPitch = floorPen;
          densityOverflow = 0;
        } else {
          masterPitch = Math.min(tonePitch, o6Pitch);
          if (masterPitch < floorPen) {
            densityOverflow = clamp(floorPen / masterPitch - 1, 0, 1);
            masterPitch = floorPen;
          }
        }
        N = clamp(Math.max(4, Math.round(calib / masterPitch)), 4, maxLines());
        masterPitch = calib / N; // what the family ACTUALLY rules at, typically
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
    const hl = (STAGE.treatment && !ldOn && opts.highlight && opts.highlight.treatment && opts.highlight.treatment !== 'blank')
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

    // ═══ THE TRUE VISIBLE REGION, TRACED FROM THE FRONT TEST ITSELF ═══════════
    //
    // `ribbonize` (below) widens a ruling SIDEWAYS, and sideways is the one
    // direction no existing guard covers. Every sample of a run has already been
    // proved front-facing (`onSurf`), refined to 1/4096 of a step by `edgeAt` —
    // but a HALF-WIDTH added at the limb lands off the form. That is defect D2,
    // and it is exactly what the old round caps used to cause. So a ribbon has to
    // be CLIPPED, and it has to be clipped against the same region the front test
    // defines — not a bbox, not a convex hull, and not the MESH silhouette
    // (`extractSilhouette` in geometry3d.js), which is a different discretisation
    // of the same form and would be off by the mesh's own facet error.
    //
    // surface-fill emits no silhouette path: the silhouette here is a PREDICATE,
    // `sampleAt(a, b).front === wantFront`, and `nz` (= camN.z) is its signed
    // field — 1 facing the camera and exactly 0 ON the contour. So the region's
    // rings are traced FROM THAT PREDICATE, by marching squares over the chart's
    // own (a, b) square, with:
    //   - every crossing BISECTED against the boolean `front` test, at the same
    //     depth `edgeAt` bisects a ruling's end (EDGE_BISECT = 12);
    //   - every contour vertex pushed back through `sampleAt`, so it reaches
    //     screen through the same projection the rulings did;
    //   - the DOMAIN EDGE treated as a real boundary on a NON-PERIODIC axis (a
    //     cylinder's rim is not a silhouette, but it is still an edge of the
    //     form and a ribbon may not cross it), and WRAPPED on a periodic one (a
    //     sphere's wind seam is not an edge at all — cutting the region there
    //     would drive a false slit through the middle of the clip).
    //
    // Same predicate, same refinement, same projection ⇒ the clip boundary and
    // the run boundary are the same curve by construction. That is what makes
    // "no ink outside the region" a structural property (T2's hard zero) rather
    // than a tolerance that happened to pass.
    const REGION_N = 72;          // marching-squares cells per chart axis
    const REGION_BISECT = 12;     // the depth `edgeAt` uses — same refinement

    // Does the chart close on itself along each axis?
    let chartPeriodMemo = null;
    const chartPeriod = () => {
      if (chartPeriodMemo) return chartPeriodMemo;
      const near = (p, q) => Boolean(p && q
        && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.z - q.z) < 1e-6);
      let perA = true; let perB = true;
      for (let k = 0; k <= 4; k++) {
        const u = k / 4;
        if (!near(chart(0, u), chart(1, u))) perA = false;
        if (!near(chart(u, 0), chart(u, 1))) perB = false;
      }
      chartPeriodMemo = { perA, perB };
      return chartPeriodMemo;
    };

    const buildRegionRings = (wantFront) => {
      const per = chartPeriod();
      const N = REGION_N;
      const paramOf = (idx, periodic) => {
        if (periodic) return ((idx % N) + N) % N / N;
        if (idx < 0 || idx > N) return null;    // OUTSIDE the domain — a sentinel
        return idx / N;
      };
      const aOf = (i) => paramOf(i, per.perA);
      const bOf = (j) => paramOf(j, per.perB);
      const smpMemo = new Map();
      const smpAtIdx = (i, j) => {
        const k = `${i}|${j}`;
        if (smpMemo.has(k)) return smpMemo.get(k);
        const a = aOf(i); const b = bOf(j);
        const s = (a == null || b == null) ? null : sampleAt(a, b);
        smpMemo.set(k, s);
        return s;
      };
      const inAt = (i, j) => {
        const s = smpAtIdx(i, j);
        return Boolean(s && s.front === wantFront);
      };
      const wrap01 = (v) => ((v % 1) + 1) % 1;
      // The boundary between one INSIDE and one OUTSIDE grid corner, in chart
      // parameters. A sentinel neighbour means the crossing IS the domain edge,
      // which the inside corner already sits on — exact, no bisection needed.
      //
      // ── THE SEAM UNWRAP. DO NOT REMOVE. ────────────────────────────────────
      //
      // On a PERIODIC axis `paramOf` folds the wrap cell's far corner back to 0,
      // so the last cell of the row hands this function the pair (0.986, 0) when
      // what it means is (0.986, 1.0). Bisected literally, that interval spans
      // the WHOLE CHART the long way round — and since the front/back boundary
      // is a closed curve, the walk still converges, but onto the OPPOSITE
      // crossing. The returned point is then a real on-surface point sitting on
      // the WRONG limb, which is undetectable downstream.
      //
      // Measured (2026-08-29, sphere r=46 seen down its own seam, camera yaw 0):
      // every seam-cell crossing came back on the LEFT limb, so the traced
      // region was the left half-circle walked out and back — 218 points of
      // signed area -0.014 instead of a ~6650 mm2 disc. The ribbon clip then
      // returned empty for every ribbon and the whole variable-width feature
      // silently degraded to bare centrelines. Unwrap first, wrap the answer
      // back into [0,1) last.
      const crossParam = (aIn, bIn, aOut, bOut) => {
        if (aOut == null || bOut == null) return { a: aIn, b: bIn };
        let loA = aIn; let loB = bIn; let hiA = aOut; let hiB = bOut;
        if (per.perA && Math.abs(hiA - loA) > 0.5) hiA += (hiA < loA ? 1 : -1);
        if (per.perB && Math.abs(hiB - loB) > 0.5) hiB += (hiB < loB ? 1 : -1);
        for (let k = 0; k < REGION_BISECT; k++) {
          const mA = (loA + hiA) / 2; const mB = (loB + hiB) / 2;
          const s = sampleAt(per.perA ? wrap01(mA) : mA, per.perB ? wrap01(mB) : mB);
          if (s && s.front === wantFront) { loA = mA; loB = mB; } else { hiA = mA; hiB = mB; }
        }
        return { a: per.perA ? wrap01(loA) : loA, b: per.perB ? wrap01(loB) : loB };
      };
      const ptMemo = new Map();
      // `ia/ja` is the INSIDE corner, `ib/jb` the OUTSIDE one.
      const edgePt = (key, ia, ja, ib, jb) => {
        if (ptMemo.has(key)) return ptMemo.get(key);
        const pr = crossParam(aOf(ia), bOf(ja), aOf(ib), bOf(jb));
        const s = sampleAt(pr.a, pr.b) || smpAtIdx(ia, ja);
        const pt = s ? { x: s.x, y: s.y } : null;
        ptMemo.set(key, pt);
        return pt;
      };

      // Marching squares. Corners c0=(i,j) c1=(i2,j) c2=(i2,j2) c3=(i,j2);
      // edges e0=c0c1 (bottom, key A|i|j), e1=c1c2 (right, B|i2|j),
      // e2=c3c2 (top, A|i|j2), e3=c0c3 (left, B|i|j). Segments are oriented
      // INSIDE-ON-THE-LEFT so the chains come out as consistently wound rings.
      const CASES = {
        1: [[0, 3]], 2: [[1, 0]], 4: [[2, 1]], 8: [[3, 2]],
        3: [[1, 3]], 6: [[2, 0]], 12: [[3, 1]], 9: [[0, 2]],
        7: [[2, 3]], 14: [[3, 0]], 13: [[0, 1]], 11: [[1, 2]],
        5: [[0, 3], [2, 1]], 10: [[1, 0], [3, 2]],
      };
      const iFrom = per.perA ? 0 : -1;
      const iTo = per.perA ? N - 1 : N;
      const jFrom = per.perB ? 0 : -1;
      const jTo = per.perB ? N - 1 : N;
      const segs = [];
      for (let i = iFrom; i <= iTo; i++) {
        const i2 = per.perA ? (i + 1) % N : i + 1;
        for (let j = jFrom; j <= jTo; j++) {
          const j2 = per.perB ? (j + 1) % N : j + 1;
          const c = [inAt(i, j), inAt(i2, j), inAt(i2, j2), inAt(i, j2)];
          const code = (c[0] ? 1 : 0) | (c[1] ? 2 : 0) | (c[2] ? 4 : 0) | (c[3] ? 8 : 0);
          const list = CASES[code];
          if (!list) continue;
          // Per-edge: which of its two corners is the inside one.
          const eSpec = [
            { key: `A|${i}|${j}`, in: c[0] ? [i, j] : [i2, j], out: c[0] ? [i2, j] : [i, j] },
            { key: `B|${i2}|${j}`, in: c[1] ? [i2, j] : [i2, j2], out: c[1] ? [i2, j2] : [i2, j] },
            { key: `A|${i}|${j2}`, in: c[3] ? [i, j2] : [i2, j2], out: c[3] ? [i2, j2] : [i, j2] },
            { key: `B|${i}|${j}`, in: c[0] ? [i, j] : [i, j2], out: c[0] ? [i, j2] : [i, j] },
          ];
          list.forEach((pair) => {
            const A = eSpec[pair[0]]; const B = eSpec[pair[1]];
            const pA = edgePt(A.key, A.in[0], A.in[1], A.out[0], A.out[1]);
            const pB = edgePt(B.key, B.in[0], B.in[1], B.out[0], B.out[1]);
            if (pA && pB) segs.push({ from: A.key, to: B.key, a: pA, b: pB });
          });
        }
      }
      if (!segs.length) return [];
      // Chain the segments into closed rings by shared grid-edge key. The keys
      // are exact (they are grid indices, not floats), so a ring closes exactly
      // or not at all — there is no join tolerance to tune.
      const byFrom = new Map();
      segs.forEach((s) => { if (!byFrom.has(s.from)) byFrom.set(s.from, []); byFrom.get(s.from).push(s); });
      const used = new Set();
      const rings = [];
      segs.forEach((seed) => {
        if (used.has(seed)) return;
        const ring = [seed.a];
        let cur = seed;
        used.add(cur);
        for (let guard = 0; guard < segs.length + 4; guard++) {
          ring.push(cur.b);
          const nexts = byFrom.get(cur.to);
          const nxt = nexts && nexts.find((s) => !used.has(s));
          if (!nxt) break;
          used.add(nxt);
          cur = nxt;
          if (cur.from === seed.from) { used.delete(cur); break; }
        }
        // Drop the closing duplicate; the contract says first !== last.
        if (ring.length >= 4) {
          const f = ring[0]; const l = ring[ring.length - 1];
          if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) ring.pop();
        }
        if (ring.length >= 3) rings.push(ring);
      });
      return resolveFoldRings(rings);
    };

    // ══ NESTED IS NOT THE SAME AS HOLLOW ═════════════════════════════════════
    //
    // `clipMultiPolygonToRegion` assembles these rings with
    // `FillBoolean.nonZeroUnionByContainment`, which calls a ring a HOLE when an
    // odd number of other rings enclose it. On a sphere that is unambiguous —
    // there is one ring. It is NOT unambiguous the moment the front-facing sheet
    // OVERLAPS ITSELF on screen, because then a contour lands inside the outer
    // silhouette WITHOUT being an edge of the drawing: it is a fold, a crease
    // where the surface turns over and covers itself twice.
    //
    // Containment alone cannot tell those apart. The WINDING can, and for a
    // reason that is exact rather than heuristic. Marching squares orients every
    // segment inside-on-the-left in CHART space, and the projection's Jacobian
    // sign is `nz`, which is strictly positive across the front-facing set — so
    // the projection preserves orientation on the whole region, and the winding
    // number of the traced rings about a screen point is the NUMBER OF SHEETS
    // over it. Normalise so the outermost ring counts +1 and:
    //
    //     outer only        1 sheet   ->  inner ring absent
    //     genuine hole      0 sheets  ->  inner ring winds the OTHER way
    //     fold / overlap    2 sheets  ->  inner ring winds the SAME way
    //
    // Measured on the factory torus across camera pitch (taperedEnds): the inner
    // ring's signed area is +381.3 / +303.8 / +181.5 at pitch 2/5/10, where the
    // hole is shut and the inner contour is a fold, and flips to -42.9 / -333.2 /
    // -768.1 at pitch 20/35/70, where the hole is genuinely open. Containment
    // carved in BOTH cases: at pitch 2 the region collapsed to 349 mm² of a
    // 730 mm² silhouette and 6 wide stretches came back `erodeEmpty`.
    //
    // So a same-winding nested ring is dropped: it is a crease drawn ON the
    // region, not an edge OF it. What survives is shells plus real holes, whose
    // nesting and winding now agree, and the containment rule downstream gets
    // the same answer the winding does. Re-derived each pass because dropping a
    // ring re-parents everything inside it.
    //
    // A single-ring region — every primitive whose front-facing sheet is
    // embedded: sphere, capsule, cylinder, cone — returns untouched.
    const resolveFoldRings = (rings) => {
      if (!Array.isArray(rings) || rings.length < 2) return rings;
      let keep = rings;
      for (let pass = 0; pass < rings.length; pass++) {
        const signed = keep.map(ringSignedArea);
        let big = 0;
        for (let i = 1; i < keep.length; i++) if (Math.abs(signed[i]) > Math.abs(signed[big])) big = i;
        const outward = signed[big] < 0 ? -1 : 1;
        const next = keep.filter((r, i) => {
          let depth = 0;
          for (let j = 0; j < keep.length; j++) if (j !== i && ptInRing(r[0], keep[j])) depth += 1;
          const sameWinding = (signed[i] < 0 ? -1 : 1) === outward;
          return !(depth % 2 === 1 && sameWinding);
        });
        if (next.length === keep.length) break;
        if (!next.length) break;
        keep = next;
      }
      return keep;
    };

    const regionMemo = new Map();
    // Lazy: the marching pass costs ~5k `sampleAt` calls, and no law that is not
    // a ribbon law ever asks for it.
    const visibleRegionRings = (wantFront) => {
      const key = wantFront ? 'F' : 'B';
      if (regionMemo.has(key)) return regionMemo.get(key);
      let rings = [];
      try { rings = buildRegionRings(wantFront) || []; } catch (err) { rings = []; }
      regionMemo.set(key, rings);
      return rings;
    };

    // The visible region pulled in by HALF A PEN — the clip target for anything
    // that will be STROKED rather than filled. A path inside this region strokes
    // its outer edge onto the silhouette and never past it, which is the same
    // protrusion guarantee `ribbonize`'s RIBBON class gets by eroding after the
    // clip, made available to the WALLS class, which cannot erode (its geometry
    // is thinner than the erosion it would need). Built once per side per build:
    // the silhouette is a fat region, so this erosion is nowhere near the
    // hairline regime that makes the per-ribbon one unreliable.
    const regionInsetMemo = new Map();
    const visibleRegionInsetRings = (wantFront) => {
      const key = wantFront ? 'F' : 'B';
      if (regionInsetMemo.has(key)) return regionInsetMemo.get(key);
      let out = [];
      const rings = visibleRegionRings(wantFront);
      const FB = Vectura.FillBoolean;
      const GU = Vectura.GeometryUtils;
      if (rings.length && FB && typeof FB.nonZeroUnionByContainment === 'function'
        && GU && typeof GU.insetMultiPolygon === 'function') {
        try {
          const mp = FB.nonZeroUnionByContainment(rings) || [];
          const inset = mp.length ? (GU.insetMultiPolygon(mp, penWidth / 2, { minArea: 0 }) || []) : [];
          inset.forEach((poly) => (poly || []).forEach((r) => {
            const pts = [];
            for (let i = 0; i < r.length; i++) {
              const q = r[i];
              const x = Array.isArray(q) ? q[0] : q.x;
              const y = Array.isArray(q) ? q[1] : q.y;
              if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
            }
            if (pts.length >= 3) out.push(pts);
          }));
        } catch (err) { out = []; }
      }
      regionInsetMemo.set(key, out);
      return out;
    };

    // ── ROUND 6 — THE MARK EMITTER ────────────────────────────────────────────
    //
    // One call per ruling. It replaces the ruling outright: a mark law emits
    // marks and NOTHING else, so the scaffold is implied by where the marks sit
    // rather than drawn under them. `emitLine` returns immediately after.
    //
    // THE ONE-WAY DOOR. A mark is designed in SCREEN millimetres in the ruling's
    // own (u = along, v = across) frame, because that is the frame the mark
    // language lives in — a chevron is a chevron on the paper, not in the
    // parameter square. Every vertex is then pushed BACK through the chart with
    // `sampleAt` and the WHOLE MARK is refused unless every vertex comes back
    // in-domain and front-facing. Refusals are counted (`mkStat.offSurface`).
    // There is no path by which a vertex reaches the page without having passed
    // that test, which is what makes "nothing outside the silhouette" a
    // structural property here rather than a measurement that happened to pass.
    const emitMarks = (ctx) => {
      const law = MK[TONE_ALGO];
      if (!law) return;
      const smps = ctx.smps; const arcMM = ctx.arcMM; const nSteps = ctx.nSteps;
      const spanDrop = ctx.spanDrop; const paramAt = ctx.paramAt;
      const pitchStep = ctx.pitchStep; const lineDir = ctx.lineDir;
      const lineIndex = ctx.lineIndex; const wantFront = ctx.wantFront;
      const back = ctx.back; const fam = ctx.fam; const pitchAtStep = ctx.pitchAtStep;
      const w = inkWidth();
      const PMIN = MK_PMIN();
      const li = Number(lineIndex) || 0;
      const gold = ((li * GOLDEN_STEP) % 1 + 1) % 1;
      const parity = ((li % 2) + 2) % 2;

      const frameAt = (s) => {
        const smp = smps[s];
        if (!smp || !smp.dA || !smp.dB) return null;
        const tt = s / nSteps;
        const ld = typeof lineDir === 'function' ? lineDir(tt) : lineDir;
        const st = typeof pitchStep === 'function' ? pitchStep(tt) : pitchStep;
        if (!ld || !st) return null;
        const ux = smp.dA.x * ld.a + smp.dB.x * ld.b;
        const uy = smp.dA.y * ld.a + smp.dB.y * ld.b;
        const ul = Math.hypot(ux, uy);
        if (!(ul > 1e-9)) return null;
        const u = { x: ux / ul, y: uy / ul };
        const px = smp.dA.x * st.a + smp.dB.x * st.b;
        const py = smp.dA.y * st.a + smp.dB.y * st.b;
        const dp = px * u.x + py * u.y;
        const vx = px - dp * u.x; const vy = py - dp * u.y;
        const vl = Math.hypot(vx, vy);
        if (!(vl > 1e-9)) return null;
        const v = { x: vx / vl, y: vy / vl };
        const det = smp.dA.x * smp.dB.y - smp.dA.y * smp.dB.x;
        if (!(Math.abs(det) > 1e-12)) return null;
        const pr = paramAt(tt);
        // Screen millimetres → parameter delta, by the exact 2×2 solve on the
        // chart's own screen derivatives. No finite differences, no extra chart
        // evaluations: `dA`/`dB` are already carried by every sample.
        const toParam = (du, dv) => {
          const tx = du * u.x + dv * v.x;
          const ty = du * u.y + dv * v.y;
          return {
            a: pr.a + (tx * smp.dB.y - smp.dB.x * ty) / det,
            b: pr.b + (smp.dA.x * ty - tx * smp.dA.y) / det,
          };
        };
        return { u, v, toParam, smp };
      };

      const place = (fr, polys, uOff, theta) => {
        if (mkStat.pens >= MK_MAX_PENS) { mkStat.budget += 1; return false; }
        const c = Math.cos(theta || 0); const sn = Math.sin(theta || 0);
        const runs = [];
        for (let i = 0; i < polys.length; i++) {
          const poly = polys[i];
          const pts = [];
          for (let j = 0; j < poly.length; j++) {
            const uu = (uOff || 0) + poly[j][0] * c - poly[j][1] * sn;
            const vv = poly[j][0] * sn + poly[j][1] * c;
            const pp = fr.toParam(uu, vv);
            if (!(pp.a >= 0 && pp.a <= 1)) { mkStat.offSurface += 1; return false; }
            // `b` is the chart's periodic direction on every primitive this
            // family rules (longitude / the wind), so a small excursion past the
            // seam WRAPS. A large one does not: that is a mark trying to leave
            // the chart, and it is refused.
            let bb = pp.b;
            if (bb < 0 || bb > 1) {
              if (bb < -0.25 || bb > 1.25) { mkStat.offSurface += 1; return false; }
              bb = ((bb % 1) + 1) % 1;
            }
            const sm = sampleAt(pp.a, bb);
            if (!sm || sm.front !== wantFront) { mkStat.offSurface += 1; return false; }
            pts.push({ x: sm.x, y: sm.y, z: sm.z });
          }
          runs.push(pts);
        }
        let tot = 0;
        runs.forEach((r) => {
          for (let i = 1; i < r.length; i++) tot += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y);
        });
        // A mark under two pen widths is a pen-down dot, not a mark. Dropping it
        // — rather than shortening it — is exactly how the ramp reaches BARE
        // PAPER at the light end instead of degenerating into speckle.
        if (tot < MIN_MARK_MM) { mkStat.tooShort += 1; return false; }
        runs.forEach((r) => {
          if (r.length < 2) return;
          r.fam = fam; r.loz = true;
          pushRun(r, back, lineIndex);
          mkStat.pens += 1;
        });
        mkStat.marks += 1; mkStat.ink += tot;
        return true;
      };

      // The mark's own turn. 'iso' and 'radial' read the intensity gradient IN
      // THE MARK'S FRAME — dI/du comes free from the ruling's own neighbours,
      // dI/dv costs one chart sample — so 'radial' points every mark straight up
      // the gradient (at the light) and 'iso' lays it along the tone contour.
      const thetaAt = (s, fr) => {
        // The dot-and-lozenge's whole point is that no two neighbouring rows
        // share a spatial frequency OR a direction, so its lozenge rows are
        // turned 45 deg off the row — which is also what keeps it from being
        // `mkLozenge` with every other row missing (measured: 83.3 % IoU before
        // this turn, the highest pair on the board).
        if (law.shape === 'altrow') return parity === 0 ? Math.PI / 4 : 0;
        if (law.or === 'along' || law.or === 'none') return 0;
        if (law.or === 'across') return Math.PI / 2;
        if (law.or === 'diag') return Math.PI / 4;
        const smp = smps[s];
        const p = (s > 0 && smps[s - 1]) ? smps[s - 1] : smp;
        const q = (s < nSteps && smps[s + 1]) ? smps[s + 1] : smp;
        const dArc = Math.hypot(q.x - p.x, q.y - p.y);
        const dIu = dArc > 1e-6 ? (finite(q.I, 0) - finite(p.I, 0)) / dArc : 0;
        let dIv = 0;
        const H = 0.6;
        const pp = fr.toParam(0, H);
        if (pp.a >= 0 && pp.a <= 1) {
          const alt = sampleAt(pp.a, ((pp.b % 1) + 1) % 1);
          if (alt && alt.front === wantFront) dIv = (finite(alt.I, 0) - finite(smp.I, 0)) / H;
        }
        if (!(Math.hypot(dIu, dIv) > 1e-7)) return 0;
        const th = Math.atan2(dIv, dIu);
        return law.or === 'radial' ? th : th + Math.PI / 2;
      };

      // ── THE TONE SOLVE ──────────────────────────────────────────────────────
      //   a  = the ink AREA the light asks for, L*-linear between the anchors
      //   R  = the DRAWN row pitch here (the master pitch over the coverage)
      //   g  = millimetres of ink path per millimetre of row = a·R / inkWidth
      // and the channel decides which of (period, mark length) absorbs g.
      const solveAt = (k) => {
        const smp = smps[k];
        const I = clamp(finite(smp.I, 0), 0, 1);
        const lp = pitchAtStep(smp, k);
        const R = clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / MK_ROW_COV, 0.25, 40);
        const g = clamp((mkAsk(I) * R) / w, 0, 26);
        let P; let L;
        const countChan = law.chan === 'count' || (law.chan === 'alt' && parity === 1);
        // The dash BAND's capacity is a function of the period, so it is stated
        // here; every other shape's is a function of the cell alone.
        const capOf = (per) => (law.shape === 'morph'
          ? Math.max(1, Math.floor((1.12 * R) / w)) * per
          : mkCap(shapeFor(), R, w));
        if (countChan) {
          const L0 = law.chan === 'alt' ? 1.60 : law.L0;
          L = Math.min(L0 * R, capOf(PMIN));
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);
          if (P <= PMIN + 1e-9) L = Math.min(g * P, capOf(P));
        } else {
          P = clamp(law.P0 * R, PMIN, MK_PMAX);
          L = Math.min(g * P, capOf(P));
        }
        return { P, L, R, I, g };
      };

      const shapeFor = () => {
        if (law.shape !== 'altrow') return law.shape;
        return parity === 0 ? 'lozenge' : 'disc';
      };

      const posAt = (fr, k, a) => ({
        x: fr.smp.x + fr.u.x * (a - arcMM[k]),
        y: fr.smp.y + fr.u.y * (a - arcMM[k]),
      });
      const blocked = (fr, k, a, sep, aniso, P0) => {
        const p = posAt(fr, k, a);
        const gx = Math.round(p.x / MK_CELL); const gy = Math.round(p.y / MK_CELL);
        const rr = Math.min(4, Math.ceil(sep / MK_CELL) + 1);
        for (let j = -rr; j <= rr; j++) {
          for (let i = -rr; i <= rr; i++) {
            const arr = mkSites.get(`${gx + i},${gy + j}`);
            if (!arr) continue;
            for (let n = 0; n < arr.length; n++) {
              const ex = arr[n].x - p.x; const ey = arr[n].y - p.y;
              const al = ex * fr.u.x + ey * fr.u.y;
              const pe = ex * fr.v.x + ey * fr.v.y;
              if (aniso) {
                // ANISOTROPIC: the exclusion disc is an ellipse elongated ALONG
                // the row, so marks may crowd along their own row (that is what
                // a dissolving row IS) but may not line up with the row next
                // door — which is what reads as a phantom column.
                const along = Math.min(sep / 3, 0.42 * P0);
                if ((al * al) / (along * along) + (pe * pe) / (sep * sep) < 1) return true;
              } else if (al * al + pe * pe < sep * sep) return true;
            }
          }
        }
        return false;
      };
      const noteSite = (fr, k, a) => {
        const p = posAt(fr, k, a);
        const key = mkKey(p.x, p.y);
        const arr = mkSites.get(key) || [];
        arr.push(p);
        mkSites.set(key, arr);
      };

      const layMark = (k, a, sv) => {
        const fr = frameAt(k);
        if (!fr) { mkStat.noFrame += 1; return; }
        let polys;
        if (law.shape === 'morph') {
          // THE DISSOLUTION RAMP, as one expression. The dash is capped at the
          // PERIOD, so L < P is a gapped dash, L = P is an unbroken ruling, and
          // L > P is that ruling thickened into a BAND of parallel passes an ink
          // width apart. Dot → dash → line → band, with no thresholds in it.
          const n0 = Math.max(1, Math.ceil(sv.L / Math.max(1e-6, sv.P)));
          const nn = Math.min(n0, Math.max(1, Math.floor((1.12 * sv.R) / w)));
          const each = sv.L / nn;
          polys = [];
          for (let j = 0; j < nn; j++) {
            const off = (j - (nn - 1) / 2) * w;
            polys.push([[-each / 2, off], [each / 2, off]]);
          }
        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
        }
        place(fr, polys, a - arcMM[k], thetaAt(k, fr));
      };

      // ── THE SPANS ───────────────────────────────────────────────────────────
      // A span is a maximal run of on-surface samples this ruling actually kept,
      // so a mark can never straddle the silhouette or a pole.
      const spans = [];
      let z0 = 0;
      while (z0 <= nSteps) {
        if (!smps[z0] || (spanDrop && spanDrop[z0])) { z0 += 1; continue; }
        let z1 = z0;
        while (z1 + 1 <= nSteps && smps[z1 + 1] && !(spanDrop && spanDrop[z1 + 1])) z1 += 1;
        if (z1 > z0) spans.push([z0, z1]);
        z0 = z1 + 1;
      }
      if (!spans.length) return;
      mkStat.rows += 1;

      spans.forEach((sp) => {
        const s0 = sp[0]; const s1 = sp[1];
        let cur = s0;
        const idxAt = (a) => {
          while (cur < s1 && arcMM[cur + 1] < a) cur += 1;
          while (cur > s0 && arcMM[cur] > a) cur -= 1;
          return cur;
        };
        for (let k = s0; k <= s1; k++) {
          const sv = solveAt(k);
          mkStat.samples += 1;
          if (sv.P < floorPitch) mkStat.flood += 1;
          if (sv.P < mkStat.pMin) mkStat.pMin = sv.P;
          if (sv.g > mkStat.gMax) mkStat.gMax = sv.g;
        }
        cur = s0;

        if (law.shape === 'scribble') {
          // ONE CONTINUOUS POLYLINE FOR THE WHOLE ROW. A triangle wave whose
          // amplitude AND wavelength both carry tone. A straight line is already
          // g = 1, so below that a wave cannot exist and the scribble BREAKS
          // into a dashed hairline — which is how this law reaches bare paper.
          let pts = [];
          const flushS = () => {
            if (pts.length >= 2 && mkStat.pens < MK_MAX_PENS) {
              let tot = 0;
              for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
              if (tot >= MIN_MARK_MM) {
                pts.fam = fam; pts.loz = true;
                pushRun(pts, back, lineIndex);
                mkStat.pens += 1; mkStat.marks += 1; mkStat.ink += tot;
              } else mkStat.tooShort += 1;
            }
            pts = [];
          };
          let a = arcMM[s0];
          let side = parity ? 1 : -1;
          let guard = 0;
          while (a <= arcMM[s1] && guard < 4000) {
            guard += 1;
            const k = idxAt(a);
            const sv = solveAt(k);
            const fr = frameAt(k);
            if (!fr) { flushS(); a += 0.6; continue; }
            if (sv.g <= 1.02) {
              flushS();
              const dl = sv.g * sv.P;
              place(fr, [[[-dl / 2, 0], [dl / 2, 0]]], a - arcMM[k], 0);
              a += sv.P;
              continue;
            }
            const A = clamp(0.62 * sv.R * Math.min(1, 0.28 + (sv.g - 1) / 3.4), 0.10 * sv.R, 0.62 * sv.R);
            const lam = clamp((4 * A) / Math.sqrt(Math.max(1e-6, sv.g * sv.g - 1)), 1.8 * w, 3.4 * sv.R);
            const pp = fr.toParam(a - arcMM[k], side * A);
            let ok = pp.a >= 0 && pp.a <= 1;
            let bb = pp.b;
            if (ok && (bb < 0 || bb > 1)) {
              if (bb < -0.25 || bb > 1.25) ok = false; else bb = ((bb % 1) + 1) % 1;
            }
            const sm = ok ? sampleAt(pp.a, bb) : null;
            if (!sm || sm.front !== wantFront) { mkStat.offSurface += 1; flushS(); a += lam / 2; side = -side; continue; }
            pts.push({ x: sm.x, y: sm.y, z: sm.z });
            side = -side;
            a += lam / 2;
          }
          flushS();
          return;
        }

        if (law.lat === 'errdiff') {
          // REAL ERROR DIFFUSION, WITH A TWO-TAP CARRY. The debt is INK LENGTH
          // owed: a stretch of row at gain g owes g·dl of black. A mark is laid
          // the moment the debt reaches its own length and exactly that is
          // subtracted, and a share of the standing residual is pushed sideways
          // into a screen cell the NEXT row consumes. Aperiodic by construction.
          let owed = 0;
          for (let k = s0 + 1; k <= s1; k++) {
            const dl = Math.hypot(smps[k].x - smps[k - 1].x, smps[k].y - smps[k - 1].y);
            const sv = solveAt(k);
            owed += sv.g * dl;
            const ck = mkKey(smps[k].x, smps[k].y);
            const carry = mkED.get(ck);
            if (carry) { owed += carry; mkED.delete(ck); }
            if (sv.L > 1e-6 && owed >= sv.L) {
              layMark(k, arcMM[k], sv);
              owed -= sv.L;
              if (owed > 0) {
                const push = owed * MK_ED_BETA;
                mkED.set(ck, finite(mkED.get(ck), 0) + push);
                owed -= push;
              }
            }
          }
          if (owed > 1e-6) {
            const ce = mkKey(smps[s1].x, smps[s1].y);
            mkED.set(ce, finite(mkED.get(ce), 0) + owed * MK_ED_BETA);
          }
          return;
        }

        // THE PHASE ACCUMULATOR. Period is integrated over ARC LENGTH, so the
        // gaps open EVENLY and eased along the form's own contour: there is no
        // rung, no quantum and no step anywhere in it.
        let phase = gold;
        if (law.lat === 'brick' || law.lat === 'altrow') phase = (gold + 0.5 * parity) % 1;
        else if (law.lat === 'hex') phase = (0.5 * parity + 0.13 * gold) % 1;
        let a = arcMM[s0] + phase * solveAt(s0).P;
        let guard = 0;
        while (a <= arcMM[s1] && guard < 4000) {
          guard += 1;
          const k = idxAt(a);
          const sv = solveAt(k);
          let ao = a;
          if (law.lat === 'jitter') {
            ao = a + (sfHash(li * 977 + guard, Math.round(a * 4)) - 0.5) * 0.55 * sv.P;
          }
          if (law.lat === 'blue' || law.lat === 'poisson') {
            const fr = frameAt(k);
            if (fr) {
              const aniso = law.lat === 'blue';
              const sep = aniso ? Math.min(0.95 * sv.R, 3.4 * sv.P) : 0.80 * Math.min(1.7 * sv.P, sv.R);
              let got = null;
              for (let t = 0; t < 6; t += 1) {
                const cand = t === 0 ? a : a + ((t % 2 ? 1 : -1) * Math.ceil(t / 2) * sv.P) / 3.5;
                if (cand < arcMM[s0] || cand > arcMM[s1]) continue;
                if (!blocked(fr, idxAt(cand), cand, sep, aniso, sv.P)) { got = cand; break; }
              }
              if (got == null) { a += sv.P; continue; }
              ao = got;
              noteSite(fr, idxAt(ao), ao);
              cur = k;
            }
          }
          layMark(idxAt(ao), ao, sv);
          cur = k;
          a += sv.P;
        }
      });
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
    const nextFam = (kind) => { currentFam = `${kind}#${famSeq}`; famSeq += 1; adjPrevSnake = null; return currentFam; };
    // THE LADDER'S PHASE, one accumulator per selection track (see ladderStep).
    // Declared HERE, per buildObject call, so a build is a pure function of its
    // opts — a module-scope phase would make the second drawing depend on the
    // first and break the byte-identity contracts. The key names the track a
    // ruling belongs to: its family, and its ordinal WITHIN the ruling for the
    // rare ruling that comes back as more than one span (the k-th spans of
    // successive rulings are the ones that neighbour each other on the form, so
    // they are the ones that must be evenly spaced against each other).
    const ladderPhase = new Map();
    // ── 'importanceGreedy' — THE ACCUMULATED-DARKNESS GRID ────────────────────
    //
    // Salisbury, Wong, Hughes & Salesin, SIGGRAPH 97 §3, the one algorithm in
    // the survey with NO tone quantisation anywhere, so banding cannot occur by
    // construction. "We define the IMPORTANCE of a point as the FRACTION OF ITS
    // INTENDED DARKNESS THAT HAS NOT YET BEEN ACCUMULATED at that point. By
    // drawing in order of importance, we make all areas approach their target
    // darkness AT THE SAME RATE."
    //
    // The load-bearing part is §3.2's ADAPTIVE BLUR: "the size INCREASING WITH
    // THE TARGET LIGHTNESS… THE DIAMETER OF THE BLURRING FILTER IS THE SAME AS
    // THE AVERAGE INTER-STROKE DISTANCE REQUIRED TO ACHIEVE THE TARGET
    // LIGHTNESS", i.e. w = 2h/t. Spacing is then an EMERGENT property of a
    // measurement kernel that is itself tone-dependent — no comb, no lattice, no
    // thresholds — and it is why this is the quality ceiling rather than another
    // placement rule. A stroke laid at spacing w contributes an area fraction
    // inkWidth/w, so smearing that constant over a disc of diameter w is exactly
    // the bookkeeping their blurred-line model performs.
    //
    // WHAT IS APPROXIMATED, NAMED. Their loop visits the GLOBAL argmax of
    // importance (through a quadtree) and re-evaluates after every stroke; this
    // emitter is a stream — `emitLine` is called once per ruling, by the family
    // builder, in spatial order — so the greedy runs in VISIT order against the
    // same grid. The kernel, the target and the termination rule are theirs; the
    // ordering is not, and that is the gap between this and their figure.
    const IMP_CELL = 0.8;      // mm
    const IMP_MIN = 0.02;      // ink-area units — never driven to zero (§3.1)
    const impGrid = new Map();
    const impKey = (x, y) => `${Math.round(x / IMP_CELL)},${Math.round(y / IMP_CELL)}`;
    const impRead = (x, y) => finite(impGrid.get(impKey(x, y)), 0);
    // 'errorDiffused' — the SAME target density, placed by 1-D error diffusion
    // instead of by a phase accumulator.
    //
    // A phase accumulator is already the degenerate case of error diffusion: one
    // tap, all of the residual carried to the very next ruling. That is what
    // makes it Sturmian — at a constant coverage the gaps are exactly
    // floor(1/c) and ceil(1/c), the most even a subset of an integer grid can
    // be, and also perfectly PERIODIC, which is what beats against a regular
    // form and against the raster. Splitting the carry two ways (2/3 to i+1, 1/3
    // to i+2) keeps the running error bounded — so the field is still locally
    // even by construction, and still exactly hits the requested density over
    // any long run — while destroying the period. No banding, no moiré, and no
    // guarantee that the gap set is two consecutive integers: that guarantee is
    // exactly what is being traded away, and the measured gap set shows it.
    const edState = new Map();
    const edKeeps = (key, cov, seed) => {
      const st = edState.get(key)
        || { e1: Number.isFinite(seed) ? seed - 0.5 : 0, e2: 0 };
      const v = clamp(finite(cov, 0), 0, 1) + st.e1;
      const keep = v >= 0.5;
      const err = v - (keep ? 1 : 0);
      edState.set(key, { e1: st.e2 + err * (2 / 3), e2: err * (1 / 3) });
      return keep;
    };
    const ladderKeeps = (key, cov, seed, lineIndex) => {
      if (TONE_ALGO === 'errorDiffused') return edKeeps(key, cov, seed);
      // ── THE NESTED SELECTOR, BACK FOR ITS RE-TEST ──────────────────────────
      // A rank threshold is NESTED by construction: rank(i) < c1 < c2 ⇒ the
      // ruling is kept at both coverages, so darkening only ever ADDS rulings
      // and never re-lays them. That is the invariant `29fb99f` traded away for
      // even gaps, and the three sources that name it (Rössl & Kobbelt §7, Praun
      // et al. §3, Winkenbach & Salesin's prioritized stroke texture) all name
      // it as THE anti-banding mechanism. It is paired here with a 64-level tone
      // axis (see `nestedCov`), which is the condition Webb et al. showed a
      // nested ladder needs and which the pre-`29fb99f` ladder never had.
      if (TONE_ALGO === 'nestedFineLadder') return vdc2(lineIndex) < clamp(finite(cov, 0), 0, 1);
      // 'strokesGrow' keeps the same nested rank, but a ruling enters slightly
      // BEFORE its rank is reached and leaves slightly after — as a growing
      // segment rather than as a whole line. `growLength` is the fraction of its
      // own span it draws; > 0 is "keep it".
      if (TONE_ALGO === 'strokesGrow') return growLength(cov, vdc2(lineIndex)) > 0.02;
      const prev = ladderPhase.has(key)
        ? ladderPhase.get(key)
        : (Number.isFinite(seed) ? seed : LADDER_PHASE0);
      const r = ladderStep(prev, cov);
      ladderPhase.set(key, r.phase);
      return r.keep;
    };
    // ── WEIGHT ALONG ONE RULING, AS ABUTTING PIECES ──────────────────────────
    // The output format carries one weight per path, so a ruling whose weight
    // varies is emitted as consecutive pieces that SHARE their endpoints: piece
    // k's last point IS piece k+1's first point (the same object), so the pen
    // never lifts between them and no piece ends in open surface. A cut only
    // opens where the quantized weight has moved AND the piece so far is already
    // at least MIN_MARK_MM long, and a trailing stub is folded back into its
    // neighbour rather than dropped — dropping it is the one thing this
    // construction may not do, because that would leave a hole in the ruling.
    const meanW = (wPts, a, b) => {
      if (!Array.isArray(wPts)) return 1;   // the deferred path has no wPts
      let s = 0; let n = 0;
      for (let i = a; i <= b; i++) { const v = Number(wPts[i]); if (Number.isFinite(v)) { s += v; n += 1; } }
      return n ? s / n : 1;
    };
    // V5 — a piece that straddles a pen change comes out of `meanW` at a width
    // no nib in the tray can draw. Snapping is what makes the claim "this plot
    // uses three pens" literally true of the output rather than nearly true.
    // `penTier` is recorded on the run so the harness can count pen changes and
    // per-pen travel; it is a diagnostic tag, exactly like `.fam`/`.lineIndex`.
    const penFinish = (pc) => {
      if (!isPenLaw()) return pc;
      const k = penSnap(pc.weightScale);
      pc.weightScale = penMul(k);
      pc.penTier = k;
      return pc;
    };
    const splitByWeight = (run, wPts, ttPts, fam) => {
      const n = run.length;
      if (n < 2) { run.weightScale = meanW(wPts, 0, n - 1); return [penFinish(run)]; }
      const lvl = (w) => Math.round(clamp(finite(w, 1), W_MIN, W_MAX) / W_LEVEL);
      const cuts = [];
      let acc = 0;
      let cur = lvl(wPts[0]);
      for (let i = 1; i < n; i++) {
        acc += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
        // `cur` is NOT advanced when the piece is still too short, so a slow
        // ramp still cuts — it just cuts once, two levels on, instead of never.
        if (lvl(wPts[i]) !== cur && acc >= MIN_MARK_MM) { cuts.push(i); acc = 0; cur = lvl(wPts[i]); }
      }
      if (cuts.length && acc < MIN_MARK_MM) cuts.pop();   // fold the trailing stub back
      if (!cuts.length) { run.weightScale = meanW(wPts, 0, n - 1); return [penFinish(run)]; }
      const bounds = [0].concat(cuts, [n - 1]);
      const pieces = [];
      for (let k = 0; k + 1 < bounds.length; k++) {
        const a = bounds[k]; const b = bounds[k + 1];
        const pc = run.slice(a, b + 1);   // shares the boundary POINT with its neighbour
        pc.fam = fam;
        pc.tt0 = ttPts[a]; pc.tt1 = ttPts[b];
        pc.weightScale = meanW(wPts, a, b);
        pieces.push(penFinish(pc));
      }
      return pieces;
    };

    // ═══ C3 — RIBBONIZE: THE VARIABLE-WIDTH STROKE, DRAWN WITH A REAL PEN ═════
    //
    // `splitByWeight` above answers "how do I ask for a fatter pen?" — it cannot
    // do better, because a path carries one width. Its answer quantises the width
    // to W_LEVEL buckets and refuses a piece shorter than MIN_MARK_MM, so a 3.5 mm
    // taper arrives as ~4 abutting capsules whose round caps bulge past their
    // narrower neighbours. That is the STAIRCASE (D1) and half of the PROTRUSION
    // (D2a), and no tuning of the bucket size fixes either: they are properties of
    // asking for a width instead of drawing one.
    //
    // So stop asking. Build the true variable-width ribbon OUTLINE from the
    // continuous width profile, clip it to the form, stroke that outline with the
    // REAL pen, and fill its interior at a pen-width pitch. Every path out of here
    // is at weightScale 1 — what the plotter draws IS what the screen shows, and
    // "expand into group" becomes correct by construction rather than by a
    // reconstruction step downstream.
    //
    // Bucket C (`isPenLaw()`) does NOT come here. A three-pen plot's entire claim
    // is that it uses three genuinely different nibs; flattening it to one pen
    // would destroy exactly the thing it exists to demonstrate.
    const RIBBON_OVERLAP = 0.15;     // PenFill's pitch = penWidth * (1 - overlap)
    const RIBBON_MAX_PATHS = 4096;   // a ceiling to NOTICE, never to silently apply
    // `degenerate` is the TOTAL of the three refusal buckets below it — one
    // number to assert on, three to debug with. Splitting them is not cosmetic:
    // the 2026-08-29 inert-ribbon blocker was 100% `clipEmpty`, and a single
    // lumped counter could not tell that from a genuinely sub-pen ribbon.
    const ribbonStat = {
      stretches: 0, wide: 0, narrow: 0, ribbons: 0, clipped: 0,
      outlines: 0, fills: 0, degenerate: 0,
      noRing: 0, clipEmpty: 0, erodeEmpty: 0,
      // A ribbon that got an OUTLINE but no interior fill. Not a refusal — the
      // outline ships and the stretch counts as a ribbon — but it IS the second
      // erosion coming back empty, and an erosion returning empty in silence is
      // exactly how the inert-ribbon blocker hid. Counted, never swallowed.
      outlineOnly: 0,
      noModule: 0, noRegion: 0, atMaxPaths: 0,
      // The 1-to-2-pen WALLS class (see `ribbonize`). `walls` counts stretches
      // that took it, `wallRings` the closed rings it shipped, `wallEmpty` the
      // ones whose clip came back empty and fell back to a centreline. NONE of
      // these is a refusal — a wall stretch is an inked ribbon, and a wall
      // stretch that degenerates is C3 rule 5 working, not an erosion failing.
      // They are kept out of `degenerate` deliberately: booking an intentional
      // centreline as `erodeEmpty` is what made the old `onePenDown` numbers lie.
      walls: 0, wallRings: 0, wallEmpty: 0, wallCentres: 0,
    };
    // Refuse a wide stretch and say WHY. Every `centrePass` fallback on a wide
    // stretch goes through here, so no refusal can be silent again.
    const ribbonRefuse = (why) => { ribbonStat[why] += 1; ribbonStat.degenerate += 1; };
    let ribbonWarned = false;

    // ── EROSION, NOT MITER OFFSET ────────────────────────────────────────────
    //
    // MEASURED, and the reason this is not `miterOffsetClosedRing`: an inward
    // MITER offset of a clipped ribbon SPIKES OUTWARD at every reflex vertex —
    // and a clipped ribbon is full of reflex vertices, because the clip is what
    // put them there. On the sphere fixture the miter version put 28 taperedEnds
    // vertices and 36 weightSmoothstep vertices OUTSIDE the silhouette, up to
    // 0.27 mm past it, with the clip itself working perfectly. That is defect D2
    // reintroduced one step AFTER the step that exists to prevent it.
    //
    // `insetMultiPolygon` is the primitive that is immune: it SUBTRACTS a band
    // of width 2·inset from the region instead of offsetting its boundary, so
    // the result is a subset of its input by construction, and it splits or
    // vanishes correctly where the ribbon is thinner than 2·inset. Its own
    // header block documents exactly this failure mode ("makes the offset curve
    // self-cross wildly … fabricates phantom lobes"). Chaining is documented as
    // sound, so the fill's deeper inset is taken from the outline's result.
    //
    // Returns a normalized multipolygon — [[shell, hole, …], …], points as
    // [x, y] pairs — or [] when the erosion consumed the ribbon.
    const erode = (mp, d) => {
      const GU = Vectura.GeometryUtils;
      if (!GU || typeof GU.insetMultiPolygon !== 'function') return [];
      try {
        const res = GU.insetMultiPolygon(mp, Math.abs(d), { minArea: 0 });
        return Array.isArray(res) ? res : [];
      } catch (err) { return []; }
    };
    // One multipolygon ring -> the {x,y} list the rest of this file speaks.
    const ringPts = (r) => {
      const pts = [];
      for (let i = 0; i < r.length; i++) {
        const q = r[i];
        const x = Array.isArray(q) ? q[0] : q.x;
        const y = Array.isArray(q) ? q[1] : q.y;
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
      }
      if (pts.length >= 2) {
        const f = pts[0]; const l = pts[pts.length - 1];
        if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) pts.pop();
      }
      return pts.length >= 3 ? pts : null;
    };
    const closePath = (ring, z) => {
      const p = ring.map((q) => ({ x: q.x, y: q.y, z }));
      p.push({ x: ring[0].x, y: ring[0].y, z });
      return p;
    };

    const ribbonize = (run, wPts, ttPts, fam, back) => {
      // Snapshot the two counters this call is not allowed to invert. `wide`
      // and `outlineOnly` are only ever touched together, in that order, by
      // the CLS_RIBBON branch below — `outlineOnly` cannot fire for a stretch
      // this very call did not also count as `wide`. That makes the relation
      // a property of ONE INVOCATION, not just of the lifetime totals, so it
      // is checked as a per-call DELTA: correct even when `ribbonize` is
      // re-entered on already-processed data (the deferred 'onePenDown' flush
      // at `flushDeferredRibbons`, which re-ribbonizes a chained/seam-joined
      // path after the fact — the one call site where stale or duplicated
      // width bookkeeping could otherwise slip past unnoticed).
      const wideBefore = ribbonStat.wide;
      const outlineOnlyBefore = ribbonStat.outlineOnly;
      const n = run.length;
      const tag = (path, t0, t1) => {
        path.fam = fam;
        path.tt0 = t0; path.tt1 = t1;
        path.weightScale = 1;
        return path;
      };
      // The DEGENERATE case, and the fallback for every refusal below: one real
      // pen pass down the centreline. Never a sub-pen stroke, never a gap
      // (C3 rule 5) — and never a protrusion, because the centreline's samples
      // were each proved front-facing before they joined the run.
      const centrePass = (a, b) => {
        const pc = run.slice(a, b + 1);
        return tag(pc, ttPts[a], ttPts[b]);
      };
      if (n < 2) return [tag(run, ttPts[0], ttPts[n - 1])];

      // ── WHOSE WIDTH PROFILE? `splitsAlongLine()` ALREADY ANSWERED THIS ──────
      //
      // Three of the twelve ribbon laws — 'weightModulated', 'weightSmoothstep'
      // and 'onePenDown' — are deliberately absent from `splitsAlongLine()`:
      // their width is ONE number for the whole run (the run mean, set in
      // `emitRun` immediately above), not a per-sample profile. `wPts` still
      // carries per-sample values for them, but those values are NOT their
      // width — reading them here would cut a law whose entire claim is that it
      // never cuts. 'onePenDown' measured this the hard way: driven off `wPts`
      // it fragmented from 9 continuous paths to 109, because every width
      // wobble broke the chart bridge that chains one ruling into the next.
      const perSample = splitsAlongLine();
      const runW = clamp(finite(run.weightScale, meanW(wPts, 0, n - 1)), W_MIN, W_MAX);
      const half = new Array(n);
      // `halfIn` is the DEFERRED path (see `deferRibbon` / `flushDeferredRibbons`):
      // a chained run's width profile is already resolved in millimetres, one
      // value per point, because it was assembled from several rulings that each
      // had their own single width. Everything below is identical either way.
      const halfIn = Array.isArray(run.__hw) ? run.__hw : null;
      let lastHalf = penWidth / 2;
      for (let i = 0; i < n; i++) {
        if (halfIn) {
          const h = Number(halfIn[i]);
          if (Number.isFinite(h) && h > 0) lastHalf = h;
          half[i] = lastHalf;
        } else {
          half[i] = penWidth * (perSample ? clamp(finite(wPts[i], 1), W_MIN, W_MAX) : runW) / 2;
        }
      }
      const HALF_MIN = penWidth / 2;
      // ── THREE WIDTH CLASSES, NOT TWO ────────────────────────────────────────
      //
      // MEASURED (sphere, pen 0.30 mm, 2026-08-30). The old split was binary —
      // "wider than 1.1 pen" got the boolean-eroded OUTLINE + PenFill, everything
      // else got a centreline. That put every ribbon between 1 and 2 pens onto a
      // path whose first step is `erode(region, pen/2)`, i.e. a boolean that has
      // to resolve two offset curves LESS THAN ONE PEN apart. It does not survive
      // that: a constant 1.58-pen weightSmoothstep ribbon eroded into THREE
      // fragments with a 4.59 mm² hole and 0.824 coverage; taperedEnds lost both
      // tapered ends outright (0.49 coverage) because below one pen the erosion
      // is legitimately empty and nothing was emitted in its place. Above two
      // pens the same code measured 0.9998. The erosion is not wrong — it is
      // being asked for a hairline.
      //
      // So classify by LOCAL width w = 2·half, in pen widths, and cut the stretch
      // at every class change:
      //
      //   w <= 1.0p   CENTRE  one centreline pass. C3 rule 5, verbatim: one pass
      //                       inks exactly one pen, so at or below a pen it is
      //                       already full coverage and a second pass would be a
      //                       duplicate.
      //   w <= 2.0p   WALLS   ONE closed ring built ANALYTICALLY at half - pen/2
      //                       (no boolean erosion at all) and clipped to the
      //                       pen-inset region. Stroked with the real pen its two
      //                       walls are (w - p) <= p apart, so their ink MEETS —
      //                       there is no interior void to fill, and the ring
      //                       covers exactly w by construction.
      //   else        RIBBON  today's clip + erode + PenFill, unchanged.
      //
      // The class boundaries are chosen from the stroke geometry, not by eye:
      // one pen pass inks exactly p, so below 1.1p a second wall would be a
      // coincident duplicate; two walls a distance d apart ink d + p, which is
      // gap-free exactly while d <= p, i.e. while w <= 2p.
      const W_CENTRE_PEN = 1.0;
      const W_WALLS_PEN = 2.0;
      // Keeps the analytic wall ring off the boolean's 1e-6 snap grid at the
      // bottom of the WALLS class, where half - pen/2 goes to zero.
      const WALL_FLOOR = penWidth * 0.05;
      const CLS_CENTRE = 0; const CLS_WALLS = 1; const CLS_RIBBON = 2;
      const classAt = (i) => {
        const wPen = (2 * half[i]) / penWidth;
        if (wPen <= W_CENTRE_PEN) return CLS_CENTRE;
        if (wPen <= W_WALLS_PEN) return CLS_WALLS;
        return CLS_RIBBON;
      };

      // Split into maximal same-class stretches, sharing the boundary POINT so
      // the pieces abut exactly (the same construction `splitByWeight` uses).
      const stretches = [];
      let s0 = 0; let cur = classAt(0);
      for (let i = 1; i < n; i++) {
        const c = classAt(i);
        if (c !== cur) { stretches.push({ a: s0, b: i, cls: cur }); s0 = i; cur = c; }
      }
      stretches.push({ a: s0, b: n - 1, cls: cur });
      const arcOf = (a, b) => {
        let L = 0;
        for (let i = a + 1; i <= b; i++) L += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
        return L;
      };
      // A stretch too short to be a mark is folded into a neighbour rather than
      // dropped — dropping it would leave a hole in the ruling. It may only be
      // folded into a NARROWER neighbour, never a wider one: folding a sub-pen
      // tail into a ribbon stretch is precisely what fed the erosion a hairline
      // and lost the tail (taperedEnds, 20 stretches at 0.49 coverage). A short
      // run with only wider neighbours keeps its own class and ships as a short
      // mark, which is invisible because it abuts its neighbours on both sides.
      const merged = [];
      stretches.forEach((st) => {
        const prev = merged[merged.length - 1];
        if (prev && prev.cls <= st.cls && arcOf(st.a, st.b) < MIN_MARK_MM) { prev.b = st.b; return; }
        merged.push(st);
      });

      const region = visibleRegionRings(!back);
      const RGm = Vectura.RibbonGeometry;
      const PFm = Vectura.PenFill;
      const haveModules = Boolean(RGm && typeof RGm.buildRibbonMultiPolygon === 'function'
        && typeof RGm.clipMultiPolygonToRegion === 'function'
        && PFm && typeof PFm.fillRegion === 'function');
      if (!haveModules) {
        ribbonStat.noModule += 1;
        if (!ribbonWarned && typeof console !== 'undefined' && console.warn) {
          ribbonWarned = true;
          console.warn('Vectura SurfaceFill: RibbonGeometry/PenFill unavailable — '
            + `ribbon law "${TONE_ALGO}" is drawing single-pen centrelines, not ribbons.`);
        }
      }

      const outp = [];
      merged.forEach((st) => {
        ribbonStat.stretches += 1;
        if (st.cls === CLS_CENTRE || !haveModules) {
          if (st.cls !== CLS_CENTRE) ribbonRefuse('noRing'); else ribbonStat.narrow += 1;
          outp.push(centrePass(st.a, st.b));
          return;
        }
        // ── WALLS — 1.1 to 2 pens wide, drawn WITHOUT a boolean erosion ───────
        //
        // The eroded ribbon of a ribbon IS a ribbon: erode(ribbon(c, h), d) is
        // ribbon(c, h - d) along the width axis. Building it analytically skips
        // the one operation that measured unreliable at these widths, and it
        // degrades correctly — as `half` approaches pen/2 the two walls converge
        // on the centreline instead of the erosion vanishing.
        //
        // The clip target is the region ALREADY PULLED IN by half a pen, so the
        // pen stroking this ring lands its outer edge exactly on the silhouette
        // and never past it. (The RIBBON class gets the same guarantee the other
        // way round: it erodes AFTER clipping to the raw region.)
        if (st.cls === CLS_WALLS) {
          ribbonStat.walls += 1;
          const inset = visibleRegionInsetRings(!back);
          if (!inset.length) {
            ribbonStat.noRegion += 1; outp.push(centrePass(st.a, st.b)); return;
          }
          const wc = []; const wh = [];
          for (let i = st.a; i <= st.b; i++) {
            wc.push({ x: run[i].x, y: run[i].y });
            // Clamped at pen/2: a short WIDER stretch folded in above may not
            // push its walls more than one pen apart, or their ink would part.
            wh.push(clamp(half[i] - penWidth / 2, WALL_FLOOR, penWidth / 2));
          }
          let wallMP = null;
          try {
            wallMP = RGm.buildRibbonMultiPolygon(wc, wh, { cap: 'butt', joinLimit: 4, minHalfWidth: WALL_FLOOR });
          } catch (err) { wallMP = null; }
          let wallClipped = null;
          if (Array.isArray(wallMP) && wallMP.length) {
            try { wallClipped = RGm.clipMultiPolygonToRegion(wallMP, inset); } catch (err) { wallClipped = null; }
          }
          const wt0 = ttPts[st.a]; const wt1 = ttPts[st.b];
          const wz = run[st.a] ? run[st.a].z : undefined;
          let wallAny = false;
          (Array.isArray(wallClipped) ? wallClipped : []).forEach((poly) => {
            (poly || []).forEach((r) => {
              const pts = Array.isArray(r) ? ringPts(r) : null;
              if (!pts) return;
              outp.push(tag(closePath(pts, wz), wt0, wt1));
              ribbonStat.wallRings += 1; wallAny = true;
            });
          });
          // A refused wall is NOT a defect and must not be booked as one: just
          // over one pen the honest output IS the centreline, and the counters
          // have to say "intentional centreline", not "erosion came back empty".
          if (!wallAny) { ribbonStat.wallEmpty += 1; outp.push(centrePass(st.a, st.b)); return; }
          // ── THE CENTRE COMPANION ────────────────────────────────────────────
          //
          // Two walls a distance d apart ink d + pen, so they cover the ribbon
          // for every d <= pen — but AT d = pen they merely abut, with no overlap
          // at all, and an abutting seam is not a covered seam: the boolean's
          // snap grid, its RDP escalation rungs and the renderer's own rasteriser
          // each move an edge by a hair, and a hair is all it takes to open a
          // lengthwise thread of bare paper down the middle of the band. That is
          // the same seating defect the fill erosion below is backed off for, one
          // class over. Once the walls are more than a `pitch` apart, put a pass
          // between them — three passes at half-pitch spacing instead of two at
          // touching distance.
          let widest = 0;
          for (let i = st.a; i <= st.b; i++) if (half[i] > widest) widest = half[i];
          if ((2 * widest - penWidth) > penWidth * (1 - RIBBON_OVERLAP)) {
            outp.push(centrePass(st.a, st.b));
            ribbonStat.wallCentres += 1;
          }
          return;
        }
        ribbonStat.wide += 1;
        const centre = []; const hw = [];
        for (let i = st.a; i <= st.b; i++) {
          centre.push({ x: run[i].x, y: run[i].y });
          hw.push(Math.max(half[i], HALF_MIN));
        }
        // A MULTIPOLYGON, not a ring. Where the centreline crosses itself the
        // swept region has a HOLE per loop — that area was never swept — and a
        // single ring cannot carry it. Taking the outline's largest shell here
        // is what filled the loop interiors solid and turned `onePenDown`,
        // `trochoidLoop`, `interlockWeave`, `weaveDepth` and `ampSpacing` into
        // slabs (measured: onePenDown mid-band 0.629 -> 0.147).
        let ribbonMP = null;
        try {
          ribbonMP = RGm.buildRibbonMultiPolygon(centre, hw, { cap: 'butt', joinLimit: 4, minHalfWidth: HALF_MIN });
        } catch (err) { ribbonMP = null; }
        if (!Array.isArray(ribbonMP) || !ribbonMP.length) {
          ribbonRefuse('noRing'); outp.push(centrePass(st.a, st.b)); return;
        }
        // ── THE CLIP. This is the step that kills D2. ─────────────────────────
        //
        // NO REGION, NO RIBBON. A ribbon is the one construction in this file
        // that puts ink where no sample was ever proved to be, so it may ship
        // only after it has been cut against the front test's own boundary. If
        // the region is unavailable the honest output is the CENTRELINE — every
        // point of which WAS proved on-surface — never an unclipped ribbon,
        // which is defect D2 restored in full. W1 made the same call inside
        // `clipMultiPolygonToRegion` (no boolean library ⇒ return [], not the ribbon).
        //
        // The clip is UNCONDITIONAL. An earlier version skipped it when every
        // ring VERTEX tested interior; that is only sound on a convex region,
        // because a segment between two interior vertices of a CONCAVE region
        // can still leave it — and "approximate clip" is precisely what the
        // plan forbids. The boolean is needed for the erosion below anyway, so
        // the saving was never worth the hole.
        if (!region.length) {
          ribbonStat.noRegion += 1; outp.push(centrePass(st.a, st.b)); return;
        }
        let clipped = null;
        try { clipped = RGm.clipMultiPolygonToRegion(ribbonMP, region); } catch (err) { clipped = null; }
        // W1 hands back polygons of [shell, ...holes]; keep that nesting all the
        // way into `insetMultiPolygon`. Flattening it into one polygon would put
        // a second shell in a hole slot and re-fill the loop interiors.
        const clippedMP = (Array.isArray(clipped) ? clipped : [])
          .map((poly) => (poly || [])
            .filter((r) => Array.isArray(r) && r.length >= 3)
            .map((r) => r.map((q) => [q.x, q.y])))
          .filter((poly) => poly.length);
        ribbonStat.clipped += 1;
        if (!clippedMP.length) { ribbonRefuse('clipEmpty'); outp.push(centrePass(st.a, st.b)); return; }
        const t0 = ttPts[st.a]; const t1 = ttPts[st.b];
        const z = run[st.a] ? run[st.a].z : undefined;
        let any = false;
        // OUTLINE — the ribbon eroded by HALF a pen, so a real pen stroking it
        // lands its OUTER edge exactly on the ribbon boundary.
        const outlineMP = erode(clippedMP, penWidth / 2);
        // FILL — deeper again, chained off the outline because
        // erode(R, a+b) === erode(erode(R, a), b) and two shallow cuts are much
        // cheaper than one deep one.
        //
        // THE DEPTH IS A PITCH, NOT A PEN RADIUS. Eroding by a further pen/2 put
        // the fill region's boundary exactly one pen in from the ribbon's, and
        // PenFill lays its first pass a pen RADIUS inside whatever region it is
        // given — so the outline's ink ([0, p] from the edge) and the first fill
        // pass ([p, 2p]) met with ZERO designed overlap, and every tolerance in
        // between them — the boolean's snap grid, its RDP escalation rungs, the
        // distance field's half-cell bias — could open that seam into a hairline
        // of bare paper running the LENGTH of the band. Measured on the torus
        // before this line changed: coverage 0.997-0.9994 with contiguous voids
        // up to 0.144 mm², i.e. ~0.05 x 3 mm streaks, in bands 3+ pens wide where
        // the erosion itself is perfectly healthy. That is a seating defect, not
        // the sub-pen erosion defect the WALLS class above fixes — two bugs.
        //
        // Backing the cut off by the overlap makes the outline the ladder's FIRST
        // pass: the next pass then sits one `pitch` (= penWidth · (1 - overlap))
        // further in, exactly like every pass after it, and the seam carries the
        // same 15% overlap as the rest of the fill.
        const fillMP = outlineMP.length
          ? erode(outlineMP, penWidth * (0.5 - RIBBON_OVERLAP)) : [];
        outlineMP.forEach((poly) => {
          poly.forEach((r) => {
            const pts = ringPts(r);
            if (!pts) return;
            outp.push(tag(closePath(pts, z), t0, t1));
            ribbonStat.outlines += 1; any = true;
          });
        });
        fillMP.forEach((poly) => {
          const regionRings = poly.map(ringPts).filter(Boolean);
          if (!regionRings.length) return;
          let res = null;
          try {
            res = PFm.fillRegion(regionRings, penWidth, STROKE_FILL_STYLE,
              { overlap: RIBBON_OVERLAP, axis: null, maxPaths: RIBBON_MAX_PATHS });
          } catch (err) { res = null; }
          const paths = (res && Array.isArray(res.paths)) ? res.paths : [];
          if (paths.length >= RIBBON_MAX_PATHS) ribbonStat.atMaxPaths += 1;
          paths.forEach((p) => {
            if (!Array.isArray(p) || p.length < 2) return;
            outp.push(tag(p.map((q) => ({ x: q.x, y: q.y, z })), t0, t1));
            ribbonStat.fills += 1; any = true;
          });
        });
        if (!any) { ribbonRefuse('erodeEmpty'); outp.push(centrePass(st.a, st.b)); return; }
        if (!fillMP.length) ribbonStat.outlineOnly += 1;
        ribbonStat.ribbons += 1;
      });

      // ── HARD ASSERT (C3 rule 6) ─────────────────────────────────────────────
      // The whole point of this function is that nothing downstream ever again
      // has to reconstruct a width from a multiplier. If that is ever untrue the
      // build is wrong and must say so, not quietly emit a fat-pen path again.
      for (let i = 0; i < outp.length; i++) {
        if (outp[i].weightScale !== 1) {
          throw new Error(`Vectura SurfaceFill.ribbonize: emitted weightScale ${outp[i].weightScale} `
            + `for law "${TONE_ALGO}" — every ribbon path must be a real single-pen stroke.`);
        }
      }
      // ── COUNTER INVARIANT (this call only) ──────────────────────────────────
      // `outlineOnly` books "a ribbon shipped without a fill" and is therefore a
      // SUBSET of `wide` ("a stretch reached the ribbon branch at all") by
      // construction — both are incremented once per CLS_RIBBON stretch, wide
      // first. A violation here means two different calls counted the same
      // geometry inconsistently (the deferred-flush re-ribbonize is the one
      // call site that revisits already-emitted data), which is exactly the
      // "outlineOnly > wide" failure that made these counters unusable for
      // judging. Fail loud rather than publish a number nobody can trust.
      const wideDelta = ribbonStat.wide - wideBefore;
      const outlineOnlyDelta = ribbonStat.outlineOnly - outlineOnlyBefore;
      if (outlineOnlyDelta > wideDelta) {
        throw new Error(`Vectura SurfaceFill.ribbonize: outlineOnly delta (${outlineOnlyDelta}) `
          + `exceeded wide delta (${wideDelta}) for law "${TONE_ALGO}" — the ribbon counters have `
          + 'gone inconsistent and can no longer be trusted.');
      }
      return outp.length ? outp : [centrePass(0, n - 1)];
    };

    // ── DEFERRED RIBBONIZATION — 'onePenDown' ONLY ────────────────────────────
    //
    // 'onePenDown' is a bucket-B ribbon law AND the one law whose entire claim
    // is continuity: it bridges ruling to ruling IN THE CHART so a whole form
    // comes off the plotter as a handful of pen-downs. Those two facts fight,
    // because the bridge (`wvChainOn`, below) can only chain a ruling that
    // emitted EXACTLY ONE path — and a ribbon emits an outline plus a fill.
    // Ribbonizing at `emitRun` therefore silences the bridge on every ruling:
    // measured 48 unchained rulings where the law's own fixture had 9 chains.
    //
    // So for this law the ribbon WAITS. `emitRun` ships the bare centreline
    // (weightScale 1 — it is a real pen line, never a fat-pen claim) carrying
    // its resolved half-width per point in `__hw`; the bridge chains those
    // centrelines exactly as it always did, appending the joined ruling's own
    // widths across the link; and `flushDeferredRibbons` ribbonizes the CHAINED
    // run at the end. One ribbon per chain, filled by one continuous stroke —
    // which is what "one pen down, at width" actually means.
    const deferRibbon = () => TONE_ALGO === 'onePenDown';
    const pendRibbon = (run, fam) => {
      const w = clamp(finite(run.weightScale, 1), W_MIN, W_MAX);
      const h = penWidth * w / 2;
      run.fam = fam;
      run.weightScale = 1;
      run.__hw = new Array(run.length).fill(h);
      return run;
    };
    // Extend a chained run's width profile across a bridge and on through the
    // ruling being joined. Called by the `wvChainOn` bridge, which is the only
    // stitcher that fires for this law. A ramp across the link rather than a
    // step: the bridge is real ink on the form and a width discontinuity there
    // is exactly the stairstep this whole effort removes.
    const extendPend = (chainRun, bridgeLen, joinRun) => {
      const hwA = chainRun && chainRun.__hw;
      const hwB = joinRun && joinRun.__hw;
      if (!Array.isArray(hwA) || !Array.isArray(hwB) || !hwB.length) return;
      const from = hwA.length ? hwA[hwA.length - 1] : hwB[0];
      const to = hwB[0];
      for (let k = 1; k <= bridgeLen; k++) hwA.push(from + (to - from) * (k / (bridgeLen + 1)));
      for (let i = 0; i < hwB.length; i++) hwA.push(hwB[i]);
    };
    // The end-of-build pass. Replaces every pending centreline in `out` with its
    // ribbon, in place, preserving the `back` / `lineIndex` tags the emitters
    // wrote. A run whose ribbon refuses stays exactly what it already is — a
    // real single-pen centreline — and is counted in `ribbonStat` like any other
    // refusal, so a silent degrade is still impossible.
    const flushDeferredRibbons = () => {
      if (!deferRibbon()) return;
      for (let i = out.length - 1; i >= 0; i--) {
        const pth = out[i];
        if (!pth || !Array.isArray(pth.__hw) || pth.length < 2) continue;
        const hw = pth.__hw;
        // A stitcher may have appended points without widths (none does for this
        // law today, but the seam join and the adjacent-pass stitch both exist
        // one scope away). Hold the last known width rather than dropping ink.
        while (hw.length < pth.length) hw.push(hw[hw.length - 1] || penWidth / 2);
        hw.length = pth.length;
        // A chained run spans many rulings, so its own tt0/tt1 (the FIRST
        // ruling's) is the only parameter span there is; hand every point the
        // interpolated value so the pieces keep a monotone span.
        const t0 = finite(pth.tt0, 0); const t1 = finite(pth.tt1, 1);
        const tt = new Array(pth.length);
        for (let k = 0; k < pth.length; k++) {
          tt[k] = pth.length > 1 ? t0 + (t1 - t0) * (k / (pth.length - 1)) : t0;
        }
        let pieces = null;
        try { pieces = ribbonize(pth, null, tt, pth.fam, Boolean(pth.back)); } catch (err) { pieces = null; }
        delete pth.__hw;
        if (!Array.isArray(pieces) || !pieces.length) continue;
        pieces.forEach((pc) => {
          if (pth.back) pc.back = true;
          if (pth.lineIndex != null) pc.lineIndex = pth.lineIndex;
          if (pth.loz) pc.loz = true;
        });
        out.splice(i, 1, ...pieces);
      }
    };
    // 'weightMultiPass' — the plotter-honest heavy line. Instead of asking for a
    // pen `w` times as wide, lay ROUND(w) real strokes of the actual pen, offset
    // perpendicular by one ink width and centred on the ruling. The piece itself
    // stays on the ruling and the extras sit alternately either side of it, so
    // the band grows symmetrically. Nothing ends anywhere new: every pass spans
    // exactly the parameter range of the piece it copies. Returned SEPARATELY
    // from the piece so the seam join still sees only the centre line.
    const extraPasses = (pc) => {
      const n = clamp(Math.round(finite(pc.weightScale, 1)), 1, MP_MAX);
      pc.weightScale = 1;
      if (n <= 1 || pc.length < 2) return [];
      // ── THE OFFSET HAS TO DIE BEFORE THE END OF THE PIECE ────────────────────
      //
      // Measured, and it is a HARD FAIL rather than a blemish: 'ampPasses' with
      // a plain constant offset put 41 MARKS OUTSIDE THE SILHOUETTE on
      // sphere·hatch and left a 13 mm free end. The reason is that this
      // displacement is made ON SCREEN and — unlike the Round 5/6 wave, which
      // displaces in the CHART and re-tests the sample for front-facing — it has
      // no way of knowing it has walked off the form. At a limb the ruling's
      // last sample is ON the silhouette, so ANY perpendicular offset there is
      // off the object.
      //
      // Tapering the offset to zero over PASS_TAPER_MM of each end fixes both
      // defects at once: the copy converges onto the piece it came from, so it
      // cannot cross the limb, and its endpoints land exactly on the original's,
      // so they register as abutting instead of as free ends. Arc length is
      // accumulated along the piece rather than counted in samples, because a
      // wave law's samples are not evenly spaced along the ruling.
      const PASS_TAPER_MM = 2.0;
      const tapered = TONE_ALGO === 'ampPasses';
      const arc = new Array(pc.length).fill(0);
      let arcTot = 0;
      for (let i = 1; i < pc.length; i++) {
        arcTot += Math.hypot(pc[i].x - pc[i - 1].x, pc[i].y - pc[i - 1].y);
        arc[i] = arcTot;
      }
      const endFrac = (i) => (tapered
        ? clamp(Math.min(arc[i], arcTot - arc[i]) / PASS_TAPER_MM, 0, 1) : 1);
      const outp = [];
      for (let j = 1; j < n; j++) {
        const d = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * inkWidth();
        const cp = pc.map((q, i) => {
          const p0 = pc[Math.max(0, i - 1)]; const p1 = pc[Math.min(pc.length - 1, i + 1)];
          const dx = p1.x - p0.x; const dy = p1.y - p0.y;
          const L = Math.hypot(dx, dy) || 1;
          const dd = d * endFrac(i);
          return { x: q.x + (-dy / L) * dd, y: q.y + (dx / L) * dd, z: q.z };
        });
        cp.fam = pc.fam; cp.tt0 = pc.tt0; cp.tt1 = pc.tt1; cp.weightScale = 1;
        outp.push(cp);
      }
      return outp;
    };
    const makeSink = (back, lineIndex, fam) => {
      let run = [];
      let runLen = 0;
      let gapPts = [];
      let gapLen = 0;
      let softStart = false;   // this run began after a dither drop, not at a boundary
      let sawSoftDrop = false;
      // Sweep parameter at the run's first and last sample, and every run this
      // sink pushed, in order. Read only by emitLine's seam join (below): a
      // ruling whose sweep is CLOSED and which came back as a tail + a head is
      // one stroke that happened to be cut at the parameter seam.
      let runTT0 = null;
      let runTT1 = null;
      // 'weightModulated' only. The geometry is uniform, so the tone has to
      // ride on the pen: this accumulates the run's own mean weight from the
      // samples that actually joined it, which is finer than a per-ruling
      // weight and is what lets a hatch line darken as it enters the shadow.
      let wSum = 0;
      let wCnt = 0;
      // Laws 12-16 (the weight laws) additionally keep the weight and the sweep
      // parameter PER POINT, parallel to `run`, which is what lets `splitByWeight`
      // cut the finished run into abutting pieces after every existing cull has
      // already had its say on the run as a whole.
      let wPts = [];
      let ttPts = [];
      let wPend = 1;
      // ROUND 5. Did this run come out of a DISSOLVED stretch of ruling — i.e.
      // is it a deliberate flick rather than a piece of a continuous line? The
      // free-end metric is not redefined by this; the tag simply lets the two
      // populations be counted apart, which is the honest way to report a mark
      // that is SUPPOSED to have two ends in open surface.
      let lozAny = false;
      const mine = [];
      // Is this run WHOLLY inside the centre light? `null` until the first
      // sample lands; latches false as soon as a non-L sample is added. Read
      // only by the L-zone speck exemption below.
      let runLit = null;
      const emitRun = (softEnd) => {
        // A mark bounded by the SURFACE at both ends is legitimate however short
        // (a ruling clipped by a narrow neck, or by the poles), so only a mark
        // the dither carved out of the MIDDLE of a ruling can be a speck. The
        // sub-pen-width floor applies to every run regardless — that one is a
        // pen-down dot, not tone, at any density.
        //
        // ...AND NOT IN THE CENTRE LIGHT. The cull's premise is "a mark this
        // short is chatter, not tone". That premise is zone-relative and it is
        // false in L: `formCeiling('L')` is the smallest non-zero ceiling in the
        // ladder and §5.4 #1 caps the zone's pitch at LIT_MAX_PITCH_PEN (12) x
        // pen, so the intended drawing there IS a scatter of short, widely
        // spaced marks — and SPECK_PEN is also 12, i.e. the cull's threshold and
        // the zone's own design pitch are the same number. Worth +0.003 of
        // D(L) on the binding ladder fixture (`V-E-bands4-sun45`), measured with
        // the proportional re-start margin in place.
        //
        // Tightest exemption that does the job: a run is exempt only if EVERY
        // sample in it classified as L. A run that so much as touches M, T, F, R
        // or H is culled exactly as before, so the limb/terminator chatter this
        // sink was built to remove is untouched. `MIN_MARK_MM` still applies in
        // L — a sub-pen-width fragment is a pen-down dot in any zone.
        const speck = STAGE.continuitySink && softStart && softEnd && runLen < SPECK_MM && runLit !== true;
        if (run.length >= 2 && runLen >= MIN_MARK_MM && !speck) {
          run.fam = fam;
          run.tt0 = runTT0; run.tt1 = runTT1;
          if (TONE_ALGO === 'weightModulated' && wCnt > 0) run.weightScale = wSum / wCnt;
          if (TONE_ALGO === 'weightSmoothstep' && wCnt > 0) run.weightScale = wDithered(wSum / wCnt, lineIndex);
          // 'onePenDown' takes the run mean for the same reason `weightModulated`
          // does: it never splits, so there is one width for the whole stroke.
          if (TONE_ALGO === 'onePenDown' && wCnt > 0) run.weightScale = wSum / wCnt;
          // ── C3 — THE EMISSION SWAP ────────────────────────────────────────
          //
          // Bucket B (`isRibbonLaw()`) leaves here as a real pen-width RIBBON.
          // Bucket C (`isPenLaw()`) and everything else goes down
          // `splitByWeight` UNCHANGED — that is not an oversight, it is the
          // three-pen laws' entire point.
          //
          // The gate is NOT `splitsAlongLine()`: three of the twelve ribbon
          // laws ('weightModulated', 'weightSmoothstep', 'onePenDown')
          // deliberately do not split, and all three set `run.weightScale`
          // from the run mean immediately above. They are ribbon laws too, and
          // gating on the split predicate would leave all three at a fat-pen
          // multiplier.
          const pieces = (isRibbonLaw() && wCnt > 0)
            ? (deferRibbon() ? [pendRibbon(run, fam)] : ribbonize(run, wPts, ttPts, fam, back))
            : ((splitsAlongLine() && wCnt > 0)
              ? splitByWeight(run, wPts, ttPts, fam)
              : [run]);
          pieces.forEach((pc) => {
            if (lozAny) pc.loz = true;
            mine.push(pc);
            // 'ampPasses' — TONE FROM PASS COUNT, at a constant wave. The pen
            // never widens and the spacing never moves; the shadow is built by
            // laying the SAME serpentine two, three, four times, offset by one
            // ink width. The count is an integer, so it quantises — the golden
            // dither on the ruling index is what stops the quantisation landing
            // on the same value for a whole band and reading as a contour.
            if (TONE_ALGO === 'ampPasses') pc.weightScale = wDithered(finite(pc.weightScale, 1), lineIndex);
            pushRun(pc, back, lineIndex);
            if (TONE_ALGO === 'weightMultiPass' || TONE_ALGO === 'ampPasses') {
              extraPasses(pc).forEach((xp) => pushRun(xp, back, lineIndex));
            }
          });
        }
        run = []; runLen = 0; softStart = false; runLit = null; lozAny = false;
        runTT0 = null; runTT1 = null; wSum = 0; wCnt = 0;
        wPts = []; ttPts = [];
      };
      return {
        emitted: () => mine,
        noteLoz: () => { lozAny = true; },
        flush: () => { emitRun(false); gapPts = []; gapLen = 0; sawSoftDrop = false; },
        softDrop: (pt) => {
          sawSoftDrop = true;
          if (!run.length) return;           // nothing open yet — a leading drop
          const prev = gapPts.length ? gapPts[gapPts.length - 1] : run[run.length - 1];
          gapLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
          gapPts.push(pt);
          if (gapLen > BRIDGE_MM) { emitRun(true); gapPts = []; gapLen = 0; }
        },
        noteW: (w) => { wSum += w; wCnt += 1; wPend = w; },
        addPt: (pt, zone, tt) => {
          runLit = (runLit === null) ? (zone === 'L') : (runLit && zone === 'L');
          if (!run.length) runTT0 = tt;
          runTT1 = tt;
          if (run.length && gapPts.length) {
            // Bridge. The skipped samples lie ON the surface, so re-adding them
            // keeps the ruling on the form instead of chording across it.
            gapPts.forEach((g) => {
              runLen += Math.hypot(g.x - run[run.length - 1].x, g.y - run[run.length - 1].y);
              run.push(g); wPts.push(wPend); ttPts.push(tt);
            });
          }
          gapPts = []; gapLen = 0;
          if (!run.length) softStart = sawSoftDrop;
          else runLen += Math.hypot(pt.x - run[run.length - 1].x, pt.y - run[run.length - 1].y);
          run.push(pt); wPts.push(wPend); ttPts.push(tt);
        },
      };
    };

    // ── THE DRAW/SKIP VERDICT IS A WHOLE-SPAN PROPERTY ───────────────────────
    // Measured on the Stage-1 (masterGrid + dither) emitter, 71 front rulings of
    // a lit sphere: `rank` is CONSTANT per ruling (71 rulings, 71 distinct
    // values) — it is the ruling's place in the bit-reversed permutation, a
    // whole-line quantity. The coverage it was compared against was
    // `coverageForSample(smp.I)`, a PER-SAMPLE function of surface intensity
    // that swings 0.35 (median) to 0.65 (max) along ONE ruling as a curved form
    // turns toward and away from the light. Comparing a per-line number against
    // a per-sample one is a category error, and it showed: 35 of 71 rulings
    // flipped verdict along their own length, and the deepest free end sat 47.6 %
    // of the sphere's radius inside the silhouette — a line stopping halfway
    // across open, unbroken, front-facing surface. `feather`, `coverageCap` and
    // `hysteresis` were all OFF, so this was never jitter.
    //
    // THE LAW (tests/unit/scene3d-fill-seam-continuity.test.js). On a lone convex
    // primitive a front ruling may end in exactly three places: the silhouette, a
    // chart pole, or nowhere (a closed ring). So the verdict is taken ONCE per
    // SPAN, where a span is a maximal run of consecutive samples that are (a) on
    // the wanted side of the surface and (b) in the same tone zone. Those two are
    // precisely the hard cuts the emitter already made — back-face culling and
    // the zone gate — so a span boundary is always a place a ruling was already
    // allowed to end, and a span interior never contains one.
    //
    // TONE IS NOT LOST. Dropping WHOLE rulings by rank is how this engine shades
    // (the file has said so since the ladder was written, and the seam tests
    // deliberately assert nothing about ink totals so that it stays free to). The
    // span's representative coverage is the MEAN over its own samples, so a
    // ruling that crosses mostly-dark surface still reads a high coverage and
    // draws, and one that crosses mostly-lit surface reads a low one and drops.
    // Taking the FIRST sample instead (a pure latch) was measured and rejected.
    // The first sample of a span sits ON the silhouette or the zone boundary,
    // where the intensity is extreme and unrepresentative of the span, so the
    // latch throws ink away: on one lit sphere, against the per-sample emitter,
    // the MEAN holds ink to within 3 % on every mapper (hatch -2.3 %, contour
    // -2.7 %, crosshatch -1.5 %, spiral -1.3 %) while the latch loses 12 % to
    // 42 % (contour 6533 -> 3790 mm). And it does not lose it evenly: the latch's
    // contour density read 0.140 / 0.126 / 0.066 / 0.222 / 0.421 across five bins
    // from the light, i.e. a hole in the middle of the form that is LIGHTER than
    // the lit end. Both stop the breaks; only one of them still draws the light.
    //
    // WHAT THIS COSTS, stated plainly. A ruling that runs FROM the light INTO the
    // shadow can no longer fade out along its own length — under the law it must
    // draw whole or not at all, so tone reads ACROSS the family, not along a
    // ruling. Where the light gradient runs along the rulings (a side-lit sphere
    // filled with contour rings) that removes an asymmetry the per-sample verdict
    // had: `scene3d-surface-fill`'s "the lit side thins" measures 0.033 where it
    // wants 0.114. It comes back with `toneZones` (Stage 2), which makes a zone
    // boundary a real span boundary — a ring crossing L -> M -> T -> F then takes
    // a verdict per zone, and ends where the surface genuinely changes, which is
    // the one mid-form end this design has always sanctioned.
    //
    // `valueAt(smp, index)` is the per-sample quantity the verdict reads;
    // `verdict(mean, midIndex, restarting, spanOrdinal)` returns true to DROP.
    // `spanOrdinal` is this span's position in the ruling (0 for the usual
    // single-span ruling); the ladder keys its phase on it so the k-th spans of
    // successive rulings — the pieces that actually neighbour each other on the
    // form — are spaced against each other and not against a different piece.
    // `restarting`
    // is true once this ruling has drawn a span AND dropped a later one — the
    // one-sided hysteresis margin (Stage 5) is charged there and nowhere else,
    // which is the same asymmetry it always had, moved to the scale the verdict
    // is now taken at. Returns one boolean per sample index, so the emit loop
    // stays a single pass.
    const spanDrops = (smps, zones, valueAt, verdict, wrap) => {
      const n = smps.length;
      const drop = new Array(n).fill(false);
      // Segment first, so a CLOSED sweep's two ends can be recognised as one
      // span before any verdict is taken.
      const spans = [];
      let s = 0;
      while (s < n) {
        if (!smps[s]) { s += 1; continue; }
        const z = zones ? zones[s] : null;
        let e = s;
        while (e + 1 < n && smps[e + 1] && (zones ? zones[e + 1] : null) === z) e += 1;
        spans.push([s, e]);
        s = e + 1;
      }
      // THE PARAMETER SEAM IS NOT A SPAN BOUNDARY. A closed sweep (a contour
      // ring: b = 1 IS b = 0) is handed to this loop as an array, so its two
      // ends arrive as the FIRST and LAST spans — but on the form they are one
      // continuous piece of surface with no boundary between them. Left apart
      // they took two verdicts, and where the two disagreed the ring stopped
      // dead on the wind meridian: measured 8.1 % of the radius inside the
      // silhouette on a lit sphere, on open front-facing surface. This is the
      // verdict-side statement of the same law `a5a8b63` fixed on the geometry
      // side, and it is decided the same way — the two ends are ONE point.
      if (wrap && spans.length > 1) {
        const first = spans[0];
        const last = spans[spans.length - 1];
        const sameZone = (zones ? zones[first[0]] : null) === (zones ? zones[last[0]] : null);
        if (first[0] === 0 && last[1] === n - 1 && sameZone) {
          spans.pop();
          spans[0] = [last[0], last[1], first[0], first[1]];   // tail + head, one span
        }
      }
      let drew = false;
      let stopped = false;
      spans.forEach((span, spanOrd) => {
        const idx = [];
        for (let i = 0; i < span.length; i += 2) {
          for (let k = span[i]; k <= span[i + 1]; k++) idx.push(k);
        }
        let sum = 0;
        idx.forEach((k) => { sum += valueAt(smps[k], k); });
        const d = verdict(sum / idx.length, idx[idx.length >> 1], drew && stopped, spanOrd);
        idx.forEach((k) => { drop[k] = d; });
        if (d) { if (drew) stopped = true; } else drew = true;
      });
      return drop;
    };

    // Emit one iso-line. `paramAt(tt)` walks the line through the (a,b)
    // parameter square. `threshold` is this line's ordered-dither cut (0..1) —
    // the sample draws only where the local shade (1 − I) meets it, so lines
    // vanish toward the lit highlight and pile up in shadow. `back` selects the
    // FAR side (camN.z < 0) instead of the visible front side, and tags the run.
    // The ladder's own selection is NOT a per-line number any more (see
    // `ladderStep`): the ruling's coverage is folded into its family's phase and
    // the verdict falls out of that, which is why there is no `ladderRank`
    // argument. `threshold` stays the geometric rank the legacy no-ladder
    // callers compare shade against. `zoneGate`, when set, restricts
    // the line to a single form zone: that is how the terminator's crossed
    // family is spent on T alone instead of being sprayed over the whole dark
    // band (O17 — Round 2 crossed ALL of band 0, at 0/90, and it read as wire mesh).
    // 'onePenDown' — the open end of the chain being built, in CHART
    // coordinates: `{ run, par, fam, back }`. One per buildObject call, so a new
    // object never inherits a previous one's open path.
    let wvChain = null;
    const emitLineOnce = (paramAt, threshold, back, lineIndex, count, zoneGate, pitchStep, lineDir, densityCross, adj) => {
      const wantFront = !back;
      // V5 — publish the ruling index for the three-pen laws' per-ruling pen
      // substitution (see `penDitherTier`). Inert under every other law.
      penLineIdx = Number(lineIndex) || 0;
      // Every ruling of one family shares one phase track (see ladderPhase).
      const ladderKey = currentFam;
      let hlRun = [];
      // The base channel goes through the shared run sink (see makeSink).
      const sink = makeSink(back, lineIndex, currentFam);
      // A hard cut ends the continuous span, so both trigger flags reset.
      const flush = () => { sink.flush(); };
      const softDrop = sink.softDrop;
      const addPt = sink.addPt;
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
      let sampleZone = null;
      // A family may ask for its own sample count (see angleFamily: a wrapped
      // helix is longer in the parameter square than an axis line, so it needs
      // proportionally more samples to stay on the form). Default is `steps`.
      // ...AND ROUND 5 TAKES THE CEILING, ALWAYS. A serpentine is only as wavy
      // as the polyline that carries it: at the default sample density a 62 mm
      // ruling gets ~60 samples, i.e. ~1 mm apart, and a 2.2 mm wavelength then
      // has TWO samples per period. The drawn path corner-cuts every crest, and
      // the elongation the tone arithmetic paid for never arrives — measured,
      // sphere·hatch delivered 1.13x arc length against the 1.48x the law had
      // already divided out of the pen, so the drawing came back a third too
      // light (5th-pct L* 66.8 against whiteBand's 51.4) with R² 0.031. At
      // MAX_LINE_STEPS the same ruling gets ~8 samples per period, which carries
      // a sine to within a per cent of its true length.
      // ...AND ROUND 6 LETS A LAW RAISE ITS OWN BUDGET. MAX_LINE_STEPS is 220,
      // i.e. about 0.28 mm between samples on a 62 mm ruling — which is exactly
      // the wavelength of `nestedOctaves`' third octave, and exactly why that
      // law's realised elongation (1.13x) fell a third short of the 1.8x its pen
      // had already been divided by. Any law that shortens its wavelength or
      // adds an octave states a bigger `steps` in the WV6 table and pays for it.
      const nSteps = (toneOn && isWaveLaw())
        ? (isWv6() ? Math.max(MAX_LINE_STEPS, wv6().steps) : MAX_LINE_STEPS)
        : Math.max(2, Math.min(MAX_LINE_STEPS,
          Number.isFinite(paramAt.steps) ? Math.round(paramAt.steps) : steps));

      // ── SAMPLE THE RULING ONCE, THEN DECIDE ONCE PER SPAN ────────────────────
      // Exactly the same sampleAt calls the emit loop used to make, hoisted so
      // the verdict can see the whole ruling before the first point is laid.
      // See `spanDrops` above for why the verdict has to be taken at this scale.
      const smps = new Array(nSteps + 1);
      const zones = new Array(nSteps + 1);
      // Geometric visibility, recorded BEFORE the zone gate nulls a sample: the
      // boundary refinement below is about where the SURFACE turns away, and a
      // zone edge is not that.
      const onSurf = new Array(nSteps + 1);
      // 'isophoteWidth' — ‖∇I‖ ON SCREEN, in intensity per millimetre. Two
      // independent chart displacements and their intensity differences
      // determine the gradient exactly (a 2×2 solve). It has to be SOLVED and
      // not averaged: the chart is not conformal, so the two parameter
      // directions are neither orthogonal nor equally scaled on screen.
      const gradIs = (toneOn && TONE_ALGO === 'isophoteWidth') ? new Array(nSteps + 1).fill(0) : null;
      const GRAD_H = 1 / 512;
      const gradIAt = (pr) => {
        const a0 = sampleAt(clamp(pr.a - GRAD_H, 0, 1), pr.b);
        const a1 = sampleAt(clamp(pr.a + GRAD_H, 0, 1), pr.b);
        const b0 = sampleAt(pr.a, clamp(pr.b - GRAD_H, 0, 1));
        const b1 = sampleAt(pr.a, clamp(pr.b + GRAD_H, 0, 1));
        if (!a0 || !a1 || !b0 || !b1) return 0;
        const ux = a1.x - a0.x; const uy = a1.y - a0.y;
        const du = finite(a1.I, 0) - finite(a0.I, 0);
        const vx = b1.x - b0.x; const vy = b1.y - b0.y;
        const dv = finite(b1.I, 0) - finite(b0.I, 0);
        const det = ux * vy - uy * vx;
        if (!(Math.abs(det) > 1e-12)) return 0;
        return Math.hypot((du * vy - dv * uy) / det, (ux * dv - vx * du) / det);
      };
      // Round 5 displaces a sample IN THE CHART, so it needs the chart
      // coordinate the sample came from, not just the point it produced.
      const prs = (toneOn && isWaveLaw()) ? new Array(nSteps + 1) : null;
      for (let s = 0; s <= nSteps; s++) {
        const pr = paramAt(s / nSteps);
        if (prs) prs[s] = pr;
        // A displaced adjacent pass (see `adjShift`) has NO parameter here when
        // its offset has carried it off the end of the chart's non-periodic
        // axis — the pass has left the surface, so there is nothing to sample
        // and nothing to draw. Treated exactly as a back-facing sample is.
        const smp = pr ? sampleAt(pr.a, pr.b) : null;
        const on = Boolean(smp && smp.front === wantFront);
        onSurf[s] = on;
        if (gradIs && on) gradIs[s] = gradIAt(pr);
        smps[s] = on ? smp : null;
        // The zone gate is a HARD cut, so a gated-out sample is not part of any
        // span; folding it in here keeps the span segmentation and the emit
        // loop's cut in step.
        if (on && toneOn) {
          const z = zoneOf(smp);
          // 'layeredCross' uses the zone ONLY as a gate. If the zone label
          // reached the span segmenter, family A — which is gated to nothing and
          // must run the whole form — would be cut into one span per zone and
          // could draw in the light and stop in the mid-tones, in open surface.
          // So the label a surviving sample carries is the GATE it passed, not
          // the zone it is in: one label per family ⇒ one span ⇒ one verdict.
          zones[s] = (TONE_ALGO === 'layeredCross') ? (zoneGate ? String(zoneGate) : null) : z;
          if (zoneGate && !gateAllows(zoneGate, z)) smps[s] = null;
        } else {
          zones[s] = null;
        }
      }
      // The composed coverage AT ONE SAMPLE — the exact arithmetic the per-sample
      // verdict used, factored out unchanged so the span verdict reads the same
      // number. `cap` and `myCeil` are Stage-3 (`coverageCap`) and are inert
      // while that flag is off; when it returns they vary continuously along a
      // ruling, and averaging them over the span is precisely what stops that
      // variation from cutting the ruling again.
      // The perpendicular gap between adjacent MASTER-GRID rulings at this
      // sample. Hoisted out of `covAtSample` because the weight laws need the
      // same number in the emit loop, where no coverage is being computed.
      // ── ARC LENGTH ALONG THIS RULING, AND THE DISTANCE TO ITS OWN END ───────
      //
      // Three laws need a quantity no single sample carries. `strokesGrow` grows
      // a black segment symmetrically about the ruling's darkest point, so it
      // needs the arc length. `forcedContrast` fabricates a Mach band a fixed
      // number of MILLIMETRES inside the silhouette, so it needs the distance to
      // the ruling's own end. `deepFillTSP` tapers its lateral excursion to zero
      // at that same end, so a displaced point cannot leave the surface.
      //
      // A run of consecutive on-surface samples is exactly the piece of ruling
      // bounded by the silhouette (or by a pole), so its two ends ARE the ends
      // the limb rule is about — the same segmentation `spanDrops` makes, minus
      // the zone split, which is not a silhouette.
      const needsArc = toneOn && (TONE_ALGO === 'strokesGrow'
        || TONE_ALGO === 'forcedContrast' || TONE_ALGO === 'deepFillTSP'
        // 'taperedEnds' needs the distance to the run's own end, in mm, to taper
        // the width into it — the same span segmentation the other three use.
        || TONE_ALGO === 'taperedEnds'
        // The adjacent-pass family: 'bundleDither' rides its level boundary on a
        // wave in arc length, and 'bundleLozenge' insets pass k by k steps from
        // the run's own two ends. Both are per-pass, so the arc is measured on
        // the PASS's own samples, not on the centre ruling's.
        || isAdjLaw()
        // ROUND 5 — every lozenge law places its marks by ARC LENGTH along the
        // ruling (a mark is a length, a period is a length, a capacity interval
        // is a length), so all ten need the same two arrays.
        || isLoz()
        // ROUND 6 — every mark law places by ARC LENGTH along the row (a period
        // is a length, a mark is a length, an ink debt is a length).
        || isMarkLaw()
        // Round 5 needs BOTH: `arcMM` is the wave's phase parameter (measured
        // from the run's own midpoint, so the crests form a field symmetric
        // about the form rather than about a chart seam), and `endMM` is what
        // tapers the amplitude to nothing before the silhouette.
        || isWaveLaw());
      let arcMM = null;
      let endMM = null;
      // Signed arc length FROM THE RUN'S OWN MIDPOINT. Round 5 phases every wave
      // on this rather than on `arcMM`, because arcMM restarts at 0 wherever the
      // silhouette cut the ruling and two neighbouring rulings are cut at
      // different places — phasing on it would drift the crests apart across the
      // family and destroy the nesting. Measured from the midpoint, the crests
      // form one coherent field, symmetric about the form.
      let midMM = null;
      if (needsArc) {
        arcMM = new Array(nSteps + 1).fill(0);
        endMM = new Array(nSteps + 1).fill(0);
        midMM = new Array(nSteps + 1).fill(0);
        let s0 = 0;
        while (s0 <= nSteps) {
          if (!smps[s0]) { s0 += 1; continue; }
          let s1 = s0;
          while (s1 + 1 <= nSteps && smps[s1 + 1]) s1 += 1;
          let acc = 0;
          arcMM[s0] = 0;
          for (let k = s0 + 1; k <= s1; k++) {
            acc += Math.hypot(smps[k].x - smps[k - 1].x, smps[k].y - smps[k - 1].y);
            arcMM[k] = acc;
          }
          for (let k = s0; k <= s1; k++) {
            endMM[k] = Math.min(arcMM[k], acc - arcMM[k]);
            midMM[k] = arcMM[k] - acc / 2;
          }
          s0 = s1 + 1;
        }
      }
      // ── THE RULING'S OWN DIRECTION, ON SCREEN ────────────────────────────────
      // 'nibAngle' only. The nib's mark width is a function of the angle between
      // the stroke and the nib's fixed axis, and that axis is fixed IN SCREEN
      // SPACE (it is the draughtsman's hand, not the chart's), so the stroke
      // direction has to be measured there too. Central difference over the
      // ruling's own on-surface samples; a lone sample with no on-surface
      // neighbour has no direction and takes the neutral factor.
      const thetas = (toneOn && TONE_ALGO === 'nibAngle') ? new Array(nSteps + 1).fill(NaN) : null;
      if (thetas) {
        for (let s = 0; s <= nSteps; s++) {
          if (!smps[s]) continue;
          const p = (s > 0 && smps[s - 1]) ? smps[s - 1] : smps[s];
          const q = (s < nSteps && smps[s + 1]) ? smps[s + 1] : smps[s];
          const dx = q.x - p.x; const dy = q.y - p.y;
          if (Math.hypot(dx, dy) > 1e-9) thetas[s] = Math.atan2(dy, dx);
        }
      }
      const pitchAtStep = (smp, s) => {
        const tt = s / nSteps;
        const stepHere = typeof pitchStep === 'function' ? pitchStep(tt) : pitchStep;
        const dirHere = typeof lineDir === 'function' ? lineDir(tt) : lineDir;
        return perpPitch(smp, stepHere, dirHere);
      };

      // ── ROUND 5 — THE WAVE, AND WHY IT IS MADE IN THE CHART ──────────────────
      //
      // The one hard requirement Jay stated for this round is that nothing may
      // fall outside the silhouette — "lines jutting out beyond the exterior of
      // the sphere" is a judged defect, and a wave's crest is the obvious risk.
      // The previous round's `deepFillTSP` displaced points ON SCREEN and then
      // fenced the excursion with `endMM`, which is a mitigation, not a proof.
      //
      // This one cannot leave the surface at all, because the displacement is
      // applied to the CHART COORDINATE and the displaced point is then SAMPLED:
      // `sampleAt(a + da, b + db)` returns a genuine point of the modelled
      // surface or nothing. The sample is re-tested for front-facing, and where
      // that test fails the amplitude is dropped to zero and the ruling runs
      // straight through — so the wave fades out as it approaches a limb instead
      // of crossing it. The requested displacement is stated in SCREEN
      // millimetres and pushed back through the sample's own frame (dA, dB), so
      // the amplitude is what the eye sees, correctly foreshortened, while the
      // point that gets drawn is still on the form.
      //
      // Three further guards, in order of who binds first:
      //   - `endMM` tapers the amplitude to nothing over WV_TAPER_MM of the
      //     run's own end, so the wave dies BEFORE the silhouette;
      //   - the anti-phase laws cap the amplitude at the clearance the plot
      //     floor allows (see WV_CLEAR_FLOOR), which is the "minimum open space"
      //     number the report asks for;
      //   - `wvElongCap` caps the elongation any law may CLAIM at the point
      //     where the wave's own limbs reach the plot floor, so the tone
      //     arithmetic can never promise ink the paper will not take.
      //
      // Tangents, arc length, radiance and the phase are all read from the
      // UNDISPLACED ruling (`base`), so the wave is a function of the form and
      // not of itself — a self-referential frame would let the excursion
      // compound along the ruling and walk off.
      const wvElongs = (toneOn && isWaveLaw()) ? new Array(nSteps + 1).fill(1) : null;
      const wvChainOn = Boolean(toneOn && TONE_ALGO === 'onePenDown');
      let wvStartS = null;
      let wvEndS = null;
      // THE TONE IS READ OFF THE UNDISPLACED RULING. Measured the other way
      // first, and it is a trap: with the width taken at the DISPLACED point,
      // an amplitude of 1.4 mm across a sphere's terminator swings the radiance
      // at the wave's own frequency, the pen pulses thick/thin twice per
      // wavelength, and the drawing stops tracking the light — sphere·hatch came
      // back with R² 0.032, a 2.71x weight step between abutting pieces and
      // 10.1 L* of moiré. The wave is a TEXTURE; the tone is a function of the
      // form. Keeping the two apart is what makes the pair legible.
      const wvBase = wvElongs ? smps.slice() : null;
      if (wvElongs) {
        sfcErr = 0;
        const base = wvBase;
        const linePh = wvLinePhase(lineIndex);
        const wrap01 = (v) => { const w = v % 1; return w < 0 ? w + 1 : w; };
        for (let s = 0; s <= nSteps; s++) {
          const smp = base[s];
          if (!smp || !prs[s]) continue;
          const I = clamp(finite(smp.I, 0), 0, 1);
          wvDepthAt(I);
          const lam = wvLambda(I);
          const lp = pitchAtStep(smp, s);
          if (!(Number.isFinite(lp) && lp > 1e-6)) continue;
          const cov = clamp(weightCovEff(I, lp), 1e-6, 1);
          const drawn = lp / cov;              // millimetres between DRAWN rulings
          let f = wvAmpAsk(I);
          // 'interlockWeave' — the crest points into the neighbour's trough, so
          // the closest approach is drawn − 2A and the plot floor owns the cap.
          // 'tourScribble' deliberately goes PAST it: that is what makes it an
          // overdraw and not a weave, and the flooding is measured, not hidden.
          if (TONE_ALGO === 'interlockWeave') {
            const fMax = 0.5 * (1 - clamp((WV_CLEAR_FLOOR * floorPitch) / drawn, 0, 1));
            f = Math.min(f, Math.max(0, fMax));
          }
          // ROUND 6 — THE CLEARANCE IS THE DESIGN VARIABLE, PERPENDICULAR TO THE
          // STROKE. 'perp' laws SOLVE the share from the eased target and then
          // clamp it back into [aFlo, aMax], so the clearance ramps smoothly and
          // the wave still cannot straighten. The 'ramp' laws take the radiance
          // ramp and are merely CAPPED at the floor — which, for the in-phase
          // ones, never binds, because lam/(2·pi·f) is already under the pitch.
          let floorBound = false;
          if (isWv6() && wv6().amp === 'perp') {
            f = clamp(wv6ShareFor(wv6TargetClear(I, drawn, lam), drawn, lam),
              wv6().aFlo, wv6().aMax);
          }
          f *= clamp((endMM[s] || 0) / WV_TAPER_MM, 0, 1);
          let amp = f * drawn;
          if (isWv6()) {
            // THE THREE BOUNDS, IN THE ORDER THEY OUTRANK EACH OTHER.
            //   1. the texture scale — a crest is a fixed size on the paper;
            //   2. the texture FLOOR — but only as far as the band has room for
            //      it, so a wave can never be floored INTO its neighbour;
            //   3. the clearance floor — which outranks both, because two
            //      strokes closer than a plot floor are one wet stroke. Where it
            //      binds the excursion is cut and the event is COUNTED, never
            //      hidden. It binds in the DARKS, where the spacing has already
            //      closed; the LIGHT — the side Jay is judging — has room to
            //      spare and keeps its full wave.
            const taper = clamp((endMM[s] || 0) / WV_TAPER_MM, 0, 1);
            amp = Math.min(amp, WV6_AMP_MAX_MM * taper);
            amp = Math.max(amp, Math.min(WV6_AMP_MIN_MM * taper, 0.42 * drawn * taper));
            const ampClear = drawn * wv6ShareFor(wv6ClearFloorMM(), drawn, lam);
            if (amp > ampClear) { amp = Math.max(0, ampClear); floorBound = true; }
            f = drawn > 1e-6 ? amp / drawn : 0;
          }
          const e = wvElong(amp, lam);
          wvElongs[s] = e;
          const anti = TONE_ALGO === 'interlockWeave' || TONE_ALGO === 'tourScribble';
          // The clearance is recorded the way it is DESIGNED — across the
          // stroke — so the number in the report and the number in the solve are
          // the same quantity. Round 5 recorded `drawn` for the in-phase laws,
          // which is the vertical offset and overstates the open space by the
          // elongation factor; that is the error being corrected.
          const clear = isWv6() ? wv6ClearAt(drawn, lam, f)
            : (anti ? drawn - 2 * amp : drawn);
          if (floorBound) waveStat.floorBound += 1;
          if (I >= 0.55) {
            waveStat.litSamples += 1;
            waveStat.litAmpSum += amp;
            waveStat.litClearSum += clear;
            if (clear < waveStat.litClearMin) waveStat.litClearMin = clear;
          }
          waveStat.samples += 1;
          waveStat.ampSum += amp;
          if (amp < waveStat.ampMin) waveStat.ampMin = amp;
          if (amp > waveStat.ampMax) waveStat.ampMax = amp;
          waveStat.elongSum += e;
          if (e < waveStat.elongMin) waveStat.elongMin = e;
          if (e > waveStat.elongMax) waveStat.elongMax = e;
          if (lam < waveStat.lambdaMin) waveStat.lambdaMin = lam;
          if (lam > waveStat.lambdaMax) waveStat.lambdaMax = lam;
          if (clear < waveStat.clearMin) waveStat.clearMin = clear;
          if (I <= 0.15) {
            waveStat.darkSamples += 1;
            waveStat.darkAmpSum += amp;
            waveStat.darkClearSum += clear;
            if (clear < waveStat.darkClearMin) waveStat.darkClearMin = clear;
          }
          if (!(amp > 1e-4)) continue;
          const ph = (2 * Math.PI * (midMM[s] || 0)) / lam + linePh;
          const wf = wvForm(ph);
          const p1 = base[Math.min(nSteps, s + 1)] || smp;
          const p0 = base[Math.max(0, s - 1)] || smp;
          let tx = p1.x - p0.x; let ty = p1.y - p0.y;
          const tl = Math.hypot(tx, ty);
          if (!(tl > 1e-9)) continue;
          tx /= tl; ty /= tl;
          const vx = (-ty) * amp * wf.n + tx * amp * wf.t;
          const vy = tx * amp * wf.n + ty * amp * wf.t;
          if (!smp.dA || !smp.dB) continue;
          const det = smp.dA.x * smp.dB.y - smp.dA.y * smp.dB.x;
          if (!(Math.abs(det) > 1e-12)) continue;
          const da = (vx * smp.dB.y - vy * smp.dB.x) / det;
          const db = (smp.dA.x * vy - smp.dA.y * vx) / det;
          const pa = clamp(prs[s].a + da, 0, 1);
          const pb = wrap01(prs[s].b + db);
          const cand = sampleAt(pa, pb);
          if (!cand || cand.front !== wantFront) { waveStat.offSurface += 1; wvElongs[s] = 1; continue; }
          smps[s] = cand;
          prs[s] = { a: pa, b: pb };
        }
        // ── THE ELONGATION THE POLYLINE ACTUALLY DELIVERED ────────────────────
        // The tone arithmetic has already DIVIDED the pen's ask by the modelled
        // elongation, so if the drawn path is shorter than the model the drawing
        // comes back light by exactly that ratio — which is how `nestedOctaves`
        // and `hilbertDepth` lost a third of their ink (model 1.8x, polyline
        // 1.13x, because the third octave's wavelength WAS the sample spacing).
        // Both lengths are summed over the same span of the same ruling, so the
        // ratio is directly comparable with `elongMean` and any law that shortens
        // its wavelength is caught here rather than in the picture.
        for (let s = 1; s <= nSteps; s++) {
          const a0 = smps[s - 1]; const a1 = smps[s];
          const b0 = base[s - 1]; const b1 = base[s];
          if (!a0 || !a1 || !b0 || !b1) continue;
          waveStat.realLen += Math.hypot(a1.x - a0.x, a1.y - a0.y);
          waveStat.baseLen += Math.hypot(b1.x - b0.x, b1.y - b0.y);
        }
      }
      // ── WHERE THE STROKE IS NOT ON THE PAPER, AND EXACTLY WHERE IT LEAVES ──
      //
      // Two laws cut a run short, for opposite reasons, and both need the cut to
      // land MID-SEGMENT rather than at whichever sample happened to be next.
      //
      //   'signedWidth'        Zander et al. §4.3. The width is signed; where it
      //                        crosses zero the stroke has retracted, and the end
      //                        is at the crossing — "this decouples the visual
      //                        occurrence of a line end from the positions of the
      //                        individual stroke vertices".
      //   'transverseReserve'  Bewick's cross-ruling. The white is cut
      //                        SYMMETRICALLY about a fixed sweep parameter on
      //                        every ruling — the gate is |frac(tt/T) − ½| ≥ d/2
      //                        — so its centre does not move as its width does,
      //                        and the reserves line up across the family into a
      //                        coherent transverse white line. That alignment is
      //                        the whole mechanism; without it these are just
      //                        broken rulings.
      //
      // Both are computed once, before any ink is laid, so the crossing points
      // are available to the emit loop as ordinary samples.
      let offPaper = null;
      let exitPt = null;
      let entryPt = null;
      //
      //   the adjacent-pass family  Pass k of a bundle is on the paper only
      //                        where the tone asks for at least k + 1 passes.
      //                        Pass 0 is the ruling itself and its value can
      //                        never go negative, so a ruling is never lost;
      //                        every pass ABOVE it enters and leaves mid-ruling,
      //                        at the crossing, which is what makes the bundle's
      //                        width vary ALONG the stroke without the nib
      //                        varying at all.
      const adjGate = Boolean(toneOn && adj && (adj.k > 0 || adj.endInset > 0));
      // V5 — two of the three-pen laws cut along the ruling as well:
      //   'penStipple' shortens the FINE nib's marks in the highlight fade
      //     (hatch → stipple, the move the perceptual work says is free), and
      //   'penReserve' cuts Bewick's transverse whites across the BROAD ground.
      // Both reuse the machinery below verbatim; only `vals[s]` differs.
      const penGate = toneOn && (TONE_ALGO === 'penStipple' || TONE_ALGO === 'penReserve');
      // MERGE (v5): the adjacent-pass gate and the three-pen gate are BOTH live
      // here — PEN_LAWS and ADJ_LAWS are disjoint, so neither can shadow the
      // other and the machinery below serves all four callers.
      if (toneOn && (TONE_ALGO === 'signedWidth' || TONE_ALGO === 'transverseReserve' || adjGate || penGate)) {
        offPaper = new Array(nSteps + 1).fill(false);
        exitPt = new Array(nSteps + 1).fill(null);
        entryPt = new Array(nSteps + 1).fill(null);
        const vals = new Array(nSteps + 1).fill(0);
        for (let s = 0; s <= nSteps; s++) {
          const smp = smps[s];
          if (!smp) continue;
          const I = clamp(finite(smp.I, 0), 0, 1);
          if (penGate) {
            const p = pitchAtStep(smp, s);
            const A = penTarget(I);
            if (TONE_ALGO === 'penStipple') {
              // Only the FINE tier stipples. Where the medium or broad nib is in
              // the holder the ruling is continuous, so `vals` stays positive.
              penLineIdx = Number(lineIndex) || 0;
              const tier = penDitherTier(penTierU(A));
              if (tier !== 0) { vals[s] = 1; offPaper[s] = false; continue; }
              const u = ((((s / nSteps) / PSTIP_PERIOD) % 1) + 1) % 1;
              vals[s] = pstipDuty(A, p) / 2 - Math.abs(u - 0.5);
            } else {
              // 'penReserve' — the white is cut at a FIXED sweep parameter on
              // every ruling, which is what makes the reserves line up into a
              // coherent transverse cross-ruling instead of a broken hatch. The
              // FINE detail family (layer 1) is never cut.
              const d = (xfLayer === 1) ? 0 : presDuty(A);
              const u = ((((s / nSteps) / PRES_PERIOD) % 1) + 1) % 1;
              vals[s] = Math.abs(u - 0.5) - d / 2;
            }
            offPaper[s] = !(vals[s] >= 0);
            continue;
          }
          if (adjGate) {
            // The whole-ruling laws already fixed N for the ruling, so their
            // passes are unconditional along it; only the end inset can cut one.
            const ask = adj.whole != null ? adj.whole : adjAskN(I, pitchAtStep(smp, s));
            const v = ask - adjThreshold(adj.k, lineIndex, arcMM ? arcMM[s] : 0);
            const inset = adj.endInset > 0 && endMM
              ? (endMM[s] - adj.endInset) : Infinity;
            vals[s] = Math.min(adj.whole != null ? 1 : v, inset);
            if (adj.floods && vals[s] >= 0) adjStat.floodSamples += 1;
            if (adj.k > 0) adjStat.samples += 1;
          } else if (TONE_ALGO === 'signedWidth') {
            vals[s] = swAsk(I, pitchAtStep(smp, s)) - SW_CUT;
          } else {
            const u = ((((s / nSteps) / TR_TT_PERIOD) % 1) + 1) % 1;
            vals[s] = Math.abs(u - 0.5) - trDuty(I) / 2;
          }
          offPaper[s] = !(vals[s] >= 0);
        }
        const crossAt = (on, off) => {
          const d = vals[on] - vals[off];
          const f = Math.abs(d) > 1e-12 ? clamp(vals[on] / d, 0, 1) : 0;
          return {
            x: smps[on].x + (smps[off].x - smps[on].x) * f,
            y: smps[on].y + (smps[off].y - smps[on].y) * f,
            z: smps[on].z + (smps[off].z - smps[on].z) * f,
          };
        };
        for (let s = 1; s <= nSteps; s++) {
          if (!smps[s] || !smps[s - 1]) continue;
          if (offPaper[s] && !offPaper[s - 1]) exitPt[s] = crossAt(s - 1, s);
          else if (!offPaper[s] && offPaper[s - 1]) entryPt[s] = crossAt(s, s - 1);
        }
      }
      const covAtSample = (smp, s, zone) => {
        // THE LOCAL PITCH IS MEASURED FIRST. Laws 6-10 are stated in APPARENT
        // AREA, not in coverage, so they need the pitch that actually lands here
        // in order to say what coverage buys that area (see `covForArea`). The
        // hoist is pure — `localPitch` never depended on `cov` — and `ladder`
        // and laws 1-5 read exactly the value they always did.
        //
        // `pitchStep` / `lineDir` are constants for a straight parameter-
        // space family and FUNCTIONS OF tt for the screen-frame crossed
        // family, whose direction — and therefore whose neighbour offset —
        // varies along the line. Everything downstream is unchanged.
        const localPitch = pitchAtStep(smp, s);
        // The four alternatives own the coverage outright. They never route
        // through `zoneCoverage`: under 'layeredCross' the zone label is a gate
        // name ('X1,X2'), not a FORM_INK row, and asking Regions for its ink
        // would be a category error. `ladder` takes the branch it always took.
        let cov = (TONE_ALGO !== 'ladder')
          ? algoCoverage(smp.I, Boolean(zoneGate), smp, localPitch)
          : (zone
            ? zoneCoverage(zone, Boolean(zoneGate), densityCross === true, smp)
            : coverageForSample(smp.I));
        // 'forcedContrast' — THE UNDERCUT. Hertzmann & Zorin §6.3: the strip on
        // the far side of an overlap gets EXTRA-dense cross-hatching. Here the
        // overlap is the silhouette itself and "far side" is the dark limb, so
        // the last FC_MACH_MM of a ruling that ends in shadow is driven denser
        // than the radiance asks. Its partner — the bright halo on the LIT limb
        // — is a blank, so it is spent in `hardCut` below and not here.
        if (TONE_ALGO === 'forcedContrast' && endMM
          && endMM[s] < FC_MACH_MM && clamp(finite(smp.I, 0), 0, 1) < FC_LIMB_I) {
          cov = clamp(cov * FC_UNDERCUT, 0, 1);
        }
        // ── THE ONE PHYSICAL LIMIT LEFT IN UNCAPPED MODE ──────────────────────
        // Budget off, floor on. `HL_STAGE.coverageCap` is a different law (a
        // composed DARKNESS ceiling, `myCeil`) and stays off; this is the craft
        // rule and nothing else — a family may not rule closer than
        // `PLOT_FLOOR_PEN x pen`, measured where the geometry actually crowds.
        // Counted, because "where does the floor bind" is now the only question
        // standing between the law and the lighting.
        // 'evenStreamlines' enforces the floor ON SCREEN, per curve, at the
        // point two curves actually approach each other — which is stricter
        // than a cap derived from a nominal neighbour offset the re-seeded
        // family no longer has. Charging both would drop curves the placement
        // rule already proved plot-safe.
        // The `contField*` family is exempt for the same reason `evenStreamlines`
        // is, and for one more: this cap turns crowding into a DROPPED RULING,
        // which is precisely the quantised step those laws exist to remove. They
        // enforce their own floor where it belongs — at PLACEMENT, on the gap
        // itself — and `cfStat` counts every ruling that landed on it.
        if (TONE_UNCAPPED && TONE_ALGO !== 'evenStreamlines' && !isContField()
          && localPitch != null && localPitch > 1e-6 && floorPitch > 1e-6) {
          // The adjacent-pass family draws every STRIDE-th ruling of the master
          // grid, so the gap between two rulings it actually plots is
          // `stride x localPitch`. Charging the floor on the master pitch would
          // condemn a family that is three master steps apart for crowding it
          // never does — and would drop rulings out of a grid whose whole point
          // is that its gaps are all equal.
          const capF = clamp((localPitch * (isAdjLaw() ? adjStride() : 1)) / floorPitch, 0, 1);
          const rk = `${ladderKey}|${lineIndex}`;
          floorStat.samples += 1;
          floorStat.touched.add(rk);
          if (cov > capF + 1e-9) {
            floorStat.clamped += 1;
            floorStat.rulings.add(rk);
            if (capF > 1e-9 && cov / capF > floorStat.worst) floorStat.worst = cov / capF;
            cov = capF;
          }
        }
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
        if (STAGE.coverageCap && localPitch != null) {
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
        if (STAGE.coverageCap && zone && localPitch != null && localPitch > 1e-6) {
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
        return covCapped;
      };
      // ── A RULING ENDS ON THE BOUNDARY, NOT ONE SAMPLE SHORT OF IT ───────────
      //
      // The span verdict says WHETHER a ruling draws; this says WHERE it stops.
      // The emit loop keeps the samples whose camera-space normal faces the
      // camera and cuts at the first one that does not, so a ruling ends at the
      // last sample that happened to test front-facing — up to one whole sample
      // step inside the silhouette.
      //
      // On a SMOOTH chart that costs nothing: `nz` decays to zero AT the
      // silhouette, so the last front sample already sits a fraction of a
      // millimetre from it (sphere, ellipsoid, cylinder, cone, capsule and
      // superellipsoid all measured 0.00 mm on the app-default scene). On a
      // chart with CREASES `nz` jumps, and the whole sample step is lost: the
      // shipped pyramid (`detail: 8`, so a 45° wrapped ruling is sampled every
      // 3.4 mm) ended its rulings 3.43 mm (hatch/crosshatch) and 4.85 mm
      // (contour) inside open front-facing surface — a bare wedge along both
      // lower slant edges. The thin-tube charts lose the same step at their own
      // scale: torus 0.96-1.99 mm and torusKnot 1.06-1.25 mm on a tube whose
      // radius is only 2.24 mm / 1.20 mm.
      //
      // So the crossing is BISECTED. `edgeAt` returns the last point that is
      // still on the wanted side, to within 1/4096 of a sample step. It can
      // only ever extend a run onto surface the emitter already proved visible
      // — it never relaxes the front test, never bridges a gap, and never adds
      // a point where there was no adjacent off-surface sample to refine
      // against, so a ruling that was already flush with the silhouette is
      // untouched.
      const EDGE_BISECT = 12;
      const edgeAt = (sIn, sOut) => {
        let lo = sIn / nSteps; let hi = sOut / nSteps; let best = null;
        for (let k = 0; k < EDGE_BISECT; k++) {
          const mid = (lo + hi) / 2;
          const pr = paramAt(mid);
          const smp = pr ? sampleAt(pr.a, pr.b) : null;
          if (smp && smp.front === wantFront) { lo = mid; best = smp; } else hi = mid;
        }
        return best ? { x: best.x, y: best.y, z: best.z } : null;
      };
      // Is this sweep CLOSED? Exactly the test the seam join below uses: the two
      // ends land on the same point, which is what "closed" means. A ring's
      // first and last spans are therefore one span, not two.
      const closedSweep = Boolean(smps[0] && smps[nSteps]
        && Math.hypot(smps[0].x - smps[nSteps].x, smps[0].y - smps[nSteps].y) < SEAM_JOIN_MM);
      // ── THE CENTRE LIGHT'S PITCH BAR, CHARGED ONCE PER SPAN ─────────────────
      // §5.4 #1 / O6: the lit band must still carry ink, because a highlight is
      // defined by the ink AROUND it and a surround ruling at 17 × pen has none.
      // The emitter states that bar in millimetres — `litMaxPitchPen() × pen` —
      // and `litFloorCov` is the coverage that buys exactly that pitch off the
      // master grid. `zoneCoverage` charges it; `coverageForSample` cannot,
      // because it is per-sample and the verdict is per-span.
      //
      // Since HL_STAGE Stage 0 turned `toneZones` off, `zoneOf` returns null for
      // every sample, so the whole object runs on the ladder path — and the bar
      // went with the zones. Measured on the app-default scene (sphere r 25,
      // detail 28, pen 0.3, Density 50, hatch): masterPitch 1.491 mm, so the
      // ladder's top rung (coverage 0.20) rules the centre light at 7.46 mm
      // against a 3.6 mm bar. On a 50 mm ball that is a bare wedge running from
      // the pole to the silhouette — reported from the app, and invisible on the
      // 62 mm test rig because the defect is a fixed number of MILLIMETRES and
      // that fixture is 2.5x wider.
      //
      // A span whose midpoint sits in the top tone band is a ruling that lies in
      // the centre light, so it is the one the bar is about. Charging it here
      // rather than in `coverageForSample` is what keeps the ladder intact:
      // per-sample it also lifted every ruling that merely clips the lit cap,
      // which drove the cap denser than the core shadow and took the 62 mm
      // contour ramp under its 1.8x bar (see coverageForSample).
      const litBand = nB - 1;
      const litSpanFloor = (cov, mid) => {
        const smp = smps[mid];
        if (!smp || zones[mid]) return cov;        // zones own their own floor
        return Regions.band(smp.I, tone) === litBand ? Math.max(cov, litFloorCov) : cov;
      };
      // One verdict per span, for the whole ruling, computed before any ink is
      // laid. `null` when the dither is off — every sample then draws.
      let spanDrop = null;
      const rulingDrop = new Map();   // zone → this ruling's verdict in that zone
      if (STAGE.dither && toneOn) {
        spanDrop = useLadder
          ? spanDrops(smps, zones, (smp, s) => covAtSample(smp, s, zones[s]), (cov, mid, restarting, spanOrd) => {
            // The feather (Stage 4) is evaluated ONCE for the span, at its
            // midpoint, rather than per sample. It keeps its full amplitude —
            // so it still decorrelates WHICH rulings drop at a band edge, which
            // is what stops the edge reading as a traceable contour — but it can
            // no longer move a ruling's state mid-span, which was never its job.
            const jit = STAGE.feather ? featherAt(lineIndex, mid) * FEATHER_AMPL : 0;
            // ...and the re-start margin (Stage 5) is charged on a span that
            // resumes a ruling which already drew and then stopped, which is the
            // only kind of re-start that is left. Raising the bar to start can
            // only ever REMOVE ink, so the composed C15/§0 budget is untouched.
            const margin = (STAGE.hysteresis && restarting) ? hystFor(cov) : 0;
            // Both offsets were stated in RANK units against a fixed per-line
            // rank; against a phase ladder the identical quantity is a shift of
            // the EFFECTIVE COVERAGE, because `rank < cov + jit - margin` and
            // `keep at coverage cov + jit - margin` are the same statement. Both
            // are inert at this stage (feather and hysteresis are off) and the
            // arithmetic is carried unchanged so they mean the same thing when
            // they come back.
            const eff = clamp(litSpanFloor(cov, mid) + jit - margin, 0, 1);
            // ONE VERDICT PER RULING PER ZONE, and the span ordinal is
            // deliberately NOT in the key. A rank threshold used to give this
            // for free: every span of a ruling read the same per-line rank, so
            // a ruling could not draw on one side of a fold and vanish on the
            // other. A phase that steps per SPAN loses it — measured, it put
            // one torusKnot contour ring's near sheet on the page without its
            // far sheet and left a 1.54 mm end in open surface. The ladder
            // selects RULINGS (that is how this engine shades), so the RULING
            // is the unit that takes the step. The ZONE stays in the key,
            // because a zone step is a genuine tone boundary and is entitled to
            // its own verdict — that is what a zone-keyed span is for — whereas
            // a fold is not. At this stage `zones` is all null, so this is one
            // track per family.
            const zk = String(zones ? zones[mid] : null);
            if (rulingDrop.has(zk)) return rulingDrop.get(zk);
            const d = !ladderKeeps(`${ladderKey}|${zk}`, eff, undefined, lineIndex);
            rulingDrop.set(zk, d);
            return d;
          }, closedSweep)
          // Legacy, no-ladder callers: the same law, on the same quantity they
          // always compared (local shade against the line's geometric rank).
          : spanDrops(smps, zones, (smp) => clamp(1 - smp.I, 0, 1), (shade) => shade < threshold, closedSweep);
      }

      // ── ROUND 6 — THE MARK LAWS REPLACE THE RULING OUTRIGHT ─────────────────
      // Placed AFTER the span verdict so the marks sit on the rows the even
      // scaffold actually kept, and returning here is what makes these laws
      // single-weight by construction: `sink.noteW` is never reached, no run is
      // ever handed a `weightScale`, and `splitByWeight` is never called.
      if (toneOn && isMarkLaw() && arcMM) {
        emitMarks({
          smps, arcMM, nSteps, spanDrop, paramAt, pitchStep, lineDir,
          lineIndex, wantFront, back, fam: currentFam, pitchAtStep,
        });
        return;
      }

      // ── THE TWO LAWS THAT END A RULING ON PURPOSE ────────────────────────────
      //
      // Everything above decides whether a ruling draws. This decides how much of
      // it draws, and it is the ONE place in this file where a ruling is allowed
      // to stop in open front-facing surface. Both laws that use it do so as
      // their MECHANISM, not as a side effect, and both report the depth.
      //
      //   'strokesGrow'     Praun et al.'s clamp(8t − 3.5): a ruling entering the
      //                     drawing is a SHORT black segment centred on its own
      //                     darkest sample, lengthening as the tone deepens. The
      //                     two ends are in open surface by construction — that
      //                     is what "the stroke grows" means on a pen plotter.
      //   'forcedContrast'  Hertzmann & Zorin's Mach band: the last FC_MACH_MM of
      //                     a ruling that ends on the LIT limb is left blank, so
      //                     the silhouette reads against a fabricated halo. Also
      //                     a deliberate free end, also reported.
      //
      // A hard cut, like the duty break: never bridged, never softened, so a
      // trimmed ruling reads as a shorter stroke and not as a bridged wobble.
      let hardCut = null;
      if (toneOn && TONE_ALGO === 'strokesGrow' && arcMM) {
        const rank = vdc2(lineIndex);
        const live = [];
        for (let s = 0; s <= nSteps; s++) if (smps[s] && !(spanDrop && spanDrop[s])) live.push(s);
        if (live.length > 2) {
          let cSum = 0;
          let dark = live[0];
          let dMin = Infinity;
          live.forEach((s) => {
            cSum += covAtSample(smps[s], s, zones[s]);
            const I = clamp(finite(smps[s].I, 0), 0, 1);
            if (I < dMin) { dMin = I; dark = s; }
          });
          const L = growLength(cSum / live.length, rank);
          if (L < 0.999) {
            const total = arcMM[live[live.length - 1]] - arcMM[live[0]];
            const half = (L * Math.max(0, total)) / 2;
            const c0 = arcMM[dark];
            hardCut = new Array(nSteps + 1).fill(false);
            live.forEach((s) => { if (Math.abs(arcMM[s] - c0) > half) hardCut[s] = true; });
          }
        }
      }
      if (toneOn && TONE_ALGO === 'forcedContrast' && endMM) {
        hardCut = new Array(nSteps + 1).fill(false);
        for (let s = 0; s <= nSteps; s++) {
          if (!smps[s]) continue;
          if (endMM[s] < FC_MACH_MM && clamp(finite(smps[s].I, 0), 0, 1) >= FC_LIMB_I) hardCut[s] = true;
        }
      }
      // ── 'importanceGreedy' — THE VERDICT IS THE IMPORTANCE, NOT A LADDER ─────
      // Replaces the span verdict outright: a ruling draws iff the darkness it
      // is still owed, averaged over its own samples, is above the termination
      // threshold — and if it draws, its contribution is smeared back into the
      // grid through the tone-adaptive kernel so the next ruling sees it.
      if (toneOn && TONE_ALGO === 'importanceGreedy') {
        const live = [];
        for (let s = 0; s <= nSteps; s++) if (smps[s]) live.push(s);
        let imp = 0;
        live.forEach((s) => { imp += targetArea(smps[s].I) - impRead(smps[s].x, smps[s].y); });
        const keep = live.length > 1 && imp / live.length > IMP_MIN;
        spanDrop = new Array(nSteps + 1).fill(!keep);
        if (keep) {
          live.forEach((s, li) => {
            const t = clamp(targetArea(smps[s].I), 0.02, 0.98);
            // w = the inter-stroke distance this tone needs, clamped to the two
            // physical ends this file already owns.
            const w = clamp(inkWidth() / t, floorPitch, litMaxPitchPen() * penWidth);
            // PER UNIT LENGTH, not per sample. A cell on the line is reached by
            // roughly w/dl of this ruling's samples, so a per-sample deposit of
            // inkWidth·dl/w² sums to inkWidth/w — which is the area fraction a
            // family at spacing w actually lays. Depositing inkWidth/w per
            // SAMPLE would over-report the drawing by that same factor and stop
            // the second ruling of every family before it started.
            const prev = live[Math.max(0, li - 1)];
            const dl = prev === s ? IMP_CELL
              : Math.hypot(smps[s].x - smps[prev].x, smps[s].y - smps[prev].y);
            const add = (inkWidth() * Math.max(1e-6, dl)) / Math.max(1e-6, w * w);
            const r = Math.ceil((w / 2) / IMP_CELL);
            const gx = Math.round(smps[s].x / IMP_CELL);
            const gy = Math.round(smps[s].y / IMP_CELL);
            for (let j = -r; j <= r; j++) {
              for (let i = -r; i <= r; i++) {
                if (Math.hypot(i, j) * IMP_CELL > w / 2) continue;
                const k = `${gx + i},${gy + j}`;
                impGrid.set(k, Math.min(0.98, finite(impGrid.get(k), 0) + add));
              }
            }
          });
        }
      }

      // ── 'lozengeStipple' — THE RESIDUAL, SPENT AS FLICKS ─────────────────────
      //
      // A ladder can only place WHOLE rulings, so between "n rulings" and
      // "n + 1 rulings" there is a tone it cannot express — and where it drops a
      // ruling, that whole ruling's worth of tone is the residual. The
      // copperplate engravers' answer (Goltzius' dotted lozenge; RISD's "The
      // Brilliant Line") is to spend the residual as DOTS: "dots taper off
      // gradually toward white paper, creating smooth gradations… a gentle
      // merging of the inscribed marks with the white of the paper", and "dot
      // placement disrupts MOIRÉ patterns that occur when cross-hatched lines
      // create unwanted optical illusions."
      //
      // Here a dropped ruling is not erased — it is reduced to short flicks
      // along its own path, at a density proportional to the coverage the ladder
      // wanted there. The marks are therefore ON the surface by construction
      // (they lie on a ruling the emitter already proved visible), they thicken
      // toward the shadow and vanish into bare paper in the light, and they
      // decorrelate the lattice because their phase is keyed on the ruling.
      const LOZ_MM = 0.9;      // a flick, ~3 × pen — a mark, not a pen-down dot
      const LOZ_GAIN = 0.35;   // flicks-per-sample at full coverage
      let lozMark = null;
      if (toneOn && TONE_ALGO === 'lozengeStipple' && spanDrop) {
        lozMark = new Array(nSteps + 1).fill(false);
        let s = 0;
        while (s <= nSteps) {
          if (!smps[s] || !spanDrop[s]) { s += 1; continue; }
          const p = clamp(covAtSample(smps[s], s, zones[s]) * LOZ_GAIN, 0, 1);
          if (sfHash(lineIndex * 977 + 31, s) >= p) { s += 1; continue; }
          let acc = 0;
          let k = s;
          while (k < nSteps && acc < LOZ_MM && smps[k + 1] && spanDrop[k + 1]) {
            acc += Math.hypot(smps[k + 1].x - smps[k].x, smps[k + 1].y - smps[k].y);
            k += 1;
          }
          if (acc >= LOZ_MM * 0.6) for (let q = s; q <= k; q++) lozMark[q] = true;
          s = k + 2;   // at least one clear sample between two flicks
        }
      }

      // ── 'deepFillTSP' — A SPACE-FILLING TRAVERSE FOR THE DARKEST ZONE ────────
      //
      // Arithmetic first, because it is what makes this law necessary at all: a
      // single ruled family with a pen-width stroke saturates at a spacing of
      // about twice the nib (this repo's PLOT_FLOOR_PEN), i.e. an ink area of
      // inkWidth/floorPitch = 0.509, L* 76. Below that there is nothing left to
      // buy by ruling closer. Velho & Gomes (SIGGRAPH '91) and Kaplan & Bosch
      // (TSP Art, 2005) both answer it the same way: in the darkest zone, stop
      // ruling and lay ONE CONTINUOUS PATH that fills the area, whose traversal
      // is APERIODIC so it cannot band or moiré.
      //
      // The plotter-legal form of that on a ruled family is a boustrophedon: the
      // ruling keeps its own path and its own two ends, and acquires a lateral
      // triangle-wave excursion into its own gap. One path, no extra pen lifts,
      // an effective pitch of half the ruled pitch without adding a ruling, and
      // a phase offset per ruling (golden ratio) so the zigs never line up into
      // a secondary lattice. The amplitude is bounded by the plot floor at one
      // end and by the ruling's own distance-to-its-end at the other, so a
      // displaced point can neither flood nor leave the surface.
      const TSP_PERIOD = 3.2;   // mm, one zig and one zag
      const tspAt = (smp, s) => {
        if (!arcMM || !endMM) return null;
        const k = tspRamp(smp.I);
        if (!(k > 0)) return null;
        const p = pitchAtStep(smp, s);
        if (!(Number.isFinite(p) && p > 1e-6)) return null;
        // The gap the thinned family left. Half of it either side of the ruling
        // is exactly the excursion that restores the ink the thinning removed,
        // and it is bounded below by the plot floor at the turns.
        const drawn = p / Math.max(1e-6, covAtSample(smp, s, zones[s]));
        let amp = Math.max(0, (drawn - floorPitch) / 2);
        amp = Math.min(amp, endMM[s] / 2);
        if (!(amp > 1e-3)) return null;
        const a = smps[Math.max(0, s - 1)] || smp;
        const b = smps[Math.min(nSteps, s + 1)] || smp;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        if (!(L > 1e-9)) return null;
        const ph = (arcMM[s] / TSP_PERIOD + (Number(lineIndex) || 0) * GOLDEN_STEP) * Math.PI * 2;
        // A TRIANGLE wave, not a sine: constant lateral speed is what makes the
        // traverse fill its gap evenly instead of dwelling at the turns.
        const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
        return { x: smp.x + (-dy / L) * amp * tri, y: smp.y + (dx / L) * amp * tri, z: smp.z };
      };

      // ── ROUND 5 — WHERE THE RULING DISSOLVES, AND INTO WHAT ─────────────────
      //
      // One pass over the ruling's own spans, before a single point is laid. It
      // produces three parallel arrays and nothing else:
      //
      //   lozOff[s]   this sample is in a GAP between marks. The emit loop cuts
      //               HARD there — never `softDrop` — so the bridge cannot join
      //               two flicks back into a dotted line, which would be a
      //               dashed ruling and not a stipple.
      //   lozWMul[s]  'lozSwell' only: the within-mark swell profile, an
      //               area-preserving raised sine that makes the flick an
      //               elongated diamond instead of a rectangle.
      //   lozDisp[s]  'lozCross' only: the half-pitch displacement into the
      //               lozenge centre, already re-verified against the chart.
      //
      // A span is a maximal run of on-surface samples — the same segmentation
      // `arcMM` uses and `spanDrops` takes its verdict over — so a mark can
      // never straddle the silhouette or a pole.
      let lozOff = null;
      let lozWMul = null;
      let lozDisp = null;
      let lozIsMark = null;
      if (toneOn && isLoz() && arcMM) {
        lozOff = new Array(nSteps + 1).fill(false);
        lozWMul = new Array(nSteps + 1).fill(1);
        lozIsMark = new Array(nSteps + 1).fill(false);
        if (TONE_ALGO === 'lozCross') lozDisp = new Array(nSteps + 1).fill(null);
        const duty = new Array(nSteps + 1).fill(1);
        for (let s = 0; s <= nSteps; s++) {
          const smp = smps[s];
          if (!smp) continue;
          const I = clamp(finite(smp.I, 0), 0, 1);
          const lp = pitchAtStep(smp, s);
          duty[s] = clamp(lozDutyAt(I, lp, weightCovEff(I, lp)), 0, 1);
          lozStat.samples += 1;
          lozStat.dutySum += duty[s];
          if (duty[s] < lozStat.dutyMin) lozStat.dutyMin = duty[s];
          if (duty[s] < 0.999) lozStat.dissolved += 1;
        }
        const phi0 = ((Number(lineIndex) || 0) * GOLDEN_STEP) % 1;
        const MARK = (TONE_ALGO === 'lozSwell') ? LZ_SWELL_MM()
          : (TONE_ALGO === 'lozBudget') ? LZ_BUDGET_MM() : LZ_MARK_MM();
        const PERIOD = LZ_PERIOD_MM();
        // The marks this span decided on, as [arcStart, arcEnd] pairs. Written
        // by whichever placement law is in force, then rasterised onto the
        // sample grid ONCE, at the bottom — so every law shares the same
        // minimum-length rule, the same swell profile and the same statistics.
        const ranges = [];
        let s0 = 0;
        while (s0 <= nSteps) {
          if (!smps[s0]) { s0 += 1; continue; }
          let s1 = s0;
          while (s1 + 1 <= nSteps && smps[s1 + 1]) s1 += 1;
          const spanLen = arcMM[s1];
          const arcOf = (s) => arcMM[s];
          // Sample index at a given arc position, by linear scan (the spans are
          // a few hundred samples; a bisection would not pay for itself).
          const atArc = (a) => {
            let k = s0;
            while (k < s1 && arcMM[k + 1] < a) k += 1;
            return k;
          };
          const dutyAtArc = (a) => duty[atArc(a)];
          if (TONE_ALGO === 'lozErrDiff' || TONE_ALGO === 'lozBudget') {
            // ── ERROR DIFFUSION, WITH A REAL TWO-TAP CARRY ────────────────────
            // The debt is INK LENGTH owed: a stretch of ruling at duty d owes
            // d·dl of black. A mark of length MARK is laid the moment the debt
            // reaches MARK, and exactly MARK is subtracted — so the ink laid
            // tracks the ink owed with a bounded error, which is what an error
            // diffusion is and what a phase accumulator only approximates.
            // A share LZ_ED_BETA of the standing residual is pushed into the
            // screen grid at that point; the neighbouring ruling picks it up and
            // clears it, so the total ink is conserved and the pattern cannot
            // lock to the raster.
            let owed = 0;
            for (let k = s0; k <= s1; k++) {
              const dl = k > s0 ? Math.hypot(smps[k].x - smps[k - 1].x, smps[k].y - smps[k - 1].y) : 0;
              owed += duty[k] * dl;
              const ck = lozKey(smps[k].x, smps[k].y);
              const carry = lozED.get(ck);
              if (carry) { owed += carry; lozED.delete(ck); }
              if (owed >= MARK) {
                const a0 = arcOf(k);
                const a1 = Math.min(spanLen, a0 + MARK);
                // ABUTTING QUANTA MERGE INTO ONE STROKE. 'lozBudget' leans on
                // this deliberately — it is where the pen-down saving comes
                // from — but it is correct for both laws: two marks that touch
                // are one mark on the paper and must be one pen-down.
                const last = ranges[ranges.length - 1];
                if (last && a0 <= last[1] + 1e-6) last[1] = Math.max(last[1], a1);
                else ranges.push([a0, a1]);
                owed -= MARK;
                if (owed > 0) {
                  const push = owed * LZ_ED_BETA;
                  lozED.set(ck, finite(lozED.get(ck), 0) + push);
                  owed -= push;
                }
              }
            }
            if (owed > 1e-6) {
              const ce = lozKey(smps[s1].x, smps[s1].y);
              lozED.set(ce, finite(lozED.get(ce), 0) + owed * LZ_ED_BETA);
            }
          } else if (TONE_ALGO === 'lozCapacity' || TONE_ALGO === 'lozAniso') {
            // ── EQUAL CAPACITY, CENTRED (Balzer et al. 2009) ──────────────────
            // Every mark owns an interval of EQUAL cumulative ink debt, and sits
            // at that interval's centre rather than at its leading edge. In 1-D
            // the capacity constraint has a closed form — walk the cumulative
            // debt and cut it at equal increments — so this is the exact
            // distribution, not a relaxation toward it.
            const centres = [];
            let cum = 0;
            let next = (phi0 + 0.5) * MARK;   // the FIRST interval's centre
            for (let k = s0; k <= s1; k++) {
              const dl = k > s0 ? Math.hypot(smps[k].x - smps[k - 1].x, smps[k].y - smps[k - 1].y) : 0;
              const prev = cum;
              cum += duty[k] * dl;
              while (cum >= next && next > prev) {
                // Linear interpolation inside the sample step: the capacity
                // centroid is a position on the ruling, not a sample index.
                const f = (next - prev) / Math.max(1e-9, cum - prev);
                centres.push(arcOf(k - 1 >= s0 ? k - 1 : k) + f * dl);
                next += MARK;
              }
            }
            centres.forEach((c) => {
              let ctr = c;
              if (TONE_ALGO === 'lozAniso') {
                // ── ANISOTROPIC BLUE NOISE ──────────────────────────────────
                // The exclusion region is an ELLIPSE elongated along the ruling:
                // a mark may sit close to its own neighbours (that is what a
                // dissolved ruling IS) but must not line up with a mark on an
                // adjacent ruling, which is what reads as a phantom row. The
                // escape is a slide ALONG the ruling, inside the mark's own
                // capacity interval, so the equal-capacity property survives the
                // rejection — this is CCVT's swap step, reduced to the one
                // degree of freedom the geometry actually leaves free.
                const R = LZ_SEP_MM();
                const blocked = (a) => {
                  const k = atArc(a);
                  const p = smps[k];
                  const q = smps[Math.min(s1, k + 1)] || p;
                  const dx = q.x - p.x; const dy = q.y - p.y;
                  const L = Math.hypot(dx, dy) || 1;
                  const gx = Math.round(p.x / LOZ_CELL); const gy = Math.round(p.y / LOZ_CELL);
                  for (let j = -2; j <= 2; j++) {
                    for (let i = -2; i <= 2; i++) {
                      const arr = lozSites.get(`${gx + i},${gy + j}`);
                      if (!arr) continue;
                      for (let n = 0; n < arr.length; n++) {
                        const ex = arr[n].x - p.x; const ey = arr[n].y - p.y;
                        const along = (ex * dx + ey * dy) / L;
                        const perp = (ex * -dy + ey * dx) / L;
                        // Ellipse with semi-axes R/3 along and R across: only a
                        // neighbour that is ACROSS the ruling can block.
                        if ((along * along) / ((R / 3) * (R / 3)) + (perp * perp) / (R * R) < 1) return true;
                      }
                    }
                  }
                  return false;
                };
                const half = MARK / 2;
                for (let t = 0; t < 6 && blocked(ctr); t++) {
                  ctr = c + ((t % 2 ? 1 : -1) * Math.ceil((t + 1) / 2) * half) / 3;
                  if (ctr < 0 || ctr > spanLen) { ctr = c; break; }
                }
                const kk = atArc(ctr);
                const key = lozKey(smps[kk].x, smps[kk].y);
                const arr = lozSites.get(key) || [];
                arr.push({ x: smps[kk].x, y: smps[kk].y });
                lozSites.set(key, arr);
              }
              const a0 = Math.max(0, ctr - MARK / 2);
              const a1 = Math.min(spanLen, ctr + MARK / 2);
              const last = ranges[ranges.length - 1];
              if (last && a0 <= last[1] + 1e-6) last[1] = Math.max(last[1], a1);
              else ranges.push([a0, a1]);
            });
          } else {
            // ── THE PHASE ACCUMULATOR (Sturmian) ──────────────────────────────
            // `u` counts MARK PERIODS, so the mark is the first `duty` fraction
            // of each period and its length is duty × period. Two geometries
            // fall out of the same accumulator, and they are the matched pair
            // this round is really asking about:
            //   fixed MARK, period = MARK/duty   — density carries tone
            //   fixed PERIOD, mark = duty·PERIOD — mark SIZE carries tone
            const fixedPeriod = (TONE_ALGO === 'lozGrow' || TONE_ALGO === 'lozHighlight');
            let u = 0;
            let open = null;
            for (let k = s0; k <= s1; k++) {
              const dl = k > s0 ? Math.hypot(smps[k].x - smps[k - 1].x, smps[k].y - smps[k - 1].y) : 0;
              const d = duty[k];
              u += fixedPeriod ? (dl / PERIOD) : ((dl * d) / Math.max(1e-6, MARK));
              const f = ((u + phi0) % 1 + 1) % 1;
              let on;
              if (d >= 0.999) on = true;
              else if (TONE_ALGO === 'lozBlue') {
                // The mark keeps its DUTY — and therefore its tone — but its
                // phase inside the period is jittered, keyed on the ruling AND
                // on the period index, so no two neighbouring rulings put their
                // flicks at the same place and the lattice never forms.
                const per = Math.floor(u + phi0);
                const j = sfHash(lineIndex * 131 + 17, per) * (1 - d);
                on = f >= j && f < j + d;
              } else on = f < d;
              if (on && open === null) open = arcOf(k);
              else if (!on && open !== null) { ranges.push([open, arcOf(k)]); open = null; }
            }
            if (open !== null) ranges.push([open, spanLen]);
          }
          s0 = s1 + 1;
        }
        // ── RASTERISE THE MARKS ONTO THE SAMPLE GRID ─────────────────────────
        // Everything below is shared by all ten laws. A mark shorter than
        // `MIN_MARK_MM` is DROPPED, not shortened: a sub-two-pen mark is a
        // pen-down dot, and dropping it is exactly how the ramp reaches bare
        // paper at the light end instead of degenerating into speckle.
        const keep = new Array(nSteps + 1).fill(false);
        ranges.forEach((r) => {
          if (r[1] - r[0] < MIN_MARK_MM) { lozStat.tooShort += 1; return; }
          lozStat.marks += 1;
          for (let s = 0; s <= nSteps; s++) {
            if (!smps[s]) continue;
            if (arcMM[s] >= r[0] - 1e-9 && arcMM[s] <= r[1] + 1e-9) {
              keep[s] = true;
              if (TONE_ALGO === 'lozSwell') {
                // THE ENGRAVER'S LOZENGE. An area-preserving raised sine —
                // mean(π/2 · sin πp) over [0,1] is exactly 1 — so the flick is
                // an elongated diamond tapering to the pen at both tips and the
                // TONE is untouched by the shaping. `splitByWeight` cuts it into
                // abutting pieces at W_LEVEL, which is why LZ_SWELL_MM is long
                // enough to hold four of them.
                const p = clamp((arcMM[s] - r[0]) / Math.max(1e-6, r[1] - r[0]), 0, 1);
                lozWMul[s] = (Math.PI / 2) * Math.sin(Math.PI * p);
              }
            }
          }
        });
        for (let s = 0; s <= nSteps; s++) {
          if (!smps[s]) continue;
          if (duty[s] >= 0.999) { keep[s] = true; lozWMul[s] = 1; }
          else lozIsMark[s] = true;
          lozOff[s] = !keep[s];
        }
        // ── 'lozCross' — THE FLICK GOES IN THE LOZENGE, NOT ON THE LINE ───────
        // Half a pitch off the ruling, in the residual between rulings, which is
        // where the engraver actually put it. The offset is taken in PARAMETER
        // space (the family's own neighbour step), then pushed back through
        // `sampleAt`: a displaced point is laid ONLY if the chart says it is
        // front-facing there. That is what keeps the one law that leaves the
        // ruling from putting a mark outside the silhouette — and the rejects
        // are counted, not silently dropped.
        if (lozDisp) {
          for (let s = 0; s <= nSteps; s++) {
            if (!smps[s] || lozOff[s] || duty[s] >= 0.999) continue;
            const tt2 = s / nSteps;
            const st = typeof pitchStep === 'function' ? pitchStep(tt2) : pitchStep;
            if (!st) continue;
            const pr = paramAt(tt2);
            const a2 = pr.a + st.a * 0.5;
            const b2 = pr.b + st.b * 0.5;
            if (a2 < 0 || a2 > 1 || b2 < 0 || b2 > 1) { lozStat.offSurface += 1; lozOff[s] = true; continue; }
            const alt = sampleAt(a2, b2);
            if (!alt || alt.front !== wantFront) { lozStat.offSurface += 1; lozOff[s] = true; continue; }
            lozDisp[s] = { x: alt.x, y: alt.y, z: alt.z };
          }
        }
      }

      for (let s = 0; s <= nSteps; s++) {
        const tt = s / nSteps;
        const smp = smps[s];
        sampleZone = null;
        if (!smp) { flush(); flushHL(); continue; }
        // A deliberate trim (see `hardCut`). Cuts hard, exactly like the duty
        // break, so it is never bridged back into one stroke.
        if (hardCut && hardCut[s]) { flush(); flushHL(); continue; }
        // ROUND 5 — the gap between two lozenges. A HARD cut, exactly like the
        // duty break: a flick must be bounded at both ends or the bridge would
        // stitch a row of them back into one dotted ruling, which is a dashed
        // line and not a stipple.
        if (lozOff && lozOff[s]) { flush(); flushHL(); continue; }
        // Tag the run as a MARK if the ruling was dissolving where it was laid.
        // This is what lets the harness measure a deliberate isolated flick
        // separately from a ruling that stopped in open surface, WITHOUT
        // redefining the free-end metric for either of them.
        if (lozIsMark && lozIsMark[s]) sink.noteLoz();
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
                else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
              } else if (tr === 'sparse' || tr === 'stippleOut') {
                // O15 — these two used to fall into the `blank` arm below, so
                // switching highlightMode to lightDriven silently turned a sparse
                // or stippled highlight into a hole. They now thin on the
                // highlight channel here exactly as they do under perFace.
                if (!treated) { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
                else if (tr === 'sparse'
                  ? lineKept
                  : sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) < clamp((ldDensity / 100) * (0.3 + shade * 2), 0, 1)) {
                  flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z });
                } else { flush(); flushHL(); }
              } else if (treated) { flush(); flushHL(); }        // blank glint
              else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
              continue;
            }
          }
          // The sample draws where this ruling's PERMUTED rank sits below the
          // SPAN's coverage — dark spans cover more ranks (dense), the centre
          // light few (sparse), the glint none (blank). The verdict was taken
          // once, above, for this whole continuous span; see `spanDrops`.
          // Without a ladder (other callers) it degrades to the legacy shade
          // vs. threshold test, taken at the same scale.
          //
          // The zone gate is a HARD cut that confines a crossed family to its
          // own zone; it has to keep firing when `toneZones` is on but `dither`
          // is off, otherwise the T/F cross families spray over the whole
          // object. It is applied in the pre-pass (a gated-out sample is not on
          // any span) and repeated here so the run is actually flushed.
          const zone = zones[s];
          sampleZone = zone;
          if (zoneGate && !gateAllows(zoneGate, zone)) { flush(); flushHL(); continue; }
          let dropZone = spanDrop ? spanDrop[s] : false;
          let dutyBreak = false;
          // Dash duty — the reflected rim breaks its rulings rather than
          // tightening them (§5.1: widened spacing + duty 0.7). A duty break
          // is DELIBERATE, so it cuts hard, is never bridged, and stays a
          // PER-SAMPLE decision: it is the one mid-surface end this emitter is
          // supposed to make. (Stage 6 / `dashDuty`, and it needs `toneZones`.)
          if (STAGE.dashDuty && !dropZone && zone) {
            const duty = clamp(finite(Regions.formInk(zone).duty, 1), 0, 1);
            if (duty < 1 && sfHash(lineIndex + 7717, Math.round(s / 2)) >= duty) { dropZone = true; dutyBreak = true; }
          }
          if (dropZone) {
            // Ordered-dither drop zone. Legacy (no highlight, or not the
            // highlight band): drop = bare paper. This is the ONE bridgeable
            // break: it is the dither's per-sample verdict, and on a wrapped
            // surface it chatters (see RULING CONTINUITY above). A duty break
            // is deliberate and still cuts hard.
            // 'lozengeStipple' spends a dropped ruling as flicks rather than
            // erasing it. A flick is bounded by a HARD flush at both ends, so
            // the bridge cannot join two of them into a dotted line — which
            // would be a dashed ruling, not a stipple.
            if (lozMark) {
              flushHL();
              if (lozMark[s]) addPt({ x: smp.x, y: smp.y, z: smp.z }, sampleZone, tt);
              else flush();
              continue;
            }
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
        // The stroke has retracted (signedWidth) or a transverse white is cut
        // here (transverseReserve). The run ends at the CROSSING, not at the
        // previous sample.
        if (offPaper && offPaper[s]) {
          if (exitPt[s]) addPt(exitPt[s], sampleZone, tt);
          flush();
          continue;
        }
        // Meet the boundary on the way in, and again on the way out. Both are
        // no-ops unless the neighbouring sample is off the wanted side of the
        // surface, which is the only place a refinement is defined.
        if (s > 0 && !onSurf[s - 1]) { const e = edgeAt(s, s - 1); if (e) addPt(e, sampleZone, tt); }
        if (toneOn && TONE_ALGO === 'weightModulated') sink.noteW(weightAt(smp.I));
        else if (toneOn && isWeightLaw()) {
          // THE TONE IS READ OFF THE UNDISPLACED RULING (`wvBase`); null under
          // every non-wave law, so it falls through to `smp`.
          const wRaw = weightAtSample((wvBase && wvBase[s]) || smp, pitchAtStep(smp, s), gradIs ? gradIs[s] : 0,
            (thetas || endMM || wvElongs)
              ? {
                theta: thetas ? thetas[s] : null,
                endMM: endMM ? endMM[s] : null,
                elong: wvElongs ? wvElongs[s] : 1,
              } : null);
          // 'lozSwell' shapes the flick; the profile is area-preserving, so this
          // multiply moves ink WITHIN the mark and never changes its total.
          sink.noteW(lozWMul ? clamp(wRaw * lozWMul[s], W_MIN, W_MAX) : wRaw);
        }
        if (entryPt && entryPt[s]) addPt(entryPt[s], sampleZone, tt);
        // 'onePenDown' chains ruling to ruling, so it has to know which sample
        // the emitted stroke actually started and stopped on — the ruling's own
        // parameter ends are not it wherever the silhouette cut the run.
        if (wvChainOn) { if (wvStartS == null) wvStartS = s; wvEndS = s; }
        addPt((lozDisp && lozDisp[s])
          || (toneOn && TONE_ALGO === 'deepFillTSP' && tspAt(smp, s))
          || { x: smp.x, y: smp.y, z: smp.z }, sampleZone, tt);
        if (s < nSteps && !onSurf[s + 1]) { const e = edgeAt(s, s + 1); if (e) addPt(e, sampleZone, tt); }
      }
      flush();
      flushHL();
      // ── THE SEAM JOIN ────────────────────────────────────────────────────────
      // A CLOSED sweep (a contour ring: `b` runs the full wind and b = 1 IS
      // b = 0) has no start and no end on the form — only a bookkeeping seam at
      // tt = 0/1. When the far side of the form cuts such a sweep, the loop
      // hands back a HEAD (from tt = 0) and a TAIL (to tt = 1) that are the two
      // ends of ONE stroke, meeting exactly on the seam. Left apart they plot as
      // two pens-down and read as a break in the ring. Stitch tail→head back
      // into one polyline. Nothing is added or removed: the join is only made
      // when the two endpoints are the SAME point, which is what "closed" means.
      const mine = sink.emitted();
      if (mine.length >= 2) {
        const head = mine[0];
        const tail = mine[mine.length - 1];
        if (head !== tail && head.tt0 === 0 && tail.tt1 === 1) {
          const h0 = head[0];
          const t1 = tail[tail.length - 1];
          if (Math.hypot(t1.x - h0.x, t1.y - h0.y) < SEAM_JOIN_MM) {
            // 'onePenDown' rides this same join wearing `__hw` (its deferred
            // per-point half-width profile — see `pendRibbon` /
            // `flushDeferredRibbons`). The point arrays are stitched in
            // lockstep here, so `__hw` MUST be too: leaving it behind means
            // `tail.length` grows by `head.length - 1` while `tail.__hw`
            // does not, and `flushDeferredRibbons`'s own padding step (it
            // holds the LAST known width open for exactly this "a stitcher
            // appended points without widths" case) then re-inks the whole
            // seam segment at `tail`'s width instead of `head`'s real one —
            // a genuine width substitution, not a merge. Measured: a
            // sphere/contour onePenDown chain crossing the seam carried
            // head's true half-widths silently forward as a flat run of
            // tail's last value, which is exactly the kind of stretch this
            // effort's `wide`/`walls`/`outlineOnly` counters have to
            // classify correctly to stay trustworthy.
            if (Array.isArray(tail.__hw) && Array.isArray(head.__hw)) {
              for (let i = 1; i < head.__hw.length; i++) tail.__hw.push(head.__hw[i]);
            }
            for (let i = 1; i < head.length; i++) tail.push(head[i]);
            tail.tt1 = head.tt1;
            const at = out.indexOf(head);
            if (at >= 0) out.splice(at, 1);
          }
        }
      }
      // ── 'onePenDown' — ONE CONTINUOUS PATH OVER THE WHOLE FORM ───────────────
      //
      // The real plotter advantage nobody spends: a pen-up is pure cost. It is
      // travel time, it is a servo cycle, it is the one moment the ink can blob,
      // and a ruled family spends one per ruling. A boustrophedon over the whole
      // form spends ONE for the entire object.
      //
      // The bridge between two rulings is built IN THE CHART, exactly like the
      // wave: a straight segment in (a, b) from where the previous ruling
      // stopped to where this one starts, sampled, with every sample required to
      // be on the surface and front-facing. So the link is a genuine curve ON
      // the form — never a chord across the silhouette, which is what a
      // screen-space link would be on a convex limb — and if any sample fails,
      // the bridge is refused and the chain simply starts again here. The
      // pen-down count is therefore an honest count of how often the surface
      // itself made continuity impossible.
      //
      // `emitAngledFamily` reverses every other ruling for this law, so the two
      // points being bridged are the two NEAR ends and the link is short.
      // WV_LINK_MAX_MM refuses anything longer than a bridge worth drawing.
      if (wvChainOn && wvStartS != null && wvEndS != null && prs) {
        const mine2 = sink.emitted();
        const run = mine2.length === 1 ? mine2[0] : null;
        const p0 = prs[wvStartS];
        const p1 = prs[wvEndS];
        let linked = false;
        if (run && p0 && p1 && wvChain && wvChain.fam === currentFam && wvChain.back === back) {
          const bridge = wvBridge(wvChain.par, p0, wantFront);
          if (bridge) {
            extendPend(wvChain.run, bridge.length, run);
            bridge.forEach((q) => wvChain.run.push(q));
            for (let i = 0; i < run.length; i++) wvChain.run.push(run[i]);
            const at = out.indexOf(run);
            if (at >= 0) out.splice(at, 1);
            wvChain.par = p1;
            linked = true;
          }
        }
        if (!linked) {
          wvChain = (run && p1) ? { run, par: p1, fam: currentFam, back } : null;
        }
      }

      return mine;
    };

    // ── THE ADJACENT-PASS EMITTER ─────────────────────────────────────────────
    //
    // One ruling in, one BUNDLE of parallel passes out. Every caller of
    // `emitLine` in this file goes through here, so the ten laws reach the axis
    // families, the angled families, the screen cross and the mappers without
    // any of them knowing about passes.
    //
    // A pass is a ruling. Its parameter walk is the caller's own `paramAt`
    // displaced by the family's own `pitchStep`, scaled so the displacement
    // measures `off` millimetres ACROSS the ruling on screen — `perpPitch` is
    // exactly that conversion and it is already local, so the bundle keeps a
    // constant screen width wherever the chart stretches. Because the pass is
    // walked on the chart, every existing guard applies to it: it is culled on
    // the far side, clipped by HLR, refined against the surface boundary, and
    // dropped under MIN_MARK_MM, all unchanged. There is no path by which a pass
    // can be drawn outside the silhouette.
    const adjShift = (paramAt, pitchStep, lineDir, offMM, wrap) => (tt) => {
      const p = paramAt(tt);
      if (!p) return p;
      if (!(Math.abs(offMM) > 1e-9)) return p;
      const st = typeof pitchStep === 'function' ? pitchStep(tt) : pitchStep;
      const dr = typeof lineDir === 'function' ? lineDir(tt) : lineDir;
      if (!st) return p;
      const smp = sampleAt(p.a, p.b);
      const pp = smp ? perpPitch(smp, st, dr) : null;
      // WHERE THE FRAME COLLAPSES, THE PASS DOES NOT EXIST. `k` is
      // offset ÷ local pitch, so at a pole — where a sphere's meridians converge
      // to zero separation — it diverges, and a pass placed with it lands
      // somewhere arbitrary on the far side of the form. Measured before this
      // guard: the pole cap of every sphere went solid (5th-percentile L* 10.1
      // against a 32 target) purely from scattered passes piling up there.
      //
      // Two limits, both physical. Below a fifth of the master pitch there is no
      // room beside the ruling for anything, so the pass simply has none of
      // itself here. And a pass may never travel far enough to land inside its
      // NEIGHBOUR'S bundle — past that it is not "immediately adjacent" to
      // anything. How far that is depends on which way the bundle grows: a
      // bundle centred on its ruling owns half the pitch in each direction; a
      // one-sided bundle ('bundleToShadow') owns the whole pitch on its own
      // side and none on the other, which is the same room stated differently.
      if (!(Number.isFinite(pp) && pp > masterPitch * 0.2)) return null;
      const k = offMM / pp;
      if (Math.abs(k) > adjStride() * (TONE_ALGO === 'bundleToShadow' ? 0.95 : 0.5)) return null;
      const a = p.a + finite(st.a, 0) * k;
      // `a` is the sweep along the axis and is NOT periodic: past either end the
      // pass has left the chart, so it has no sample there and simply does not
      // draw. `b` is the wind and is periodic on every primitive this fill
      // wraps, so it is wrapped rather than clamped — clamping would pile the
      // outermost pass of every bundle onto the seam.
      if (!(a >= 0 && a <= 1)) return null;
      const b = finite(p.b, 0) + finite(st.b, 0) * k;
      return { a, b: wrap ? (((b % 1) + 1) % 1) : b };
    };
    // Which side of this ruling the shadow is on, MEASURED. Sampled at the
    // ruling's own midpoint, one step either way; a tie (or a degenerate frame)
    // takes +1, which is the symmetric law's own first offset.
    const adjShadowSign = (paramAt, pitchStep, lineDir) => {
      const plus = adjShift(paramAt, pitchStep, lineDir, adjStep() * 2, true)(0.5);
      const minus = adjShift(paramAt, pitchStep, lineDir, -adjStep() * 2, true)(0.5);
      const a = plus ? sampleAt(plus.a, plus.b) : null;
      const b = minus ? sampleAt(minus.a, minus.b) : null;
      if (!a || !b) return 1;
      return finite(a.I, 0) <= finite(b.I, 0) ? 1 : -1;
    };
    // A serpentine connector is the ONLY screen-space geometry this family adds,
    // so it is proved on the chart before it is allowed: walk the parameter
    // segment between the two passes' endpoints and require every station to be
    // on the same visible surface. A connector that would cut the corner off a
    // silhouette fails here and the stitch is simply not made.
    const adjConnectorOk = (pa, pb, wantFront) => {
      if (!pa || !pb) return false;
      for (let i = 1; i < 5; i++) {
        const f = i / 5;
        const smp = sampleAt(pa.a + (pb.a - pa.a) * f, pa.b + (pb.b - pa.b) * f);
        if (!smp || smp.front !== wantFront) return false;
      }
      return true;
    };
    const emitLine = (paramAt, threshold, back, lineIndex, count, zoneGate, pitchStep, lineDir, densityCross) => {
      if (!(toneOn && isAdjLaw() && STAGE.masterGrid)) {
        emitLineOnce(paramAt, threshold, back, lineIndex, count, zoneGate, pitchStep, lineDir, densityCross, null);
        return;
      }
      // The decimation to the bundle pitch, done here rather than by the ladder
      // (see `adjStride`). Every stride-th ruling of the master grid draws, so
      // every gap is exactly equal and the spacing is even by construction.
      const stride = adjStride();
      if (stride > 1 && ((Number(lineIndex) || 0) % stride) !== 0) return;
      // How many passes this ruling could possibly want. Sampling the ask
      // coarsely first is what keeps the family affordable: a ruling lying
      // wholly in the light runs ONE pass, not `adjMax()` of them each finding
      // nothing to draw.
      let wantMax = 1;
      let sum = 0; let n = 0;
      for (let i = 0; i <= 24; i++) {
        const p = paramAt(i / 24);
        const smp = p ? sampleAt(p.a, p.b) : null;
        if (!smp || smp.front !== !back) continue;
        const st = typeof pitchStep === 'function' ? pitchStep(i / 24) : pitchStep;
        const dr = typeof lineDir === 'function' ? lineDir(i / 24) : lineDir;
        const pp = perpPitch(smp, st, dr);
        const ask = adjAskN(smp.I, pp);
        if (ask > wantMax) wantMax = ask;
        if (ask > adjStat.askMax) adjStat.askMax = ask;
        if (Number.isFinite(pp)) {
          if (pp < adjStat.pitchMin) adjStat.pitchMin = pp;
          if (pp > adjStat.pitchMax) adjStat.pitchMax = pp;
        }
        sum += ask; n += 1;
      }
      // The whole-ruling laws take ONE count for the ruling, from the mean of
      // its own on-surface samples, so every pass spans the ruling end to end
      // and nothing stops in open surface. That is the maximally even reading of
      // the brief, and it is also the precondition for stitching: a serpentine
      // whose passes ended at different places would have to traverse the form.
      const whole = adjWholeRuling() && n > 0 ? clamp(Math.round(sum / n), 1, adjMax()) : null;
      const passes = whole != null ? whole : Math.min(adjMax(), Math.max(1, Math.round(wantMax)));
      const sign = TONE_ALGO === 'bundleToShadow' ? adjShadowSign(paramAt, pitchStep, lineDir) : 1;
      const emitted = [];
      const params = [];
      for (let k = 0; k < passes; k++) {
        const off = adjOffsetMul(k, sign) * adjStep();
        const pa = k === 0 ? paramAt : adjShift(paramAt, pitchStep, lineDir, off, true);
        const adj = {
          k,
          whole,
          endInset: adjEndInset(k),
          // Sub-nib passes deliberately overlap the one before them, which is an
          // ink flood by this repo's own bar (PLOT_FLOOR_PEN). Counted, not
          // hidden — the brief asked for exactly where it would flood.
          floods: k > 0 && adjStep() < inkWidth(),
        };
        const mine = emitLineOnce(pa, threshold, back, lineIndex, count, zoneGate, pitchStep, lineDir, densityCross, adj);
        if (mine && mine.length) { emitted.push(mine); params.push(pa); }
      }
      adjStat.bundles += 1;
      adjStat.passes += emitted.length;
      if (emitted.length) adjStat.drew += 1;
      if (emitted.length) {
        if (emitted.length < adjStat.nMin) adjStat.nMin = emitted.length;
        if (emitted.length > adjStat.nMax) adjStat.nMax = emitted.length;
        adjStat.nSum += emitted.length;
      }
      if (!adjStitches() || emitted.length < 2) return;
      // ── THE SERPENTINE ────────────────────────────────────────────────────
      // Out along pass 0, U-turn, back along pass 1, U-turn, out along pass 2.
      // One pen-down for the whole bundle, which is a real plotter saving and is
      // measured as one. Only bundles whose passes came back as a SINGLE run
      // each are stitched — a pass that HLR cut into two pieces has no single
      // end to turn at, and forcing one would draw across the cut.
      const single = emitted.every((m) => m.length === 1);
      if (!single) return;
      let head = emitted[0][0];
      for (let k = 1; k < emitted.length; k++) {
        const nxt = emitted[k][0];
        const tail = head[head.length - 1];
        // The turn is made at whichever end of the next pass is nearer, and the
        // pass is reversed when it is the far one — that is what makes the walk
        // boustrophedon instead of a comb with traverses.
        const d0 = Math.hypot(nxt[0].x - tail.x, nxt[0].y - tail.y);
        const d1 = Math.hypot(nxt[nxt.length - 1].x - tail.x, nxt[nxt.length - 1].y - tail.y);
        const rev = d1 < d0;
        const gap = Math.min(d0, d1);
        const ttEnd = rev ? nxt.tt1 : nxt.tt0;
        const pa = params[k - 1] ? params[k - 1](clamp(finite(head.tt1, 1), 0, 1)) : null;
        const pb = params[k] ? params[k](clamp(finite(ttEnd, 0), 0, 1)) : null;
        if (!(gap <= adjStep() * (adjMax() + 1)) || !adjConnectorOk(pa, pb, !back)) {
          adjStat.stitchRejects += 1;
          head = nxt;
          continue;
        }
        const src = rev ? nxt.slice().reverse() : nxt;
        for (let i = 0; i < src.length; i++) head.push(src[i]);
        head.tt1 = rev ? nxt.tt0 : nxt.tt1;
        const at = out.indexOf(nxt);
        if (at >= 0) out.splice(at, 1);
        adjStat.stitches += 1;
        adjStat.penDownSaved += 1;
      }
      // ── AND ACROSS RULINGS ('bundleSnake') ────────────────────────────────
      // "A continuous single path that snakes: out along a ruling, back
      // adjacent, out again — covering a whole tonal region in one stroke."
      // The bundle serpentine above does that WITHIN a bundle; this carries the
      // walk on into the next bundle, so a whole tonal region comes off the
      // plotter as one pen-down.
      //
      // It is allowed only where the two bundles have nearly closed the white
      // between them, which is the deep shadow and nowhere else. Anywhere
      // lighter the traverse would be a line drawn across bare paper — ink the
      // tone did not budget for and the eye will read as a mark — so the gate
      // is measured, not assumed: `gap` is the real screen distance between the
      // two endpoints, and it must be inside ADJ_SNAKE_GAP nib widths.
      const prev = adjPrevSnake;
      adjPrevSnake = (TONE_ALGO === 'bundleSnake' && head && head.length >= 2 && out.indexOf(head) >= 0)
        ? { path: head, param: params[emitted.length - 1] || params[0], tt: head.tt1, fam: currentFam, line: lineIndex }
        : null;
      if (TONE_ALGO === 'bundleSnake' && prev && adjPrevSnake
        && prev.fam === currentFam && out.indexOf(prev.path) >= 0) {
        const tail = prev.path[prev.path.length - 1];
        const d0 = Math.hypot(head[0].x - tail.x, head[0].y - tail.y);
        const d1 = Math.hypot(head[head.length - 1].x - tail.x, head[head.length - 1].y - tail.y);
        const rev = d1 < d0;
        const gap = Math.min(d0, d1);
        const pa = prev.param ? prev.param(clamp(finite(prev.tt, 1), 0, 1)) : null;
        const pb = params[0] ? params[0](clamp(finite(rev ? head.tt1 : head.tt0, 0), 0, 1)) : null;
        if (gap <= ADJ_SNAKE_GAP * inkWidth() && adjConnectorOk(pa, pb, !back)) {
          const src = rev ? head.slice().reverse() : head;
          for (let i = 0; i < src.length; i++) prev.path.push(src[i]);
          prev.path.tt1 = rev ? head.tt0 : head.tt1;
          const at2 = out.indexOf(head);
          if (at2 >= 0) out.splice(at2, 1);
          adjStat.stitches += 1;
          adjStat.penDownSaved += 1;
          adjPrevSnake = { path: prev.path, param: prev.param, tt: prev.path.tt1, fam: currentFam, line: lineIndex };
        } else {
          adjStat.stitchRejects += 1;
        }
      }
    };


    // The chart-space bridge itself. Refuses on the first sample that is not on
    // the wanted side of the surface, and refuses outright if the link is longer
    // than WV_LINK_MAX_MM on screen — a long link is a leap across a neck or a
    // pole, and drawing it would put ink where the form is not.
    const WV_BRIDGE_STEPS = 14;
    const wvBridge = (pA, pB, wantFront) => {
      if (!pA || !pB) return null;
      let db = pB.b - pA.b;
      if (db > 0.5) db -= 1;
      if (db < -0.5) db += 1;
      const da = pB.a - pA.a;
      const pts = [];
      let L = 0;
      let prev = null;
      for (let k = 1; k <= WV_BRIDGE_STEPS; k++) {
        const f = k / WV_BRIDGE_STEPS;
        const bb = pA.b + db * f;
        const smp = sampleAt(clamp(pA.a + da * f, 0, 1), bb - Math.floor(bb));
        if (!smp || smp.front !== wantFront) return null;
        if (prev) L += Math.hypot(smp.x - prev.x, smp.y - prev.y);
        prev = smp;
        pts.push({ x: smp.x, y: smp.y, z: smp.z });
      }
      if (!(L < WV_LINK_MAX_MM)) return null;
      // The last bridge point IS this ruling's first point; drop it so the two
      // are not laid twice.
      pts.pop();
      return pts;
    };

    // 'onePenDown' rules a BOUSTROPHEDON: every other ruling is traversed
    // backwards, so consecutive rulings finish and start at the same end of the
    // form and the bridge between them is short enough to be legal. Sample
    // count and every other property are untouched — only the direction flips.
    const boustro = (at, i) => {
      if (!at || TONE_ALGO !== 'onePenDown' || (i % 2) === 0) return at;
      const rev = (tt) => at(1 - tt);
      if (Number.isFinite(at.steps)) rev.steps = at.steps;
      return rev;
    };

    const emitFamily = (fixAxis, count, back, zoneGate) => {
      nextFam(zoneGate ? `gate${zoneGate}` : 'A');
      for (let i = 0; i < count; i++) {
        const fixVal = (i + 0.5) / count;
        emitLine(boustro(axisLine(fixAxis, fixVal), i), (i + 0.5) / count, back, i, count, zoneGate,
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
      // ── THE WIND SEAM IS NOT A WALL ──────────────────────────────────────────
      //
      // The comment above always claimed "`b` is periodic (the wind seam), so a
      // line clipped at b=0/b=1 continues as its neighbour with no visible
      // break." IT DOES NOT. The clip below is a slab clip against the unit
      // SQUARE, so an angled ruling stops dead on the b = 1 meridian — and on a
      // yaw-0 sphere that meridian projects INSIDE the visible disc, running
      // from the right-hand equator point (at the silhouette) up to the pole (at
      // 0.87 R). The lune between it and the right silhouette is real, visible,
      // front-facing surface, and it was reached only by the residual corner
      // segments: measured on a 62 mm sphere, a ragged crescent up to 8 mm deep
      // — 13% of the radius — on the RIGHT limb only, with the left limb clean.
      // The asymmetry is the tell: b = 0.5 (the left limb) has no seam.
      //
      // The domain is a CYLINDER, not a square: a ∈ [0,1] with genuine ends (the
      // poles) and b ∈ R/Z with none. So clip against `a` alone and let `b` wrap.
      // Shifting b by one period shifts the family offset c by `nb`, so c ∈
      // [0, |nb|) already enumerates every distinct ruling — which makes the
      // line budget `count x span` land on exactly the same perpendicular
      // spacing (1/count) the axis families use, with no extra bookkeeping.
      //
      // Not used within WRAP_MIN_DA of the parallels direction: there `da` → 0,
      // a ruling would wind the seam many times per unit of `a`, and `steps`
      // could not follow it. That neighbourhood of 90° is the latitude family,
      // whose lines already span a whole wind and so have no seam to cross.
      const WRAP_MIN_DA = 0.2;
      if (Math.abs(da) >= WRAP_MIN_DA) {
        const period = Math.abs(nb);
        const wrap01 = (v) => { const w = v % 1; return w < 0 ? w + 1 : w; };
        const lineAtWrapped = (frac) => {
          const c = frac * period;
          const a0 = c * na; const b0 = c * nb;
          const ta = (0 - a0) / da; const tb = (1 - a0) / da;
          const t0 = Math.min(ta, tb); const t1 = Math.max(ta, tb);
          const len = t1 - t0;                     // = 1/|da|, the ruling's own length
          const at = (tt) => {
            const t = t0 + len * tt;
            return { a: clamp(a0 + t * da, 0, 1), b: wrap01(b0 + t * db) };
          };
          // Sample density per unit of parameter length matches an axis line's.
          at.steps = steps * len;
          return at;
        };
        return { span: period, lineAt: lineAtWrapped, na, nb, da, db };
      }
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

    // ── THE CONTINUOUS FAMILY ────────────────────────────────────────────────
    //
    // Not a comb with a selection rule on top — an INTEGRATION. Walk across the
    // family from one edge of the parameter domain to the other; at each point
    // ask the field how much clearance the light wants here, in millimetres of
    // paper; step by exactly that much and place a ruling. The gap between two
    // adjacent rulings is therefore a continuous function of where they are, so
    // it can close to nothing in shadow, open smoothly across the highlight and
    // close again on the far side — with no step anywhere, because there is no
    // grid left for a step to be a multiple of.
    //
    // Every ruling placed is drawn WHOLE (`algoCoverage` hands the ladder 1), so
    // this construction cannot produce a free end, a chattered stub, or a
    // dropped ruling. Nothing is placed outside the parameter domain and every
    // sample is still back-face culled and HLR-clipped by `emitLine`, so nothing
    // can land outside the silhouette either.
    const emitContFamily = (kind, angleDeg, count, back) => {
      const wantFront = !back;
      const fam = (kind === 'angle') ? angleFamily(angleDeg) : null;
      const span = fam ? fam.span : 1;
      const lineAt = fam ? fam.lineAt : ((frac) => axisLine(kind, frac));
      // The parameter offset one unit of `frac` moves ACROSS the family, and the
      // direction the ruling itself runs. Together these are what turns a
      // parameter step into millimetres of screen (see `perpPitch`).
      const unitOff = fam ? { a: fam.na * span, b: fam.nb * span }
        : (kind === 'b' ? { a: 0, b: 1 } : { a: 1, b: 0 });
      const dirOf = fam ? { a: fam.da, b: fam.db }
        : (kind === 'b' ? { a: 1, b: 0 } : { a: 0, b: 1 });
      // The projection's own scale, measured once. Orthographic and uniform, so
      // one number converts world millimetres to screen millimetres — which is
      // what `contFieldSurface` and `contFieldFore` need in order to state a
      // spacing in the SURFACE's units and still land a known tone on paper.
      const projScale = (() => {
        const o = { x: 0, y: 0, z: 0 };
        const p0 = projectWorld(o);
        if (!p0) return 1;
        let best = 0;
        [['x', 1], ['y', 1], ['z', 1]].forEach(([ax]) => {
          const q = { x: 0, y: 0, z: 0 }; q[ax] = 10;
          const p1 = projectWorld(q);
          if (p1) best = Math.max(best, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10);
        });
        return best > 1e-6 ? best : 1;
      })();
      const worldAt = (a, b) => {
        const p = chart(clamp(a, 0, 1), clamp(b, 0, 1));
        return p ? applyTransform(p, t) : null;
      };
      // ZANDER, ISENBERG, SCHLECHTWEG & STROTHOTTE (CGF 2004) — the
      // foreshortening factor. `cross(t, n)` is the unit surface direction
      // ACROSS the ruling; the length of its projection into the view plane is
      // how much of a millimetre of surface survives as a millimetre of paper.
      // Without it a surface turning away from the camera reads darker than the
      // light says, which is false limb-darkening.
      const foreAt = (smp, tanW) => {
        if (!smp || !smp.wN || !tanW) return 1;
        const c = {
          x: tanW.y * smp.wN.z - tanW.z * smp.wN.y,
          y: tanW.z * smp.wN.x - tanW.x * smp.wN.z,
          z: tanW.x * smp.wN.y - tanW.y * smp.wN.x,
        };
        const m = Math.hypot(c.x, c.y, c.z);
        if (!(m > 1e-9)) return 1;
        const v = rotatePoint({ x: c.x / m, y: c.y / m, z: c.z / m }, cam);
        return clamp(Math.hypot(v.x, v.y), 0.02, 1);
      };
      // ── PROBE ONE CANDIDATE RULING ──────────────────────────────────────────
      // Returns the ruling's screen polyline, the radiance the field should read
      // for it, and the metric: how many millimetres one unit of `frac` buys
      // across the family here. Radiance is weighted by the screen AREA each
      // sample stands for (arc length along × clearance across), because that is
      // what the eye integrates — a parameter-weighted mean would let a
      // foreshortened pole outvote the whole lit face.
      const probe = (frac) => {
        const at = lineAt(clamp(frac, 0, 1));
        if (!at) return null;
        const st = Math.max(8, Math.round(at.steps || steps));
        const pts = [];
        let iSum = 0; let wSum = 0;
        let mmSum = 0; let mmW = 0;
        let prevW = null; let prevS = null;
        for (let s = 0; s <= st; s++) {
          const pr = at(s / st);
          const smp = sampleAt(pr.a, pr.b);
          if (!smp || smp.front !== wantFront) { pts.push(null); prevW = null; prevS = null; continue; }
          const scr = { x: smp.x, y: smp.y, I: smp.I };
          pts.push(scr);
          // The ruling's own world tangent, from the step just taken.
          let tanW = null;
          if (prevW && smp.world) {
            const d = { x: smp.world.x - prevW.x, y: smp.world.y - prevW.y, z: smp.world.z - prevW.z };
            const m = Math.hypot(d.x, d.y, d.z);
            if (m > 1e-9) tanW = { x: d.x / m, y: d.y / m, z: d.z / m };
          }
          let mm;
          if (TONE_ALGO === 'contFieldSurface' || TONE_ALGO === 'contFieldFore') {
            // World-space clearance for one unit of `frac`, perpendicular to the
            // ruling — the spacing measured ON THE FORM.
            const w1 = worldAt(pr.a + unitOff.a * 1e-3, pr.b + unitOff.b * 1e-3);
            if (w1 && smp.world) {
              const o = { x: (w1.x - smp.world.x) / 1e-3, y: (w1.y - smp.world.y) / 1e-3, z: (w1.z - smp.world.z) / 1e-3 };
              let perp = Math.hypot(o.x, o.y, o.z);
              if (tanW) {
                const dt = o.x * tanW.x + o.y * tanW.y + o.z * tanW.z;
                perp = Math.hypot(o.x - dt * tanW.x, o.y - dt * tanW.y, o.z - dt * tanW.z);
              }
              mm = perp * projScale * (TONE_ALGO === 'contFieldFore' ? foreAt(smp, tanW) : 1);
            }
          }
          if (!(mm > 1e-6)) mm = perpPitch(smp, unitOff, dirOf);
          const segLen = prevS ? Math.hypot(scr.x - prevS.x, scr.y - prevS.y) : 0;
          const area = Math.max(1e-4, segLen) * Math.max(1e-3, finite(mm, 1));
          iSum += clamp(finite(smp.I, 0), 0, 1) * area; wSum += area;
          if (mm > 1e-6) { mmSum += mm * area; mmW += area; }
          prevW = smp.world; prevS = scr;
        }
        if (!(wSum > 0) || !(mmW > 0)) return { on: false, pts };
        return { on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW };
      };
      // ── ACROSS-FLOW CLEARANCE, MEASURED (Zander §4) ─────────────────────────
      // The seeding offset is the clearance in the MIDDLE of a ruling and a lie
      // at its tips, where a converging family has already closed and a
      // diverging one has already opened. So `contFieldAniso` shoots a probe
      // along the candidate ruling's own NORMAL at every sample and takes the
      // smallest crossing — clearance measured across the flow and nowhere else,
      // which is the only direction the eye reads a gap in.
      const acrossClear = (cur, prev, cap) => {
        if (!cur || !prev) return null;
        let best = Infinity;
        for (let k = 1; k < cur.length - 1; k++) {
          const p = cur[k]; const a = cur[k - 1]; const b = cur[k + 1];
          if (!p || !a || !b) continue;
          const tx = b.x - a.x; const ty = b.y - a.y;
          const tl = Math.hypot(tx, ty);
          if (!(tl > 1e-9)) continue;
          const nx = -ty / tl; const ny = tx / tl;
          const x0 = p.x - nx * cap; const y0 = p.y - ny * cap;
          const x1 = p.x + nx * cap; const y1 = p.y + ny * cap;
          for (let j = 1; j < prev.length; j++) {
            const q0 = prev[j - 1]; const q1 = prev[j];
            if (!q0 || !q1) continue;
            const rx = x1 - x0; const ry = y1 - y0;
            const sx = q1.x - q0.x; const sy = q1.y - q0.y;
            const den = rx * sy - ry * sx;
            if (Math.abs(den) < 1e-12) continue;
            const u = ((q0.x - x0) * sy - (q0.y - y0) * sx) / den;
            const v = ((q0.x - x0) * ry - (q0.y - y0) * rx) / den;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            const d = Math.abs(u - 0.5) * 2 * cap;
            if (d < best) best = d;
          }
        }
        return Number.isFinite(best) ? best : null;
      };
      // ── THE WALK ────────────────────────────────────────────────────────────
      const maxN = maxLines();
      const dfMin = 1 / Math.max(8, count * 40);
      // THE STEP CEILING IS SIX NOMINAL SPACINGS, AND IT HAD TO COME DOWN.
      // `perpPitch` is a DERIVATIVE — the millimetres one unit of `frac` buys AT
      // THIS POINT — so extrapolating a whole step from it is only sound while
      // the step is small. Where the family converges (a chart pole, a contour
      // ring approaching the axis) the derivative collapses, `want / mmPerFrac`
      // blows up, and the walk takes the ceiling. At the old ceiling of
      // count/30 that was a THIRD of the parameter domain per step: measured on
      // ellipsoid-contour, three such steps ate the far half of the form and
      // every `contField*` law left the same 6.12 mm bare patch across the
      // bottom of the object. Six nominal spacings is wide enough for the
      // sparse end (6 x the master pitch is past the O6 bar) and far too narrow
      // to swallow a form.
      const dfMax = 6 / Math.max(6, count);
      const creep = 1 / Math.max(8, count * 3);
      const walk = (fld) => {
        const placed = [];
        let f = 0;
        let guard = 0;
        let prevPts = null;
        while (f <= 1 + 1e-9 && placed.length < maxN && guard < maxN * 12) {
          guard += 1;
          const pb = probe(f);
          if (!pb || !pb.on) { f += creep; continue; }
          let want = cfWantedPitch(pb.I);
          // 'contFieldMeasured' — the global response inversion, from pass 1.
          if (TONE_ALGO === 'contFieldMeasured' && cfLut) {
            want = clamp(inkWidth() / Math.max(1e-6,
              clamp((inkWidth() / want) * cfLutGain(pb.I), 1e-4, 0.999)), cfTightPitch(), cfOpenPitch());
          }
          // 'contFieldEquil' — Ostromoukhov's LOCAL correction, averaged over
          // this ruling's own samples so the correction cannot introduce a
          // discontinuity along the line it is applied to.
          if (TONE_ALGO === 'contFieldEquil' && cfCorr) {
            let cs = 0; let cn = 0;
            pb.pts.forEach((q) => { if (q) { cs += cfCorrAt(q.x, q.y); cn += 1; } });
            if (cn) want = clamp(want / clamp(cs / cn, 0.6, 1.7), cfTightPitch(), cfOpenPitch());
          }
          if (TONE_ALGO === 'contFieldQuant') want = cfQuantise(want);
          let df = clamp(want / Math.max(1e-6, pb.mmPerFrac), dfMin, dfMax);
          if (TONE_ALGO === 'contFieldAniso' && prevPts) {
            // Two corrections, never more: this is a fixed-point step, not a
            // solve, and a third pass moves the answer by under a per cent.
            for (let it = 0; it < 2; it++) {
              const cand = probe(f + df);
              if (!cand || !cand.on) break;
              const got = acrossClear(cand.pts, prevPts, want * 3);
              if (!(got > 1e-4)) break;
              df = clamp(df * clamp(want / got, 0.5, 2), dfMin, dfMax);
            }
          }
          cfStat.placed += 1;
          if (want <= cfTightPitch() * 1.002) cfStat.atFloor += 1;
          if (want <= inkWidth() * 1.02) cfStat.flooded += 1;
          if (want < cfStat.minPitch) cfStat.minPitch = want;
          if (want > cfStat.maxPitch) cfStat.maxPitch = want;
          if (fld) {
            for (let k = 1; k < pb.pts.length; k++) {
              const a = pb.pts[k - 1]; const b = pb.pts[k];
              if (a && b) cfAddInk(fld, a.x, a.y, b.x, b.y);
              if (b) cfAddRad(fld, b.x, b.y, b.I);
            }
          }
          placed.push({ frac: f, df, I: pb.I, want });
          prevPts = pb.pts;
          f += df;
        }
        return placed;
      };
      // The calibrated laws place, measure, and place again. Only the LAST pass
      // is emitted — the earlier ones exist purely to find out what the paper
      // actually received.
      const P = cfPasses();
      let placed = null;
      for (let pass = 0; pass < P; pass++) {
        const last = pass === P - 1;
        const fld = last ? null : cfMakeField();
        const at0 = cfStat.placed;
        placed = walk(fld);
        if (!last) {
          // A measuring pass is not a drawing; roll its counters back.
          cfStat.placed = at0;
          const res = cfResidual(fld);
          if (TONE_ALGO === 'contFieldMeasured') cfBuildLut(res);
          else if (TONE_ALGO === 'contFieldEquil') cfBuildCorr(res);
        }
      }
      if (!placed || !placed.length) return;
      nextFam('A');
      placed.forEach((p, i) => {
        const at = lineAt(p.frac);
        if (!at) return;
        // `pitchStep` is the ruling's OWN gap, not a family constant — which is
        // the whole difference between this family and every other one here, and
        // it is what makes every pitch-derived quantity downstream honest.
        emitLine(at, p.frac, back, i, placed.length, null,
          { a: unitOff.a * p.df, b: unitOff.b * p.df }, dirOf, false);
      });
    };

    const emitAngledFamily = (angleDeg, count, back, zoneGate, densityCross) => {
      nextFam(densityCross ? 'over' : (zoneGate ? `gate${zoneGate}` : 'A'));
      const fam = angleFamily(angleDeg);
      // Keep the LINE SPACING (not the line count) constant as the family
      // rotates, so Density reads the same at every angle. span = 1 on an axis.
      const n = Math.max(2, Math.round(count * fam.span));
      for (let i = 0; i < n; i++) {
        const at = fam.lineAt((i + 0.5) / n);
        // Same dark→dense ladder the axis families use. Adjacent lines are
        // span/n apart ALONG the family normal, in parameter space.
        const step = fam.span / n;
        if (at) emitLine(boustro(at, i), (i + 0.5) / n, back, i, n, zoneGate,
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
    // ── THE DOMAIN IS A CYLINDER, FOR A STREAMLINE TOO ────────────────────────
    // `angleFamily` learned this the hard way ("THE WIND SEAM IS NOT A WALL"):
    // `a` has genuine ends (the poles) and `b` is periodic, so a family clipped
    // against the unit SQUARE stops dead on a meridian that is ordinary visible
    // surface. A traced streamline hit exactly the same wall — measured on the
    // first contourFlow cut, the sphere came back as 50 fragments averaging half
    // a chord each, with an 18.35 mm free end and a 12.98 mm bare gap. So a flow
    // trace is bounded on `a` only, keeps `b` UNWRAPPED in its point list (so
    // the interpolation between two points never runs backwards across the
    // seam), and wraps only when it samples or emits.
    const wrapB = (v) => { const w = v % 1; return w < 0 ? w + 1 : w; };
    const inCylinder = (p) => p.a >= 0 && p.a <= 1;

    // Build the whole screen-frame crossed family once, and cache it: the T
    // gate, the F gate and the Density-overflow pass all emit the SAME geometry
    // and differ only in which zone they are allowed to draw in, so tracing once
    // makes the new family cheaper than the three straight ones it replaces.
    // ── 'contourFlow' — THE RULING DIRECTION IS THE LIGHT ──────────────────────
    //
    // Every other law here rules along the chart and varies the SPACING. This
    // one rules along the LIGHTING and lets the direction carry it, which is
    // what a hand engraver does: the strokes wrap a sphere because the light
    // wraps it, not because the parameterisation does.
    //
    // The intensity used is the SIGNED (unclamped) Lambert wherever the lights
    // are in scope. `smp.I` is clamped, so the whole dark side of a form is
    // I = 0 and its gradient vanishes — the field would have no direction at all
    // over exactly the half of the object this is supposed to describe.
    //
    //   'iso'  the level-set tangent, (−I_b, I_a) in the parameter square. This
    //          is coordinate-covariant: the level set of I is the same curve
    //          whatever chart names it, so no pullback is needed and none is
    //          done.
    //   'grad' the steepest-descent direction ON SCREEN, which is the honest
    //          orthogonal — perpendicularity is a screen property and the chart
    //          is not conformal. ∇_screen I = J^-T ∇_param I, then pulled back
    //          through `pullbackDir` exactly as the +65° family is.
    const FLOW_H = 1 / 256;
    const flowIntensity = (smp) => {
      if (!smp) return null;
      const lights = zoneCtx ? zoneCtx.lights : null;
      if (lights && typeof Regions.signedLambert === 'function') {
        return finite(Regions.signedLambert(smp.wN, smp.world, lights), finite(smp.I, 0));
      }
      return finite(smp.I, 0);
    };
    const flowDir = (p, mode) => {
      const smp = sampleAt(p.a, p.b);
      if (!smp) return null;
      const sA1 = sampleAt(clamp(p.a + FLOW_H, 0, 1), p.b);
      const sA0 = sampleAt(clamp(p.a - FLOW_H, 0, 1), p.b);
      const sB1 = sampleAt(p.a, clamp(p.b + FLOW_H, 0, 1));
      const sB0 = sampleAt(p.a, clamp(p.b - FLOW_H, 0, 1));
      if (!sA1 || !sA0 || !sB1 || !sB0) return null;
      const Ia = flowIntensity(sA1) - flowIntensity(sA0);
      const Ib = flowIntensity(sB1) - flowIntensity(sB0);
      const m = Math.hypot(Ia, Ib);
      if (!(m > 1e-12)) return null;   // the light is flat here; caller falls back
      if (mode !== 'grad') return { a: -Ib / m, b: Ia / m };
      if (!smp.dA || !smp.dB) return null;
      const det = smp.dA.x * smp.dB.y - smp.dB.x * smp.dA.y;
      const scale = Math.hypot(smp.dA.x, smp.dA.y) * Math.hypot(smp.dB.x, smp.dB.y);
      if (!(Math.abs(det) > CROSS_MIN_DET * Math.max(1e-12, scale))) return null;
      return pullbackDir(smp,
        (smp.dB.y * Ia - smp.dA.y * Ib) / det,
        (smp.dA.x * Ib - smp.dB.x * Ia) / det);
    };

    // ── 'curvatureField' — THE RULINGS FOLLOW THE PRINCIPAL CURVATURES ────────
    //
    // Hertzmann & Zorin, SIGGRAPH 2000: hatching along the principal curvature
    // directions reads as FORM far more strongly than hatching along whatever
    // the parameterisation happens to be, because the direction field is a
    // property of the SURFACE and not of the chart that names it.
    //
    // The field is the shape operator's eigenvectors, computed on the chart the
    // fill is already sampling. Second-order central differences give the two
    // fundamental forms directly:
    //     I  = [[E,F],[F,G]]   E = r_u·r_u, F = r_u·r_v, G = r_v·r_v
    //     II = [[L,M],[M,N]]   L = r_uu·n,  M = r_uv·n,  N = r_vv·n
    //     S  = I⁻¹ II          eigenvectors = principal directions in (du,dv)
    // and the eigenvector of the LARGER |κ| is the direction of strongest
    // bending — the one an engraver rules ACROSS, so the family runs along its
    // partner. (`curv` is that partner; `curv2` is the strong direction itself,
    // and is what the crosshatch mapper's second family gets.)
    //
    // ── THE SINGULARITY, HANDLED EXPLICITLY ───────────────────────────────────
    //
    // At an UMBILIC point κ₁ = κ₂ and every tangent direction is principal — the
    // field is not merely hard to compute there, it does not exist. A sphere is
    // umbilic AT EVERY POINT, so on the primary test primitive the curvature
    // field is undefined everywhere, not just at isolated poles. An ellipsoid
    // has four isolated umbilics; a capsule's hemispherical caps are umbilic
    // over their whole area and its barrel is not.
    //
    // So the field is BLENDED, not switched. `u` is the normalised curvature
    // anisotropy |κ₁−κ₂| / (|κ₁|+|κ₂|), which is 0 at an umbilic and 1 on a
    // cylinder. Where u ≥ UMB_HI the principal direction is taken outright;
    // where u ≤ UMB_LO it is discarded entirely and the ruling follows the LIGHT
    // — the iso-intensity tangent, which is defined wherever the shading has a
    // gradient and is the field `contourFlow` measured best of any law. In
    // between the two are blended on a smootherstep, with the principal
    // direction sign-aligned to the light direction first so the blend cannot
    // cancel. There is no discontinuity anywhere in the transition, which is the
    // reason for blending rather than thresholding.
    //
    // ON A SPHERE THIS DEGENERATES TO contourFlow's ISO FIELD BY CONSTRUCTION.
    // That is the correct answer and it is reported as such: the curvature field
    // has nothing to say about a sphere, so the light is allowed to say it.
    const CURV_H = 1 / 192;
    const UMB_LO = 0.06;
    const UMB_HI = 0.30;
    const dot3 = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;
    const curvDir = (p, mode) => {
      const h = CURV_H;
      const a = clamp(p.a, h, 1 - h);
      const b = clamp(p.b, h, 1 - h);
      const r = (u, v) => chart(clamp(u, 0, 1), clamp(v, 0, 1));
      const c0 = r(a, b);
      const ap = r(a + h, b); const am = r(a - h, b);
      const bp = r(a, b + h); const bm = r(a, b - h);
      const pp = r(a + h, b + h); const pm = r(a + h, b - h);
      const mp = r(a - h, b + h); const mm = r(a - h, b - h);
      if (!c0 || !ap || !am || !bp || !bm || !pp || !pm || !mp || !mm) return null;
      const ru = { x: (ap.x - am.x) / (2 * h), y: (ap.y - am.y) / (2 * h), z: (ap.z - am.z) / (2 * h) };
      const rv = { x: (bp.x - bm.x) / (2 * h), y: (bp.y - bm.y) / (2 * h), z: (bp.z - bm.z) / (2 * h) };
      const ruu = { x: (ap.x - 2 * c0.x + am.x) / (h * h), y: (ap.y - 2 * c0.y + am.y) / (h * h), z: (ap.z - 2 * c0.z + am.z) / (h * h) };
      const rvv = { x: (bp.x - 2 * c0.x + bm.x) / (h * h), y: (bp.y - 2 * c0.y + bm.y) / (h * h), z: (bp.z - 2 * c0.z + bm.z) / (h * h) };
      const q = 4 * h * h;
      const ruv = { x: (pp.x - pm.x - mp.x + mm.x) / q, y: (pp.y - pm.y - mp.y + mm.y) / q, z: (pp.z - pm.z - mp.z + mm.z) / q };
      const nn = cross(ru, rv);
      const nl = Math.hypot(nn.x, nn.y, nn.z);
      if (!(nl > 1e-12)) return null;                    // a chart singularity (a pole)
      const n = { x: nn.x / nl, y: nn.y / nl, z: nn.z / nl };
      const E = dot3(ru, ru); const F = dot3(ru, rv); const G = dot3(rv, rv);
      const det = E * G - F * F;
      if (!(Math.abs(det) > 1e-14)) return null;
      const L = dot3(ruu, n); const M = dot3(ruv, n); const N = dot3(rvv, n);
      // S = I⁻¹ II, written out.
      const s11 = (G * L - F * M) / det;
      const s12 = (G * M - F * N) / det;
      const s21 = (E * M - F * L) / det;
      const s22 = (E * N - F * M) / det;
      const tr = s11 + s22;
      const dt = s11 * s22 - s12 * s21;
      const disc = tr * tr / 4 - dt;
      if (!(disc >= 0)) return null;
      const rt = Math.sqrt(Math.max(0, disc));
      const k1 = tr / 2 + rt;                            // the larger principal curvature
      const k2 = tr / 2 - rt;
      const umb = clamp(Math.abs(k1 - k2) / Math.max(1e-12, Math.abs(k1) + Math.abs(k2)), 0, 1);
      umbStat.n += 1; umbStat.sum += umb;
      if (umb <= UMB_LO) umbStat.degenerate += 1;
      // Eigenvector for the requested curvature, in (du,dv).
      const kk = (mode === 'curv2') ? k1 : k2;
      let du; let dv;
      if (Math.abs(s12) > 1e-14) { du = s12; dv = kk - s11; }
      else if (Math.abs(s21) > 1e-14) { du = kk - s22; dv = s21; }
      else { du = (mode === 'curv2') ? 1 : 0; dv = (mode === 'curv2') ? 0 : 1; }
      const dl = Math.hypot(du, dv);
      if (!(dl > 1e-12)) return null;
      let pdir = { a: du / dl, b: dv / dl };
      // THE BLEND. `iso` is the light's own level-set tangent; where the
      // curvature field is umbilic it takes over completely.
      const iso = flowDir(p, 'iso');
      if (!iso) return pdir;
      const t = clamp((umb - UMB_LO) / Math.max(1e-6, UMB_HI - UMB_LO), 0, 1);
      const w = t * t * t * (t * (6 * t - 15) + 10);
      if (w >= 0.999) return pdir;
      if (w <= 0.001) return iso;
      pdir = alignTo(pdir, iso);
      const ba = w * pdir.a + (1 - w) * iso.a;
      const bb2 = w * pdir.b + (1 - w) * iso.b;
      const bl = Math.hypot(ba, bb2);
      return bl > 1e-12 ? { a: ba / bl, b: bb2 / bl } : iso;
    };
    // How umbilic the object turned out to be — reported, not assumed.
    const umbStat = { n: 0, sum: 0, degenerate: 0 };

    const crossFamilyCache = new Map();
    const buildCrossFamily = (baseAngleDeg, deg, count, flow) => {
      const key = `${baseAngleDeg}|${deg}|${count}|${flow || ''}`;
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
        let d = null;
        if (flow) {
          // The lighting field. Where it is degenerate — a flat-lit patch, the
          // pole of the light — the last direction the ruling had is a better
          // continuation than the chart's, so `ref` leads and nominal is the
          // last resort.
          // 'curv'/'curv2' are the principal-curvature fields, which fall back
          // to the lighting field themselves wherever the surface is umbilic.
          d = (flow === 'curv' || flow === 'curv2') ? curvDir(p, flow) : flowDir(p, flow);
          return alignTo(d || ref || nomDir, ref || nomDir);
        }
        const smp = sampleAt(p.a, p.b);
        d = smp ? screenCrossDir(smp, aDir, deg, sense) : null;
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
      // ── 'evenStreamlines' — JOBARD & LEFER, WITH d_sep TAKEN FROM THE TONE ──
      //
      // `contourFlow` read the light better than any other law measured (R²
      // 0.444 on the sphere, against 0.003-0.11 for every family that rules
      // along the chart) and had the worst craft of any: spacing CoV 2.32,
      // 10.6 mm of free end, a 10.2 mm bare patch. Both defects have the same
      // cause and it is stated in the note above — the separation above exists
      // to catch COLLAPSE, deliberately sits at HALF the plot floor, and does
      // nothing whatever to SPACE the family. Integral curves of a direction
      // field are not an evenly-spaced family, and seeding them on the nominal
      // comb does not make them one: where the field converges they pile up,
      // where it diverges they leave a hole.
      //
      // Jobard & Lefer (1997) is the standard answer and it is two rules:
      //   (1) a curve TERMINATES when it comes within d_test·d_sep of a curve
      //       already laid down;
      //   (2) new curves are SEEDED at d_sep from the ones already laid, until
      //       no admissible seed remains.
      // Applied here with d_sep taken from the LIGHT rather than from a
      // constant — Salisbury's w = 2h/t, restated on this file's own tone target
      // as inkWidth/targetArea(I) and clamped between the plot floor and the O6
      // sparse bar. The spacing IS the tone, so no ladder, no threshold and no
      // quantisation is involved anywhere in this law: it is the only one here
      // that cannot band by construction.
      //
      // Seeding is a Hammersley candidate lattice over the parameter square,
      // rejected on the same occupancy the termination rule reads. That is
      // dart-throwing rather than their perpendicular-offset queue, and the
      // difference is stated plainly: it fills the domain, but it does not
      // guarantee the tightest packing their queue reaches.
      const even = Boolean(flow) && TONE_ALGO === 'evenStreamlines';
      const ES_TEST = 0.55;
      const ES_CELL = Math.max(0.4, (litMaxPitchPen() * penWidth) / 3);
      const esGrid = new Map();
      const dSepAt = (smp) => clamp(inkWidth() / clamp(targetArea(smp ? smp.I : 0), 0.02, 0.98),
        floorPitch, litMaxPitchPen() * penWidth);
      const esStamp = (x, y, self) => {
        const k = `${Math.floor(x / ES_CELL)},${Math.floor(y / ES_CELL)}`;
        let arr = esGrid.get(k);
        if (!arr) { arr = []; esGrid.set(k, arr); }
        arr.push(x, y, self);
      };
      const esNear = (x, y, self, r) => {
        const ix = Math.floor(x / ES_CELL); const iy = Math.floor(y / ES_CELL);
        const R = Math.min(4, Math.ceil(r / ES_CELL));
        const r2 = r * r;
        for (let j = -R; j <= R; j++) {
          for (let i = -R; i <= R; i++) {
            const arr = esGrid.get(`${ix + i},${iy + j}`);
            if (!arr) continue;
            for (let q = 0; q < arr.length; q += 3) {
              if (arr[q + 2] === self) continue;
              const dx = arr[q] - x; const dy = arr[q + 1] - y;
              if (dx * dx + dy * dy < r2) return true;
            }
          }
        }
        return false;
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
      // A FLOW RULING IS NOT BUDGETED BY A CHORD. The arc bound above exists to
      // stop a +65° streamline spending twice the ink the ladder allocated to
      // the straight ruling it replaces. contourFlow has no straight ruling to
      // replace — the streamline IS the family — and binding it to the nominal
      // chord is what cut the sphere into 50 half-length fragments. So a flow
      // trace is given a full traversal of the domain and stops where the domain
      // does, which is what "edge to edge" means, with proportionally more steps
      // so the step SIZE is unchanged.
      const halfSteps = Math.max(4, Math.round(flow ? steps : steps / 2));
      const FLOW_ARC = 2.6;
      const trace = (seed, nomLen, self) => {
        const h = Math.max(1e-4, nomLen / 2) / halfSteps;
        const fwd = []; const bwd = [];
        // On a flow family the domain is a cylinder and `b` is not a wall (see
        // `inCylinder`); everywhere else the square clip is what it always was.
        const inDom = flow ? inCylinder : inSquare;
        const at = flow ? ((p) => ({ a: p.a, b: wrapB(p.b) })) : ((p) => p);
        const walk = (sign, into) => {
          let cur = { a: seed.a, b: seed.b };
          let ref = null;
          for (let k = 0; k < halfSteps; k++) {
            let d = dirField(at(cur), ref);
            if (ref == null && sign < 0) d = { a: -d.a, b: -d.b };
            const mid = { a: cur.a + d.a * h * 0.5, b: cur.b + d.b * h * 0.5 };
            if (!inDom(mid)) break;
            const d2 = dirField(at(mid), d);
            const nx = { a: cur.a + d2.a * h, b: cur.b + d2.b * h };
            if (!inDom(nx)) break;
            // Screen-space separation: walk the new step at sub-cell resolution
            // and stop the ruling the moment it enters another ruling's floor.
            const c0 = at(cur); const c1 = at(nx);
            const s0 = sampleAt(c0.a, c0.b);
            const s1 = sampleAt(c1.a, c1.b);
            if (s0 && s1 && s0.front && s1.front) {
              const segLen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
              const sub = Math.max(1, Math.ceil(segLen / (CELL * 0.5)));
              let blocked = false;
              // Rule (1): terminate at d_test x the LOCAL d_sep, which is the
              // spacing this radiance asks for — not at a global constant.
              const rTest = even ? dSepAt(s1) * ES_TEST : 0;
              for (let q = 1; q <= sub; q++) {
                const u = q / sub;
                const px = s0.x + (s1.x - s0.x) * u; const py = s0.y + (s1.y - s0.y) * u;
                if (even ? esNear(px, py, self, rTest) : occupiedByOther(px, py, self)) { blocked = true; break; }
              }
              if (blocked) break;
              for (let q = 0; q <= sub; q++) {
                const u = q / sub;
                const px = s0.x + (s1.x - s0.x) * u; const py = s0.y + (s1.y - s0.y) * u;
                if (even) esStamp(px, py, self); else stamp(px, py, self);
              }
            }
            cur = nx; ref = d2;
            into.push({ a: cur.a, b: cur.b, da: d2.a, db: d2.b });
          }
        };
        walk(1, fwd);
        walk(-1, bwd);
        const d0 = dirField(at(seed), null);
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
        const nomLen = flow ? FLOW_ARC : Math.hypot(p1.a - p0.a, p1.b - p0.b);
        lines.push(trace(at(0.5), nomLen, i));
      }
      // Rule (2): KEEP SEEDING until the domain is full. Candidates come off a
      // Hammersley lattice — stratified in `a`, bit-reversed in `b` — so the
      // order in which the square is offered to the tracer is itself
      // low-discrepancy and the family fills evenly rather than sweeping.
      if (even) {
        const CAND = 40;
        const budget = Math.min(maxLines(), Math.max(n * 3, 64));
        for (let c = 0; c < CAND * CAND && lines.length < budget; c++) {
          const seed = { a: clamp((c % CAND + 0.5) / CAND, 0, 1), b: clamp(vdc2(Math.floor(c / CAND) * CAND + (c % CAND)), 0, 1) };
          const smp = sampleAt(seed.a, seed.b);
          if (!smp || !smp.front) continue;
          if (esNear(smp.x, smp.y, -1, dSepAt(smp))) continue;
          const L = trace(seed, FLOW_ARC, lines.length);
          if (L && L.pts.length >= 2) lines.push(L); else lines.push(null);
        }
        // The measured neighbour offset below assumes lines[i±1] are the
        // spatial neighbours, and after re-seeding they are not — the family is
        // no longer a comb. The nominal offset is the honest fallback, and the
        // quantity it feeds (the plot-floor cap) is superseded here anyway: this
        // law enforces the floor on SCREEN, per curve, which is stricter.
        lines.forEach((L) => { if (L) L.off = L.pts.map(() => nomOff); });
        const famE = { n: lines.length, lines, step, nomOff, wrap: true, even: true };
        crossFamilyCache.set(key, famE);
        return famE;
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
      const fam = { n, lines, step, nomOff, wrap: Boolean(flow) };
      crossFamilyCache.set(key, fam);
      return fam;
    };

    // Emit the screen-frame crossed family. Same signature role as
    // emitAngledFamily, same line budget, same ladder ranks.
    const emitScreenCross = (baseAngleDeg, deg, count, back, zoneGate, densityCross, flow) => {
      // MERGE FIX (shadow-anatomy × p4). This function is shadow-anatomy's
      // screen-frame replacement for the `emitAngledFamily` calls that used to
      // draw the terminator cross; p4 independently added `nextFam` family
      // tagging to `emitFamily` and `emitAngledFamily`, the only two emitLine
      // callers that existed when it was written. The two changes touch no
      // common line, so the merge was textually clean and silently produced a
      // third emitLine caller that never opens a family — every cross ruling
      // inherited the PREVIOUS family's id ('A#n'). That is not cosmetic:
      // `run.fam` is the key p4's continuity contract groups rulings by, so the
      // cross lines landed in family A's per-ruling buckets and made whole
      // rulings read as 3+ fragments, while `gate*` matched nothing at all.
      // Tag identically to `emitAngledFamily` — same argument names, same
      // precedence — so the cross is once again its own family.
      nextFam(densityCross ? 'over' : (zoneGate ? `gate${zoneGate}` : 'A'));
      const fam = buildCrossFamily(baseAngleDeg, deg, count, flow);
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
          const bb = p.b + (q.b - p.b) * u;
          // `b` is stored UNWRAPPED on a flow family, precisely so this
          // interpolation cannot run backwards across the wind seam; it is
          // wrapped here, once, at the point it becomes a chart coordinate.
          return { a: clamp(p.a + (q.a - p.a) * u, 0, 1), b: fam.wrap ? wrapB(bb) : clamp(bb, 0, 1) };
        };
        const dirAt = (tt) => L.pts[Math.round(idxAt(tt))] || L.pts[0];
        const lineDir = (tt) => { const p = dirAt(tt); return { a: p.da, b: p.db }; };
        const pitchStep = (tt) => L.off[Math.round(idxAt(tt))] || fam.nomOff;
        emitLine(paramAt, (i + 0.5) / fam.n, back, i, fam.n, zoneGate,
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
      // 'layeredCross' — tone by ADDING families, the engraver's answer.
      // Family A (already emitted, at the flat sparse-end pitch) runs the whole
      // form. A second family crosses it wherever the surface is at or below the
      // mid-tone cut, and a third crosses both in the darks. Every family is
      // internally even and continuous, because each is a full phase-ladder pass
      // at ONE coverage; the tone is the COUNT of families over a point, not the
      // spacing of any of them.
      //
      // +65° and +32° are the angles this file already uses for a second and
      // third direction, and for the reason stated at `emitTerminatorCross`
      // below: +90° reads as a square grid and beats against the raster.
      // NOT `emitScreenCross`. That one traces streamlines of a screen-frame
      // direction field and stops a ruling the moment it comes within the plot
      // floor of one already laid — which is right for the terminator ACCENT it
      // was built for, and wrong here: measured, it built only 13 rulings across
      // the whole object for the +65° pass, so the added family read as four
      // stray arcs rather than as a second layer of tone. A plain angled family
      // is the same construction family A itself uses, so the added layers are
      // as even and as complete as the base one.
      const emitLayeredCross = (count, back) => {
        const base = finite(opts.fillAngle, 0);
        emitAngledFamily(base + 65, count, back, ['X1', 'X2']);
        emitAngledFamily(base + 32, count, back, ['X2']);
      };
      // 'crossFade' — layeredCross's three layers with the gates taken OFF.
      //
      // The two flaws being removed are both in the argument list. `zoneGate` is
      // gone, so no family is confined to a zone and therefore no family has an
      // edge to trace; and because every ruling is un-gated, every ruling runs
      // the full width of the form, so none of them can terminate in open
      // surface. The fade is carried entirely by `crossFadeCov` through
      // `xfLayer` — density, continuously, exactly as the eye reads a wash
      // thickening. Family A is layer 0 and was already emitted by the mapper.
      const emitCrossFade = (count, back) => {
        const base = finite(opts.fillAngle, 0);
        xfLayer = 1; emitAngledFamily(base + 65, count, back);
        xfLayer = 2; emitAngledFamily(base + 32, count, back);
        xfLayer = 0;
      };
      const emitTerminatorCross = (count, back) => {
        // V5 — THE THREE-PEN LAWS' EXTRA FAMILIES. Family A is already emitted
        // by the mapper at the full line count; these are the partners, each at
        // its own angle and its own line count, each drawn with ONE nib. All are
        // un-gated, so no ruling of any of them can terminate in open surface,
        // and all enter by density off `penPlan` (no threshold, no traceable
        // onset). A law with no entry in PEN_FAMILIES is a single-family law and
        // adds nothing here.
        if (isPenLaw()) {
          const plan = PEN_FAMILIES[TONE_ALGO];
          if (toneOn && plan) {
            const base = finite(opts.fillAngle, 0);
            plan.forEach((f) => {
              const n = Math.max(2, Math.round(count / Math.max(1, f.div)));
              xfLayer = clamp(Math.round(f.layer), 0, 2);
              if (f.deg) { emitAngledFamily(base + f.deg, n, back); return; }
              if (mapper === 'contour') emitFamily('a', n, back);
              else if (onMeridianAxis) emitFamily('b', n, back);
              else emitAngledFamily(hatchAngle, n, back);
            });
            xfLayer = 0;
          }
          return;
        }
        if (TONE_ALGO === 'layeredCross') { if (toneOn) emitLayeredCross(count, back); return; }
        if (TONE_ALGO === 'crossFade') { if (toneOn) emitCrossFade(count, back); return; }
        // 'weightCrossHandoff' — ONE added family, entering by density from
        // nothing on the offset grey (see xhAreaB). Un-gated, exactly as
        // crossFade's are, so every ruling of it runs the full width of the form
        // and none can terminate in open surface.
        if (TONE_ALGO === 'weightCrossHandoff') {
          if (toneOn) {
            xfLayer = 1;
            emitAngledFamily(finite(opts.fillAngle, 0) + 65, count, back);
            xfLayer = 0;
          }
          return;
        }
        // 'multiScale' — THE COARSE OCTAVE. Family A (already emitted by the
        // mapper) is the FINE one at the reserved pitch; this is its partner at
        // HALF the line count, so its own `localPitch` is twice the reserved one
        // and every pitch-correct quantity downstream follows without being told.
        // Same angle, same construction, one octave apart — a pyramid, not a
        // cross. Un-gated, so every coarse ruling runs the full width of the form.
        if (TONE_ALGO === 'multiScale') {
          if (toneOn) {
            const nCoarse = Math.max(2, Math.round(count / 2));
            xfLayer = 1;
            if (mapper === 'contour') emitFamily('a', nCoarse, back);
            else if (onMeridianAxis) emitFamily('b', nCoarse, back);
            else emitAngledFamily(hatchAngle, nCoarse, back);
            xfLayer = 0;
          }
          return;
        }
        // 'wideShadowPen' — THE SECOND PEN. Same angle, half the line count (a
        // 3x nib needs 3x the room), un-gated so no ruling of it can end in open
        // surface, and entering purely by density off `wspCovWide`.
        if (TONE_ALGO === 'wideShadowPen') {
          if (toneOn) {
            const nWide = Math.max(2, Math.round(count / 2));
            xfLayer = 1;
            if (mapper === 'contour') emitFamily('a', nWide, back);
            else if (onMeridianAxis) emitFamily('b', nWide, back);
            else emitAngledFamily(hatchAngle, nWide, back);
            xfLayer = 0;
          }
          return;
        }
        // 'screenAngles' — TWO MORE FAMILIES AT THE SCREEN-THEORY SEPARATION.
        // 60° and 120° off family A instead of the file's own 65° and 32°; see
        // the constant block for why 60 is the line-screen analogue of the
        // 15/45/75 dot screen. Both enter by density from nothing (saCovAt), so
        // there is no threshold and no traceable band edge, and both are
        // un-gated, so no ruling of either can terminate in open surface.
        //
        // NOT `emitScreenCross`. That traces integral curves of a screen-frame
        // direction field and STOPS a ruling the moment it comes within the plot
        // floor of one already laid — which would breach this branch's own
        // invariant for the sake of the frame the angle is measured in. So the
        // families are plain angled ones and the harness measures the SCREEN
        // separations that actually landed, rather than this file asserting them.
        if (TONE_ALGO === 'screenAngles') {
          if (toneOn) {
            const base = finite(opts.fillAngle, 0);
            xfLayer = 1; emitAngledFamily(base + SA_SEP_DEG, count, back);
            xfLayer = 2; emitAngledFamily(base + SA_SEP_DEG * 2, count, back);
            xfLayer = 0;
          }
          return;
        }
        // 'contourFlow' replaces family A outright (see the mapper dispatch) and
        // adds nothing on top: the direction IS the tone statement.
        // 'evenStreamlines' is the same family, placed by Jobard-Lefer.
        // 'curvatureField' likewise owns family A and adds nothing.
        if (TONE_ALGO === 'contourFlow' || TONE_ALGO === 'evenStreamlines'
          || TONE_ALGO === 'curvatureField') return;
        // The `contField*` family owns family A and adds nothing on top. A
        // crossed pass would put a second, differently-spaced grid over a field
        // whose whole claim is that its spacing IS the tone, and the composed
        // clearance would no longer be the one the field placed.
        if (isContField()) return;
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
      // 'contourFlow' owns family A itself on every line mapper: the rulings are
      // streamlines of the lighting field, seeded at the nominal family's own
      // line positions so the LINE BUDGET and the ladder's ranks are untouched
      // and only the direction changes. 'crosshatch' gets the orthogonal partner
      // — iso curves crossed by gradient curves, which is the engraver's pair.
      const flowMapper = (TONE_ALGO === 'contourFlow' || TONE_ALGO === 'evenStreamlines'
        || TONE_ALGO === 'curvatureField') && toneOn
        && (mapper === 'hatch' || mapper === 'crosshatch' || mapper === 'contour');
      // ── ROUND 5: the continuous field owns family A on every line mapper ─────
      // No terminator cross, no shadow infill: both of those ADD ink on top of a
      // family whose spacing is already the complete tone statement, and both
      // would put marks at a clearance the field did not choose.
      // The mono family owns family A outright on every line mapper, and adds
      // no terminator cross and no shadow infill: both of those would put marks
      // at a clearance the law did not choose.
      const monoMapper = isMonoLaw() && toneOn
        && (mapper === 'hatch' || mapper === 'crosshatch' || mapper === 'contour');
      const contMapper = isContField() && toneOn
        && (mapper === 'hatch' || mapper === 'crosshatch' || mapper === 'contour');
      if (monoMapper) {
        MonoFill().emit({
          algo: TONE_ALGO,
          back,
          count,
          mapper,
          sampleAt,
          pushRun,
          penWidth,
          inkWidth: inkWidth(),
          floorPitch,
          masterPitch,
          litMaxPitch: litMaxPitchPen() * penWidth,
          targetArea,
          minMarkMM: MIN_MARK_MM,
          hash: sfHash,
          angleDeg: finite(opts.fillAngle, 0),
        });
      } else if (contMapper) {
        if (mapper === 'contour') {
          emitContFamily('a', 0, count, back);
        } else if (onMeridianAxis) {
          emitContFamily('b', 0, count, back);
        } else {
          emitContFamily('angle', hatchAngle, count, back);
        }
        // Crosshatch keeps its second family, placed by the SAME field — the
        // mapper is a crossed pair by definition and dropping the pair would
        // make the cell measure a hatch under a crosshatch label.
        if (mapper === 'crosshatch') {
          const aB = hatchAngle + crossDelta;
          const a180 = (((aB % 180) + 180) % 180);
          if (onMeridianAxis && a180 === 0) emitContFamily('b', 0, Math.max(2, Math.round(count / crossRatio)), back);
          else if (onMeridianAxis && a180 === 90) emitContFamily('a', 0, Math.max(2, Math.round(count / crossRatio)), back);
          else emitContFamily('angle', aB, Math.max(2, Math.round(count / crossRatio)), back);
        }
      } else if (flowMapper) {
        const fBase = finite(opts.fillAngle, 0);
        // 'curvatureField' rules along the WEAK principal direction (so the
        // strokes cross the strongest bending, which is what makes the form
        // read); its crosshatch partner takes the strong one, which is the
        // engraver's orthogonal pair on a surface rather than on a chart.
        const fMode = TONE_ALGO === 'curvatureField' ? 'curv' : FLOW_MODE;
        emitScreenCross(fBase, 0, count, back, null, false, fMode);
        if (mapper === 'crosshatch') {
          emitScreenCross(fBase, 0, count, back, null, false,
            TONE_ALGO === 'curvatureField' ? 'curv2' : (FLOW_MODE === 'iso' ? 'grad' : 'iso'));
        }
        emitShadowInfill(angleFamily(hatchAngle).lineAt, count, back);
      } else if (mapper === 'hatch') {
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
        // Same run sink as emitLine: a helix loop is a ruling too, and its
        // selection (by the turn it is on) is taken against a coverage that
        // varies along the loop, so it chattered in exactly the same way — just
        // less often, because a whole turn takes one verdict.
        const spiralFam = nextFam('spiral');
        const sink = makeSink(back, null, spiralFam);
        const flush = sink.flush;
        const total = steps * turns;
        // Sample the whole helix first, exactly as emitLine does, so the same
        // whole-span verdict can be taken here. A helix has no family index, so
        // its rank is the TURN it is on — and a turn's rank is as constant along
        // that turn as a ruling's is along itself, so comparing it against a
        // per-SAMPLE coverage cut turns in half in open surface for the very
        // same reason. Spans are delimited by the TURN as well as by the
        // surface: consecutive turns are different rulings and must be free to
        // take different verdicts.
        const sSmps = new Array(total + 1);
        const sZones = new Array(total + 1);
        const sTurn = new Array(total + 1);
        const sweepAt = (f) => {
          let sweep = symmetric ? (f < 0.5 ? f * 2 : (1 - f) * 2) : f;
          if (gamma !== 1) sweep = Math.pow(sweep, gamma);
          return sweep;
        };
        for (let s = 0; s <= total; s++) {
          const f = s / total;
          const sweep = sweepAt(f);
          const wind = (f * turns + phase) % 1;
          const smp = snap ? sampleAt(wind, sweep) : sampleAt(sweep, wind);
          const on = Boolean(smp && smp.front === wantFront);
          sSmps[s] = on ? smp : null;
          // 'layeredCross' has no gated family on the helix, so its intensity
          // zones would only cut the spiral into per-zone spans for nothing.
          sZones[s] = (on && toneOn && TONE_ALGO !== 'layeredCross') ? zoneOf(smp) : null;
          sTurn[s] = Math.floor(f * turns);
        }
        // Span key = (turn, zone). THE TURN HAS TO BE IN THE KEY, and this was
        // measured both ways. A helix's rank IS the turn it is on, so the turn is
        // the unit the verdict is taken over — the same relationship a ruling has
        // to its own rank. Keying the span on the ZONE ALONE (so a span is the
        // visible arc, and the arc's rank is the turn it is mostly on) does take
        // the helix's deepest free end from 13.3 % of the radius to 0.1 %, but a
        // sphere's helix stays front-facing straight across the wind seam, so the
        // whole visible face came back as ONE span with ONE verdict: ink rose
        // from 8190 mm to 9281 mm, the density ramp across the form collapsed
        // from 2.06x to 1.04x, and the lit end came back DENSER than mid-form.
        // That is a drawing that no longer shades, which is a worse defect than
        // the one being fixed. So the turn stays, and the residual free ends —
        // the ends of a loop whose neighbour dropped — stay with it. See the
        // report note: they land on the wind meridian, not scattered over the
        // form, because that is where every loop begins and ends.
        const sKeys = sZones.map((z, i) => `${sTurn[i]}|${z}`);
        let spTurn = -1;
        let spArc = 0;
        let sDrop = null;
        if (STAGE.dither && toneOn) {
          sDrop = useLadder
            ? spanDrops(sSmps, sKeys,
              (smp, k) => (TONE_ALGO !== 'ladder'
                ? algoCoverage(smp.I, false, smp, null)
                : (sZones[k] ? zoneCoverage(sZones[k], false) : coverageForSample(smp.I))),
              // The helix's ruling index is the TURN, so the phase advances once
              // per turn (see ladderStep) and consecutive loops end up evenly
              // spaced instead of dropping in the power-of-two pattern a
              // bit-reversed rank on the turn number produced. `spanDrops`
              // numbers spans over the WHOLE helix, so the track key cannot be
              // that ordinal — it is the arc's ordinal WITHIN its turn, which is
              // what makes the k-th arc of each turn a track of neighbours.
              (cov, mid) => {
                const turn = sTurn[mid];
                if (turn !== spTurn) { spTurn = turn; spArc = 0; } else spArc += 1;
                return !ladderKeeps(`${spiralFam}|${spArc}`, clamp(cov, 0, 1));
              })
            : spanDrops(sSmps, sKeys, (smp) => clamp(1 - smp.I, 0, 1), (shade) => shade < 0.12);
        }
        for (let s = 0; s <= total; s++) {
          const smp = sSmps[s];
          if (!smp) { flush(); continue; }
          // Same hoist as emitLine's `sampleZone`: the sink's L-zone speck
          // exemption has to hold on EVERY path that feeds it, or the law is
          // enforced on the line families and not on the helix.
          // O18 — the spiral used to gate on a hardcoded `shade < 0.12` and
          // ignored `ladder[]` outright, so `bands` did nothing at all on a
          // spiral-filled object.
          const sampleZone = sZones[s];
          if (sDrop && sDrop[s]) {
            if (useLadder) { sink.softDrop({ x: smp.x, y: smp.y }); } else { flush(); }
            continue;
          }
          sink.addPt({ x: smp.x, y: smp.y, z: smp.z }, sampleZone);
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
              // The dot now rides the same phase ladder the line families use,
              // against the local zone coverage.
              //
              // ONE TRACK PER ROW, and each row's phase OFFSET. A single track
              // running the whole raster (r x colsPer + c, which is what the
              // bit-reversed rank was indexed by) is even along the raster but
              // that is not the axis the eye reads — keeping every k-th dot in
              // raster order lands the survivors of consecutive rows at the same
              // column offset and the field  reads as diagonal rulings. So each
              // row is its own track, evenly spaced along itself, and its phase
              // starts a golden-ratio step further on than the row above, which
              // is the cheapest way to stop the rows lining up into columns.
              if (STAGE.dither && useLadder) {
                const zone = TONE_ALGO === 'layeredCross' ? null : zoneOf(smp);
                const cov = TONE_ALGO !== 'ladder'
                  ? algoCoverage(smp.I, false, smp, null)
                  : (zone ? zoneCoverage(zone, false) : coverageForSample(smp.I));
                if (!ladderKeeps(`stipple|${back ? 'B' : 'F'}|${r}`, clamp(cov, 0, 1),
                  (r * GOLDEN_STEP) % 1)) continue;
              } else if (STAGE.dither) {
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

    // The traced region's NET area in mm2 — shells minus holes, classified by
    // the same containment-depth parity `FillBoolean.nonZeroUnionByContainment`
    // applies when the clip is actually taken — plus the area its OUTER ring
    // alone encloses. The load-bearing pair:
    //   - ring COUNT cannot tell a real silhouette from a hairline walked out
    //     and back, which is the shape the seam bug produced (1 ring, area
    //     0.014, on a form whose disc is ~6650);
    //   - the SUM of |areas| cannot tell a real region from one whose middle has
    //     been carved away by a ring that was never a hole, which is the shape
    //     the torus normal-flip produced (3 rings summing to 2169 over a region
    //     that had collapsed to a 399.6 mm2 rim inside a 1282.4 mm2 silhouette).
    // `net` is what the ribbon actually gets clipped against; `outer` is what it
    // is entitled to expect, so the ratio is the collapse detector.
    const regionMetrics = (rings) => {
      const list = (rings || []).filter((r) => Array.isArray(r) && r.length >= 3);
      const abs = list.map((r) => Math.abs(ringSignedArea(r)));
      let net = 0;
      list.forEach((r, i) => {
        let depth = 0;
        for (let j = 0; j < list.length; j++) if (j !== i && ptInRing(r[0], list[j])) depth += 1;
        net += (depth % 2 === 0 ? 1 : -1) * abs[i];
      });
      const round = (v) => Math.round(v * 1000) / 1000;
      return { net: round(Math.max(0, net)), outer: round(abs.length ? Math.max(...abs) : 0) };
    };
    // Written for EVERY build, ribbon law or not — a zeroed report on a
    // non-ribbon law is itself the answer to "did this law widen anything?".
    // `regionArea` is the load-bearing field: a ribbon may only ship CLIPPED,
    // so a region that is 0 rings — or a hairline pretending to be a region —
    // means every stretch fell back to its centreline.
    const publishRibbonStats = () => {
      lastRibbonStats = {
        algo: TONE_ALGO, ribbonLaw: isRibbonLaw(), penWidth,
        regionRings: (regionMemo.get('F') || []).length,
        regionRingsBack: (regionMemo.get('B') || []).length,
        regionArea: regionMetrics(regionMemo.get('F')).net,
        regionOuterArea: regionMetrics(regionMemo.get('F')).outer,
        regionAreaBack: regionMetrics(regionMemo.get('B')).net,
        ...ribbonStat,
      };
      // ── A WHOLESALE FALLBACK IS AN ALARM, NOT A DEGRADATION ────────────────
      //
      // One sub-pen stretch dropping to its centreline is the contract (C3 rule
      // 5). EVERY wide stretch doing so means the ribbon pipeline is switched
      // off and the layer is drawing bare hairlines — which is visually quiet,
      // passes the weightScale invariant trivially, and hid a dead feature
      // behind a green suite for a whole integration round. Say it out loud,
      // once per build.
      if (isRibbonLaw() && (ribbonStat.wide + ribbonStat.walls) > 0
        && (ribbonStat.ribbons + ribbonStat.wallRings) === 0
        && typeof console !== 'undefined' && console.warn) {
        console.warn(`Vectura SurfaceFill: ribbon law "${TONE_ALGO}" built NO ribbons — `
          + `all ${ribbonStat.wide} wide stretches fell back to bare centrelines `
          + `(noRing ${ribbonStat.noRing}, clipEmpty ${ribbonStat.clipEmpty}, `
          + `erodeEmpty ${ribbonStat.erodeEmpty}, regionRings ${lastRibbonStats.regionRings}, `
          + `regionArea ${lastRibbonStats.regionArea}). The variable-width feature is INERT.`);
      }
    };
    if (!runMapper(N, false)) { flushDeferredRibbons(); publishRibbonStats(); return null; } // front surface (unchanged when no x-ray)
    // X-ray back surface: sparser (count × backDensity) far-side family, tagged.
    if (xray) runMapper(Math.max(2, Math.round(N * backDensity)), true);
    // Every chain is closed by now, so the deferred ribbons can be built — and
    // they must be built BEFORE the report, or the report describes a build that
    // has not happened yet.
    flushDeferredRibbons();
    publishRibbonStats();
    // WHERE THE PLOT FLOOR BOUND, published for the comparison harness. Written
    // only in uncapped mode, so the committed build never allocates or exposes
    // it — `lastFloorStats` stays null and nothing downstream can read a number
    // that only exists for a prototype.
    lastFloorStats = TONE_UNCAPPED ? {
      algo: TONE_ALGO,
      penWidth,
      masterPitch: Math.round(masterPitch * 1000) / 1000,
      floorPitch: Math.round(floorPitch * 1000) / 1000,
      N,
      samples: floorStat.samples,
      clamped: floorStat.clamped,
      rulingsTouched: floorStat.touched.size,
      rulingsClamped: floorStat.rulings.size,
      worstAsk: Math.round(floorStat.worst * 100) / 100,
      // ROUND 5 — where the CONTINUOUS FIELD's own floor bound, and where it
      // asked for a gap so tight the rulings abut. `contFieldTouch` is supposed
      // to reach the second one; every other law is supposed not to.
      cont: isContField() ? {
        placed: cfStat.placed,
        atFloor: cfStat.atFloor,
        flooded: cfStat.flooded,
        tightPitch: Math.round(cfTightPitch() * 1000) / 1000,
        openPitch: Math.round(cfOpenPitch() * 1000) / 1000,
        minPitch: Number.isFinite(cfStat.minPitch) ? Math.round(cfStat.minPitch * 1000) / 1000 : null,
        maxPitch: Math.round(cfStat.maxPitch * 1000) / 1000,
        levels: TONE_ALGO === 'contFieldQuant' ? CF_LEVELS : null,
      } : null,
      // ...and, for laws 12-16, where the WEIGHT range bound. Both ends of it
      // are physical (W_MIN is the pen itself, W_FLOOD_AREA is a wet blob), so
      // "did the law reach the dark it asked for" has to be reported.
      weight: weightStat.samples ? {
        samples: weightStat.samples,
        wMin: Math.round(weightStat.wMin * 100) / 100,
        wMax: Math.round(weightStat.wMax * 100) / 100,
        wMean: Math.round((weightStat.wSum / weightStat.samples) * 100) / 100,
        askMax: Math.round(weightStat.askMax * 100) / 100,
        atMax: weightStat.atMax,
        floods: weightStat.floods,
        areaMin: Math.round(weightStat.aMin * 1000) / 1000,
        areaMax: Math.round(weightStat.aMax * 1000) / 1000,
        baseCov: Math.round(weightBaseCov() * 1000) / 1000,
      } : null,
      // ...and, for the adjacent-pass family, HOW MANY PASSES A BUNDLE ACTUALLY
      // GOT. That is the whole tonal channel of those ten laws, so its range is
      // the counterpart of `weight.wMin–wMax` and is reported the same way —
      // together with the stitch tally (pen-downs the serpentine saved) and the
      // flood count (samples where a sub-nib pass overlapped the one before it,
      // which is an ink flood by this repo's own PLOT_FLOOR_PEN bar).
      adj: adjStat.bundles ? {
        law: TONE_ALGO,
        stepMM: Math.round(adjStep() * 1000) / 1000,
        stepPen: Math.round((adjStep() / inkWidth()) * 100) / 100,
        maxPasses: adjMax(),
        bundles: adjStat.bundles,
        passes: adjStat.passes,
        nMin: Number.isFinite(adjStat.nMin) ? adjStat.nMin : 0,
        nMax: adjStat.nMax,
        nMean: adjStat.bundles ? Math.round((adjStat.nSum / adjStat.bundles) * 100) / 100 : 0,
        askMax: Math.round(adjStat.askMax * 100) / 100,
        pitchMin: Math.round(adjStat.pitchMin * 1000) / 1000,
        pitchMax: Math.round(adjStat.pitchMax * 1000) / 1000,
        drew: adjStat.drew,
        gatedSamples: adjStat.samples,
        floodSamples: adjStat.floodSamples,
        stitches: adjStat.stitches,
        stitchRejects: adjStat.stitchRejects,
        penDownSaved: adjStat.penDownSaved,
        stride: adjStride(),
        nomPitch: Math.round(adjNomPitch() * 1000) / 1000,
      } : null,
      // V5 — WHERE EACH NIB BOUND. Three separate floors, so "the floor binds"
      // has three separate answers, and a flood is a flood on ONE pen.
      pens: (isPenLaw() && penStat.samples) ? {
        mm: PEN_MM.slice(),
        label: PEN_LABEL.slice(),
        mul: [penMul(0), penMul(1), penMul(2)].map((v) => Math.round(v * 1000) / 1000),
        ownFloorMM: [penOwnFloor(0), penOwnFloor(1), penOwnFloor(2)].map((v) => Math.round(v * 100) / 100),
        touchMM: [penTouchPitch(0), penTouchPitch(1), penTouchPitch(2)].map((v) => Math.round(v * 100) / 100),
        maxArea: [penMaxArea(0), penMaxArea(1), penMaxArea(2)].map((v) => Math.round(v * 1000) / 1000),
        samples: penStat.samples,
        picks: penStat.picks.slice(),
        floorBound: penStat.floorBound.slice(),
        ownFloorBound: penStat.ownFloorBound.slice(),
        flood: penStat.flood.slice(),
        lightArea: Math.round(penLightArea() * 1000) / 1000,
        darkArea: Math.round(penDarkArea() * 1000) / 1000,
      } : null,
      // ROUND 5 — WHERE THE DISSOLUTION LANDED, AND WHAT IT COST. A stipple's
      // price on a plotter is pen-downs and its risk is marks below the legal
      // minimum, so both are counted rather than asserted. `offSurface` is
      // 'lozCross' only: displaced flicks the chart refused, which is the count
      // that has to stay equal to the number of marks NOT laid outside the
      // silhouette.
      // ROUND 6 — WHERE THE MARKS LANDED, AND WHAT THEY COST. Three numbers
      // the brief asks for by name: pen-downs (a stipple's whole cost on a
      // plotter), marks refused by the chart (which is why nothing can land
      // outside the silhouette), and FLOOD — samples where the mark period fell
      // below the plot floor, i.e. where the marks are deliberately touching to
      // make pure black. The floor is respected as an ink-flood LIMIT and every
      // crossing of it is reported.
      mark: mkStat.samples ? {
        marks: mkStat.marks,
        pens: mkStat.pens,
        rows: mkStat.rows,
        ink: Math.round(mkStat.ink * 10) / 10,
        samples: mkStat.samples,
        flood: mkStat.flood,
        floodFrac: Math.round((mkStat.flood / mkStat.samples) * 1000) / 1000,
        tooShort: mkStat.tooShort,
        offSurface: mkStat.offSurface,
        noFrame: mkStat.noFrame,
        budget: mkStat.budget,
        pMin: Number.isFinite(mkStat.pMin) ? Math.round(mkStat.pMin * 1000) / 1000 : null,
        gMax: Math.round(mkStat.gMax * 100) / 100,
        rowPitch: Math.round((masterPitch / MK_ROW_COV) * 1000) / 1000,
        floorPitch: Math.round(floorPitch * 1000) / 1000,
      } : null,
      loz: lozStat.samples ? {
        samples: lozStat.samples,
        dissolved: lozStat.dissolved,
        dissolvedFrac: Math.round((lozStat.dissolved / lozStat.samples) * 1000) / 1000,
        marks: lozStat.marks,
        tooShort: lozStat.tooShort,
        offSurface: lozStat.offSurface,
        dutyMean: Math.round((lozStat.dutySum / lozStat.samples) * 1000) / 1000,
        dutyMin: Math.round(lozStat.dutyMin * 1000) / 1000,
      } : null,
      // 'curvatureField' only — HOW UMBILIC THE OBJECT TURNED OUT TO BE. The
      // principal-direction field does not exist at an umbilic point, and a
      // sphere is umbilic everywhere, so the share of samples that fell back to
      // the lighting field is the honest answer to "what did the curvature
      // field actually contribute here".
      // ROUND 5 — WHERE THE WAVE LANDED. The amplitude range and the realised
      // clearance are the two numbers the nested-serpentine claim stands on
      // ("open space minimised in the darks, whitespace opened in the lights"),
      // and `elongCapped` / `offSurface` are the two ways the claim can fail:
      // the paper refusing the arc length, and the surface refusing the crest.
      wave: waveStat.samples ? {
        samples: waveStat.samples,
        ampMin: Math.round(waveStat.ampMin * 1000) / 1000,
        ampMax: Math.round(waveStat.ampMax * 1000) / 1000,
        ampMean: Math.round((waveStat.ampSum / waveStat.samples) * 1000) / 1000,
        ampMeanDark: waveStat.darkSamples
          ? Math.round((waveStat.darkAmpSum / waveStat.darkSamples) * 1000) / 1000 : null,
        elongMin: Math.round(waveStat.elongMin * 1000) / 1000,
        elongMax: Math.round(waveStat.elongMax * 1000) / 1000,
        elongMean: Math.round((waveStat.elongSum / waveStat.samples) * 1000) / 1000,
        elongCapped: waveStat.elongCapped,
        lambdaMin: Math.round(waveStat.lambdaMin * 1000) / 1000,
        lambdaMax: Math.round(waveStat.lambdaMax * 1000) / 1000,
        clearMin: Math.round(waveStat.clearMin * 1000) / 1000,
        clearMinDark: Number.isFinite(waveStat.darkClearMin)
          ? Math.round(waveStat.darkClearMin * 1000) / 1000 : null,
        darkSamples: waveStat.darkSamples,
        offSurface: waveStat.offSurface,
        // ROUND 6 — the three numbers this round is about.
        // (a) the clearance PERPENDICULAR to the stroke, dark and light;
        clearMeanDark: waveStat.darkSamples
          ? Math.round((waveStat.darkClearSum / waveStat.darkSamples) * 1000) / 1000 : null,
        clearMinLit: Number.isFinite(waveStat.litClearMin)
          ? Math.round(waveStat.litClearMin * 1000) / 1000 : null,
        clearMeanLit: waveStat.litSamples
          ? Math.round((waveStat.litClearSum / waveStat.litSamples) * 1000) / 1000 : null,
        // (b) the amplitude that SURVIVED into the light, as a fraction of the
        //     shadow amplitude. "Waviness throughout" IS this number, and a law
        //     that straightens in the highlight reports it near zero.
        ampMeanLit: waveStat.litSamples
          ? Math.round((waveStat.litAmpSum / waveStat.litSamples) * 1000) / 1000 : null,
        litSamples: waveStat.litSamples,
        // The denominator is the WHOLE-FORM mean, not the shadow mean. Measured
        // against the shadow it is a useless ratio: a spacing-tone law rules the
        // core shadow at the plot floor, the clearance floor then cuts the
        // excursion to near nothing there, and dividing by ~0 reports
        // "2 084 552 388× retained". Against the form mean the number says what
        // it should — 1.0 is a wave of the same size everywhere, above 1.0 is
        // MORE wave in the light than on average, and near 0 is the straightened
        // highlight this round exists to prevent.
        ampRetained: (waveStat.litSamples && waveStat.samples && waveStat.ampSum > 1e-9)
          ? Math.round(((waveStat.litAmpSum / waveStat.litSamples)
            / (waveStat.ampSum / waveStat.samples)) * 1000) / 1000 : null,
        // (c) modelled elongation against the elongation the POLYLINE delivered.
        elongReal: waveStat.baseLen > 1e-6
          ? Math.round((waveStat.realLen / waveStat.baseLen) * 1000) / 1000 : null,
        floorBound: waveStat.floorBound,
        pitchPen: wvPitchPen(),
      } : null,
      umbilic: umbStat.n ? {
        samples: umbStat.n,
        anisotropyMean: Math.round((umbStat.sum / umbStat.n) * 1000) / 1000,
        degenerate: umbStat.degenerate,
        degenerateFrac: Math.round((umbStat.degenerate / umbStat.n) * 1000) / 1000,
      } : null,
    } : null;
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
    {
      SurfaceFill: {
        buildObject, chartFor, lineCountFor, __litFloorForTest, __ladderForTest: ladderKeep,
        // C4 — the stroke-fill roster + committed default, so the UI control
        // and the config default read one list rather than three copies.
        get strokeFillStyles() { return STROKE_FILL_STYLES.slice(); },
        get strokeFillDefault() { return strokeFillDefault(); },
        // Bucket B, for the UI's enable/disable decision and for tests. A copy.
        get ribbonLaws() { return Object.keys(RIBBON_LAWS); },
        get lastFloorStats() { return lastFloorStats; },
        // The last build's ribbon report — see `lastRibbonStats`. The only way
        // to distinguish a CLIPPED ribbon from an unclipped one or from a
        // silent degrade to centrelines, all three of which look alike from
        // outside. Read by the T2/T4 tests.
        get lastRibbonStats() { return lastRibbonStats; },
        // Unchanged reading: the committed default, byte-identical to the
        // pre-refactor module constant. `scene3d-tone-algo-default.test.js`
        // pins this and must stay green unmodified.
        get toneAlgo() { return TONE_ALGO_DEFAULT; },
        get toneLawDefault() { return TONE_ALGO_DEFAULT; },
        // A copy — no caller can mutate the module's live Stage-1 flags.
        get hlStage() { return Object.assign({}, HL_STAGE); },
        get uncapped() { return TONE_UNCAPPED; },
        // The committed default, byte-identical to the pre-wire module
        // constant — NOT the per-call value (that shadow lives inside
        // `buildObject`, keyed off `opts.toneFlowMode`; see its own comment).
        get flowMode() { return FLOW_MODE_DEFAULT; },
      },
    });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildObject, chartFor, lineCountFor, __litFloorForTest, __ladderForTest: ladderKeep };
  }
})();
