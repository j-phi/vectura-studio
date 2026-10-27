#!/usr/bin/env node
/**
 * Fetch the curated CC0 paper-texture bundle (maintainers, run locally).
 *
 *   node scripts/fetch-paper-textures.js [--only=id,id] [--dry-run] [--include-review] [--trust-manifest]
 *
 * Reads the manifest in src/config/paper-texture-bundle.js, downloads each
 * entry (skipping `manual` ones and, unless --include-review, `review` ones),
 * verifies the bytes are PNG/JPEG/WebP, checks the licence the MANIFEST
 * declares against the allowlist, then fetches each landing page and looks
 * for the licence string on it (an entry whose page does not mention it is
 * skipped unless --trust-manifest). This is a sanity check, not legal
 * verification: read each landing page before shipping. Downscales to
 * ≤ MAX_PX with `sharp` when it is installed (else keeps the original if
 * ≤ 8 MB), and writes
 * assets/paper-textures/<id>.<ext> (+ _height, _thumb) and index.json.
 * The app's Search sheet shows "Curated CC0 papers" only when index.json
 * exists. Image files are not committed by default — decide per release.
 * Print the landing URL of every entry so the licence can be re-checked by eye.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'paper-textures');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const loadManifest = () => {
  const ctx = { window: {} };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/config/paper-texture-bundle.js'), 'utf8'), ctx);
  return ctx.window.Vectura.PAPER_TEXTURE_BUNDLE;
};

const sniff = (b) => {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

let sharp = null;
try { sharp = require('sharp'); } catch (_e) { sharp = null; }

const fetchBytes = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'vectura-studio paper-texture bundle fetcher (maintainer script)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

const write = async (bytes, stem, maxPx) => {
  const kind = sniff(bytes);
  if (!kind) throw new Error(`${stem}: not a PNG/JPEG/WebP`);
  if (sharp) {
    const file = `${stem}.webp`;
    // toFile reports the real output size (correct for non-square images).
    const info = await sharp(bytes)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(path.join(OUT, file));
    return { file, width: info.width, height: info.height };
  }
  if (bytes.length > 8 * 1024 * 1024) throw new Error(`${stem}: over 8 MB and sharp is not installed`);
  const file = `${stem}.${kind}`;
  fs.writeFileSync(path.join(OUT, file), bytes);
  return { file };
};

// Does the landing page mention the declared licence? (CC0 / public domain)
const LICENCE_PATTERNS = {
  'CC0 1.0': /\bCC0\b|creative\s*commons\s*zero|publicdomain\/zero|public\s+domain/i,
};
const landingMentionsLicence = async (e) => {
  const re = LICENCE_PATTERNS[e.licence];
  if (!re || !e.landingUrl) return false;
  try {
    const html = (await fetchBytes(e.landingUrl)).toString('utf8');
    return re.test(html);
  } catch (_e) {
    return false;
  }
};

const thumb = async (bytes, stem) => {
  if (!sharp) return null;
  const file = `${stem}_thumb.webp`;
  await sharp(bytes).resize({ width: 256, height: 256, fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(OUT, file));
  return file;
};

(async () => {
  const B = loadManifest();
  const entries = B.ENTRIES.filter((e) => (!only.length || only.includes(e.id)));
  if (!sharp) console.warn('[paper-textures] `sharp` not installed: files are kept at original size (npm i -D sharp to downscale).');
  if (!flag('dry-run')) fs.mkdirSync(OUT, { recursive: true });
  const textures = [];
  for (const e of entries) {
    console.log(`- ${e.id}  (${e.licence})  ${e.landingUrl}`);
    if (!B.LICENCE_ALLOW.includes(e.licence)) { console.warn('  skipped: the manifest\u2019s declared licence is not on the allowlist'); continue; }
    if (e.manual) { console.warn(`  manual: download from the landing page into assets/paper-textures/${e.id}.jpg`); continue; }
    if (e.review && !flag('include-review')) { console.log('  skipped: needs review (pass --include-review)'); continue; }
    if (flag('dry-run')) continue;
    if (!(await landingMentionsLicence(e))) {
      if (!flag('trust-manifest')) { console.warn(`  skipped: the landing page does not mention "${e.licence}" — check it by hand (or pass --trust-manifest)`); continue; }
      console.warn(`  warning: landing page does not mention "${e.licence}" (kept: --trust-manifest)`);
    }
    try {
      const albedo = await fetchBytes(e.albedoUrl);
      const a = await write(albedo, e.id, B.MAX_PX);
      const t = (await thumb(albedo, e.id)) || a.file;
      let h = null;
      if (e.heightUrl) {
        try { h = await write(await fetchBytes(e.heightUrl), `${e.id}_height`, B.MAX_PX); } catch (err) { console.warn(`  height map: ${err.message}`); }
      }
      textures.push({
        id: e.id, title: e.title, source: e.source, author: e.author, licence: e.licence, licenceUrl: e.licenceUrl,
        landingUrl: e.landingUrl, albedo: a.file, heightMap: h ? h.file : undefined, thumb: t,
        width: a.width, height: a.height, physicalMm: e.physicalMm, tags: e.tags,
        attribution: `${e.title} — ${e.source} (${e.licence})`,
      });
      console.log(`  ok: ${a.file}${h ? ` + ${h.file}` : ''}`);
    } catch (err) {
      console.warn(`  failed: ${err.message}`);
    }
  }
  if (flag('dry-run')) return;
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify({ schema: B.SCHEMA, version: B.VERSION, generatedAt: new Date().toISOString(), textures }, null, 2)}\n`);
  console.log(`[paper-textures] wrote ${textures.length} textures to ${path.relative(ROOT, OUT)}/index.json`);
})().catch((err) => { console.error(err); process.exit(1); });
