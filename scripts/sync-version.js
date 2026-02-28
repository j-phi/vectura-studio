const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const versionPath = path.join(root, 'src', 'config', 'version.js');
const indexPath = path.join(root, 'index.html');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = packageJson.version;

const versionFile = `(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.APP_VERSION = '${version}';
})();
`;

const indexHtml = fs
  .readFileSync(indexPath, 'utf8')
  .replace(/(<span class="pane-meta text-\[10px\] text-vectura-muted">)V\.[^<]+(<\/span>)/, `$1V.${version}$2`);

fs.writeFileSync(versionPath, versionFile, 'utf8');
fs.writeFileSync(indexPath, indexHtml, 'utf8');

process.stdout.write(`Synchronized app version ${version}\n`);
