# Paper textures: image papers and online collections

Custom papers ("My papers", v1.4.30) can be made from a photo or scan of paper. This page
covers the import pipeline, storage and portability, the online texture search, the curated
bundle script, and the collections that were considered and rejected.

## Image papers

**Pen / Paper ▸ Paper ▸ Texture… ▸ Upload image… / Search online textures…**

Import (`src/render/paper-image.js`, `Vectura.PaperImage.processImport`):

1. The file must really be PNG, JPEG or WebP (magic bytes; SVG, HTML and other `data:` types
   are refused), ≤ 40 MB, 16–16384 px per side. Decoding uses `createImageBitmap` (or `<img>`
   from a data URL) inside `try`.
2. Downscaled to a 2048 px working size; every heavy pass yields to the event loop.
3. Linear-light luminance, divided by a heavily blurred copy (σ ≈ 7 % of the image, mirrored
   borders) so lighting gradients and vignetting go; rescaled to mean 0.5.
4. Made tileable: blended with its half-offset copy through a feathered weight (the offset copy
   wins at the borders, the original in the centre), so the wrap edge is seamless.
5. An optional height/displacement map (or a provider's displacement map) goes through the
   same tiling; otherwise height is derived from the tile's fine detail.
6. The tile is encoded as grey WebP (JPEG fallback) ≤ 1024 px and ≤ 1.5 MB (halved until it
   fits). The photo's mean colour becomes the paper colour.

**Physical size.** The dialog asks for the scan resolution (default 300 dpi; mm per px =
25.4 / dpi) or the image width in mm. Provider metadata (ambientCG `dimensions`, cm) prefills
it; when a source states no size the dialog says so and pre-fills an estimate (≈ 300 mm for
watercolour/kraft/cardboard, ≈ 150 mm otherwise).

**Rendering** (`src/render/paper-texture.js`). A registered custom type with an `image` block
samples its maps in document millimetres (`tileMm` per tile, wrapping), from the mip level
nearest the chunk's px/mm (no aliasing when zoomed out). Albedo = the paper colour × a small
residual (`lum / mean − 1`), so the Color control re-tints the photo; height drives the same
emboss, dry-skip pits and bleed modulation as the procedural paper, with a gentler emboss.
Past the image's native resolution the procedural tooth is blended in and the chunk's fine
octave and fibre web keep the surface sharp. Papers without an image never enter this path
(None and the 10 procedural papers are byte-identical).

**Storage and portability.** Library entries (`localStorage['vectura.customPapers']`) stay
small: an image paper stores `image: { ref, tileMm, w, h }`; the pixels live in IndexedDB
(`vectura-textures` / `textures`, `src/core/texture-store.js`) under a content ref. A document
embeds the tile in `settings.paper.custom.image.tile` (+ `height`), so it opens on any
machine. The default paper and the preference snapshot keep refs only and are re-hydrated from
IndexedDB on load. Library exports inline the pixels; imports re-validate every tile (format,
size, decode), store it in IndexedDB and keep the entry lean. Quota errors are reported.

**Attribution.** A texture from a collection keeps `source: { provider, providerId, assetId,
title, author, licence, licenceUrl, url, attribution }` (Openverse's ready-made attribution
string when present). It is shown in the Paper panel with a link to the source page, saved in
the `.vectura` custom block and in library exports. CC BY-SA textures carry a note: a paper
made from them stays under BY-SA.

## Online collections

Declarative records in `src/config/paper-texture-sources.js`, read by
`src/core/paper-texture-search.js` (parallel queries, 12 s timeout each, 5 min result cache,
https-only URLs, NC/ND/non-free licences dropped). Downloads use `fetch` in CORS mode; when a
host refuses (or the provider is marked `cors: 'no'`) the card offers **Open source page**
(new tab, `rel=noopener noreferrer`) and **Upload the file**, which feeds the same pipeline and
keeps the attribution. There is no CORS proxy.

| Collection | Search | Licence | Height maps | Notes |
|---|---|---|---|---|
| Openverse | `api.openverse.org/v1/images` (no key) | per item: CC0, PDM, CC BY, CC BY-SA | no | "Powered by Openverse"; originals on provider hosts (CORS varies) |
| ambientCG | `ambientcg.com/api/v3/assets` | CC0 | yes (Displacement) | preview maps direct; **High-res (ZIP)** unpacks the 2K zip in the browser (`DecompressionStream`) |
| Wikimedia Commons | MediaWiki API, `origin=*` | per file (free licences only) | no | Artist HTML stripped to text |
| Pexels | `api.pexels.com/v1/search` | Pexels Licence | no | needs the user's own key; "Photo by X on Pexels" |
| Unsplash | `api.unsplash.com/search/photos` | Unsplash Licence | no | needs the user's own key; hotlinks + `download_location` ping; "Photo by X on Unsplash" |
| Curated CC0 papers | same-origin `assets/paper-textures/index.json` | CC0 | some | appears only when a maintainer has fetched the bundle |

API keys are pasted in the search sheet (API keys), stored in `localStorage['vectura.textureKeys']`
in this browser only, and never exported.

**Verification status (v1.4.30).** The build container could not reach any provider. The
ambientCG v2 response shape was fetched once; every provider is otherwise **mock-tested only**
(see PRH-043 for the live check).

### Rejected collections

| Collection | Reason |
|---|---|
| ShareTextures | Terms forbid automated downloads, hotlinking and embedding downloads in apps |
| Pixabay | No permanent hotlinking; key required; large images capped at 1280 px |
| Poly Haven | No paper textures (fabric only) |
| cgbookcase | No paper category, no API |
| FreePBR | Not an open licence (commercial use is paid), no API |
| Smithsonian Open Access | Needs a key; little blank-paper material |
| Flickr API | Needs a key; open-licence photos are covered by Openverse |

## Curated bundle (maintainers)

`src/config/paper-texture-bundle.js` lists ~48 CC0 candidates (ambientCG Paper001–006 and
Cardboard001–004, TextureCan Paper 0001–0037, 3DTextures Watercolor Paper 001). No image files
are committed. To build the bundle locally:

```bash
node scripts/fetch-paper-textures.js --dry-run          # list entries + landing pages
npm i -D sharp                                          # optional: downscale to ≤ 2048 px WebP + thumbnails
node scripts/fetch-paper-textures.js                    # ambientCG + reviewed TextureCan entries
node scripts/fetch-paper-textures.js --include-review   # also the TextureCan entries flagged for review
```

The script checks each file is a real PNG/JPEG/WebP and the licence is on the allowlist, and
writes `assets/paper-textures/index.json`; re-check each landing page's licence by eye before
shipping. `manual` entries (no stable direct URL) are downloaded by hand into
`assets/paper-textures/<id>.jpg` and added to the index. TextureCan entries flagged `review`
may be printed wrapping-paper patterns rather than blank paper.
