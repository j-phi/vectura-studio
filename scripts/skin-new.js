#!/usr/bin/env node
/*
 * scripts/skin-new.js
 *
 * Generate a new Vectura Studio skin from `src/ui/skin/_template.css`.
 *
 * Usage:
 *   npm run skin:new -- <skin-id> [--label "Display Label"] [--family <family>] [--force]
 *
 * Examples:
 *   npm run skin:new -- twilight
 *   npm run skin:new -- meridian-twilight --label "Meridian Blue · Twilight" --family meridian
 *
 * What it does:
 *   1. Reads `src/ui/skin/_template.css`.
 *   2. Substitutes `__SKIN_ID__` with the passed id and writes
 *      `src/ui/skin/<id>.css`. Refuses to overwrite unless --force.
 *   3. Prints the manifest snippet to paste into `src/config/defaults.js`
 *      (under `window.Vectura.THEMES`).
 *   4. Reminds the operator to add a <link>-friendly stylesheet path and to
 *      cycle the skin via the picker once registered.
 *
 * The script does NOT edit `src/config/defaults.js` automatically — manifest
 * registration is intentionally a manual step so reviewers see the diff. This
 * keeps the SDK to "one CSS file + one manifest entry" per the plan §"Phase 5".
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIN_DIR = path.join(root, 'src', 'ui', 'skin');
const TEMPLATE_PATH = path.join(SKIN_DIR, '_template.css');

function parseArgs(argv) {
  const args = { id: null, label: null, family: null, force: false };
  const rest = argv.slice(2);
  while (rest.length) {
    const tok = rest.shift();
    if (tok === '--force' || tok === '-f') {
      args.force = true;
    } else if (tok === '--label') {
      args.label = rest.shift();
    } else if (tok === '--family') {
      args.family = rest.shift();
    } else if (tok === '--help' || tok === '-h') {
      args.help = true;
    } else if (tok && !tok.startsWith('--') && !args.id) {
      args.id = tok;
    } else {
      throw new Error(`Unknown argument: ${tok}`);
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Usage: npm run skin:new -- <skin-id> [options]

Options:
  --label <text>   Human-friendly label (default: title-cased id).
  --family <name>  Skin family slug (default: parsed from id, or "custom").
  --force, -f      Overwrite an existing CSS file.
  --help, -h       Show this help.

Generates src/ui/skin/<id>.css from _template.css and prints a manifest
snippet to paste into src/config/defaults.js under window.Vectura.THEMES.
`);
}

function isValidSkinId(id) {
  // Lowercase kebab-case, must start with a letter.
  return typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id);
}

function titleCase(id) {
  return id
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

function deriveFamily(id) {
  const dash = id.indexOf('-');
  if (dash > 0) return id.slice(0, dash);
  return id;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`skin:new: ${err.message}\n`);
    printHelp();
    process.exit(2);
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.id) {
    process.stderr.write('skin:new: missing <skin-id>.\n');
    printHelp();
    process.exit(2);
    return;
  }

  if (!isValidSkinId(args.id)) {
    process.stderr.write(
      `skin:new: invalid skin id "${args.id}". Must be lowercase kebab-case (a-z, 0-9, -), starting with a letter, max 64 chars.\n`,
    );
    process.exit(2);
    return;
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    process.stderr.write(`skin:new: template missing at ${path.relative(root, TEMPLATE_PATH)}\n`);
    process.exit(1);
    return;
  }

  const outPath = path.join(SKIN_DIR, `${args.id}.css`);
  if (fs.existsSync(outPath) && !args.force) {
    process.stderr.write(
      `skin:new: ${path.relative(root, outPath)} already exists. Pass --force to overwrite.\n`,
    );
    process.exit(1);
    return;
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const generated = template.replace(/__SKIN_ID__/g, args.id);
  fs.writeFileSync(outPath, generated, 'utf8');

  const label = args.label || titleCase(args.id);
  const family = args.family || deriveFamily(args.id) || 'custom';
  const stylesheet = `./src/ui/skin/${args.id}.css`;

  // Snippet shape mirrors existing meridian-* manifest entries.
  const snippet = `    '${args.id}': {
      id: '${args.id}',
      label: '${label.replace(/'/g, "\\'")}',
      family: '${family}',
      stylesheet: '${stylesheet}',
      manifest: ${family === 'meridian' ? 'MERIDIAN_MANIFEST' : 'CLASSIC_MANIFEST'},
      colorScheme: 'dark', // 'dark' | 'light'
      metaThemeColor: '#1b1b1b',
      documentBg: '#1b1b1b',
      pen1Color: '#e6f1ff',
      cssVars: {
        // Subset pushed synchronously before the stylesheet streams in.
        // Fill these in from the matching --vectura-*-rgb values in your CSS file.
        '--vectura-bg-rgb': '27 27 27',
        '--vectura-panel-rgb': '37 37 37',
        '--vectura-border-rgb': '54 54 54',
        '--vectura-text-rgb': '224 224 224',
        '--vectura-muted-rgb': '104 104 104',
        '--vectura-accent-rgb': '78 158 225',
        '--vectura-danger-rgb': '224 82 82',
      },
    },`;

  process.stdout.write(`Created ${path.relative(root, outPath)}\n\n`);
  process.stdout.write('Next steps:\n');
  process.stdout.write(`  1. Edit ${path.relative(root, outPath)} — replace the template palette with your colors.\n`);
  process.stdout.write('  2. Add this entry to src/config/defaults.js under window.Vectura.THEMES:\n\n');
  process.stdout.write(`${snippet}\n\n`);
  process.stdout.write('  3. Reload the app — the skin appears in the picker. Cycle to verify it paints.\n');
  process.stdout.write('  4. (Optional) Run `npm run test:visual` if you want a baseline; otherwise the new skin\n');
  process.stdout.write('     is exempt from the existing visual baselines (which exercise classic skins).\n');
}

main();
