/**
 * Petal Designer methods for the UI class — mixed into UI.prototype by ui.js.
 * Extracted from ui.js to reduce token cost during feature work; behavior is
 * unchanged.
 */
(() => {
  const {
    ALGO_DEFAULTS = {},
    SETTINGS = {},
    UI_CONSTANTS = {},
    PRESETS,
    PETALIS_PRESETS,
  } = window.Vectura || {};

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clone =
    typeof structuredClone === 'function' ? (obj) => structuredClone(obj) : (obj) => JSON.parse(JSON.stringify(obj));

  const PETALIS_LAYER_TYPES = new Set(['petalisDesigner']);
  const isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type);
  const PETALIS_PRESET_LIBRARY = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(PETALIS_PRESETS) ? PETALIS_PRESETS : [])
    .filter((preset) => {
      const system = preset?.preset_system || 'petalisDesigner';
      return system === 'petalisDesigner';
    });

  const PETAL_DESIGNER_TARGET_OPTIONS = [
    { value: 'inner', label: 'Inner' },
    { value: 'outer', label: 'Outer' },
    { value: 'both', label: 'Both' },
  ];
  const PETAL_DESIGNER_PROFILE_DIRECTORY = './src/config/petal-profiles/';
  const PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT = '.json,application/json';
  const PETAL_DESIGNER_PROFILE_TYPE = 'vectura-petal-profile';
  const PETAL_DESIGNER_PROFILE_VERSION = 1;
  const PETAL_DESIGNER_PROFILE_BUNDLE_KEY = 'PETAL_PROFILE_LIBRARY';
  const PETAL_DESIGNER_WIDTH_MATCH_BASELINE = 0.85;

  const PETALIS_DESIGNER_DEFAULT_INNER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.innerCount ?? 20, 5, 400)
  );
  const PETALIS_DESIGNER_DEFAULT_OUTER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.outerCount ?? 20, 5, 600)
  );
  const PETALIS_DESIGNER_DEFAULT_COUNT = Math.round(
    clamp(
      ALGO_DEFAULTS?.petalisDesigner?.count ??
        PETALIS_DESIGNER_DEFAULT_INNER_COUNT + PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
      5,
      800
    )
  );
  const PETALIS_DESIGNER_VIEW_STYLE_OPTIONS = [
    { value: 'overlay', label: 'Overlay' },
    { value: 'side-by-side', label: 'Side by Side' },
  ];
  const PETALIS_DESIGNER_RANDOMNESS_DEFS = [
    { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1, precision: 0 },
    { key: 'countJitter', label: 'Count Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'sizeJitter', label: 'Size Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'rotationJitter', label: 'Rotation Jitter', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'angularDrift', label: 'Angular Drift', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'driftStrength', label: 'Drift Strength', min: 0, max: 1, step: 0.05, precision: 2 },
    { key: 'driftNoise', label: 'Drift Noise', min: 0.05, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScale', label: 'Radius Scale', min: -1, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScaleCurve', label: 'Radius Scale Curve', min: 0.5, max: 2.5, step: 0.05, precision: 2 },
  ];

  window.Vectura = window.Vectura || {};
  window.Vectura._UIPetalDesignerMixin = {
    getPetalDesignerLayer() {
      const active = this.app.engine.getActiveLayer?.();
      if (isPetalisLayerType(active?.type)) return active;
      return (this.app.engine.layers || []).find((layer) => isPetalisLayerType(layer?.type)) || null;
    },

    normalizePetalDesignerProfileId(value, fallback = 'petal-profile') {
      const raw = `${value ?? ''}`.trim().toLowerCase();
      const cleaned = raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');
      if (cleaned) return cleaned;
      return `${fallback}-${Date.now().toString(36)}`;
    },

    normalizePetalDesignerProfileName(value, fallback = 'Petal Profile') {
      const safe = `${value ?? ''}`.trim();
      return safe || fallback;
    },

    normalizePetalDesignerProfileShape(shape, side = 'outer', options = {}) {
      const allowPresetFallback = options.allowPresetFallback !== false;
      if (!shape) return null;
      if (typeof shape === 'string') {
        if (!allowPresetFallback) return null;
        return this.buildProfileDesignerShape(shape, side);
      }
      if (typeof shape === 'object' && typeof shape.profile === 'string' && !Array.isArray(shape.anchors)) {
        if (!allowPresetFallback) return null;
        return this.buildProfileDesignerShape(shape.profile, side);
      }
      if (!Array.isArray(shape.anchors) || shape.anchors.length < 2) return null;
      const next = this.cloneDesignerShape(shape);
      this.normalizeDesignerShape(next);
      next.profile = typeof next.profile === 'string' ? next.profile : 'teardrop';
      return next;
    },

    normalizePetalDesignerProfileDefinition(raw, options = {}) {
      if (!raw || typeof raw !== 'object') return null;
      const fallbackId = this.normalizePetalDesignerProfileId(options.fallbackId || 'petal-profile');
      const id = this.normalizePetalDesignerProfileId(raw.id || fallbackId, fallbackId);
      const name = this.normalizePetalDesignerProfileName(raw.name, id);
      const source = options.source || 'project';
      const sourcePath = options.sourcePath || '';
      const allowPresetFallback = options.allowPresetFallback !== false;
      const shapes = raw.shapes && typeof raw.shapes === 'object' ? raw.shapes : {};
      const target = this.normalizePetalDesignerRingTarget(raw.target, 'both');
      let inner = this.normalizePetalDesignerProfileShape(raw.inner || shapes.inner, 'inner', {
        allowPresetFallback,
      });
      let outer = this.normalizePetalDesignerProfileShape(raw.outer || shapes.outer, 'outer', {
        allowPresetFallback,
      });
      if (allowPresetFallback && !inner && typeof raw.innerProfile === 'string') {
        inner = this.buildProfileDesignerShape(raw.innerProfile, 'inner');
      }
      if (allowPresetFallback && !outer && typeof raw.outerProfile === 'string') {
        outer = this.buildProfileDesignerShape(raw.outerProfile, 'outer');
      }
      const sharedShape =
        this.normalizePetalDesignerProfileShape(raw.shape || shapes.both, 'outer', {
          allowPresetFallback,
        }) ||
        (allowPresetFallback && typeof raw.profile === 'string'
          ? this.buildProfileDesignerShape(raw.profile, 'outer')
          : null);
      if (sharedShape) {
        if (!inner && target !== 'outer') {
          inner = this.normalizePetalDesignerProfileShape(sharedShape, 'inner', {
            allowPresetFallback,
          });
        }
        if (!outer && target !== 'inner') {
          outer = this.normalizePetalDesignerProfileShape(sharedShape, 'outer', {
            allowPresetFallback,
          });
        }
      }
      if (!inner && !outer) return null;
      return { id, name, inner, outer, source, sourcePath };
    },

    extractPetalDesignerProfileFileNames(listingText) {
      if (typeof listingText !== 'string' || !listingText.trim()) return [];
      const files = [];
      const seen = new Set();
      const regex = /href="([^"]+)"/gi;
      let match = regex.exec(listingText);
      while (match) {
        const rawHref = `${match[1] || ''}`.trim();
        const cleanHref = rawHref.split('#')[0].split('?')[0];
        if (cleanHref && !cleanHref.endsWith('/')) {
          const name = decodeURIComponent(cleanHref.split('/').pop() || '');
          if (name.toLowerCase().endsWith('.json') && name.toLowerCase() !== 'index.json' && !seen.has(name)) {
            seen.add(name);
            files.push(name);
          }
        }
        match = regex.exec(listingText);
      }
      return files;
    },

    extractPetalDesignerProfileFileNamesFromIndex(indexPayload) {
      const list = Array.isArray(indexPayload)
        ? indexPayload
        : Array.isArray(indexPayload?.files)
        ? indexPayload.files
        : [];
      const seen = new Set();
      return list
        .map((entry) => `${entry || ''}`.trim())
        .filter((entry) => entry.toLowerCase().endsWith('.json'))
        .filter((entry) => entry.toLowerCase() !== 'index.json')
        .filter((entry) => {
          if (seen.has(entry)) return false;
          seen.add(entry);
          return true;
        });
    },

    getPetalDesignerProfileLibrary() {
      if (Array.isArray(this.petalDesignerProfiles) && this.petalDesignerProfiles.length) {
        return this.petalDesignerProfiles;
      }
      return [];
    },

    getBundledPetalDesignerProfileDefinitions() {
      const bundle = window?.Vectura?.[PETAL_DESIGNER_PROFILE_BUNDLE_KEY];
      if (Array.isArray(bundle)) return bundle;
      if (bundle && Array.isArray(bundle.profiles)) return bundle.profiles;
      return [];
    },

    async loadPetalDesignerProfiles(options = {}) {
      const { force = false } = options;
      const isFileProtocol = window?.location?.protocol === 'file:';
      if (!force && isFileProtocol && this.petalDesignerProfilesLoaded) return this.getPetalDesignerProfileLibrary();
      if (!force && this.petalDesignerProfilesLoading) return this.petalDesignerProfilesLoading;
      this.petalDesignerProfilesLoading = (async () => {
        const bundledProfiles = [];
        const fetchedProfiles = [];
        const addProjectProfile = (target, payload, sourcePath, fallbackId = '') => {
          const normalized = this.normalizePetalDesignerProfileDefinition(payload, {
            fallbackId,
            source: 'project',
            sourcePath,
            allowPresetFallback: false,
          });
          if (normalized) target.push(normalized);
        };
        const bundled = this.getBundledPetalDesignerProfileDefinitions();
        bundled.forEach((payload, index) => {
          if (!payload || typeof payload !== 'object') return;
          const sourcePath =
            typeof payload.sourcePath === 'string' && payload.sourcePath.trim()
              ? payload.sourcePath.trim()
              : `bundle-${index + 1}.json`;
          const fallbackId =
            typeof payload.id === 'string' && payload.id.trim()
              ? payload.id.trim()
              : sourcePath.replace(/\.json$/i, '');
          addProjectProfile(bundledProfiles, payload, sourcePath, fallbackId);
        });
        if (!isFileProtocol) {
          const profileFiles = new Set();
          try {
            const indexRes = await fetch(`${PETAL_DESIGNER_PROFILE_DIRECTORY}index.json`, { cache: 'no-store' });
            if (indexRes.ok) {
              const indexPayload = await indexRes.json();
              this.extractPetalDesignerProfileFileNamesFromIndex(indexPayload).forEach((file) => profileFiles.add(file));
            }
          } catch (err) {
            // Folder index is optional.
          }
          try {
            const dirRes = await fetch(PETAL_DESIGNER_PROFILE_DIRECTORY, { cache: 'no-store' });
            if (dirRes.ok) {
              const listing = await dirRes.text();
              this.extractPetalDesignerProfileFileNames(listing).forEach((file) => profileFiles.add(file));
            }
          } catch (err) {
            // Directory listing support depends on the static host.
          }
          for (const filename of profileFiles) {
            const fallbackId = filename.replace(/\.json$/i, '');
            try {
              const res = await fetch(`${PETAL_DESIGNER_PROFILE_DIRECTORY}${filename}`, { cache: 'no-store' });
              if (!res.ok) continue;
              const payload = await res.json();
              addProjectProfile(fetchedProfiles, payload, filename, fallbackId);
            } catch (err) {
              // Ignore malformed files and continue loading valid profiles.
            }
          }
        }
        const sourceProfiles = isFileProtocol
          ? bundledProfiles
          : fetchedProfiles.length
          ? fetchedProfiles
          : bundledProfiles;
        const merged = new Map();
        sourceProfiles.forEach((profile) => merged.set(profile.id, profile));
        this.petalDesignerProfiles = Array.from(merged.values()).sort((a, b) =>
          `${a.name || ''}`.localeCompare(`${b.name || ''}`)
        );
        this.petalDesignerProfilesLoaded = true;
        return this.petalDesignerProfiles;
      })();
      try {
        return await this.petalDesignerProfilesLoading;
      } finally {
        this.petalDesignerProfilesLoading = null;
      }
    },

    getPetalDesignerProfilesForSide(side = 'outer') {
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const otherSide = safeSide === 'inner' ? 'outer' : 'inner';
      return this.getPetalDesignerProfileLibrary().filter((profile) => profile?.[safeSide] || profile?.[otherSide]);
    },

    getPetalDesignerProfileById(profileId) {
      const id = `${profileId || ''}`.trim();
      if (!id) return null;
      return this.getPetalDesignerProfileLibrary().find((profile) => profile?.id === id) || null;
    },

    ensurePetalDesignerProfileSelections(state) {
      if (!state || typeof state !== 'object') return { inner: '', outer: '' };
      const source =
        state.profileSelections && typeof state.profileSelections === 'object'
          ? state.profileSelections
          : {
              inner: state.profileSelectionInner,
              outer: state.profileSelectionOuter,
            };
      state.profileSelections = {
        inner: typeof source.inner === 'string' ? source.inner : '',
        outer: typeof source.outer === 'string' ? source.outer : '',
      };
      return state.profileSelections;
    },

    applyPetalDesignerProfileSelection(state, side, profileId, options = {}) {
      if (!state) return false;
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const profile = this.getPetalDesignerProfileById(profileId);
      if (!profile) return false;
      const shape = profile[safeSide] || profile[safeSide === 'inner' ? 'outer' : 'inner'];
      if (!shape) return false;
      state[safeSide] = this.cloneDesignerShape(shape);
      this.normalizeDesignerShape(state[safeSide]);
      const selections = this.ensurePetalDesignerProfileSelections(state);
      selections[safeSide] = profile.id;
      if (options.applyBoth && profile.inner && profile.outer) {
        state.inner = this.cloneDesignerShape(profile.inner);
        state.outer = this.cloneDesignerShape(profile.outer);
        this.normalizeDesignerShape(state.inner);
        this.normalizeDesignerShape(state.outer);
        selections.inner = profile.id;
        selections.outer = profile.id;
      }
      if (safeSide === 'inner' || safeSide === 'outer') {
        state.activeTarget = safeSide;
        state.target = safeSide;
      }
      if (options.syncLock !== false) this.syncInnerOuterLock(state, safeSide);
      return true;
    },

    buildPetalDesignerProfileExportPayload(state, options = {}) {
      if (!state) return null;
      const scope = options.scope === 'inner' || options.scope === 'outer' ? options.scope : 'both';
      const rawName = `${options.name || ''}`.trim();
      const fallbackName = scope === 'both' ? 'Petal Profile Pair' : `${scope === 'inner' ? 'Inner' : 'Outer'} Petal Profile`;
      const name = this.normalizePetalDesignerProfileName(rawName, fallbackName);
      const id = this.normalizePetalDesignerProfileId(options.id || name);
      const payload = {
        type: PETAL_DESIGNER_PROFILE_TYPE,
        version: PETAL_DESIGNER_PROFILE_VERSION,
        id,
        name,
        created: new Date().toISOString(),
      };
      if (scope === 'both' || scope === 'inner') {
        payload.inner = this.cloneDesignerShape(state.inner);
      }
      if (scope === 'both' || scope === 'outer') {
        payload.outer = this.cloneDesignerShape(state.outer);
      }
      if (scope !== 'both') {
        payload.target = scope;
      }
      return payload;
    },

    downloadJsonPayload(payload, filename = 'profile.json') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    async importPetalDesignerProfileFile(file, side, state) {
      if (!file) return { applied: false, profile: null };
      const text = await file.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch (err) {
        throw new Error('Invalid JSON');
      }
      const fallbackId = this.normalizePetalDesignerProfileId(`${file.name || 'imported-profile'}`.replace(/\.json$/i, ''));
      const profile = this.normalizePetalDesignerProfileDefinition(payload, {
        fallbackId,
        source: 'import',
        sourcePath: file.name || '',
      });
      if (!profile) {
        throw new Error('Profile has no usable inner/outer shape.');
      }
      const library = this.getPetalDesignerProfileLibrary();
      const merged = new Map(library.map((entry) => [entry.id, entry]));
      merged.set(profile.id, profile);
      this.petalDesignerProfiles = Array.from(merged.values()).sort((a, b) =>
        `${a.name || ''}`.localeCompare(`${b.name || ''}`)
      );
      this.petalDesignerProfilesLoaded = true;
      let applied = false;
      const appliedSides = [];
      if (state) {
        if (profile.inner && profile.outer) {
          applied = this.applyPetalDesignerProfileSelection(state, side, profile.id, {
            applyBoth: true,
            syncLock: true,
          });
          if (applied) {
            appliedSides.push('inner', 'outer');
          }
        } else {
          applied = this.applyPetalDesignerProfileSelection(state, side, profile.id, {
            applyBoth: false,
            syncLock: true,
          });
          if (applied) appliedSides.push(side === 'inner' ? 'inner' : 'outer');
        }
      }
      return { applied, profile, appliedSides };
    },

    makeDefaultDesignerShape(layer, side = 'outer') {
      const p = layer?.params || {};
      const source = side === 'inner' && p.designerInner ? p.designerInner : side === 'outer' && p.designerOuter ? p.designerOuter : null;
      if (source?.anchors && source.anchors.length >= 2) {
        return {
          profile: source.profile || p.petalProfile || 'teardrop',
          anchors: JSON.parse(JSON.stringify(source.anchors)),
        };
      }
      const profile = p.petalProfile || 'teardrop';
      return this.buildProfileDesignerShape(profile, side);
    },

    buildProfileDesignerShape(profile = 'teardrop', side = 'outer') {
      const widthScale = side === 'inner' ? 0.86 : 1;
      const makeFourPointShape = ({
        upperT,
        upperW,
        lowerT,
        lowerW,
        topOutT = null,
        topOutW = 0,
        upperInT = null,
        upperOutT = null,
        lowerInT = null,
        lowerOutT = null,
        bottomInT = null,
        bottomInW = 0,
      }) => {
        const uT = clamp(upperT, 0.14, 0.45);
        const lT = clamp(Math.max(uT + 0.16, lowerT), 0.5, 0.9);
        const uW = Math.max(0.05, upperW);
        const lW = Math.max(0.05, lowerW);
        const PA = UI_CONSTANTS.PETALIS_CURVE_ANCHORS ?? {};
        const oTop = clamp(topOutT ?? uT * (PA.oTopRatio ?? 0.42), 0.04, uT - 0.02);
        const iUpper = clamp(upperInT ?? uT * (PA.iUpperRatio ?? 0.72), oTop + 0.01, uT - 0.02);
        const oUpper = clamp(upperOutT ?? lerp(uT, lT, PA.oUpperLerp ?? 0.34), uT + 0.02, lT - 0.04);
        const iLower = clamp(lowerInT ?? lerp(uT, lT, PA.iLowerLerp ?? 0.68), oUpper + 0.02, lT - 0.02);
        const oLower = clamp(lowerOutT ?? lerp(lT, 1, PA.oLowerLerp ?? 0.38), lT + 0.02, 0.96);
        const iBottom = clamp(bottomInT ?? lerp(lT, 1, PA.iBottomLerp ?? 0.62), oLower + 0.02, 0.98);
        const iTop = clamp(-oTop * (PA.mirrorExtent ?? 0.7), -0.35, -0.02);
        const oBottom = clamp(1 + (1 - iBottom) * (PA.mirrorExtent ?? 0.7), 1.02, 1.35);
        return [
          { t: 0, w: 0, in: { t: iTop, w: 0 }, out: { t: oTop, w: topOutW } },
          {
            t: uT,
            w: uW,
            in: { t: iUpper, w: uW },
            out: { t: oUpper, w: uW },
          },
          {
            t: lT,
            w: lW,
            in: { t: iLower, w: lW },
            out: { t: oLower, w: lW },
          },
          { t: 1, w: 0, in: { t: iBottom, w: bottomInW }, out: { t: oBottom, w: 0 } },
        ];
      };
      const scaleAnchor = (anchor) => ({
        ...anchor,
        w: Math.max(0, (anchor.w || 0) * widthScale),
        in: anchor.in ? { ...anchor.in, w: Math.max(0, (anchor.in.w || 0) * widthScale) } : null,
        out: anchor.out ? { ...anchor.out, w: Math.max(0, (anchor.out.w || 0) * widthScale) } : null,
      });
      const templates = {
        oval: makeFourPointShape({
          upperT: 0.27,
          upperW: 0.74,
          lowerT: 0.73,
          lowerW: 0.74,
          topOutW: 0.08,
          bottomInW: 0.08,
        }),
        teardrop: makeFourPointShape({
          upperT: 0.24,
          upperW: 0.36,
          lowerT: 0.71,
          lowerW: 0.86,
          topOutW: 0.01,
          topOutT: 0.095,
          upperInT: 0.165,
          upperOutT: 0.44,
          lowerInT: 0.64,
          lowerOutT: 0.86,
          bottomInT: 0.95,
          bottomInW: 0.04,
        }),
        lanceolate: makeFourPointShape({
          upperT: 0.29,
          upperW: 0.4,
          lowerT: 0.68,
          lowerW: 0.62,
          topOutW: 0.01,
          bottomInW: 0.04,
        }),
        heart: makeFourPointShape({
          upperT: 0.24,
          upperW: 0.72,
          lowerT: 0.66,
          lowerW: 0.9,
          topOutW: 0.18,
          bottomInW: 0.14,
        }),
        spoon: makeFourPointShape({
          upperT: 0.32,
          upperW: 0.36,
          lowerT: 0.76,
          lowerW: 1.08,
          topOutW: 0.02,
          bottomInW: 0.2,
        }),
        rounded: makeFourPointShape({
          upperT: 0.31,
          upperW: 0.84,
          lowerT: 0.69,
          lowerW: 0.84,
          topOutW: 0.12,
          bottomInW: 0.12,
        }),
        notched: makeFourPointShape({
          upperT: 0.25,
          upperW: 0.56,
          lowerT: 0.69,
          lowerW: 0.82,
          topOutW: 0.2,
          bottomInW: 0.1,
        }),
        spatulate: makeFourPointShape({
          upperT: 0.36,
          upperW: 0.42,
          lowerT: 0.74,
          lowerW: 1.02,
          topOutW: 0.03,
          bottomInW: 0.18,
        }),
        marquise: makeFourPointShape({
          upperT: 0.3,
          upperW: 0.64,
          lowerT: 0.7,
          lowerW: 0.64,
          topOutW: 0.01,
          bottomInW: 0.01,
        }),
        dagger: makeFourPointShape({
          upperT: 0.27,
          upperW: 0.28,
          lowerT: 0.67,
          lowerW: 0.4,
          topOutW: 0,
          bottomInW: 0,
        }),
      };
      const template = templates[profile] || templates.teardrop;
      return {
        profile,
        anchors: template.map((anchor) => scaleAnchor(anchor)),
      };
    },

    cloneDesignerShape(shape) {
      return shape ? JSON.parse(JSON.stringify(shape)) : null;
    },

    syncInnerOuterLock(state, sourceSide = null) {
      if (!state) return;
      const lockShapes = Boolean(state.innerOuterLock);
      if (!lockShapes) return;
      const source = sourceSide === 'inner' || sourceSide === 'outer'
        ? sourceSide
        : state.activeTarget === 'outer'
        ? 'outer'
        : 'inner';
      if (source === 'outer') {
        state.inner = this.cloneDesignerShape(state.outer);
        state.activeTarget = 'outer';
        state.target = 'outer';
        return;
      }
      state.outer = this.cloneDesignerShape(state.inner);
      state.activeTarget = 'inner';
      state.target = 'inner';
    },

    normalizeDesignerShape(shape) {
      if (!shape || !Array.isArray(shape.anchors)) return;
      const clampHandleT = (value) => clamp(value, -1, 2);
      const normalizeHandle = (value, fallbackT, fallbackW) => {
        if (!value) return null;
        const t = Number.isFinite(value.t) ? value.t : fallbackT;
        const w = Number.isFinite(value.w) ? value.w : fallbackW;
        return {
          t: clampHandleT(t),
          w,
        };
      };
      shape.anchors = shape.anchors
        .map((anchor) => ({
          t: clamp(anchor?.t ?? 0, 0, 1),
          w: Math.max(0, anchor?.w ?? 0),
          in: normalizeHandle(anchor?.in, anchor?.t ?? 0, anchor?.w ?? 0),
          out: normalizeHandle(anchor?.out, anchor?.t ?? 0, anchor?.w ?? 0),
        }))
        .sort((a, b) => a.t - b.t);
      if (shape.anchors.length < 2) {
        shape.anchors = [
          { t: 0, w: 0, in: { t: -0.1, w: 0 }, out: { t: 0.12, w: 0.06 } },
          { t: 0.28, w: 0.5, in: { t: 0.18, w: 0.5 }, out: { t: 0.44, w: 0.5 } },
          { t: 0.72, w: 0.88, in: { t: 0.56, w: 0.88 }, out: { t: 0.84, w: 0.88 } },
          { t: 1, w: 0, in: { t: 0.88, w: 0.12 }, out: { t: 1.1, w: 0 } },
        ];
      }
      shape.anchors[0].t = 0;
      shape.anchors[0].w = 0;
      shape.anchors[shape.anchors.length - 1].t = 1;
      shape.anchors[shape.anchors.length - 1].w = 0;
      if (!shape.anchors[0].in) {
        shape.anchors[0].in = { t: -0.1, w: 0 };
      }
      if (!shape.anchors[shape.anchors.length - 1].out) {
        shape.anchors[shape.anchors.length - 1].out = { t: 1.1, w: 0 };
      }

      for (let i = 0; i < shape.anchors.length; i++) {
        const anchor = shape.anchors[i];
        if (anchor.in) {
          anchor.in.t = clampHandleT(anchor.in.t);
          if (!Number.isFinite(anchor.in.w)) anchor.in.w = anchor.w;
        }
        if (anchor.out) {
          anchor.out.t = clampHandleT(anchor.out.t);
          if (!Number.isFinite(anchor.out.w)) anchor.out.w = anchor.w;
        }
      }
    },

    normalizeDesignerSymmetryMode(value) {
      if (value === 'horizontal' || value === 'vertical' || value === 'both') return value;
      return 'none';
    },

    designerSymmetryHasHorizontalAxis(value) {
      const mode = this.normalizeDesignerSymmetryMode(value);
      return mode === 'horizontal' || mode === 'both';
    },

    designerSymmetryHasVerticalAxis(value) {
      const mode = this.normalizeDesignerSymmetryMode(value);
      return mode === 'vertical' || mode === 'both';
    },

    getPetalDesignerSymmetryForSide(state, side = 'outer') {
      if (!state || typeof state !== 'object') return 'none';
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const key = safeSide === 'inner' ? 'innerSymmetry' : 'outerSymmetry';
      const fallback = this.normalizeDesignerSymmetryMode(state.designerSymmetry);
      if (state[key] === undefined) {
        state[key] = fallback;
      }
      return this.normalizeDesignerSymmetryMode(state[key]);
    },

    setPetalDesignerSymmetryForSide(state, side, value) {
      if (!state || typeof state !== 'object') return;
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const key = safeSide === 'inner' ? 'innerSymmetry' : 'outerSymmetry';
      state[key] = this.normalizeDesignerSymmetryMode(value);
      state.designerSymmetry = state[key];
    },

    normalizePetalDesignerViewStyle(value) {
      return value === 'side-by-side' ? 'side-by-side' : 'overlay';
    },

    ensurePetalDesignerState(layer) {
      if (!layer) return null;
      const params = layer.params || {};
      const shadings = Array.isArray(params.shadings) ? params.shadings : [];
      const shapeTarget = this.normalizePetalDesignerRingTarget(params.petalShape ?? params.petalRing, 'inner');
      const activeTarget = shapeTarget === 'outer' ? 'outer' : 'inner';
      const defaultSymmetry = this.normalizeDesignerSymmetryMode(params.designerSymmetry);
      const innerCount = Math.round(
        clamp(params.innerCount ?? params.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400)
      );
      const outerCount = Math.round(
        clamp(params.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600)
      );
      const countSplit = innerCount / Math.max(1, innerCount + outerCount);
      const transitionPosition = clamp(countSplit * 100, 0, 100);
      const state = {
        layerId: layer.id,
        outer: this.makeDefaultDesignerShape(layer, 'outer'),
        inner: this.makeDefaultDesignerShape(layer, 'inner'),
        shadings: shadings.map((shade, index) =>
          this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
        ),
        petalModifiers: (Array.isArray(params.petalModifiers) ? params.petalModifiers : []).map((modifier, index) =>
          this.normalizePetalDesignerModifier(modifier, index)
        ),
        innerOuterLock: Boolean(params.innerOuterLock || shapeTarget === 'both'),
        designerSymmetry: defaultSymmetry,
        innerSymmetry: this.normalizeDesignerSymmetryMode(params.designerInnerSymmetry ?? defaultSymmetry),
        outerSymmetry: this.normalizeDesignerSymmetryMode(params.designerOuterSymmetry ?? defaultSymmetry),
        count: Math.round(clamp(params.count ?? innerCount, 5, 800)),
        innerCount,
        outerCount,
        profileTransitionPosition: transitionPosition,
        profileTransitionFeather: clamp(params.profileTransitionFeather ?? 0, 0, 100),
        widthRatio: this.normalizePetalDesignerWidthRatio(params.petalWidthRatio ?? 1, 1),
        target: activeTarget,
        activeTarget,
        profileSelections: {
          inner: `${params.designerProfileSelectionInner || ''}`,
          outer: `${params.designerProfileSelectionOuter || ''}`,
        },
        viewStyle: this.normalizePetalDesignerViewStyle(
          params.petalVisualizerViewStyle ?? params.petalViewStyle ?? 'overlay'
        ),
        seed: Math.round(clamp(params.seed ?? 1, 0, 9999)),
        countJitter: clamp(params.countJitter ?? 0.1, 0, 0.5),
        sizeJitter: clamp(params.sizeJitter ?? 0.12, 0, 0.5),
        rotationJitter: clamp(params.rotationJitter ?? 6, 0, 45),
        angularDrift: clamp(params.angularDrift ?? 0, 0, 45),
        driftStrength: clamp(params.driftStrength ?? 0.1, 0, 1),
        driftNoise: clamp(params.driftNoise ?? 0.2, 0.05, 1),
        radiusScale: clamp(params.radiusScale ?? 0.2, -1, 1),
        radiusScaleCurve: clamp(params.radiusScaleCurve ?? 1.2, 0.5, 2.5),
        randomnessOpen: false,
        views: {
          outer: { zoom: 1, panX: 0, panY: 0 },
          inner: { zoom: 1, panX: 0, panY: 0 },
        },
      };
      this.normalizeDesignerShape(state.outer);
      this.normalizeDesignerShape(state.inner);
      this.ensurePetalDesignerProfileSelections(state);
      this.syncInnerOuterLock(state);
      return state;
    },

    getSharedToolbarDefinitions() {
      if (this._sharedToolbarDefinitions) return this._sharedToolbarDefinitions;
      this._sharedToolbarDefinitions = {
        select: {
          label: 'Selection (V)',
          ariaLabel: 'Selection Tool (V)',
          icon: '<rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3" />',
        },
        'select-rect': {
          label: 'Rectangle Selection',
          submenuKind: 'select',
          submenuValue: 'rect',
          icon: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3" />',
        },
        'select-oval': {
          label: 'Oval Selection',
          submenuKind: 'select',
          submenuValue: 'oval',
          icon: '<ellipse cx="12" cy="12" rx="7" ry="5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3" />',
        },
        'select-pen': {
          label: 'Pen Selection',
          submenuKind: 'select',
          submenuValue: 'pen',
          icon: '<path d="M4 18C7 9 14 6 20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2" /><path d="M16.8 6.2l2.6 2.6-3.2 3.2-2.6-2.6z" fill="none" stroke="currentColor" stroke-width="1.4" />',
        },
        'select-lasso': {
          label: 'Lasso Selection',
          submenuKind: 'select',
          submenuValue: 'lasso',
          icon: '<path d="M6 14c1.5-4.5 6.5-6 10-3 2.5 2 2 6-1.5 7.2-3.4 1.2-6.8-0.6-6.8-3.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2" />',
        },
        direct: {
          label: 'Direct Selection (A)',
          ariaLabel: 'Direct Selection Tool (A)',
          icon: '<path d="M4 2L14 12H9.5L12.5 21L9.5 22L6.5 13L3 16Z" fill="none" stroke="currentColor" stroke-width="1.6" /><rect x="15.5" y="3.5" width="4.5" height="4.5" rx="0.6" fill="currentColor" />',
        },
        'shape-rect': {
          label: 'Rectangle (M)',
          ariaLabel: 'Rectangle Tool (M)',
          icon: '<rect x="5" y="6" width="14" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8" />',
        },
        'shape-oval': {
          label: 'Oval (L)',
          ariaLabel: 'Oval Tool (L)',
          icon: '<ellipse cx="12" cy="12" rx="7.2" ry="5.8" fill="none" stroke="currentColor" stroke-width="1.8" />',
        },
        'shape-polygon': {
          label: 'Polygon (Y)',
          ariaLabel: 'Polygon Tool (Y)',
          icon: '<path d="M12 4.5L18.5 8.3L17.3 15.8L12 19.5L6.7 15.8L5.5 8.3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />',
        },
        hand: {
          label: 'Hand (Space)',
          ariaLabel: 'Hand Tool (Space)',
          icon: '<path d="M7 12V6.5c0-.8.6-1.5 1.4-1.5.7 0 1.3.6 1.3 1.4V12m0-5.3V5c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v6.9m0-5.1V5.3c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4V13m0-3.6V8.5c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v6.8c0 2.5-1.6 4.7-4 5.5l-2.1.7c-2.5.9-5.3-.4-6.2-2.9L5 12.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />',
        },
        pen: {
          label: 'Pen (P)',
          ariaLabel: 'Pen Tool (P)',
          icon: '<path d="M12 2.2L20.2 10.2L14.8 21.8H9.2L3.8 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="11.6" r="1.7" fill="currentColor" /><path d="M9.5 16.2L12 18.3L14.5 16.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /><line x1="5" y1="20.5" x2="19" y2="20.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /><circle cx="5" cy="20.5" r="1.3" fill="currentColor" /><circle cx="19" cy="20.5" r="1.3" fill="currentColor" />',
        },
        'pen-draw': {
          label: 'Pen Tool (P)',
          submenuKind: 'pen',
          submenuValue: 'draw',
          icon: '<path d="M12 2.2L20.2 10.2L14.8 21.8H9.2L3.8 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="11.6" r="1.6" fill="currentColor" />',
        },
        'pen-add': {
          label: 'Add Anchor Point (+)',
          submenuKind: 'pen',
          submenuValue: 'add',
          icon: '<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />',
        },
        'pen-delete': {
          label: 'Delete Anchor Point (-)',
          submenuKind: 'pen',
          submenuValue: 'delete',
          icon: '<path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />',
        },
        'pen-anchor': {
          label: 'Anchor Point Tool (Shift + C)',
          submenuKind: 'pen',
          submenuValue: 'anchor',
          icon: '<circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M3.5 12h5M15.5 12h5M12 3.5v5M12 15.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />',
        },
        fill: {
          label: 'Fill (F)',
          ariaLabel: 'Fill Tool (F)',
          icon: '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor" /><path d="M19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" fill="currentColor" />',
        },
        'fill-erase': {
          label: 'Erase Fill',
          ariaLabel: 'Erase Fill Tool',
          submenuKind: 'fill',
          submenuValue: 'erase',
          icon: '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor" /><path d="M16.5 16.5l4.5 4.5M21 16.5l-4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />',
        },
        scissor: {
          label: 'Scissor (C)',
          ariaLabel: 'Scissor Tool (C)',
          icon: '<circle cx="6.5" cy="7.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="6.5" cy="16.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8.6 9.2L20 4.5M8.6 14.8L20 19.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><path d="M11.5 12L15 10.5M11.5 12L15 13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />',
        },
        'scissor-line': {
          label: 'Scissor Line',
          submenuKind: 'scissor',
          submenuValue: 'line',
          icon: '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />',
        },
        'scissor-rect': {
          label: 'Scissor Rectangle',
          submenuKind: 'scissor',
          submenuValue: 'rect',
          icon: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2" />',
        },
        'scissor-circle': {
          label: 'Scissor Circle',
          submenuKind: 'scissor',
          submenuValue: 'circle',
          icon: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2" />',
        },
        'light-source': {
          label: 'Set Light Source',
          ariaLabel: 'Set Light Source',
          id: 'btn-light-source',
          extraClasses: 'tool-light hidden',
          icon: '<circle cx="12" cy="12" r="4.4" fill="currentColor" /><path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.5 4.5L6.6 6.6M17.4 17.4L19.5 19.5M4.5 19.5L6.6 17.4M17.4 6.6L19.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />',
        },
      };
      return this._sharedToolbarDefinitions;
    },

    buildSharedToolbarMarkup(items = [], options = {}) {
      const defs = this.getSharedToolbarDefinitions();
      const {
        buttonClass = 'tool-btn',
        subButtonClass = 'tool-sub-btn',
        groupClass = 'tool-group',
        submenuClass = 'tool-submenu',
        dividerClass = 'tool-divider',
        iconClass = 'tool-icon',
        buttonAttr = 'data-tool',
        includePressed = false,
        buttonValueResolver = (id) => id,
      } = options;
      const renderIcon = (def) =>
        `<svg class="${iconClass}" viewBox="0 0 24 24" aria-hidden="true">${def.icon}</svg>`;
      const renderButton = (id, buttonOptions = {}) => {
        const def = defs[id];
        if (!def) return '';
        const {
          isSubtool = false,
          extraClasses = '',
          value = buttonValueResolver(id),
          title = def.label || '',
        } = buttonOptions;
        const classes = [isSubtool ? subButtonClass : buttonClass, def.extraClasses || '', extraClasses].filter(Boolean).join(' ');
        const mainAttr = !isSubtool && value !== null && value !== undefined ? ` ${buttonAttr}="${value}"` : '';
        const subAttr = isSubtool && def.submenuKind ? ` data-${def.submenuKind}="${def.submenuValue}"` : '';
        const ariaPressed = includePressed && !isSubtool ? ' aria-pressed="false"' : '';
        const ariaLabel = def.ariaLabel && !isSubtool ? ` aria-label="${def.ariaLabel}"` : '';
        const idAttr = def.id ? ` id="${def.id}"` : '';
        return `<button class="${classes}"${idAttr}${mainAttr}${subAttr} type="button"${ariaPressed}${ariaLabel} title="${title}">${renderIcon(def)}</button>`;
      };
      return items.map((item) => {
        if (item?.divider) return `<div class="${dividerClass}"></div>`;
        if (item?.type === 'group') {
          const submenuAttrs = item.submenuAttrs ? ` ${item.submenuAttrs}` : '';
          const subMarkup = (item.subtools || []).map((toolId) =>
            renderButton(toolId, { isSubtool: true, title: defs[toolId]?.label || '' })
          ).join('');
          return `<div class="${groupClass}">${renderButton(item.tool, { value: item.value || buttonValueResolver(item.tool), title: defs[item.tool]?.label || '' })}<div class="${submenuClass}"${submenuAttrs}>${subMarkup}</div></div>`;
        }
        if (typeof item === 'string') return renderButton(item, { title: defs[item]?.label || '' });
        return renderButton(item.tool, {
          value: item.value || buttonValueResolver(item.tool),
          extraClasses: item.extraClasses || '',
          title: item.title || defs[item.tool]?.label || '',
        });
      }).join('');
    },

    createMainToolbarMarkup() {
      return this.buildSharedToolbarMarkup([
        { type: 'group', tool: 'select', subtools: ['select-rect', 'select-oval', 'select-pen', 'select-lasso'], submenuAttrs: 'data-menu="select" aria-label="Selection subtools"' },
        'direct',
        'shape-rect',
        'shape-oval',
        'shape-polygon',
        'hand',
        { type: 'group', tool: 'pen', subtools: ['pen-draw', 'pen-add', 'pen-delete', 'pen-anchor'], submenuAttrs: 'data-menu="pen" aria-label="Pen subtools"' },
        { type: 'group', tool: 'fill', subtools: ['fill-erase'], submenuAttrs: 'aria-label="Fill subtools"' },
        { divider: true },
        { type: 'group', tool: 'scissor', subtools: ['scissor-line', 'scissor-rect', 'scissor-circle'], submenuAttrs: 'aria-label="Scissor subtools"' },
        { divider: true },
        { tool: 'light-source', value: null, title: 'Set Light Source' },
      ], {
        buttonClass: 'tool-btn',
        subButtonClass: 'tool-sub-btn',
        groupClass: 'tool-group',
        submenuClass: 'tool-submenu',
        dividerClass: 'tool-divider',
        iconClass: 'tool-icon',
        buttonAttr: 'data-tool',
        includePressed: true,
      });
    },

    createPetalDesignerMarkup(options = {}) {
      const {
        showClose = true,
        showPopOut = false,
        showPopIn = false,
        canvasWidth = 260,
        canvasHeight = 220,
      } = options;
      const symmetryOptions = [
        { value: 'none', label: 'None' },
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
        { value: 'both', label: 'Horizontal and Vertical' },
      ]
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
      const viewStyleOptions = PETALIS_DESIGNER_VIEW_STYLE_OPTIONS
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
      const toolMarkup = this.buildSharedToolbarMarkup([
        { tool: 'direct', value: 'direct', title: 'Direct Selection (A)' },
        { tool: 'pen-add', value: 'pen', title: 'Add Point (P / +)' },
        { tool: 'pen-delete', value: 'delete', title: 'Delete Point (-)' },
        { tool: 'pen-anchor', value: 'anchor', title: 'Anchor Point (Shift + C)' },
      ], {
        buttonClass: 'petal-tool-btn',
        buttonAttr: 'data-petal-tool',
      });
      const buildProfileEditorCard = (side, title) => `
        <div class="petal-profile-editor-card" data-petal-profile-editor="${side}">
          <div class="petal-profile-editor-card-title">${title}</div>
          <label class="petal-slider-label">
            <span>Profile</span>
            <span class="petal-slider-value" data-petal-profile-label="${side}">None</span>
            <select data-petal-profile-select="${side}">
              <option value="">No Profiles Found</option>
            </select>
          </label>
          <label class="petal-slider-label">
            <span>Symmetry</span>
            <span class="petal-slider-value" data-petal-symmetry-label="${side}">None</span>
            <select data-petal-symmetry-side="${side}">${symmetryOptions}</select>
          </label>
          <div class="petal-profile-editor-actions">
            <button type="button" class="petal-copy-btn" data-petal-profile-import="${side}">Import</button>
            <button type="button" class="petal-copy-btn" data-petal-profile-export="${side}">Export ${title}</button>
          </div>
          <input type="file" class="hidden" accept="${PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT}" data-petal-profile-file="${side}" />
        </div>
      `;
      return `
        <div class="petal-designer-header">
          <div class="petal-designer-title">Petal Designer</div>
          <div class="petal-designer-actions">
            ${toolMarkup}
            ${showPopOut ? '<button type="button" class="petal-popout" aria-label="Pop Out Petal Designer" title="Pop Out">⧉</button>' : ''}
            ${showPopIn ? '<button type="button" class="petal-popin" aria-label="Pop In Petal Designer" title="Pop In">↩</button>' : ''}
            ${showClose ? '<button type="button" class="petal-close" aria-label="Close Petal Designer">✕</button>' : ''}
          </div>
        </div>
        <div class="petal-designer-structure">
          <label class="petal-slider-label" data-petal-inner-count-wrap>
            <span>Inner Petal Count</span>
            <span class="petal-slider-value" data-petal-slider-value="inner-count" data-petal-slider-precision="0"></span>
            <input type="range" min="5" max="400" step="1" data-petal-inner-count>
          </label>
          <label class="petal-slider-label" data-petal-outer-count-wrap>
            <span>Outer Petal Count</span>
            <span class="petal-slider-value" data-petal-slider-value="outer-count" data-petal-slider-precision="0"></span>
            <input type="range" min="5" max="600" step="1" data-petal-outer-count>
          </label>
          <label class="petal-slider-label" data-petal-split-feather-wrap>
            <span>Split Feathering</span>
            <span class="petal-slider-value" data-petal-slider-value="split-feather" data-petal-slider-precision="0" data-petal-slider-unit="%"></span>
            <input type="range" min="0" max="100" step="1" data-petal-split-feather>
          </label>
        </div>
        <div class="petal-designer-transition">
          <label class="petal-transition-lock">
            <input type="checkbox" data-petal-inner-outer-lock>
            <span>Inner = Outer</span>
          </label>
        </div>
        <div class="petal-designer-visualizer">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">PETAL VISUALIZER</div>
            <label class="petal-visualizer-mode">
              <span>View Style</span>
              <select data-petal-view-style>${viewStyleOptions}</select>
            </label>
          </div>
          <div class="petal-designer-grid" data-petal-visualizer-grid>
            <div class="petal-cell" data-petal-cell="overlay">
              <div class="petal-cell-title" data-petal-canvas-title="overlay">Overlay</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="overlay"></canvas>
            </div>
            <div class="petal-cell hidden" data-petal-cell="inner">
              <div class="petal-cell-title" data-petal-canvas-title="inner">Inner Shape</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="inner"></canvas>
            </div>
            <div class="petal-cell hidden" data-petal-cell="outer">
              <div class="petal-cell-title" data-petal-canvas-title="outer">Outer Shape</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="outer"></canvas>
            </div>
          </div>
        </div>
        <div class="petal-designer-profile-editor">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">PROFILE EDITOR</div>
          </div>
          <div class="petal-profile-editor-grid">
            ${buildProfileEditorCard('inner', 'Inner Shape')}
            ${buildProfileEditorCard('outer', 'Outer Shape')}
          </div>
          <div class="petal-profile-editor-footer">
            <button type="button" class="petal-copy-btn" data-petal-profile-export-pair>Export Pair</button>
          </div>
        </div>
        <div class="petal-designer-shading">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">Shading Stack</div>
            <button type="button" class="petal-copy-btn" data-petal-shading-add>+ Add Shading</button>
          </div>
          <div class="petal-designer-shading-stack" data-petal-shading-stack></div>
        </div>
        <div class="petal-designer-shading">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">Modifier Stack</div>
            <button type="button" class="petal-copy-btn" data-petal-modifier-add>+ Add Modifier</button>
          </div>
          <div class="petal-designer-shading-stack" data-petal-modifier-stack></div>
        </div>
        <details class="petal-designer-randomness" data-petal-randomness-panel>
          <summary>Randomness &amp; Seed</summary>
          <div class="petal-designer-randomness-stack" data-petal-randomness-stack></div>
        </details>
      `;
    },

    normalizePetalDesignerRingTarget(value, fallback = 'both') {
      if (value === 'inner' || value === 'outer' || value === 'both') return value;
      return fallback === 'inner' || fallback === 'outer' || fallback === 'both' ? fallback : 'both';
    },

    normalizePetalDesignerShadingTarget(value, fallback = 'both') {
      return this.normalizePetalDesignerRingTarget(value, fallback);
    },

    getPetalDesignerTarget(state) {
      if (!state) return 'inner';
      const fallback = this.normalizePetalDesignerRingTarget(state.target, 'inner');
      if (state.activeTarget !== 'inner' && state.activeTarget !== 'outer') {
        state.activeTarget = fallback === 'outer' ? 'outer' : 'inner';
      }
      state.target = state.activeTarget;
      return state.activeTarget;
    },

    getPetalDesignerShadingTarget(state) {
      return 'both';
    },

    normalizePetalDesignerShadings(state, options = {}) {
      const { defaultTarget = 'both' } = options;
      const fallbackTarget = this.normalizePetalDesignerShadingTarget(defaultTarget, 'both');
      const shadings = Array.isArray(state?.shadings) ? state.shadings : [];
      const normalized = shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: fallbackTarget })
      );
      if (state) state.shadings = normalized;
      return normalized;
    },

    getPetalDesignerShadingsForTarget(state, target, options = {}) {
      const safeTarget = this.normalizePetalDesignerShadingTarget(target, 'both');
      const all = this.normalizePetalDesignerShadings(state, options);
      return all
        .filter(
          (shade) => this.normalizePetalDesignerShadingTarget(shade?.target, options.defaultTarget || 'both') === safeTarget
        )
        .map((shade, index) => this.normalizePetalDesignerShading(shade, index, { defaultTarget: safeTarget }));
    },

    setPetalDesignerShadingsForTarget(state, target, stack, options = {}) {
      if (!state) return;
      const safeTarget = this.normalizePetalDesignerShadingTarget(target, 'both');
      const fallbackTarget = this.normalizePetalDesignerShadingTarget(options.defaultTarget, 'both');
      const all = this.normalizePetalDesignerShadings(state, { defaultTarget: fallbackTarget });
      const preserved = all.filter(
        (shade) => this.normalizePetalDesignerShadingTarget(shade?.target, fallbackTarget) !== safeTarget
      );
      const incoming = Array.isArray(stack) ? stack : [];
      const normalizedIncoming = incoming.map((shade, index) =>
        this.normalizePetalDesignerShading(
          {
            ...(shade || {}),
            target: safeTarget,
          },
          index,
          { defaultTarget: safeTarget }
        )
      );
      state.shadings = preserved.concat(normalizedIncoming);
    },

    getPetalDesignerCountSplit(state) {
      if (!state) return 0.5;
      const inner = Math.max(
        0,
        Math.round(clamp(state.innerCount ?? state.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400))
      );
      const outer = Math.max(
        0,
        Math.round(clamp(state.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600))
      );
      const total = inner + outer;
      if (total <= 0) return 0.5;
      return clamp(inner / total, 0, 1);
    },

    syncPetalDesignerTransitionFromCounts(state) {
      if (!state) return 0.5;
      const split = this.getPetalDesignerCountSplit(state);
      state.profileTransitionPosition = clamp(split * 100, 0, 100);
      return split;
    },

    getPetalDesignerView(state, side = null) {
      if (!state) return { zoom: 1, panX: 0, panY: 0 };
      if (!state.views || typeof state.views !== 'object') {
        state.views = {
          outer: { zoom: 1, panX: 0, panY: 0 },
          inner: { zoom: 1, panX: 0, panY: 0 },
        };
      }
      if (!state.views.outer) state.views.outer = { zoom: 1, panX: 0, panY: 0 };
      if (!state.views.inner) state.views.inner = { zoom: 1, panX: 0, panY: 0 };
      const key = side || this.getPetalDesignerTarget(state);
      const view = state.views[key] || state.views.outer;
      view.zoom = clamp(Number(view.zoom) || 1, 0.35, 4.5);
      view.panX = Number.isFinite(view.panX) ? view.panX : 0;
      view.panY = Number.isFinite(view.panY) ? view.panY : 0;
      return view;
    },

    getPetalDesignerActiveShape(state) {
      return this.getPetalDesignerTarget(state) === 'inner' ? state.inner : state.outer;
    },

    normalizePetalDesignerShading(shade = {}, index = 0, options = {}) {
      const { defaultTarget = 'both' } = options;
      const base = createPetalisShading('radial');
      const target = this.normalizePetalDesignerShadingTarget(shade?.target, defaultTarget);
      return {
        ...base,
        ...(shade || {}),
        id: shade?.id || `designer-shade-${index + 1}`,
        enabled: shade?.enabled !== false,
        target,
        type: shade?.type || base.type,
        lineType: shade?.lineType || base.lineType,
        widthX: clamp(shade?.widthX ?? base.widthX, 0, 100),
        widthY: clamp(shade?.widthY ?? base.widthY, 0, 100),
        posX: clamp(shade?.posX ?? base.posX, 0, 100),
        posY: clamp(shade?.posY ?? base.posY, 0, 100),
        gapX: clamp(shade?.gapX ?? base.gapX, 0, 100),
        gapY: clamp(shade?.gapY ?? base.gapY, 0, 100),
        gapPosX: clamp(shade?.gapPosX ?? base.gapPosX, 0, 100),
        gapPosY: clamp(shade?.gapPosY ?? base.gapPosY, 0, 100),
        lineSpacing: clamp(shade?.lineSpacing ?? base.lineSpacing, 0.2, 8),
        density: clamp(shade?.density ?? base.density, 0.2, 3),
        jitter: clamp(shade?.jitter ?? base.jitter, 0, 1),
        lengthJitter: clamp(shade?.lengthJitter ?? base.lengthJitter, 0, 1),
        angle: clamp(shade?.angle ?? base.angle, -90, 90),
      };
    },

    getPetalDesignerModifierType(type) {
      return PETALIS_PETAL_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_PETAL_MODIFIER_TYPES[0];
    },

    normalizePetalDesignerModifierTarget(value, fallback = 'both') {
      return this.normalizePetalDesignerRingTarget(value, fallback);
    },

    normalizePetalDesignerModifier(modifier = {}, index = 0) {
      const typeDef = this.getPetalDesignerModifierType(modifier?.type);
      const base = createPetalModifier(typeDef.value);
      const next = {
        ...base,
        ...(modifier || {}),
        id: modifier?.id || `designer-mod-${index + 1}`,
        enabled: modifier?.enabled !== false,
        type: typeDef.value,
        target: this.normalizePetalDesignerModifierTarget(modifier?.target, 'both'),
        noises: Array.isArray(modifier?.noises) ? modifier.noises.map((noise) => clone(noise)) : [],
      };
      typeDef.controls.forEach((def) => {
        const fallback = base[def.key] ?? def.min ?? 0;
        const raw = Number(next[def.key]);
        const safe = Number.isFinite(raw) ? raw : fallback;
        next[def.key] = clamp(safe, def.min, def.max);
      });
      if (this.isPetalisNoiseModifier(next)) {
        this.ensurePetalisModifierNoises(next);
      } else {
        next.noises = [];
      }
      return next;
    },

    normalizePetalDesignerModifiers(state) {
      const modifiers = Array.isArray(state?.petalModifiers) ? state.petalModifiers : [];
      const normalized = modifiers.map((modifier, index) => this.normalizePetalDesignerModifier(modifier, index));
      if (state && typeof state === 'object') state.petalModifiers = normalized;
      return normalized;
    },

    setPetalDesignerSliderValue(pd, key, value) {
      const root = pd?.root;
      if (!root) return;
      const el = root.querySelector(`[data-petal-slider-value="${key}"]`);
      if (!el) return;
      const precision = Number.parseInt(el.dataset.petalSliderPrecision || '0', 10);
      const unit = el.dataset.petalSliderUnit || '';
      const factor = Math.pow(10, Number.isFinite(precision) ? precision : 0);
      const rounded = Math.round((Number(value) || 0) * factor) / factor;
      el.textContent = `${rounded}${unit}`;
    },

    renderPetalDesignerShadingStack(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const list = pd.root.querySelector('[data-petal-shading-stack]');
      const addBtn = pd.root.querySelector('[data-petal-shading-add]');
      if (!list || !addBtn) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      let shadings = this.normalizePetalDesignerShadings(pd.state, { defaultTarget: 'both' });
      const syncState = () => {
        pd.state.shadings = shadings.map((shade, index) =>
          this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
        );
        shadings = pd.state.shadings;
      };

      addBtn.onclick = () => {
        const activeSide = this.getPetalDesignerTarget(pd.state);
        shadings = shadings.concat([
          this.normalizePetalDesignerShading(createPetalisShading('radial'), shadings.length, {
            defaultTarget: activeSide,
          }),
        ]);
        syncState();
        this.renderPetalDesignerShadingStack(pd, onApply);
        onApply();
      };

      const rangeDefs = [
        { key: 'lineSpacing', label: 'Line Spacing', min: 0.2, max: 8, step: 0.1, precision: 1, unit: 'mm' },
        { key: 'density', label: 'Line Density', min: 0.2, max: 3, step: 0.05, precision: 2 },
        { key: 'jitter', label: 'Line Jitter', min: 0, max: 1, step: 0.05, precision: 2 },
        { key: 'lengthJitter', label: 'Length Jitter', min: 0, max: 1, step: 0.05, precision: 2 },
        { key: 'angle', label: 'Hatch Angle', min: -90, max: 90, step: 1, precision: 0, unit: '°' },
        { key: 'widthX', label: 'Width X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'posX', label: 'Position X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapX', label: 'Gap Width X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapPosX', label: 'Gap Position X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'widthY', label: 'Width Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'posY', label: 'Position Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapY', label: 'Gap Width Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapPosY', label: 'Gap Position Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
      ];

      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };

      list.innerHTML = '';
      shadings.forEach((shade, idx) => {
        const card = document.createElement('div');
        card.className = `noise-card${shade.enabled ? '' : ' noise-disabled'}`;
        card.innerHTML = `
          <div class="noise-header">
            <div class="flex items-center gap-2">
              <span class="noise-title">Shading ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <button type="button" class="petal-copy-btn" data-shade-up title="Move up">↑</button>
              <button type="button" class="petal-copy-btn" data-shade-down title="Move down">↓</button>
              <label class="noise-toggle">
                <input type="checkbox" ${shade.enabled ? 'checked' : ''} data-shade-enabled>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete shading" data-shade-delete>🗑</button>
            </div>
          </div>
        `;
        const controls = document.createElement('div');
        controls.className = 'noise-controls';

        const makeSelect = (label, key, options) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionMarkup = options
            .map((opt) => `<option value="${opt.value}" ${shade[key] === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          wrap.innerHTML = `
            <span>${label}</span>
            <span class="petal-slider-value">${options.find((opt) => opt.value === shade[key])?.label || shade[key]}</span>
            <select data-shade-key="${key}">${optionMarkup}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !shade.enabled;
            input.onchange = () => {
              shade[key] =
                key === 'target'
                  ? this.normalizePetalDesignerShadingTarget(input.value, 'both')
                  : input.value;
              shadings[idx] = shade;
              syncState();
              valueLabel.textContent = options.find((opt) => opt.value === shade[key])?.label || shade[key];
              onApply();
            };
          }
          return wrap;
        };

        const makeRange = (def) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const value = clamp(shade[def.key] ?? def.min, def.min, def.max);
          shade[def.key] = value;
          wrap.innerHTML = `
            <span>${def.label}</span>
            <span class="petal-slider-value">${formatValue(value, def.precision, def.unit || '')}</span>
            <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" data-shade-key="${def.key}">
          `;
          const input = wrap.querySelector('input');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !shade.enabled;
            const onRange = (live = false) => {
              const next = Number.parseFloat(input.value);
              if (!Number.isFinite(next)) return;
              shade[def.key] = clamp(next, def.min, def.max);
              shadings[idx] = shade;
              syncState();
              valueLabel.textContent = formatValue(shade[def.key], def.precision, def.unit || '');
              onApply({ live });
            };
            input.oninput = () => onRange(true);
            input.onchange = () => onRange(false);
          }
          return wrap;
        };

        controls.appendChild(makeSelect('Shading Type', 'type', PETALIS_SHADING_TYPES));
        controls.appendChild(makeSelect('Petal Shape', 'target', PETAL_DESIGNER_TARGET_OPTIONS));
        controls.appendChild(makeSelect('Line Type', 'lineType', PETALIS_LINE_TYPES));
        rangeDefs.forEach((def) => controls.appendChild(makeRange(def)));
        card.appendChild(controls);

        const upBtn = card.querySelector('[data-shade-up]');
        const downBtn = card.querySelector('[data-shade-down]');
        const enabledInput = card.querySelector('[data-shade-enabled]');
        const deleteBtn = card.querySelector('[data-shade-delete]');
        if (upBtn) {
          upBtn.disabled = idx === 0;
          upBtn.onclick = () => {
            if (idx <= 0) return;
            const next = shadings.slice();
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            shadings = next;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (downBtn) {
          downBtn.disabled = idx >= shadings.length - 1;
          downBtn.onclick = () => {
            if (idx >= shadings.length - 1) return;
            const next = shadings.slice();
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            shadings = next;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (enabledInput) {
          enabledInput.onchange = () => {
            shade.enabled = Boolean(enabledInput.checked);
            shadings[idx] = shade;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (deleteBtn) {
          deleteBtn.onclick = () => {
            shadings.splice(idx, 1);
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        list.appendChild(card);
      });
    },

    renderPetalDesignerModifierStack(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const layer = this.app.engine.layers.find((candidate) => candidate.id === pd.state.layerId);
      if (!layer) return;
      const list = pd.root.querySelector('[data-petal-modifier-stack]');
      const addBtn = pd.root.querySelector('[data-petal-modifier-add]');
      if (!list || !addBtn) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      let modifiers = this.normalizePetalDesignerModifiers(pd.state);
      const syncState = () => {
        pd.state.petalModifiers = modifiers.map((modifier, index) =>
          this.normalizePetalDesignerModifier(modifier, index)
        );
        modifiers = pd.state.petalModifiers;
      };
      addBtn.onclick = () => {
        const activeSide = this.getPetalDesignerTarget(pd.state);
        modifiers = modifiers.concat([
          this.normalizePetalDesignerModifier(
            {
              ...createPetalModifier('ripple'),
              target: activeSide,
            },
            modifiers.length
          ),
        ]);
        syncState();
        this.renderPetalDesignerModifierStack(pd, onApply);
        onApply();
      };
      const stepToPrecision = (step) => {
        const text = `${step ?? 1}`;
        if (!text.includes('.')) return 0;
        return text.split('.')[1].length;
      };
      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };
      list.innerHTML = '';
      modifiers.forEach((modifier, idx) => {
        const typeDef = this.getPetalDesignerModifierType(modifier.type);
        const card = document.createElement('div');
        card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
        card.innerHTML = `
          <div class="noise-header">
            <div class="flex items-center gap-2">
              <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <button type="button" class="petal-copy-btn" data-mod-up title="Move up">↑</button>
              <button type="button" class="petal-copy-btn" data-mod-down title="Move down">↓</button>
              <label class="noise-toggle">
                <input type="checkbox" ${modifier.enabled ? 'checked' : ''} data-mod-enabled>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete modifier" data-mod-delete>🗑</button>
            </div>
          </div>
        `;
        const controls = document.createElement('div');
        controls.className = 'noise-controls';
        const makeTypeSelect = () => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionsHtml = PETALIS_PETAL_MODIFIER_TYPES
            .map((opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          wrap.innerHTML = `
            <span>Modifier Type</span>
            <span class="petal-slider-value">${typeDef.label}</span>
            <select data-mod-type>${optionsHtml}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            input.onchange = () => {
              modifiers[idx] = this.normalizePetalDesignerModifier(
                {
                  ...modifier,
                  type: input.value,
                },
                idx
              );
              syncState();
              this.renderPetalDesignerModifierStack(pd, onApply);
              onApply();
            };
          }
          return wrap;
        };
        const makeTargetSelect = () => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionsHtml = PETAL_DESIGNER_TARGET_OPTIONS
            .map((opt) => `<option value="${opt.value}" ${modifier.target === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          const currentLabel =
            PETAL_DESIGNER_TARGET_OPTIONS.find((opt) => opt.value === modifier.target)?.label || modifier.target || 'Both';
          wrap.innerHTML = `
            <span>Petal Shape</span>
            <span class="petal-slider-value">${currentLabel}</span>
            <select data-mod-target>${optionsHtml}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            input.onchange = () => {
              modifier.target = this.normalizePetalDesignerModifierTarget(input.value, 'both');
              modifiers[idx] = this.normalizePetalDesignerModifier(modifier, idx);
              syncState();
              valueLabel.textContent =
                PETAL_DESIGNER_TARGET_OPTIONS.find((opt) => opt.value === modifier.target)?.label || modifier.target;
              onApply();
            };
          }
          return wrap;
        };
        const makeRange = (def) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const precision = stepToPrecision(def.step);
          const unit = def.displayUnit || '';
          const value = clamp(modifier[def.key] ?? def.min ?? 0, def.min, def.max);
          modifier[def.key] = value;
          wrap.innerHTML = `
            <span>${def.label}</span>
            <span class="petal-slider-value">${formatValue(value, precision, unit)}</span>
            <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}">
          `;
          const input = wrap.querySelector('input');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            const onRange = (live = false) => {
              const next = Number.parseFloat(input.value);
              if (!Number.isFinite(next)) return;
              modifier[def.key] = clamp(next, def.min, def.max);
              modifiers[idx] = modifier;
              syncState();
              valueLabel.textContent = formatValue(modifier[def.key], precision, unit);
              onApply({ live });
            };
            input.oninput = () => onRange(true);
            input.onchange = () => onRange(false);
          }
          return wrap;
        };
        controls.appendChild(makeTypeSelect());
        controls.appendChild(makeTargetSelect());
        typeDef.controls.forEach((def) => controls.appendChild(makeRange(def)));
        if (this.isPetalisNoiseModifier(modifier)) {
          this.mountPetalisModifierNoiseRack(layer, controls, modifier, { label: 'Noise Rack' });
        }
        card.appendChild(controls);
        const upBtn = card.querySelector('[data-mod-up]');
        const downBtn = card.querySelector('[data-mod-down]');
        const enabledInput = card.querySelector('[data-mod-enabled]');
        const deleteBtn = card.querySelector('[data-mod-delete]');
        if (upBtn) {
          upBtn.disabled = idx === 0;
          upBtn.onclick = () => {
            if (idx <= 0) return;
            const next = modifiers.slice();
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            modifiers = next;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (downBtn) {
          downBtn.disabled = idx >= modifiers.length - 1;
          downBtn.onclick = () => {
            if (idx >= modifiers.length - 1) return;
            const next = modifiers.slice();
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            modifiers = next;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (enabledInput) {
          enabledInput.onchange = () => {
            modifier.enabled = Boolean(enabledInput.checked);
            modifiers[idx] = modifier;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (deleteBtn) {
          deleteBtn.onclick = () => {
            modifiers.splice(idx, 1);
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        list.appendChild(card);
      });
    },

    renderPetalDesignerRandomnessPanel(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const panel = pd.root.querySelector('[data-petal-randomness-panel]');
      const stack = pd.root.querySelector('[data-petal-randomness-stack]');
      if (!panel || !stack) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      panel.open = Boolean(pd.state.randomnessOpen);
      panel.ontoggle = () => {
        pd.state.randomnessOpen = panel.open;
      };
      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };
      stack.innerHTML = '';
      PETALIS_DESIGNER_RANDOMNESS_DEFS.forEach((def) => {
        const wrap = document.createElement('label');
        wrap.className = 'petal-slider-label';
        const value = clamp(pd.state[def.key] ?? def.min ?? 0, def.min, def.max);
        pd.state[def.key] = value;
        wrap.innerHTML = `
          <span>${def.label}</span>
          <span class="petal-slider-value">${formatValue(value, def.precision || 0, def.unit || '')}</span>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}">
        `;
        const input = wrap.querySelector('input');
        const valueLabel = wrap.querySelector('.petal-slider-value');
        if (input && valueLabel) {
          const onRange = (live = false) => {
            const next = Number.parseFloat(input.value);
            if (!Number.isFinite(next)) return;
            pd.state[def.key] = clamp(next, def.min, def.max);
            valueLabel.textContent = formatValue(pd.state[def.key], def.precision || 0, def.unit || '');
            onApply({ live });
          };
          input.oninput = () => onRange(true);
          input.onchange = () => onRange(false);
        }
        stack.appendChild(wrap);
      });
    },

    renderPetalDesignerProfileEditor(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      const selections = this.ensurePetalDesignerProfileSelections(pd.state);
      const activeSide = this.getPetalDesignerTarget(pd.state);
      const symmetryLabelFromValue = (value) => {
        const normalized = this.normalizeDesignerSymmetryMode(value);
        const match = [
          { value: 'none', label: 'None' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'both', label: 'Horizontal and Vertical' },
        ].find((item) => item.value === normalized);
        return match ? match.label : 'None';
      };
      ['inner', 'outer'].forEach((side) => {
        const card = pd.root.querySelector(`[data-petal-profile-editor="${side}"]`);
        if (!card) return;
        const activateSide = (options = {}) => {
          const { rerender = false } = options;
          pd.state.activeTarget = side;
          pd.state.target = side;
          this.syncPetalDesignerControls(pd);
          if (rerender) this.renderPetalDesigner(pd);
        };
        card.classList.toggle('is-active', side === activeSide);
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', side === activeSide ? 'true' : 'false');
        card.onclick = (e) => {
          if (e.target.closest('button, select, input, label')) return;
          activateSide({ rerender: true });
        };
        card.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          activateSide({ rerender: true });
        };
        const profileSelect = card.querySelector(`select[data-petal-profile-select="${side}"]`);
        const profileLabel = card.querySelector(`[data-petal-profile-label="${side}"]`);
        const symmetrySelect = card.querySelector(`select[data-petal-symmetry-side="${side}"]`);
        const symmetryLabel = card.querySelector(`[data-petal-symmetry-label="${side}"]`);
        const importBtn = card.querySelector(`[data-petal-profile-import="${side}"]`);
        const exportBtn = card.querySelector(`[data-petal-profile-export="${side}"]`);
        const fileInput = card.querySelector(`input[data-petal-profile-file="${side}"]`);
        const profiles = this.getPetalDesignerProfilesForSide(side);
        if (profileSelect) {
          profileSelect.innerHTML = profiles.length
            ? profiles
                .map((profile) => `<option value="${profile.id}">${profile.name}</option>`)
                .join('')
            : '<option value="">No Profiles Found</option>';
          profileSelect.disabled = !profiles.length;
          const currentId = `${selections[side] || ''}`;
          const hasCurrent = profiles.some((profile) => profile.id === currentId);
          const nextId = hasCurrent ? currentId : profiles[0]?.id || '';
          profileSelect.value = nextId;
          selections[side] = nextId;
          if (profileLabel) {
            profileLabel.textContent = profiles.find((profile) => profile.id === nextId)?.name || 'None';
          }
          profileSelect.onfocus = () => {
            activateSide({ rerender: true });
          };
          profileSelect.onchange = () => {
            const selectedId = profileSelect.value;
            if (!selectedId) return;
            activateSide();
            const applied = this.applyPetalDesignerProfileSelection(pd.state, side, selectedId, {
              applyBoth: false,
              syncLock: true,
            });
            if (!applied) return;
            if (profileLabel) {
              profileLabel.textContent = profiles.find((profile) => profile.id === selectedId)?.name || selectedId;
            }
            this.syncPetalDesignerControls(pd);
            onApply();
          };
        }
        if (symmetrySelect) {
          const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
          symmetrySelect.value = symmetry;
          if (symmetryLabel) symmetryLabel.textContent = symmetryLabelFromValue(symmetry);
          symmetrySelect.onfocus = () => {
            activateSide({ rerender: true });
          };
          symmetrySelect.onchange = () => {
            activateSide();
            this.setPetalDesignerSymmetryForSide(pd.state, side, symmetrySelect.value);
            if (symmetryLabel) symmetryLabel.textContent = symmetryLabelFromValue(symmetrySelect.value);
            this.syncPetalDesignerControls(pd);
            onApply();
          };
        }
        if (importBtn && fileInput) {
          importBtn.onclick = () => {
            activateSide();
            fileInput.value = '';
            fileInput.click();
          };
          fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
              const result = await this.importPetalDesignerProfileFile(file, side, pd.state);
              if (!result.applied) {
                throw new Error('Profile import did not apply.');
              }
              this.syncPetalDesignerControls(pd);
              this.renderPetalDesignerProfileEditor(pd, onApply);
              onApply();
            } catch (err) {
              this.openModal({
                title: 'Invalid Profile',
                body: `<p class="modal-text">That profile file could not be imported.</p>`,
              });
            } finally {
              fileInput.value = '';
            }
          };
        }
        if (exportBtn) {
          exportBtn.onclick = () => {
            const fallback = `${side}-petal-profile`;
            const requested = window.prompt('Profile name', fallback);
            if (requested === null) return;
            const payload = this.buildPetalDesignerProfileExportPayload(pd.state, {
              scope: side,
              name: requested,
            });
            if (!payload) return;
            this.downloadJsonPayload(payload, `${payload.id}.json`);
          };
        }
      });
      const exportPairBtn = pd.root.querySelector('[data-petal-profile-export-pair]');
      if (exportPairBtn) {
        exportPairBtn.onclick = () => {
          const requested = window.prompt('Profile pair name', 'petal-profile-pair');
          if (requested === null) return;
          const payload = this.buildPetalDesignerProfileExportPayload(pd.state, {
            scope: 'both',
            name: requested,
          });
          if (!payload) return;
          this.downloadJsonPayload(payload, `${payload.id}.json`);
        };
      }
    },

    syncPetalDesignerControls(pd) {
      if (!pd?.root || !pd?.state) return;
      this.syncInnerOuterLock(pd.state);
      const side = this.getPetalDesignerTarget(pd.state);
      const viewStyleSelect = pd.root.querySelector('select[data-petal-view-style]');
      const innerCountInput = pd.root.querySelector('input[data-petal-inner-count]');
      const outerCountInput = pd.root.querySelector('input[data-petal-outer-count]');
      const splitFeatherInput = pd.root.querySelector('input[data-petal-split-feather]');
      const innerCountWrap = pd.root.querySelector('[data-petal-inner-count-wrap]');
      const outerCountWrap = pd.root.querySelector('[data-petal-outer-count-wrap]');
      const splitFeatherWrap = pd.root.querySelector('[data-petal-split-feather-wrap]');
      const lockToggle = pd.root.querySelector('input[data-petal-inner-outer-lock]');
      const visualizerGrid = pd.root.querySelector('[data-petal-visualizer-grid]');
      const overlayCell = pd.root.querySelector('[data-petal-cell="overlay"]');
      const innerCell = pd.root.querySelector('[data-petal-cell="inner"]');
      const outerCell = pd.root.querySelector('[data-petal-cell="outer"]');
      const overlayTitle = pd.root.querySelector('[data-petal-canvas-title="overlay"]');
      const innerTitle = pd.root.querySelector('[data-petal-canvas-title="inner"]');
      const outerTitle = pd.root.querySelector('[data-petal-canvas-title="outer"]');
      this.ensurePetalDesignerProfileSelections(pd.state);
      pd.state.activeTarget = side;
      pd.state.target = side;
      const innerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, 'inner');
      const outerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, 'outer');
      pd.state.innerSymmetry = innerSymmetry;
      pd.state.outerSymmetry = outerSymmetry;
      pd.state.designerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
      pd.state.viewStyle = this.normalizePetalDesignerViewStyle(pd.state.viewStyle);
      pd.state.count = Math.round(clamp(pd.state.count ?? PETALIS_DESIGNER_DEFAULT_COUNT, 5, 800));
      pd.state.innerCount = Math.round(
        clamp(pd.state.innerCount ?? pd.state.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400)
      );
      pd.state.outerCount = Math.round(
        clamp(pd.state.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600)
      );
      this.syncPetalDesignerTransitionFromCounts(pd.state);
      pd.state.profileTransitionFeather = clamp(pd.state.profileTransitionFeather ?? 0, 0, 100);
      pd.state.seed = Math.round(clamp(pd.state.seed ?? 1, 0, 9999));
      pd.state.countJitter = clamp(pd.state.countJitter ?? 0.1, 0, 0.5);
      pd.state.sizeJitter = clamp(pd.state.sizeJitter ?? 0.12, 0, 0.5);
      pd.state.rotationJitter = clamp(pd.state.rotationJitter ?? 6, 0, 45);
      pd.state.angularDrift = clamp(pd.state.angularDrift ?? 0, 0, 45);
      pd.state.driftStrength = clamp(pd.state.driftStrength ?? 0.1, 0, 1);
      pd.state.driftNoise = clamp(pd.state.driftNoise ?? 0.2, 0.05, 1);
      pd.state.radiusScale = clamp(pd.state.radiusScale ?? 0.2, -1, 1);
      pd.state.radiusScaleCurve = clamp(pd.state.radiusScaleCurve ?? 1.2, 0.5, 2.5);
      this.normalizePetalDesignerModifiers(pd.state);
      if (visualizerGrid) {
        visualizerGrid.classList.toggle('is-side-by-side', pd.state.viewStyle === 'side-by-side');
      }
      if (overlayCell) overlayCell.classList.toggle('hidden', pd.state.viewStyle === 'side-by-side');
      if (innerCell) innerCell.classList.toggle('hidden', pd.state.viewStyle !== 'side-by-side');
      if (outerCell) outerCell.classList.toggle('hidden', pd.state.viewStyle !== 'side-by-side');
      if (overlayTitle) {
        const activeLabel = side === 'inner' ? 'Inner Active' : 'Outer Active';
        overlayTitle.textContent = `Overlay (${activeLabel})`;
      }
      if (innerTitle) innerTitle.textContent = side === 'inner' ? 'Inner Shape (Active)' : 'Inner Shape';
      if (outerTitle) outerTitle.textContent = side === 'outer' ? 'Outer Shape (Active)' : 'Outer Shape';
      if (viewStyleSelect) viewStyleSelect.value = pd.state.viewStyle;
      if (innerCountInput) innerCountInput.value = pd.state.innerCount;
      if (outerCountInput) outerCountInput.value = pd.state.outerCount;
      if (splitFeatherInput) splitFeatherInput.value = pd.state.profileTransitionFeather;
      if (innerCountWrap) innerCountWrap.classList.remove('hidden');
      if (outerCountWrap) outerCountWrap.classList.remove('hidden');
      if (splitFeatherWrap) splitFeatherWrap.classList.remove('hidden');
      if (lockToggle) lockToggle.checked = Boolean(pd.state.innerOuterLock);
      this.setPetalDesignerSliderValue(pd, 'inner-count', pd.state.innerCount);
      this.setPetalDesignerSliderValue(pd, 'outer-count', pd.state.outerCount);
      this.setPetalDesignerSliderValue(pd, 'split-feather', pd.state.profileTransitionFeather);
      this.renderPetalDesignerProfileEditor(pd, pd.applyChanges);
    },

    bindPetalDesignerUI(pd, options = {}) {
      if (!pd?.root || !pd?.state) return;
      const { refreshControls = true } = options;
      const applyChanges = (opts = {}) => {
        const live = Boolean(opts.live);
        this.applyPetalDesignerToLayer(pd.state, {
          refreshControls: !live && refreshControls,
          persistState: !live,
        });
        this.renderPetalDesigner(pd);
      };
      pd.applyChanges = applyChanges;
      const setTool = (tool) => {
        pd.tool = tool;
        pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.petalTool === tool);
        });
      };
      const viewStyleSelect = pd.root.querySelector('select[data-petal-view-style]');
      const innerCountInput = pd.root.querySelector('input[data-petal-inner-count]');
      const outerCountInput = pd.root.querySelector('input[data-petal-outer-count]');
      const splitFeatherInput = pd.root.querySelector('input[data-petal-split-feather]');
      const lockToggle = pd.root.querySelector('input[data-petal-inner-outer-lock]');
      if (viewStyleSelect) {
        viewStyleSelect.onchange = () => {
          pd.state.viewStyle = this.normalizePetalDesignerViewStyle(viewStyleSelect.value);
          this.syncPetalDesignerControls(pd);
          this.renderPetalDesigner(pd);
        };
      }
      if (innerCountInput) {
        const onInnerCount = (live = false) => {
          const next = Number.parseFloat(innerCountInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.innerCount = Math.round(clamp(next, 5, 400));
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        innerCountInput.oninput = () => onInnerCount(true);
        innerCountInput.onchange = () => onInnerCount(false);
      }
      if (outerCountInput) {
        const onOuterCount = (live = false) => {
          const next = Number.parseFloat(outerCountInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.outerCount = Math.round(clamp(next, 5, 600));
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        outerCountInput.oninput = () => onOuterCount(true);
        outerCountInput.onchange = () => onOuterCount(false);
      }
      if (lockToggle) {
        lockToggle.onchange = () => {
          pd.state.innerOuterLock = Boolean(lockToggle.checked);
          this.syncInnerOuterLock(pd.state, this.getPetalDesignerTarget(pd.state));
          this.syncPetalDesignerControls(pd);
          applyChanges();
        };
      }
      if (splitFeatherInput) {
        const onFeather = (live = false) => {
          const next = Number.parseFloat(splitFeatherInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.profileTransitionFeather = clamp(next, 0, 100);
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        splitFeatherInput.oninput = () => onFeather(true);
        splitFeatherInput.onchange = () => onFeather(false);
      }
      this.renderPetalDesignerProfileEditor(pd, applyChanges);
      pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
        btn.onclick = () => setTool(btn.dataset.petalTool || 'direct');
      });
      const closeBtn = pd.root.querySelector('.petal-close');
      if (closeBtn) closeBtn.onclick = () => this.closePetalDesigner();
      const popOutBtn = pd.root.querySelector('.petal-popout');
      if (popOutBtn) popOutBtn.onclick = () => this.popOutInlinePetalDesigner();
      const popInBtn = pd.root.querySelector('.petal-popin');
      if (popInBtn) popInBtn.onclick = () => this.popInPetalDesigner();
      this.renderPetalDesignerShadingStack(pd, applyChanges);
      this.renderPetalDesignerModifierStack(pd, applyChanges);
      this.renderPetalDesignerRandomnessPanel(pd, applyChanges);
      this.loadPetalDesignerProfiles()
        .then(() => {
          if (!pd?.root?.isConnected) return;
          this.renderPetalDesignerProfileEditor(pd, applyChanges);
          this.syncPetalDesignerControls(pd);
          this.renderPetalDesigner(pd);
        })
        .catch(() => {
          // Profile ingestion can fail when static hosting blocks directory reads.
        });
      setTool('direct');
      this.syncPetalDesignerControls(pd);
    },

    openPetalDesigner(options = {}) {
      const { layer: requestedLayer = null, fromInline = false } = options;
      const layer = requestedLayer || this.getPetalDesignerLayer();
      if (!layer) {
        this.openModal({
          title: 'Petal Designer',
          body:
            '<p class="modal-text">Add or select a <strong>Petalis</strong> layer first to open the Petal Designer.</p>',
        });
        return;
      }
      if (!fromInline && this.inlinePetalDesigner && this.inlinePetalDesigner.state?.layerId === layer.id) {
        this.inlinePetalDesigner.focused = true;
        this.inlinePetalDesigner.root?.classList.add('focused');
        return;
      }
      this.closePetalDesigner();
      const state = this.ensurePetalDesignerState(layer);
      if (!state) return;
      const root = document.createElement('div');
      root.id = 'petal-designer-window';
      root.className = 'petal-designer-window';
      root.innerHTML = this.createPetalDesignerMarkup({
        showPopIn: true,
        canvasWidth: 220,
        canvasHeight: 180,
      });
      document.body.appendChild(root);

      this.petalDesigner = {
        root,
        state,
        tool: 'direct',
        drag: null,
        windowDrag: null,
        keyHandler: null,
      };
      this.bindPetalDesignerDrag(this.petalDesigner);
      this.bindPetalDesignerUI(this.petalDesigner);
      this.bindPetalDesignerCanvases(this.petalDesigner);
      this.bindPetalDesignerShortcuts(this.petalDesigner);
      this.applyPetalDesignerToLayer(state);
      this.renderPetalDesigner(this.petalDesigner);
    },

    popOutInlinePetalDesigner() {
      const inline = this.inlinePetalDesigner;
      if (!inline?.state?.layerId) return;
      const layer = (this.app.engine.layers || []).find((entry) => entry?.id === inline.state.layerId);
      if (!layer) return;
      this.destroyInlinePetalisDesigner();
      this.openPetalDesigner({ layer, fromInline: true });
    },

    popInPetalDesigner() {
      const modalState = this.petalDesigner?.state;
      this.closePetalDesigner();
      if (!modalState?.layerId) return;
      const layer = (this.app.engine.layers || []).find((entry) => entry?.id === modalState.layerId);
      if (!layer) return;
      this.buildControls();
      if (this.inlinePetalDesigner?.state?.layerId === layer.id) {
        this.inlinePetalDesigner.focused = true;
        this.inlinePetalDesigner.root?.classList.add('focused');
      }
    },

    closePetalDesigner() {
      if (!this.petalDesigner) return;
      const { root, keyHandler, cleanupDrag, cleanupCanvas } = this.petalDesigner;
      if (cleanupDrag) cleanupDrag();
      if (cleanupCanvas) cleanupCanvas();
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      if (root && root.parentElement) root.remove();
      this.petalDesigner = null;
    },

    destroyInlinePetalisDesigner() {
      if (!this.inlinePetalDesigner) return;
      const { root, keyHandler, cleanupCanvas, cleanupOutside } = this.inlinePetalDesigner;
      if (cleanupCanvas) cleanupCanvas();
      if (cleanupOutside) cleanupOutside();
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      if (root && root.parentElement) root.remove();
      this.inlinePetalDesigner = null;
    },

    mountInlinePetalisDesigner(layer, mountTarget) {
      if (!layer || !mountTarget) return;
      this.destroyInlinePetalisDesigner();
      const state = this.ensurePetalDesignerState(layer);
      if (!state) return;

      const root = document.createElement('div');
      root.className = 'petal-designer-window petal-designer-inline';
      root.innerHTML = this.createPetalDesignerMarkup({
        showClose: false,
        showPopOut: true,
        canvasWidth: 220,
        canvasHeight: 180,
      });
      mountTarget.appendChild(root);
      const pd = {
        root,
        state,
        tool: 'direct',
        drag: null,
        keyHandler: null,
        cleanupCanvas: null,
        cleanupOutside: null,
        focused: false,
        inline: true,
      };

      const focusInline = () => {
        pd.focused = true;
        root.classList.add('focused');
      };
      focusInline();
      root.addEventListener('pointerdown', focusInline);
      const onOutsidePointer = (e) => {
        if (root.contains(e.target)) return;
        pd.focused = false;
        root.classList.remove('focused');
      };
      document.addEventListener('pointerdown', onOutsidePointer);
      pd.cleanupOutside = () => {
        root.removeEventListener('pointerdown', focusInline);
        document.removeEventListener('pointerdown', onOutsidePointer);
      };

      this.inlinePetalDesigner = pd;
      this.bindPetalDesignerUI(pd, { refreshControls: false });
      this.bindPetalDesignerCanvases(pd, { refreshControls: false });
      this.bindPetalDesignerShortcuts(pd, { allowClose: false, requireFocus: true });
      this.applyPetalDesignerToLayer(state, { refreshControls: false });
      this.renderPetalDesigner(pd);
    },

    bindPetalDesignerDrag(pd = this.petalDesigner) {
      if (!pd?.root) return;
      const header = pd.root.querySelector('.petal-designer-header');
      if (!header) return;
      const startDrag = (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
        const rect = pd.root.getBoundingClientRect();
        pd.windowDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        pd.root.classList.add('dragging');
      };
      const move = (e) => {
        if (!pd.windowDrag) return;
        const left = Math.max(12, e.clientX - pd.windowDrag.dx);
        const top = Math.max(12, e.clientY - pd.windowDrag.dy);
        pd.root.style.left = `${left}px`;
        pd.root.style.top = `${top}px`;
      };
      const end = () => {
        pd.windowDrag = null;
        pd.root.classList.remove('dragging');
      };
      header.addEventListener('pointerdown', startDrag);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      pd.cleanupDrag = () => {
        header.removeEventListener('pointerdown', startDrag);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      const viewport = document.getElementById('viewport-container')?.getBoundingClientRect();
      const fallbackLeft = viewport ? viewport.left + 24 : 120;
      const fallbackTop = viewport ? viewport.top + 24 : 120;
      pd.root.style.left = `${fallbackLeft}px`;
      pd.root.style.top = `${fallbackTop}px`;
    },

    bindPetalDesignerShortcuts(pd = this.petalDesigner, options = {}) {
      if (!pd?.root) return;
      const { allowClose = true, requireFocus = false } = options;
      const setTool = (tool) => {
        pd.tool = tool;
        pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.petalTool === tool);
        });
      };
      const handler = (e) => {
        if (!pd?.root) return;
        if (requireFocus && !pd.focused) return;
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
        const key = e.key.toLowerCase();
        if (key === 'escape') {
          if (!allowClose) return;
          e.preventDefault();
          if (pd.inline) this.destroyInlinePetalisDesigner();
          else this.closePetalDesigner();
          return;
        }
        if (key === 'a' || key === 'v') {
          e.preventDefault();
          setTool('direct');
        } else if (key === 'p' || key === '+') {
          e.preventDefault();
          setTool('pen');
        } else if (key === '-') {
          e.preventDefault();
          setTool('delete');
        } else if (key === 'c' && e.shiftKey) {
          e.preventDefault();
          setTool('anchor');
        }
      };
      pd.keyHandler = handler;
      window.addEventListener('keydown', handler);
    },

    bindPetalDesignerCanvases(pd = this.petalDesigner, options = {}) {
      if (!pd?.root) return;
      const { refreshControls = true } = options;
      const applyChanges = (opts = {}) => {
        const live = Boolean(opts.live);
        this.applyPetalDesignerToLayer(pd.state, {
          refreshControls: !live && refreshControls,
          persistState: !live,
        });
        this.renderPetalDesigner(pd);
      };
      const canvases = Array.from(pd.root.querySelectorAll('canvas[data-petal-canvas]'));
      if (!canvases.length) return;
      const canvasByRole = new Map();
      const getCanvasRole = (canvas) => {
        const role = canvas?.dataset?.petalCanvas;
        if (role === 'inner' || role === 'outer') return role;
        return 'overlay';
      };
      const getCanvasForSide = (side) => canvasByRole.get(side) || canvasByRole.get('overlay') || canvases[0];
      const getSideForCanvas = (canvas) => {
        const role = getCanvasRole(canvas);
        return role === 'inner' || role === 'outer' ? role : this.getPetalDesignerTarget(pd.state);
      };
      const getViewForCanvas = (canvas, side = null) => {
        const role = getCanvasRole(canvas);
        if (role === 'inner' || role === 'outer') return this.getPetalDesignerView(pd.state, role);
        return this.getPetalDesignerView(pd.state, side || this.getPetalDesignerTarget(pd.state));
      };
      const activateCanvasSide = (canvas) => {
        const role = getCanvasRole(canvas);
        if (role !== 'inner' && role !== 'outer') return this.getPetalDesignerTarget(pd.state);
        pd.state.target = role;
        pd.state.activeTarget = role;
        this.syncPetalDesignerControls(pd);
        this.renderPetalDesignerShadingStack(pd, applyChanges);
        this.renderPetalDesigner(pd);
        return role;
      };
      const normalizePointForCanvas = (fromCanvas, toCanvas, point) => {
        const sourceMetrics = this.getDesignerCanvasMetrics(fromCanvas);
        const targetMetrics = this.getDesignerCanvasMetrics(toCanvas);
        const nx = clamp(point.x / Math.max(1e-6, sourceMetrics.width), 0, 1);
        const ny = clamp(point.y / Math.max(1e-6, sourceMetrics.height), 0, 1);
        return {
          x: nx * targetMetrics.width,
          y: ny * targetMetrics.height,
        };
      };
      const zoomViewAtPoint = (side, canvas, point, factor) => {
        if (!canvas) return;
        const view = this.getPetalDesignerView(pd.state, side);
        const prevZoom = view.zoom;
        view.zoom = clamp(view.zoom * factor, 0.35, 4.5);
        const scale = view.zoom / Math.max(1e-6, prevZoom);
        view.panX = point.x - (point.x - view.panX) * scale;
        view.panY = point.y - (point.y - view.panY) * scale;
      };
      const zoomBothSides = (sourceCanvas, sourcePoint, factor) => {
        ['inner', 'outer'].forEach((side) => {
          const targetCanvas = getCanvasForSide(side);
          const targetPoint = normalizePointForCanvas(sourceCanvas, targetCanvas, sourcePoint);
          zoomViewAtPoint(side, targetCanvas, targetPoint, factor);
        });
      };
      if (!pd.canvasHover || typeof pd.canvasHover !== 'object') pd.canvasHover = {};
      const readModifiers = (e) => {
        const mods = SETTINGS.touchModifiers || {};
        const isTouch = e?.pointerType === 'touch';
        return {
          shift: Boolean(e?.shiftKey || (isTouch && mods.shift)),
          alt: Boolean(e?.altKey || (isTouch && mods.alt)),
          meta: Boolean(e?.metaKey || e?.ctrlKey || (isTouch && mods.meta)),
        };
      };
      const setCursor = (canvas, e = null) => {
        if (!canvas) return;
        const role = getCanvasRole(canvas);
        const hoverKey = role;
        if (pd.canvasPan && pd.canvasPan.canvas === canvas) {
          canvas.style.cursor = 'grabbing';
          return;
        }
        const side = getSideForCanvas(canvas);
        const shape = pd.state?.[side];
        const view = getViewForCanvas(canvas, side);
        const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
        let hit = pd.canvasHover?.[hoverKey] || null;
        let bodySide = null;
        if (shape && e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
          const pos = this.getDesignerCanvasPoint(canvas, e);
          hit = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
          bodySide =
            role === 'overlay'
              ? this.pickPetalDesignerShapeAtPoint(pd, canvas, pos)
              : this.hitDesignerShapeBody(shape, canvas, pos, view, symmetry)
              ? side
              : null;
          pd.canvasHover[hoverKey] = hit;
        }
        const modifiers = readModifiers(e || {});
        if (pd.tool === 'direct' || (pd.tool === 'pen' && modifiers.meta)) {
          if (hit) {
            canvas.style.cursor = hit.kind === 'anchor' ? 'move' : 'pointer';
            return;
          }
          if (bodySide) {
            canvas.style.cursor = 'pointer';
            return;
          }
          canvas.style.cursor = 'crosshair';
          return;
        }
        if (pd.tool === 'pen') {
          if (modifiers.alt && (hit?.kind === 'anchor' || hit?.kind === 'handle')) {
            canvas.style.cursor = 'copy';
            return;
          }
          canvas.style.cursor = hit ? (hit.kind === 'anchor' ? 'move' : 'pointer') : 'crosshair';
          return;
        }
        if (pd.tool === 'delete') {
          canvas.style.cursor = hit?.kind === 'anchor' ? 'not-allowed' : 'crosshair';
          return;
        }
        if (pd.tool === 'anchor') {
          canvas.style.cursor = hit?.kind === 'anchor' ? 'copy' : 'crosshair';
          return;
        }
        canvas.style.cursor = 'crosshair';
      };
      const cleanupFns = [];
      canvases.forEach((canvas) => {
        const role = getCanvasRole(canvas);
        canvasByRole.set(role, canvas);
      });
      canvases.forEach((canvas) => {
        const role = getCanvasRole(canvas);
        const hoverKey = role;
        const touchPoints = new Map();
        let pinch = null;
        const readPair = () => {
          if (touchPoints.size < 2) return null;
          const values = Array.from(touchPoints.values());
          return [values[0], values[1]];
        };
        const onDown = (e) => {
          if (role === 'inner' || role === 'outer') activateCanvasSide(canvas);
          if (e.pointerType === 'touch') {
            touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPoints.size >= 2) {
              const pair = readPair();
              if (pair) {
                const [a, b] = pair;
                const side = getSideForCanvas(canvas);
                const view = getViewForCanvas(canvas, side);
                pinch = {
                  side,
                  startZoom: view.zoom,
                  startPanX: view.panX,
                  startPanY: view.panY,
                  startCenter: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
                  startDistance: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
                };
                pd.drag = null;
              }
              if (canvas.setPointerCapture) {
                try {
                  canvas.setPointerCapture(e.pointerId);
                } catch (err) {
                  // Ignore capture failures.
                }
              }
              e.preventDefault();
              setCursor(canvas, e);
              return;
            }
          }
          if (pinch) return;
          if (e.button === 1) {
            e.preventDefault();
            const side = getSideForCanvas(canvas);
            pd.canvasPan = { pointerId: e.pointerId, canvas, side, x: e.clientX, y: e.clientY };
            setCursor(canvas, e);
            return;
          }
          if (e.button !== undefined && e.button !== 0) return;
          e.preventDefault();
          const side = getSideForCanvas(canvas);
          const pos = this.getDesignerCanvasPoint(canvas, e);
          const selectedSide = role === 'overlay' ? this.pickPetalDesignerShapeAtPoint(pd, canvas, pos) : side;
          if (selectedSide && selectedSide !== side) {
            pd.state.target = selectedSide;
            pd.state.activeTarget = selectedSide;
            this.syncPetalDesignerControls(pd);
            this.renderPetalDesignerShadingStack(pd, applyChanges);
            this.renderPetalDesigner(pd);
            setCursor(canvas, e);
            return;
          }
          const activeSide = selectedSide || side;
          const shape = pd.state[activeSide];
          const view = getViewForCanvas(canvas, activeSide);
          const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, activeSide);
          const hit = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
          const modifiers = readModifiers(e);
          if (pd.tool === 'direct' || (pd.tool === 'pen' && modifiers.meta)) {
            if (hit) {
              pd.drag = { mode: 'control', side: activeSide, canvas, hit, pointerId: e.pointerId };
              setCursor(canvas, e);
              return;
            }
          } else if (pd.tool === 'pen') {
            if (modifiers.alt && hit && (hit.kind === 'anchor' || hit.kind === 'handle')) {
              this.toggleDesignerAnchor(shape, hit.index, hit.kind === 'handle' ? hit.which : null);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, activeSide);
              applyChanges();
              setCursor(canvas, e);
              return;
            }
            if (hit) {
              pd.drag = { mode: 'control', side: activeSide, canvas, hit, pointerId: e.pointerId };
              setCursor(canvas, e);
              return;
            }
            const index = this.insertDesignerAnchor(shape, canvas, pos, view);
            if (Number.isFinite(index)) {
              pd.drag = {
                mode: 'pen-new',
                side: activeSide,
                canvas,
                pointerId: e.pointerId,
                index,
              };
            }
            applyChanges();
            setCursor(canvas, e);
            return;
          } else if (pd.tool === 'delete') {
            if (hit && hit.kind === 'anchor' && hit.index > 0 && hit.index < shape.anchors.length - 1 && shape.anchors.length > 3) {
              shape.anchors.splice(hit.index, 1);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, activeSide);
              applyChanges();
            }
            setCursor(canvas, e);
            return;
          } else if (pd.tool === 'anchor') {
            if (hit && hit.kind === 'anchor') {
              this.toggleDesignerAnchor(shape, hit.index);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, activeSide);
              applyChanges();
            }
            setCursor(canvas, e);
          }
        };
        const onMove = (e) => {
          if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
            touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }
          if (pinch) {
            const pair = readPair();
            if (!pair) return;
            const [a, b] = pair;
            const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
            const dist = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
            const view = this.getPetalDesignerView(pd.state, pinch.side);
            const ratio = dist / Math.max(1e-6, pinch.startDistance);
            view.zoom = clamp(pinch.startZoom * ratio, 0.35, 4.5);
            view.panX = pinch.startPanX + (center.x - pinch.startCenter.x);
            view.panY = pinch.startPanY + (center.y - pinch.startCenter.y);
            this.renderPetalDesigner(pd);
            if (e.cancelable) e.preventDefault();
            setCursor(canvas, e);
            return;
          }
          if (pd.canvasPan && pd.canvasPan.canvas === canvas) {
            if (pd.canvasPan.pointerId !== undefined && e.pointerId !== undefined && pd.canvasPan.pointerId !== e.pointerId) return;
            const view = getViewForCanvas(canvas, pd.canvasPan.side);
            view.panX += e.clientX - pd.canvasPan.x;
            view.panY += e.clientY - pd.canvasPan.y;
            pd.canvasPan.x = e.clientX;
            pd.canvasPan.y = e.clientY;
            this.renderPetalDesigner(pd);
            setCursor(canvas, e);
            return;
          }
          if (!pd.drag) {
            if (e.pointerType !== 'touch') {
              const side = getSideForCanvas(canvas);
              const shape = pd.state?.[side];
              const view = getViewForCanvas(canvas, side);
              const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
              if (shape) {
                const pos = this.getDesignerCanvasPoint(canvas, e);
                pd.canvasHover[hoverKey] = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
              } else {
                pd.canvasHover[hoverKey] = null;
              }
              setCursor(canvas, e);
            }
            return;
          }
          if (pd.drag.canvas !== canvas) return;
          if (pd.drag.pointerId !== undefined && e.pointerId !== undefined && pd.drag.pointerId !== e.pointerId) return;
          const { side, canvas: dragCanvas, hit } = pd.drag;
          const shape = pd.state[side];
          if (!shape) return;
          const view = getViewForCanvas(dragCanvas, side);
          const pos = this.getDesignerCanvasPoint(dragCanvas, e);
          if (pd.drag.mode === 'pen-new') {
            this.updateDesignerPenHandleDrag(shape, pd.drag.index, dragCanvas, pos, e, view);
          } else {
            this.updateDesignerDrag(shape, dragCanvas, hit, pos, e, view);
          }
          this.normalizeDesignerShape(shape);
          this.syncInnerOuterLock(pd.state, side);
          applyChanges({ live: true });
          setCursor(canvas, e);
        };
        const onUp = (e) => {
          const hadDrag = Boolean(pd.drag && pd.drag.canvas === canvas);
          if (e.pointerType === 'touch') {
            touchPoints.delete(e.pointerId);
            if (touchPoints.size < 2) pinch = null;
          }
          if (pd.canvasPan && pd.canvasPan.canvas === canvas && pd.canvasPan.pointerId !== undefined && e.pointerId !== undefined && pd.canvasPan.pointerId === e.pointerId) {
            pd.canvasPan = null;
            setCursor(canvas, e);
          }
          if (pd.drag && pd.drag.canvas === canvas) {
            if (pd.drag.pointerId !== undefined && e.pointerId !== undefined && pd.drag.pointerId !== e.pointerId) return;
            pd.drag = null;
            if (hadDrag) applyChanges();
          }
          setCursor(canvas, e);
        };
        const onWheel = (e) => {
          e.preventDefault();
          if (role === 'inner' || role === 'outer') activateCanvasSide(canvas);
          const pos = this.getDesignerCanvasPoint(canvas, e);
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          zoomBothSides(canvas, pos, factor);
          this.renderPetalDesigner(pd);
          canvases.forEach((entry) => setCursor(entry, e));
        };
        const onLeave = () => {
          pd.canvasHover[hoverKey] = null;
          setCursor(canvas);
        };
        const onResize = () => this.renderPetalDesigner(pd);
        const resizeObserver =
          typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => this.renderPetalDesigner(pd))
            : null;
        if (resizeObserver) resizeObserver.observe(canvas);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerleave', onLeave);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('resize', onResize);
        cleanupFns.push(() => {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointerleave', onLeave);
          canvas.removeEventListener('wheel', onWheel);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          window.removeEventListener('resize', onResize);
          if (resizeObserver) resizeObserver.disconnect();
        });
        this.syncDesignerCanvasResolution(canvas);
        setCursor(canvas);
      });
      pd.cleanupCanvas = () => {
        cleanupFns.forEach((cleanup) => cleanup());
      };
    },

    getDesignerCanvasMetrics(canvas) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const width = Math.max(1, rect.width || canvas?.clientWidth || canvas?.width / dpr || 1);
      const height = Math.max(1, rect.height || canvas?.clientHeight || canvas?.height / dpr || 1);
      return { width, height, dpr };
    },

    syncDesignerCanvasResolution(canvas) {
      if (!canvas) return this.getDesignerCanvasMetrics(canvas);
      const metrics = this.getDesignerCanvasMetrics(canvas);
      const targetWidth = Math.max(1, Math.round(metrics.width * metrics.dpr));
      const targetHeight = Math.max(1, Math.round(metrics.height * metrics.dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      return metrics;
    },

    getDesignerCanvasPoint(canvas, e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    normalizePetalDesignerWidthRatio(value, fallback = 1) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return clamp(fallback, 0.01, 2);
      return clamp(numeric, 0.01, 2);
    },

    getPetalDesignerWidthRatioForCanvas(canvas, fallback = 1) {
      const resolveFromDesigner = (designerState) => {
        if (!designerState?.root || !designerState?.state || !canvas || !designerState.root.contains(canvas)) {
          return null;
        }
        const layer = this.getLayerById(designerState.state.layerId);
        const value = layer?.params?.petalWidthRatio ?? designerState.state?.widthRatio;
        return this.normalizePetalDesignerWidthRatio(value, fallback);
      };
      return resolveFromDesigner(this.petalDesigner)
        ?? resolveFromDesigner(this.inlinePetalDesigner)
        ?? this.normalizePetalDesignerWidthRatio(fallback, 1);
    },

    designerToCanvas(canvas, point, view = null) {
      const { width: w, height: h } = this.getDesignerCanvasMetrics(canvas);
      const cx = w * 0.5;
      const baseY = h * 0.88;
      const tSpan = h * 0.74;
      const widthRatio = this.getPetalDesignerWidthRatioForCanvas(canvas, 1);
      const widthScale = widthRatio / PETAL_DESIGNER_WIDTH_MATCH_BASELINE;
      const wSpan = w * 0.28 * widthScale;
      const zoom = Math.max(0.35, view?.zoom ?? 1);
      const panX = view?.panX ?? 0;
      const panY = view?.panY ?? 0;
      const baseX = cx + point.w * wSpan;
      const baseYY = baseY - point.t * tSpan;
      return {
        x: (baseX - cx) * zoom + cx + panX,
        y: (baseYY - h * 0.5) * zoom + h * 0.5 + panY,
      };
    },

    canvasToDesigner(canvas, point, view = null, options = {}) {
      const { width: w, height: h } = this.getDesignerCanvasMetrics(canvas);
      const cx = w * 0.5;
      const baseY = h * 0.88;
      const tSpan = h * 0.74;
      const widthRatio = this.getPetalDesignerWidthRatioForCanvas(canvas, 1);
      const widthScale = widthRatio / PETAL_DESIGNER_WIDTH_MATCH_BASELINE;
      const wSpan = w * 0.28 * widthScale;
      const zoom = Math.max(0.35, view?.zoom ?? 1);
      const panX = view?.panX ?? 0;
      const panY = view?.panY ?? 0;
      const baseX = (point.x - cx - panX) / zoom + cx;
      const baseYY = (point.y - h * 0.5 - panY) / zoom + h * 0.5;
      const rawT = (baseY - baseYY) / Math.max(1e-6, tSpan);
      const clampT = options?.clampT !== false;
      return {
        t: clampT ? clamp(rawT, 0, 1) : rawT,
        w: (baseX - cx) / Math.max(1e-6, wSpan),
      };
    },

    sampleDesignerWidthAt(edge, t) {
      if (!Array.isArray(edge) || edge.length < 2) return 0;
      if (t <= edge[0].t) return Math.max(0, edge[0].w);
      if (t >= edge[edge.length - 1].t) return Math.max(0, edge[edge.length - 1].w);
      for (let i = 1; i < edge.length; i++) {
        const a = edge[i - 1];
        const b = edge[i];
        if (t <= b.t + 1e-6) {
          const denom = Math.max(1e-6, b.t - a.t);
          const mix = clamp((t - a.t) / denom, 0, 1);
          return Math.max(0, lerp(a.w, b.w, mix));
        }
      }
      return Math.max(0, edge[edge.length - 1].w);
    },

    applyDesignerEdgeSymmetry(edge, symmetry = 'none') {
      if (!Array.isArray(edge) || edge.length < 2) return edge || [];
      const mode = this.normalizeDesignerSymmetryMode(symmetry);
      if (!this.designerSymmetryHasVerticalAxis(mode)) {
        return edge.map((pt) => ({ t: clamp(pt.t, 0, 1), w: Math.max(0, pt.w) }));
      }
      return edge.map((pt) => {
        const t = clamp(pt.t, 0, 1);
        const mirrored = this.sampleDesignerWidthAt(edge, 1 - t);
        return { t, w: Math.max(0, (Math.max(0, pt.w) + mirrored) * 0.5) };
      });
    },

    sampleDesignerEdge(shape, stepsPerSeg = 18, symmetry = 'none') {
      this.normalizeDesignerShape(shape);
      const anchors = shape.anchors || [];
      if (anchors.length < 2) return [];
      const cubic = (p0, p1, p2, p3, t) => {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        return {
          t: uuu * p0.t + 3 * uu * t * p1.t + 3 * u * tt * p2.t + ttt * p3.t,
          w: uuu * p0.w + 3 * uu * t * p1.w + 3 * u * tt * p2.w + ttt * p3.w,
        };
      };
      const out = [];
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        const c1 = a.out || { t: lerp(a.t, b.t, 1 / 3), w: a.w };
        const c2 = b.in || { t: lerp(a.t, b.t, 2 / 3), w: b.w };
        for (let s = 0; s <= stepsPerSeg; s++) {
          if (out.length && s === 0) continue;
          const pt = cubic(a, c1, c2, b, s / stepsPerSeg);
          out.push({ t: clamp(pt.t, 0, 1), w: Math.max(0, pt.w) });
        }
      }
      return this.applyDesignerEdgeSymmetry(out, symmetry);
    },

    buildDesignerPolygon(shape, symmetry = 'none') {
      const right = this.sampleDesignerEdge(shape, 36, symmetry);
      if (!right.length) return [];
      const left = right
        .slice(1, -1)
        .reverse()
        .map((pt) => ({ t: pt.t, w: -pt.w }));
      return right.concat(left);
    },

    pointInDesignerPolygon(points, pos) {
      if (!Array.isArray(points) || points.length < 3 || !pos) return false;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        const dy = b.y - a.y;
        const safeDy = Math.abs(dy) < 1e-6 ? (dy < 0 ? -1e-6 : 1e-6) : dy;
        const intersects =
          (a.y > pos.y) !== (b.y > pos.y)
          && pos.x < ((b.x - a.x) * (pos.y - a.y)) / safeDy + a.x;
        if (intersects) inside = !inside;
      }
      return inside;
    },

    distanceToDesignerPolygon(points, pos) {
      if (!Array.isArray(points) || points.length < 2 || !pos) return Infinity;
      const distanceToSegment = (point, a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
        const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
        const projX = a.x + dx * t;
        const projY = a.y + dy * t;
        return Math.hypot(point.x - projX, point.y - projY);
      };
      let best = Infinity;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        best = Math.min(best, distanceToSegment(pos, a, b));
      }
      return best;
    },

    hitDesignerShapeBody(shape, canvas, pos, view = null, symmetry = 'none', tolerance = 6) {
      const polygon = this.buildDesignerPolygon(shape, symmetry);
      if (!polygon.length) return false;
      const points = polygon.map((pt) => this.designerToCanvas(canvas, pt, view));
      return this.pointInDesignerPolygon(points, pos) || this.distanceToDesignerPolygon(points, pos) <= tolerance;
    },

    pickPetalDesignerShapeAtPoint(pd, canvas, pos) {
      if (!pd?.state || !canvas || !pos) return null;
      const activeSide = this.getPetalDesignerTarget(pd.state);
      const inactiveSide = activeSide === 'inner' ? 'outer' : 'inner';
      const activeHit = this.hitDesignerShapeBody(
        pd.state[activeSide],
        canvas,
        pos,
        this.getPetalDesignerView(pd.state, activeSide),
        this.getPetalDesignerSymmetryForSide(pd.state, activeSide)
      );
      const inactiveHit = this.hitDesignerShapeBody(
        pd.state[inactiveSide],
        canvas,
        pos,
        this.getPetalDesignerView(pd.state, inactiveSide),
        this.getPetalDesignerSymmetryForSide(pd.state, inactiveSide)
      );
      if (inactiveHit && !activeHit) return inactiveSide;
      if (activeHit) return activeSide;
      if (inactiveHit) return inactiveSide;
      return null;
    },

    drawDesignerGrid(ctx, canvas) {
      const { width, height, dpr } = this.syncDesignerCanvasResolution(canvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.fillStyle = getThemeToken('--designer-grid-bg', '#0f1116');
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = getThemeToken('--designer-grid-line', 'rgba(148,163,184,0.14)');
      ctx.lineWidth = 1;
      const gap = 20;
      for (let x = 0; x <= width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawDesignerShape(canvas, shape, options = {}) {
      const {
        shading = null,
        shadings = null,
        showControls = false,
        view = null,
        symmetry = 'none',
        clearCanvas = true,
        fillStyle = getThemeToken('--designer-fill-active', 'rgba(56, 189, 248, 0.08)'),
        strokeStyle = getThemeToken('--designer-stroke-active', '#67e8f9'),
      } = options;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (clearCanvas) this.drawDesignerGrid(ctx, canvas);
      const polygon = this.buildDesignerPolygon(shape, symmetry);
      if (!polygon.length) return;
      const points = polygon.map((pt) => this.designerToCanvas(canvas, pt, view));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.4;
      ctx.fill();
      ctx.stroke();

      const activeShadings = Array.isArray(shadings)
        ? shadings.filter((item) => item && item.enabled !== false)
        : shading
        ? [shading]
        : [];
      if (activeShadings.length) {
        ctx.save();
        ctx.clip();
        const center = points.reduce(
          (acc, point) => {
            acc.x += point.x;
            acc.y += point.y;
            return acc;
          },
          { x: 0, y: 0 }
        );
        center.x /= Math.max(1, points.length);
        center.y /= Math.max(1, points.length);
        const edge = this.sampleDesignerEdge(shape, 96, symmetry);
        const seededUnit = (seed) => {
          const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
          return raw - Math.floor(raw);
        };
        const sampleWidthAt = (t) => {
          const safeT = clamp(t, 0, 1);
          if (!edge.length) return 0;
          if (edge.length === 1) return Math.max(0, edge[0].w || 0);
          for (let i = 1; i < edge.length; i++) {
            const a = edge[i - 1];
            const b = edge[i];
            if (safeT > b.t && i < edge.length - 1) continue;
            const span = Math.max(1e-6, b.t - a.t);
            const mix = clamp((safeT - a.t) / span, 0, 1);
            return Math.max(0, lerp(a.w, b.w, mix));
          }
          return Math.max(0, edge[edge.length - 1].w || 0);
        };
        const pointAt = (t, offset) => {
          const w = sampleWidthAt(t);
          return this.designerToCanvas(canvas, { t: clamp(t, 0, 1), w: clamp(offset, -1, 1) * w }, view);
        };
        const rotatePath = (path, deg = 0) => {
          if (!Array.isArray(path) || path.length < 2) return path;
          const rad = (deg * Math.PI) / 180;
          if (Math.abs(rad) < 1e-5) return path;
          const pivot = path.reduce(
            (acc, pt) => {
              acc.x += pt.x;
              acc.y += pt.y;
              return acc;
            },
            { x: 0, y: 0 }
          );
          pivot.x /= Math.max(1, path.length);
          pivot.y /= Math.max(1, path.length);
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          return path.map((pt) => {
            const dx = pt.x - pivot.x;
            const dy = pt.y - pivot.y;
            return {
              x: pivot.x + dx * cos - dy * sin,
              y: pivot.y + dx * sin + dy * cos,
            };
          });
        };
        const strokePath = (path) => {
          if (!Array.isArray(path) || path.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        };
        const slicePathByPattern = (path, dash, gap) => {
          if (!Array.isArray(path) || path.length < 2) return [];
          const segments = [];
          let draw = true;
          let remaining = dash;
          let current = [];
          for (let i = 0; i < path.length - 1; i++) {
            let a = path[i];
            let b = path[i + 1];
            let segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen < 1e-6) continue;
            while (segLen > 1e-6) {
              const step = Math.min(segLen, remaining);
              const t = step / segLen;
              const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
              if (draw) {
                if (!current.length) current.push(a);
                current.push(pt);
              }
              segLen -= step;
              a = pt;
              if (Math.abs(step - remaining) < 1e-6) {
                if (draw && current.length > 1) segments.push(current);
                current = [];
                draw = !draw;
                remaining = draw ? dash : gap;
              } else {
                remaining -= step;
              }
            }
          }
          if (draw && current.length > 1) segments.push(current);
          return segments;
        };
        const applyLineType = (path, lineType, spacingPx) => {
          const safeSpacing = Math.max(2, spacingPx || 4);
          if (lineType === 'dashed') {
            return slicePathByPattern(path, safeSpacing * 2, safeSpacing * 1.2);
          }
          if (lineType === 'dotted') {
            return slicePathByPattern(path, safeSpacing * 0.4, safeSpacing * 1.4);
          }
          if (lineType === 'stitch') {
            return slicePathByPattern(path, safeSpacing * 1.2, safeSpacing * 0.8);
          }
          return [path];
        };
        const buildRanges = (shade) => {
          const widthX = clamp(shade.widthX ?? 100, 0, 100) / 100;
          const posX = clamp(shade.posX ?? 50, 0, 100) / 100;
          const half = widthX * 0.5;
          const tStart = clamp(posX - half, 0, 1);
          const tEnd = clamp(posX + half, 0, 1);
          const gapX = clamp(shade.gapX ?? 0, 0, 100) / 100;
          const gapPosX = clamp(shade.gapPosX ?? 50, 0, 100) / 100;
          const gapHalf = gapX * 0.5;
          const gapStart = gapPosX - gapHalf;
          const gapEnd = gapPosX + gapHalf;
          const ranges = [];
          if (gapX > 0 && gapStart < tEnd && gapEnd > tStart) {
            if (tStart < gapStart) ranges.push([tStart, clamp(gapStart, 0, 1)]);
            if (gapEnd < tEnd) ranges.push([clamp(gapEnd, 0, 1), tEnd]);
          } else {
            ranges.push([tStart, tEnd]);
          }
          return ranges;
        };
        const buildOffsets = (shade, spacingPx) => {
          const widthY = clamp(shade.widthY ?? 100, 0, 100) / 100;
          const posY = clamp(shade.posY ?? 50, 0, 100) / 100;
          const offsetCenter = (posY - 0.5) * 2;
          const halfRange = widthY;
          const offsetStart = clamp(offsetCenter - halfRange, -1, 1);
          const offsetEnd = clamp(offsetCenter + halfRange, -1, 1);
          const gapY = clamp(shade.gapY ?? 0, 0, 100) / 100;
          const gapPosY = clamp(shade.gapPosY ?? 50, 0, 100) / 100;
          const gapCenter = (gapPosY - 0.5) * 2;
          const gapHalf = gapY;
          const gapStart = gapCenter - gapHalf;
          const gapEnd = gapCenter + gapHalf;
          const density = Math.max(0.2, shade.density ?? 1);
          const widthPx = Math.max(8, sampleWidthAt(clamp(posY, 0, 1)) * 2);
          const span = Math.abs(offsetEnd - offsetStart) * widthPx;
          const count = Math.max(1, Math.round((span / Math.max(1, spacingPx)) * density));
          return { offsetStart, offsetEnd, gapStart, gapEnd, count };
        };
        const buildLinePath = (shade, offset, tStart, tEnd, seedBase, options = {}) => {
          const { angleOffset = 0, gradient = false, spiral = false } = options;
          const span = Math.max(1e-4, tEnd - tStart);
          const steps = Math.max(10, Math.round(70 * span));
          const jitter = clamp(shade.jitter ?? 0, 0, 1);
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const mix = i / steps;
            const t = lerp(tStart, tEnd, mix);
            let localOffset = offset;
            if (spiral) localOffset += (mix - 0.5) * 0.6;
            if (gradient) localOffset = lerp(localOffset, localOffset * 0.45, mix);
            if (jitter > 0) {
              const unit = seededUnit(seedBase + i * 17.37);
              localOffset += (unit - 0.5) * jitter * 0.35;
            }
            pts.push(pointAt(t, localOffset));
          }
          return rotatePath(pts, (shade.angle ?? 0) + angleOffset);
        };
        const strokePolygon = (scale = 1) => {
          const path = points.map((pt) => ({
            x: center.x + (pt.x - center.x) * scale,
            y: center.y + (pt.y - center.y) * scale,
          }));
          if (!path.length) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
          ctx.closePath();
          ctx.stroke();
        };

        activeShadings.forEach((shade, idx) => {
          const alpha = 0.22 + Math.min(idx, 4) * 0.08;
          const shadingColor = getThemeToken('--designer-shading-stroke', 'rgba(125, 211, 252, 0.6)');
          ctx.strokeStyle = shadingColor.startsWith('rgba(')
            ? shadingColor.replace(/rgba\(([^)]+),\s*[^,]+\)$/u, (_match, prefix) => `rgba(${prefix}, ${Math.min(0.6, alpha).toFixed(2)})`)
            : shadingColor;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = 1;
          const type = shade.type || 'radial';
          const spacingPx = Math.max(2, (shade.lineSpacing ?? 1) * 8);
          const lineType = shade.lineType || 'solid';
          const ranges = buildRanges(shade);
          const { offsetStart, offsetEnd, gapStart, gapEnd, count } = buildOffsets(shade, spacingPx);

          if (type === 'outline' || type === 'rim' || type === 'contour') {
            strokePolygon(1);
            if (type === 'rim') {
              strokePolygon(0.93);
            }
            if (type === 'contour') {
              const levels = clamp(Math.round(2 + (shade.density ?? 1) * 3), 2, 8);
              for (let i = 1; i <= levels; i++) {
                const scale = 1 - (i / (levels + 1)) * 0.36;
                strokePolygon(scale);
              }
            }
            return;
          }

          for (let i = 0; i < count; i++) {
            const frac = count === 1 ? 0.5 : i / (count - 1);
            let offset = lerp(offsetStart, offsetEnd, frac);
            if (offset >= gapStart && offset <= gapEnd) continue;
            if (type === 'chiaroscuro') {
              offset = lerp(offsetStart, offsetEnd, Math.pow(frac, 1.6));
            }
            if (type === 'edge') {
              const edgeMix = frac < 0.5 ? frac * 2 : (frac - 0.5) * 2;
              offset =
                frac < 0.5
                  ? lerp(offsetStart, -0.75, edgeMix)
                  : lerp(0.75, offsetEnd, edgeMix);
            }
            ranges.forEach(([tStart, tEnd], rangeIndex) => {
              if (tEnd <= tStart) return;
              let localStart = tStart;
              let localEnd = tEnd;
              const lengthJitter = clamp(shade.lengthJitter ?? 0, 0, 1);
              if (lengthJitter > 0) {
                const span = Math.max(0.001, tEnd - tStart);
                const jitterAmt = span * lengthJitter * 0.5;
                const startJitter = seededUnit(idx * 500 + i * 67 + rangeIndex * 11 + 1) - 0.5;
                const endJitter = seededUnit(idx * 500 + i * 67 + rangeIndex * 11 + 2) - 0.5;
                localStart = clamp(tStart + startJitter * jitterAmt, 0, 1);
                localEnd = clamp(tEnd + endJitter * jitterAmt, 0, 1);
                if (localEnd < localStart) [localStart, localEnd] = [localEnd, localStart];
                if (localEnd - localStart < 0.01) return;
              }
              const seedBase = idx * 1000 + i * 37 + rangeIndex * 101;
              if (type === 'stipple') {
                const dots = Math.max(
                  6,
                  Math.round((localEnd - localStart) * 42 * Math.max(0.2, shade.density ?? 1))
                );
                const jitter = clamp(shade.jitter ?? 0, 0, 1);
                for (let d = 0; d < dots; d++) {
                  const t = lerp(localStart, localEnd, (d + 1) / (dots + 1));
                  const jitterUnit = seededUnit(seedBase + d * 7) - 0.5;
                  const dotPt = pointAt(t, offset + jitterUnit * jitter * 0.35);
                  ctx.beginPath();
                  ctx.arc(dotPt.x, dotPt.y, 0.8, 0, Math.PI * 2);
                  ctx.fill();
                }
                return;
              }
              const drawPath = (linePath) => {
                const typed = applyLineType(linePath, lineType, spacingPx);
                typed.forEach((segment) => strokePath(segment));
              };
              if (type === 'crosshatch') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { angleOffset: 0 }));
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase + 13, { angleOffset: 90 }));
                return;
              }
              if (type === 'spiral') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { spiral: true }));
                return;
              }
              if (type === 'gradient') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { gradient: true }));
                return;
              }
              drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase));
            });
          }
        });
        ctx.restore();
      }

      if (showControls) {
        const controls = this.sampleDesignerControls(shape, canvas, view, symmetry);
        controls.forEach((control) => {
          if (control.kind === 'handle') {
            const anchorW = control.mirror ? -control.anchor.w : control.anchor.w;
            const anchor = this.designerToCanvas(canvas, { t: control.anchor.t, w: anchorW }, view);
            ctx.strokeStyle = getThemeToken('--designer-control-line', 'rgba(34, 211, 238, 0.55)');
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(control.point.x, control.point.y);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.fillStyle = getThemeToken('--designer-control-fill', '#0f172a');
          ctx.strokeStyle = control.kind === 'anchor'
            ? getThemeToken('--designer-control-anchor', '#22d3ee')
            : getThemeToken('--designer-control-handle', '#67e8f9');
          ctx.lineWidth = 1.2;
          const r = control.kind === 'anchor' ? 3.2 : 2.3;
          ctx.arc(control.point.x, control.point.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    },

    sampleDesignerControls(shape, canvas, view = null, symmetry = 'none') {
      const out = [];
      const mirrorEpsilon = 1e-6;
      const showMirroredControls = this.designerSymmetryHasHorizontalAxis(symmetry);
      this.normalizeDesignerShape(shape);
      (shape.anchors || []).forEach((anchor, index) => {
        const base = this.designerToCanvas(canvas, anchor, view);
        out.push({ kind: 'anchor', point: base, index, mirror: false, anchor });
        if (showMirroredControls && index > 0 && index < shape.anchors.length - 1) {
          const mirror = this.designerToCanvas(canvas, { t: anchor.t, w: -anchor.w }, view);
          out.push({ kind: 'anchor', point: mirror, index, mirror: true, anchor });
        }
        if (anchor.in) {
          out.push({
            kind: 'handle',
            which: 'in',
            point: this.designerToCanvas(canvas, anchor.in, view),
            index,
            mirror: false,
            anchor,
          });
          if (showMirroredControls && Math.abs(anchor.in.w) > mirrorEpsilon) {
            out.push({
              kind: 'handle',
              which: 'in',
              point: this.designerToCanvas(canvas, { t: anchor.in.t, w: -anchor.in.w }, view),
              index,
              mirror: true,
              anchor,
            });
          }
        }
        if (anchor.out) {
          out.push({
            kind: 'handle',
            which: 'out',
            point: this.designerToCanvas(canvas, anchor.out, view),
            index,
            mirror: false,
            anchor,
          });
          if (showMirroredControls && Math.abs(anchor.out.w) > mirrorEpsilon) {
            out.push({
              kind: 'handle',
              which: 'out',
              point: this.designerToCanvas(canvas, { t: anchor.out.t, w: -anchor.out.w }, view),
              index,
              mirror: true,
              anchor,
            });
          }
        }
      });
      return out;
    },

    hitDesignerShapeControl(shape, canvas, pos, view = null, symmetry = 'none') {
      const controls = this.sampleDesignerControls(shape, canvas, view, symmetry);
      let best = null;
      let bestDist = Infinity;
      controls.forEach((control) => {
        const dx = pos.x - control.point.x;
        const dy = pos.y - control.point.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = control;
        }
      });
      return bestDist <= 10 ? best : null;
    },

    toggleDesignerAnchor(shape, index, which = null) {
      const anchor = shape?.anchors?.[index];
      if (!anchor) return;
      if (which === 'in' || which === 'out') {
        if (anchor[which]) {
          anchor[which] = null;
          return;
        }
        const opposite = which === 'in' ? 'out' : 'in';
        const source = anchor[opposite] || { t: anchor.t + (which === 'out' ? 0.08 : -0.08), w: anchor.w };
        const dt = anchor.t - source.t;
        const dw = anchor.w - source.w;
        anchor[which] = {
          t: anchor.t + dt,
          w: anchor.w + dw,
        };
        return;
      }
      if (anchor.in || anchor.out) {
        anchor.in = null;
        anchor.out = null;
        return;
      }
      const prev = shape.anchors[Math.max(0, index - 1)] || anchor;
      const next = shape.anchors[Math.min(shape.anchors.length - 1, index + 1)] || anchor;
      const dt = Math.max(0.05, Math.min(0.2, (next.t - prev.t) * 0.33));
      anchor.in = { t: anchor.t - dt, w: anchor.w };
      anchor.out = { t: anchor.t + dt, w: anchor.w };
    },

    insertDesignerAnchor(shape, canvas, pos, view = null) {
      const p = this.canvasToDesigner(canvas, pos, view);
      const w = Math.max(0, Math.abs(p.w));
      let insertAt = shape.anchors.findIndex((anchor) => anchor.t > p.t);
      if (insertAt <= 0) insertAt = shape.anchors.length - 1;
      const prev = shape.anchors[Math.max(0, insertAt - 1)];
      const next = shape.anchors[Math.min(shape.anchors.length - 1, insertAt)];
      const t = clamp(p.t, (prev?.t ?? 0) + 0.02, (next?.t ?? 1) - 0.02);
      const dt = Math.max(0.04, Math.min(0.2, ((next?.t ?? 1) - (prev?.t ?? 0)) * 0.18));
      shape.anchors.splice(insertAt, 0, {
        t,
        w,
        in: { t: t - dt, w },
        out: { t: t + dt, w },
      });
      this.normalizeDesignerShape(shape);
      return insertAt;
    },

    snapDesignerHandle(anchor, point) {
      const dt = point.t - anchor.t;
      const dw = point.w - anchor.w;
      if (Math.abs(dt) >= Math.abs(dw)) {
        return { t: point.t, w: anchor.w };
      }
      return { t: anchor.t, w: point.w };
    },

    updateDesignerPenHandleDrag(shape, index, canvas, pos, e, view = null) {
      const anchor = shape?.anchors?.[index];
      if (!anchor) return;
      const pRaw = this.canvasToDesigner(canvas, pos, view, { clampT: false });
      const p = e?.shiftKey ? this.snapDesignerHandle(anchor, pRaw) : pRaw;
      const prev = shape.anchors[index - 1];
      const next = shape.anchors[index + 1];
      const nextT = clamp(
        p.t,
        (prev?.t ?? anchor.t) - 1,
        (next?.t ?? anchor.t) + 1
      );
      const nextW = p.w;
      const dist = Math.hypot(nextT - anchor.t, nextW - anchor.w);
      if (dist <= 0.01) {
        anchor.in = null;
        anchor.out = null;
        return;
      }
      anchor.out = { t: nextT, w: nextW };
      const breakHandle = Boolean(e?.altKey || SETTINGS.touchModifiers?.alt);
      if (!breakHandle) {
        const dt = anchor.t - nextT;
        const dw = anchor.w - nextW;
        anchor.in = { t: anchor.t + dt, w: anchor.w + dw };
      }
    },

    updateDesignerDrag(shape, canvas, hit, pos, e, view = null) {
      const anchor = shape.anchors[hit.index];
      if (!anchor) return;
      const pRaw = this.canvasToDesigner(canvas, pos, view, { clampT: hit.kind === 'anchor' });
      const p = e?.shiftKey && hit.kind === 'handle' ? this.snapDesignerHandle(anchor, pRaw) : pRaw;
      const controlPoint = hit.kind === 'handle' && hit.mirror ? { t: p.t, w: -p.w } : p;
      if (hit.kind === 'anchor') {
        if (hit.index === 0 || hit.index === shape.anchors.length - 1) return;
        const prev = shape.anchors[hit.index - 1];
        const next = shape.anchors[hit.index + 1];
        const nextT = clamp(p.t, (prev?.t ?? 0) + 0.02, (next?.t ?? 1) - 0.02);
        const nextW = Math.max(0, Math.abs(p.w));
        const dt = nextT - anchor.t;
        const dw = nextW - anchor.w;
        anchor.t = nextT;
        anchor.w = nextW;
        if (anchor.in) {
          anchor.in.t = anchor.in.t + dt;
          anchor.in.w = anchor.in.w + dw;
        }
        if (anchor.out) {
          anchor.out.t = anchor.out.t + dt;
          anchor.out.w = anchor.out.w + dw;
        }
      } else if (hit.kind === 'handle') {
        const which = hit.which;
        anchor[which] = {
          t: controlPoint.t,
          w: controlPoint.w,
        };
        const breakHandle = Boolean(e.altKey || SETTINGS.touchModifiers?.alt);
        if (!breakHandle) {
          const dt = anchor.t - anchor[which].t;
          const dw = anchor.w - anchor[which].w;
          const opposite = which === 'in' ? 'out' : 'in';
          anchor[opposite] = {
            t: anchor.t + dt,
            w: anchor.w + dw,
          };
        }
      }
    },

    renderPetalDesigner(pd = this.petalDesigner) {
      if (!pd?.root) return;
      const overlayCanvas = pd.root.querySelector('canvas[data-petal-canvas="overlay"]');
      const innerCanvas = pd.root.querySelector('canvas[data-petal-canvas="inner"]');
      const outerCanvas = pd.root.querySelector('canvas[data-petal-canvas="outer"]');
      if (!overlayCanvas && !innerCanvas && !outerCanvas) return;
      this.syncPetalDesignerControls(pd);
      const activeSide = this.getPetalDesignerTarget(pd.state);
      const viewStyle = this.normalizePetalDesignerViewStyle(pd.state?.viewStyle);
      const allShadings = this.normalizePetalDesignerShadings(pd.state, { defaultTarget: 'both' });
      const shadingForSide = (side) =>
        allShadings.filter((shade) => {
          const target = this.normalizePetalDesignerShadingTarget(shade?.target, 'both');
          return target === 'both' || target === side;
        });
      const drawSide = (canvas, side, options = {}) => {
        if (!canvas) return;
        const isActive = side === activeSide;
        const showControls = options.showControls !== undefined ? options.showControls : isActive;
        const shape = side === 'inner' ? pd.state.inner : pd.state.outer;
        const clearCanvas = options.clearCanvas !== false;
        this.drawDesignerShape(canvas, shape, {
          shadings: shadingForSide(side),
          showControls,
          view: this.getPetalDesignerView(pd.state, side),
          symmetry: this.getPetalDesignerSymmetryForSide(pd.state, side),
          clearCanvas,
          fillStyle: isActive
            ? getThemeToken('--designer-fill-active', 'rgba(56, 189, 248, 0.1)')
            : getThemeToken('--designer-fill-inactive', 'rgba(34, 211, 238, 0.05)'),
          strokeStyle: isActive
            ? getThemeToken('--designer-stroke-active', '#67e8f9')
            : getThemeToken('--designer-stroke-inactive', 'rgba(103, 232, 249, 0.55)'),
        });
      };
      if (viewStyle === 'side-by-side') {
        drawSide(innerCanvas, 'inner', {
          showControls: activeSide === 'inner',
        });
        drawSide(outerCanvas, 'outer', {
          showControls: activeSide === 'outer',
        });
        return;
      }
      const canvas = overlayCanvas || innerCanvas || outerCanvas;
      const drawOrder = activeSide === 'inner' ? ['outer', 'inner'] : ['inner', 'outer'];
      drawOrder.forEach((side, index) => {
        drawSide(canvas, side, {
          showControls: side === activeSide,
          clearCanvas: index === 0,
        });
      });
    },

    applyPetalDesignerToLayer(state, options = {}) {
      const { refreshControls = true, persistState = true } = options;
      if (!state) return;
      const layer = this.getLayerById(state.layerId);
      if (!layer || !isPetalisLayerType(layer.type)) return;
      state.target = this.normalizePetalDesignerRingTarget(state.activeTarget ?? state.target, 'inner');
      state.viewStyle = this.normalizePetalDesignerViewStyle(state.viewStyle);
      state.activeTarget = state.target === 'outer' ? 'outer' : 'inner';
      state.target = state.activeTarget;
      this.syncInnerOuterLock(state, state.activeTarget);
      this.normalizeDesignerShape(state.outer);
      this.normalizeDesignerShape(state.inner);
      const params = layer.params || {};
      const selections = this.ensurePetalDesignerProfileSelections(state);
      state.innerSymmetry = this.getPetalDesignerSymmetryForSide(state, 'inner');
      state.outerSymmetry = this.getPetalDesignerSymmetryForSide(state, 'outer');
      state.designerSymmetry = this.getPetalDesignerSymmetryForSide(state, state.activeTarget);
      state.innerCount = Math.round(
        clamp(
          state.innerCount ?? params.innerCount ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT,
          5,
          400
        )
      );
      state.outerCount = Math.round(
        clamp(
          state.outerCount ?? params.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
          5,
          600
        )
      );
      const countSplit = this.syncPetalDesignerTransitionFromCounts(state);
      state.profileTransitionFeather = clamp(state.profileTransitionFeather ?? params.profileTransitionFeather ?? 0, 0, 100);
      state.count = Math.round(
        clamp(
          state.innerCount + state.outerCount,
          5,
          800
        )
      );
      state.seed = Math.round(clamp(state.seed ?? params.seed ?? 1, 0, 9999));
      state.countJitter = clamp(state.countJitter ?? params.countJitter ?? 0.1, 0, 0.5);
      state.sizeJitter = clamp(state.sizeJitter ?? params.sizeJitter ?? 0.12, 0, 0.5);
      state.rotationJitter = clamp(state.rotationJitter ?? params.rotationJitter ?? 6, 0, 45);
      state.angularDrift = clamp(state.angularDrift ?? params.angularDrift ?? 0, 0, 45);
      state.driftStrength = clamp(state.driftStrength ?? params.driftStrength ?? 0.1, 0, 1);
      state.driftNoise = clamp(state.driftNoise ?? params.driftNoise ?? 0.2, 0.05, 1);
      state.radiusScale = clamp(state.radiusScale ?? params.radiusScale ?? 0.2, -1, 1);
      state.radiusScaleCurve = clamp(state.radiusScaleCurve ?? params.radiusScaleCurve ?? 1.2, 0.5, 2.5);
      params.designerOuter = JSON.parse(JSON.stringify(state.outer));
      params.designerInner = JSON.parse(JSON.stringify(state.inner));
      params.designerSymmetry = state.designerSymmetry;
      params.designerInnerSymmetry = state.innerSymmetry;
      params.designerOuterSymmetry = state.outerSymmetry;
      params.designerProfileSelectionInner = selections.inner;
      params.designerProfileSelectionOuter = selections.outer;
      params.petalVisualizerViewStyle = state.viewStyle;
      params.count = state.count;
      params.petalShape = state.activeTarget;
      params.petalRing = state.activeTarget;
      params.ringMode = 'dual';
      params.innerCount = state.innerCount;
      params.outerCount = state.outerCount;
      params.ringSplit = countSplit;
      params.innerOuterLock = Boolean(state.innerOuterLock);
      params.profileTransitionPosition = clamp(state.profileTransitionPosition ?? countSplit * 100, 0, 100);
      params.profileTransitionFeather = clamp(state.profileTransitionFeather ?? 0, 0, 100);
      params.petalSteps = Math.max(64, Math.round(params.petalSteps ?? 64));
      params.petalProfile = state.outer.profile || params.petalProfile || 'teardrop';
      params.petalWidthRatio = Number.isFinite(params.petalWidthRatio) ? params.petalWidthRatio : 1;
      state.widthRatio = this.normalizePetalDesignerWidthRatio(params.petalWidthRatio, 1);
      params.petalLengthRatio = 1;
      params.petalSizeRatio = 1;
      params.leafSidePos = 0.45;
      params.leafSideWidth = 1;
      params.centerProfile = null;
      params.centerSizeMorph = 0;
      params.centerSizeCurve = 1;
      params.centerShapeMorph = 0;
      params.centerWaveBoost = 0;
      params.edgeWaveAmp = 0;
      params.edgeWaveFreq = 0;
      params.seed = state.seed;
      params.countJitter = state.countJitter;
      params.sizeJitter = state.sizeJitter;
      params.rotationJitter = state.rotationJitter;
      params.angularDrift = state.angularDrift;
      params.driftStrength = state.driftStrength;
      params.driftNoise = state.driftNoise;
      params.radiusScale = state.radiusScale;
      params.radiusScaleCurve = state.radiusScaleCurve;
      const shadings = Array.isArray(state.shadings) ? state.shadings : [];
      state.shadings = shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
      );
      params.shadings = state.shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
      );
      const modifiers = this.normalizePetalDesignerModifiers(state);
      params.petalModifiers = modifiers.map((modifier, index) =>
        this.normalizePetalDesignerModifier(modifier, index)
      );
      if (persistState) this.storeLayerParams(layer);
      this.app.engine.generate(layer.id);
      if (this.app.engine.activeLayerId === layer.id) {
        if (refreshControls) this.buildControls();
        this.updateFormula();
      }
      this.renderLayers();
      this.app.render();
    },

  };
})();
