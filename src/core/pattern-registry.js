/**
 * Runtime pattern registry with bundled, local, and project-scoped custom patterns.
 */
(() => {
  window.Vectura = window.Vectura || {};

  const STORAGE_KEY = 'vectura.custom-patterns.v1';
  const bundledPatterns = Array.isArray(window.Vectura.PATTERNS)
    ? window.Vectura.PATTERNS.map((pattern) => JSON.parse(JSON.stringify(pattern)))
    : [];
  let localCustomPatterns = [];
  let projectCustomPatterns = [];
  let registryVersion = 0;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const slugify = (value, fallback = 'pattern') => {
    const raw = `${value ?? ''}`.trim().toLowerCase();
    const cleaned = raw
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || fallback;
  };

  const ensureCustomId = (value, fallbackName = 'Custom Pattern') => {
    const raw = slugify(value, slugify(fallbackName, 'custom-pattern'));
    return raw.startsWith('custom-') ? raw : `custom-${raw}`;
  };

  const inferPatternFlags = (pattern = {}) => {
    const svg = `${pattern.svg || ''}`;
    const lineLike = /<(line|polyline)\b/i.test(svg);
    const strokeLike = /\bstroke\s*=\s*["'](?!none\b)/i.test(svg) || /style=["'][^"']*stroke\s*:/i.test(svg);
    const fillLike = /\bfill\s*=\s*["'](?!none\b)/i.test(svg) || /style=["'][^"']*fill\s*:/i.test(svg);
    return {
      lines: pattern.lines === true || lineLike || strokeLike,
      fills: pattern.fills !== false && (pattern.fills === true || fillLike || !lineLike),
    };
  };

  const normalizePattern = (pattern, options = {}) => {
    if (!pattern || typeof pattern !== 'object') return null;
    const fallbackName = `${pattern.name || pattern.id || 'Custom Pattern'}`.trim() || 'Custom Pattern';
    const scope = options.scope || 'local';
    const source = scope === 'project' ? 'Project Patterns' : 'Custom Patterns';
    const flags = inferPatternFlags(pattern);
    const normalized = {
      id: ensureCustomId(pattern.id || fallbackName, fallbackName),
      name: `${pattern.name || fallbackName}`.trim() || fallbackName,
      source: `${pattern.source || source}`.trim() || source,
      filename: `${pattern.filename || ''}`.trim(),
      svg: `${pattern.svg || ''}`,
      lines: flags.lines,
      fills: flags.fills,
      custom: true,
      customScope: scope,
      customUpdatedAt: pattern.customUpdatedAt || new Date().toISOString(),
      validation: pattern.validation ? clone(pattern.validation) : null,
    };
    if (pattern.cachedTile) normalized.cachedTile = clone(pattern.cachedTile);
    return normalized.svg ? normalized : null;
  };

  const mergeCustomPools = () => {
    const merged = new Map();
    localCustomPatterns.forEach((pattern) => merged.set(pattern.id, pattern));
    projectCustomPatterns.forEach((pattern) => merged.set(pattern.id, pattern));
    return Array.from(merged.values()).sort((a, b) => `${a.name}`.localeCompare(`${b.name}`));
  };

  const refreshGlobalCatalog = () => {
    registryVersion += 1;
    const catalog = bundledPatterns.concat(mergeCustomPools().map((pattern) => clone(pattern)));
    window.Vectura.BUNDLED_PATTERNS = bundledPatterns.map((pattern) => clone(pattern));
    window.Vectura.LOCAL_CUSTOM_PATTERNS = localCustomPatterns.map((pattern) => clone(pattern));
    window.Vectura.PROJECT_CUSTOM_PATTERNS = projectCustomPatterns.map((pattern) => clone(pattern));
    window.Vectura.PATTERNS = catalog;
    window.Vectura.PATTERN_REGISTRY_VERSION = registryVersion;
  };

  const persistLocalPatterns = () => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(localCustomPatterns));
    } catch (err) {
      // Local persistence is best-effort only.
    }
  };

  const invalidateCacheFor = (patternId) => {
    const fn = window.Vectura?.AlgorithmRegistry?.patternInvalidateCache;
    if (typeof fn === 'function') fn(patternId);
  };

  const replacePool = (poolName, patterns = []) => {
    const target = [];
    (patterns || []).forEach((pattern) => {
      const normalized = normalizePattern(pattern, { scope: poolName === 'project' ? 'project' : 'local' });
      if (!normalized) return;
      target.push(normalized);
    });
    if (poolName === 'project') {
      projectCustomPatterns.forEach((pattern) => invalidateCacheFor(pattern.id));
      projectCustomPatterns = target;
    } else {
      localCustomPatterns.forEach((pattern) => invalidateCacheFor(pattern.id));
      localCustomPatterns = target;
      persistLocalPatterns();
    }
    target.forEach((pattern) => invalidateCacheFor(pattern.id));
    refreshGlobalCatalog();
  };

  const upsertIntoPool = (poolName, pattern) => {
    const normalized = normalizePattern(pattern, { scope: poolName === 'project' ? 'project' : 'local' });
    if (!normalized) return null;
    const list = poolName === 'project' ? projectCustomPatterns.slice() : localCustomPatterns.slice();
    const index = list.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) invalidateCacheFor(list[index].id);
    if (index >= 0) list[index] = normalized;
    else list.push(normalized);
    if (poolName === 'project') projectCustomPatterns = list;
    else {
      localCustomPatterns = list;
      persistLocalPatterns();
    }
    invalidateCacheFor(normalized.id);
    refreshGlobalCatalog();
    return clone(normalized);
  };

  const deleteFromPools = (patternId) => {
    const nextLocal = localCustomPatterns.filter((pattern) => pattern.id !== patternId);
    const nextProject = projectCustomPatterns.filter((pattern) => pattern.id !== patternId);
    const changed = nextLocal.length !== localCustomPatterns.length || nextProject.length !== projectCustomPatterns.length;
    if (!changed) return false;
    invalidateCacheFor(patternId);
    localCustomPatterns = nextLocal;
    projectCustomPatterns = nextProject;
    persistLocalPatterns();
    refreshGlobalCatalog();
    return true;
  };

  const hydrateLocalPatterns = () => {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      localCustomPatterns = parsed
        .map((pattern) => normalizePattern(pattern, { scope: 'local' }))
        .filter(Boolean);
    } catch (err) {
      localCustomPatterns = [];
    }
  };

  hydrateLocalPatterns();
  refreshGlobalCatalog();

  const getPatternById = (patternId) =>
    (window.Vectura.PATTERNS || []).find((pattern) => pattern?.id === patternId) || null;

  const getAllPatterns = () => (window.Vectura.PATTERNS || []).map((pattern) => clone(pattern));

  const getCustomPatterns = () => mergeCustomPools().map((pattern) => clone(pattern));

  const saveCustomPattern = (pattern, options = {}) => {
    const normalized = normalizePattern(pattern, { scope: 'local' });
    if (!normalized) return null;
    const persistToLocal = options.persistToLocal !== false;
    const persistToProject = options.persistToProject !== false;
    let saved = null;
    if (persistToLocal) saved = upsertIntoPool('local', normalized) || saved;
    if (persistToProject) saved = upsertIntoPool('project', normalized) || saved;
    return saved ? clone(saved) : null;
  };

  const duplicatePattern = (patternId, options = {}) => {
    const source = getPatternById(patternId);
    if (!source) return null;
    const copyName = `${source.name || 'Pattern'} Copy`;
    return saveCustomPattern({
      ...source,
      id: ensureCustomId(options.id || `${patternId}-copy`, copyName),
      name: options.name || copyName,
      source: 'Custom Patterns',
      customUpdatedAt: new Date().toISOString(),
    }, options);
  };

  const api = {
    getVersion: () => registryVersion,
    getPatterns: getAllPatterns,
    getCustomPatterns,
    getPatternById: (patternId) => {
      const pattern = getPatternById(patternId);
      return pattern ? clone(pattern) : null;
    },
    saveCustomPattern,
    duplicatePattern,
    deleteCustomPattern: deleteFromPools,
    replaceProjectPatterns: (patterns = []) => replacePool('project', patterns),
    replaceLocalPatterns: (patterns = []) => replacePool('local', patterns),
    exportProjectPatterns: () => projectCustomPatterns.map((pattern) => clone(pattern)),
    exportLocalPatterns: () => localCustomPatterns.map((pattern) => clone(pattern)),
    exportAllCustomPatterns: () => getCustomPatterns(),
    ensureCustomId,
    normalizePattern,
  };

  window.Vectura.PatternRegistry = {
    ...(window.Vectura.PatternRegistry || {}),
    ...api,
  };
})();
