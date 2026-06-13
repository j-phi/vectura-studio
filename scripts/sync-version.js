const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const versionPath = path.join(root, 'src', 'config', 'version.js');
const indexPath = path.join(root, 'index.html');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = packageJson.version;

const versionFile = `(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.APP_VERSION = '${version}';
})();
`;

// Cache-busting: stamp ?v=<version> onto every LOCAL (./-prefixed) script and
// stylesheet so a version bump invalidates the browser's cache for our no-build
// modules. index.html is always refetched (it's the document), but the ~150 JS
// modules and skin CSS have no other cache key — without this a soft reload
// serves stale JS even though the version badge looks current. External assets
// (https:// CDN / fonts) are left untouched. Idempotent: replaces any existing
// ?v=… rather than appending a second one.
const bustQuery = (html) =>
  html
    .replace(/(<script\s+src="\.\/[^"?]+\.js)(\?v=[^"]*)?(")/g, `$1?v=${version}$3`)
    .replace(/(href="\.\/[^"?]+\.css)(\?v=[^"]*)?(")/g, `$1?v=${version}$3`);

const indexHtml = bustQuery(
  fs
    .readFileSync(indexPath, 'utf8')
    .replace(/(<span class="pane-meta text-\[11px\] text-vectura-muted">)V\.[^<]+(<\/span>)/, `$1V.${version}$2`)
);

fs.writeFileSync(versionPath, versionFile, 'utf8');
fs.writeFileSync(indexPath, indexHtml, 'utf8');

process.stdout.write(`Synchronized app version ${version}\n`);
