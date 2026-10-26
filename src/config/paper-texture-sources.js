/**
 * Online paper-texture collections (Paper panel ▸ Texture… ▸ Search online).
 *
 * window.Vectura.PAPER_TEXTURE_SOURCES = {
 *   PROVIDERS, REJECTED, DEFAULT_QUERY, TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS, CACHE_MS,
 *   MAX_RESULTS, DOWNLOAD_MAX_BYTES, KEYS_STORAGE, SCALE_GUESS
 * }
 *
 * Each provider is a DECLARATIVE record read by src/core/paper-texture-search.js
 * (no provider-specific code):
 *   id / name / homepage / credit   identity; credit {text, url} is shown under results
 *   licence / licenceUrl            collection-wide licence (when items carry none)
 *   licenceAllow / licenceDeny      regex strings tested on each item's licence; a denied or
 *                                   not-allowed item is dropped (NC / ND / non-free never show)
 *   enabled                         false = not queried
 *   needsKey                        { label, help, url }: queried only once the user has pasted
 *                                   their own key (stored in this browser only, never exported)
 *   auth                            { header, value } or { param, value } templates using {key}
 *   search.url                      URL template: {query} {limit} (URI-encoded), {key}
 *   search.results                  dot path to the result list (array, or object keyed by id
 *                                   with search.resultsAreMap)
 *   fields                          per normalised field, a field spec:
 *                                     'a.b.0.c'                own-property dot path (numbers index arrays)
 *                                     '=text'                  constant
 *                                     { tpl: '… {a.b} …' }     template over item paths
 *                                     { path, map: { value: tpl } }   value lookup → template
 *                                     { path, strip: 'html' }  HTML → plain text
 *                                     { path, fileTitle: true } "File:Foo bar.jpg" → "Foo bar"
 *                                   fields: id, title, thumbUrl, sourceUrl, author, licence,
 *                                   licenceUrl, attribution, width, height, mime
 *   file / heightFile               full image (+ height map): { path } | { tpl } | { from, where, field },
 *                                   archive: 'zip' + members { albedo, height } (regex) for zips
 *   hires                           optional larger download (e.g. a zip of 2K maps), offered as
 *                                   "High-res (ZIP)" when the browser can unzip
 *   physicalMm                      { path, scale } real-world tile width (0/absent = unknown → guess)
 *   onUse                           { path, auth } URL to GET when a result is used (API rules)
 *   mimeAllow                       regex string for fields.mime (when present)
 *   cors                            { api, files }: 'yes' | 'no' | 'unverified' (unverified = try, then
 *                                   fall back to "Open source page" + upload)
 *   verified                        what was checked, how and when
 *   kind: 'bundle'                  the curated local bundle (assets/paper-textures/index.json,
 *                                   written by scripts/fetch-paper-textures.js); shown only when
 *                                   the index exists
 *
 * Add a collection by adding a record here; nothing else changes.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const FREE_LICENCE = '^(cc0|cc-?0|public domain|pd|pdm|cc by(-sa)?|cc-by(-sa)?|cc by(-sa)? [0-9.]+|attribution(-sharealike)?)';
  const NON_FREE = '(\\bnc\\b|\\bnd\\b|non-?commercial|no-?deriv|fair use|all rights reserved|copyrighted)';

  const PROVIDERS = Object.freeze([
    Object.freeze({
      id: 'openverse',
      name: 'Openverse',
      homepage: 'https://openverse.org',
      credit: Object.freeze({ text: 'Powered by Openverse', url: 'https://openverse.org' }),
      licenceAllow: FREE_LICENCE,
      licenceDeny: NON_FREE,
      enabled: true,
      search: Object.freeze({
        url: 'https://api.openverse.org/v1/images/?q={query}&license=cc0,pdm,by,by-sa&license_type=commercial,modification&size=large&category=photograph&page_size=20',
        results: 'results',
      }),
      fields: Object.freeze({
        id: 'id',
        title: 'title',
        thumbUrl: 'thumbnail',
        sourceUrl: 'foreign_landing_url',
        author: 'creator',
        licence: Object.freeze({
          path: 'license',
          map: Object.freeze({ cc0: 'CC0 1.0', pdm: 'Public Domain Mark', by: 'CC BY {license_version}', 'by-sa': 'CC BY-SA {license_version}' }),
        }),
        licenceUrl: 'license_url',
        attribution: 'attribution',
        width: 'width',
        height: 'height',
      }),
      file: Object.freeze({ path: 'url' }),
      cors: Object.freeze({ api: 'yes', files: 'unverified' }),
      verified: 'Response fields from the Openverse public schema; API CORS from its source (CORS_ALLOW_ALL_ORIGINS). Originals live on provider hosts (Flickr, Wikimedia…): CORS varies. Mock-tested only.',
    }),
    Object.freeze({
      id: 'ambientcg',
      name: 'ambientCG',
      homepage: 'https://ambientcg.com',
      credit: Object.freeze({ text: 'ambientCG (CC0)', url: 'https://ambientcg.com' }),
      licence: 'CC0 1.0',
      licenceUrl: 'https://docs.ambientcg.com/license/',
      enabled: true,
      search: Object.freeze({
        url: 'https://ambientcg.com/api/v3/assets?q={query}&type=material&include=title,tags,dimensions,maps,downloads,thumbnails,previews&limit=100',
        results: 'foundAssets',
      }),
      fields: Object.freeze({
        id: 'id',
        title: 'title',
        thumbUrl: 'thumbnails.512-JPG-FFFFFF',
        thumbUrlAlt: 'thumbnails.1024-WEBP',
        sourceUrl: Object.freeze({ tpl: 'https://ambientcg.com/view?id={id}' }),
        author: '=ambientCG',
        attribution: Object.freeze({ tpl: '{title} from ambientCG.com (CC0 1.0)' }),
      }),
      // Preview-quality maps served directly (no zip): colour + displacement.
      file: Object.freeze({ tpl: 'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/{id}/{id}_SQ_Color.jpg' }),
      heightFile: Object.freeze({ tpl: 'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/{id}/{id}_SQ_Displacement.jpg' }),
      hires: Object.freeze({
        tpl: 'https://ambientcg.com/get?file={id}_2K-JPG.zip',
        archive: 'zip',
        members: Object.freeze({ albedo: '_Color\\.(jpe?g|png)$', height: '_Displacement\\.(jpe?g|png)$' }),
      }),
      physicalMm: Object.freeze({ path: 'dimensions.width', scale: 10 }), // cm → mm; 0 = unknown
      cors: Object.freeze({ api: 'unverified', files: 'unverified' }),
      verified: 'v2 response shape fetched 2026-10-26 (q=paper: Paper001–006, Cardboard…); v3 fields + preview-map URLs from the research record (Paper004 dimensions 30 cm). CORS unknown. Mock-tested only.',
    }),
    Object.freeze({
      id: 'wikimedia',
      name: 'Wikimedia Commons',
      homepage: 'https://commons.wikimedia.org',
      credit: Object.freeze({ text: 'via Wikimedia Commons', url: 'https://commons.wikimedia.org' }),
      licenceAllow: FREE_LICENCE,
      licenceDeny: NON_FREE,
      enabled: true,
      search: Object.freeze({
        url: 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch={query}%20filetype:bitmap&gsrlimit=40&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=512&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired|UsageTerms',
        results: 'query.pages',
        resultsAreMap: true,
      }),
      fields: Object.freeze({
        id: 'pageid',
        title: Object.freeze({ path: 'title', fileTitle: true }),
        thumbUrl: 'imageinfo.0.thumburl',
        sourceUrl: 'imageinfo.0.descriptionurl',
        author: Object.freeze({ path: 'imageinfo.0.extmetadata.Artist.value', strip: 'html' }),
        licence: 'imageinfo.0.extmetadata.LicenseShortName.value',
        licenceUrl: 'imageinfo.0.extmetadata.LicenseUrl.value',
        width: 'imageinfo.0.width',
        height: 'imageinfo.0.height',
        mime: 'imageinfo.0.mime',
      }),
      file: Object.freeze({ path: 'imageinfo.0.url' }),
      mimeAllow: '^image/(jpeg|png|webp)$',
      cors: Object.freeze({ api: 'yes', files: 'unverified' }),
      verified: 'Standard MediaWiki imageinfo schema; API CORS via origin=* (MediaWiki docs). upload.wikimedia.org CORS unverified. Mock-tested only.',
    }),
    Object.freeze({
      id: 'pexels',
      name: 'Pexels',
      homepage: 'https://www.pexels.com',
      credit: Object.freeze({ text: 'Photos provided by Pexels', url: 'https://www.pexels.com' }),
      licence: 'Pexels Licence',
      licenceUrl: 'https://www.pexels.com/license/',
      enabled: true,
      needsKey: Object.freeze({ label: 'Pexels API key', url: 'https://www.pexels.com/api/' }),
      auth: Object.freeze({ header: 'Authorization', value: '{key}' }),
      search: Object.freeze({ url: 'https://api.pexels.com/v1/search?query={query}&per_page=30', results: 'photos' }),
      fields: Object.freeze({
        id: 'id',
        title: Object.freeze({ tpl: '{alt}' }),
        thumbUrl: 'src.medium',
        sourceUrl: 'url',
        author: 'photographer',
        attribution: Object.freeze({ tpl: 'Photo by {photographer} on Pexels' }),
        width: 'width',
        height: 'height',
      }),
      file: Object.freeze({ path: 'src.original' }),
      cors: Object.freeze({ api: 'unverified', files: 'unverified' }),
      verified: 'Fields from the Pexels API docs; needs the user’s own key. Mock-tested only.',
    }),
    Object.freeze({
      id: 'unsplash',
      name: 'Unsplash',
      homepage: 'https://unsplash.com',
      credit: Object.freeze({ text: 'Photos from Unsplash', url: 'https://unsplash.com/?utm_source=vectura_studio&utm_medium=referral' }),
      licence: 'Unsplash Licence',
      licenceUrl: 'https://unsplash.com/license',
      enabled: true,
      needsKey: Object.freeze({ label: 'Unsplash access key', url: 'https://unsplash.com/developers' }),
      auth: Object.freeze({ header: 'Authorization', value: 'Client-ID {key}' }),
      search: Object.freeze({ url: 'https://api.unsplash.com/search/photos?query={query}&per_page=30', results: 'results' }),
      fields: Object.freeze({
        id: 'id',
        title: Object.freeze({ tpl: '{alt_description}' }),
        thumbUrl: 'urls.small',
        sourceUrl: Object.freeze({ tpl: '{links.html}?utm_source=vectura_studio&utm_medium=referral' }),
        author: 'user.name',
        attribution: Object.freeze({ tpl: 'Photo by {user.name} on Unsplash' }),
        width: 'width',
        height: 'height',
      }),
      // Unsplash requires hotlinking its URLs and pinging download_location on use.
      file: Object.freeze({ path: 'urls.full' }),
      onUse: Object.freeze({ path: 'links.download_location', auth: true }),
      cors: Object.freeze({ api: 'unverified', files: 'unverified' }),
      verified: 'Fields from the Unsplash API guidelines; needs the user’s own key. Mock-tested only.',
    }),
    Object.freeze({
      id: 'bundle',
      kind: 'bundle',
      name: 'Curated CC0 papers',
      homepage: 'https://github.com/j-phi/vectura-studio',
      credit: Object.freeze({ text: 'Curated CC0 paper textures (TextureCan, ambientCG, 3DTextures)', url: 'https://www.texturecan.com/category/Paper/' }),
      licence: 'CC0 1.0',
      enabled: true,
      index: 'assets/paper-textures/index.json',
      cors: Object.freeze({ api: 'yes', files: 'yes' }),
      verified: 'Same-origin files written by scripts/fetch-paper-textures.js (not committed); shown only when the index exists.',
    }),
  ]);

  // Researched and rejected (kept so nobody re-adds them without reading why).
  const REJECTED = Object.freeze([
    Object.freeze({ id: 'sharetextures', reason: 'Terms forbid automated downloads, hotlinking and embedding downloads in third-party apps.' }),
    Object.freeze({ id: 'pixabay', reason: 'No permanent hotlinking; key required; large images capped at 1280 px.' }),
    Object.freeze({ id: 'polyhaven', reason: 'No paper textures (fabric only).' }),
    Object.freeze({ id: 'cgbookcase', reason: 'No paper category and no API.' }),
    Object.freeze({ id: 'freepbr', reason: 'Not an open licence (commercial use is paid); no API.' }),
    Object.freeze({ id: 'smithsonian', reason: 'Needs an API key; little blank-paper material.' }),
    Object.freeze({ id: 'flickr', reason: 'Needs an API key; its open-licence photos are covered by Openverse.' }),
  ]);

  Vectura.PAPER_TEXTURE_SOURCES = {
    PROVIDERS,
    REJECTED,
    DEFAULT_QUERY: 'paper texture',
    TIMEOUT_MS: 12000,
    DOWNLOAD_TIMEOUT_MS: 60000,
    CACHE_MS: 5 * 60 * 1000,
    MAX_RESULTS: 30,
    DOWNLOAD_MAX_BYTES: 40 * 1024 * 1024,
    // User-supplied API keys (Pexels, Unsplash): this browser only, never exported.
    KEYS_STORAGE: 'vectura.textureKeys',
    // Physical tile width when a source gives none: rough watercolour/kraft
    // photos usually show more paper than smooth drawing-paper close-ups.
    SCALE_GUESS: Object.freeze([
      Object.freeze({ match: '(water ?colou?r|kraft|cardboard|carton|rough)', mm: 300 }),
      Object.freeze({ match: '.', mm: 150 }),
    ]),
  };
})();
