#!/usr/bin/env node
/**
 * Regenerates src/config/petal-profiles/library.js from JSON profile files.
 * This keeps direct file:// runs in sync without triggering browser CORS errors.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(REPO_ROOT, 'src/config/petal-profiles');
const INDEX_PATH = path.join(PROFILE_DIR, 'index.json');
const OUTPUT_PATH = path.join(PROFILE_DIR, 'library.js');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const normalizeIndexFiles = (payload) => {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.files)
    ? payload.files
    : [];
  const out = [];
  const seen = new Set();
  raw.forEach((entry) => {
    const value = `${entry || ''}`.trim();
    if (!value.toLowerCase().endsWith('.json')) return;
    if (value.toLowerCase() === 'index.json') return;
    if (seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
};

const listProfileFiles = () =>
  fs
    .readdirSync(PROFILE_DIR)
    .filter((file) => file.toLowerCase().endsWith('.json') && file.toLowerCase() !== 'index.json')
    .sort((a, b) => a.localeCompare(b));

const indexPayload = readJson(INDEX_PATH);
const indexedFiles = normalizeIndexFiles(indexPayload);
const diskFiles = listProfileFiles();
const fileOrder = [];
const seenFiles = new Set();

indexedFiles.forEach((file) => {
  if (seenFiles.has(file)) return;
  seenFiles.add(file);
  fileOrder.push(file);
});
diskFiles.forEach((file) => {
  if (seenFiles.has(file)) return;
  seenFiles.add(file);
  fileOrder.push(file);
});

const profiles = fileOrder.map((file) => {
  const fullPath = path.join(PROFILE_DIR, file);
  const payload = readJson(fullPath);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Invalid profile payload in ${file}`);
  }
  return {
    sourcePath: file,
    ...payload,
  };
});

const bundle = {
  version: 1,
  profiles,
};

const output = `(function initPetalProfileLibrary(global) {\n  const root = global.Vectura = global.Vectura || {};\n  root.PETAL_PROFILE_LIBRARY = ${JSON.stringify(bundle, null, 2)};\n})(window);\n`;

fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`Updated ${path.relative(REPO_ROOT, OUTPUT_PATH)} with ${profiles.length} profiles.`);
