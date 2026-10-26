/**
 * Curated CC0 paper-texture bundle — manifest (no image files are committed).
 *
 * window.Vectura.PAPER_TEXTURE_BUNDLE = { INDEX, SCHEMA, ENTRIES }
 *
 * A maintainer runs `node scripts/fetch-paper-textures.js` locally: it
 * downloads each entry below, checks the bytes are a real PNG/JPEG/WebP,
 * re-checks the licence against an allowlist, downscales to ≤ 2048 px (when
 * the optional `sharp` package is installed) and writes
 *   assets/paper-textures/<id>.<ext> (+ <id>_height.<ext>, <id>_thumb.<ext>)
 *   assets/paper-textures/index.json   { schema, version, textures: [...] }
 * The Search sheet's "Curated CC0 papers" collection appears only when that
 * index exists (src/config/paper-texture-sources.js, kind: 'bundle').
 *
 * Entry fields: id, title, source (collection), author, licence, licenceUrl,
 * landingUrl (credit / manual check), albedoUrl, heightUrl?, physicalMm?
 * (real tile width; absent = estimate), tags, manual (true = no stable direct
 * URL: download by hand from landingUrl into assets/paper-textures/<id>.jpg),
 * review (true = check the texture is blank paper, not a printed pattern,
 * before shipping).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const pad = (n) => String(n).padStart(4, '0');
  const TEXTURECAN_TAGS = Object.freeze({
    21: ['cardboard'], 22: ['crumpled', 'a4'], 23: ['parcel', 'kraft'], 25: ['cardboard'], 26: ['newsprint'], 27: ['newsprint'],
  });
  const texturecan = Array.from({ length: 37 }, (_v, i) => {
    const n = i + 1;
    const id = `paper_${pad(n)}`;
    const tags = TEXTURECAN_TAGS[n] || [];
    return Object.freeze({
      id: `texturecan-${id}`,
      title: `TextureCan Paper ${pad(n)}${tags.length ? ` (${tags.join(', ')})` : ''}`,
      source: 'TextureCan',
      author: 'TextureCan',
      licence: 'CC0 1.0',
      licenceUrl: 'https://texturecan.com/terms/',
      landingUrl: 'https://www.texturecan.com/category/Paper/',
      albedoUrl: `https://www.texturecan.com/img/textures/${id}/${id}_1200.jpg`,
      tags: Object.freeze(['paper', ...tags]),
      review: !tags.length, // many TextureCan "papers" are wrapping-paper patterns
    });
  });

  const ambient = ['Paper001', 'Paper002', 'Paper003', 'Paper004', 'Paper005', 'Paper006', 'Cardboard001', 'Cardboard002', 'Cardboard003', 'Cardboard004']
    .map((id) => Object.freeze({
      id: `ambientcg-${id.toLowerCase()}`,
      title: `ambientCG ${id}`,
      source: 'ambientCG',
      author: 'ambientCG',
      licence: 'CC0 1.0',
      licenceUrl: 'https://docs.ambientcg.com/license/',
      landingUrl: `https://ambientcg.com/view?id=${id}`,
      albedoUrl: `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${id}/${id}_SQ_Color.jpg`,
      heightUrl: `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${id}/${id}_SQ_Displacement.jpg`,
      ...(id === 'Paper004' ? { physicalMm: 300 } : {}),
      tags: Object.freeze(id.startsWith('Cardboard') ? ['cardboard'] : ['paper']),
    }));

  const ENTRIES = Object.freeze([
    ...ambient,
    ...texturecan,
    Object.freeze({
      id: '3dtextures-watercolor-paper-001',
      title: 'Watercolor Paper 001',
      source: '3DTextures.me',
      author: 'Joao Paulo (3DTextures.me)',
      licence: 'CC0 1.0',
      licenceUrl: 'https://3dtextures.me/about/', // licence page not verified: re-check before shipping
      landingUrl: 'https://3dtextures.me/?s=watercolor+paper',
      manual: true,
      physicalMm: 300,
      tags: Object.freeze(['paper', 'watercolor']),
    }),
  ]);

  Vectura.PAPER_TEXTURE_BUNDLE = {
    INDEX: 'assets/paper-textures/index.json',
    SCHEMA: 'vectura-paper-texture-bundle',
    VERSION: 1,
    LICENCE_ALLOW: Object.freeze(['CC0 1.0']),
    MAX_PX: 2048,
    ENTRIES,
  };
})();
