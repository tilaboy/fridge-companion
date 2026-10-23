#!/usr/bin/env node
/* Post-build: teach the service worker the hashed asset names.
 *
 * Vite fingerprints the JavaScript bundle, so the precache list cannot be
 * written by hand. This reads the built index.html, appends those exact URLs
 * to the worker's SHELL, and stamps a cache name derived from the build's
 * contents. A changed build therefore lands in a fresh cache, and the old one
 * is deleted on activate — no manual version bump.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', dist), 'utf8');

const assets = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (url.startsWith('./assets/') || url.startsWith('assets/')) {
    assets.add(url.startsWith('./') ? url : './' + url);
  }
}

const assetFiles = (await readdir(new URL('assets/', dist), { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();

const hash = createHash('sha256');
hash.update(html);
for (const name of assetFiles) {
  hash.update(name);
  hash.update(await readFile(new URL('assets/' + name, dist)));
}
const version = hash.digest('hex').slice(0, 12);

const swPath = new URL('sw.js', dist);
let sw = await readFile(swPath, 'utf8');
const entries = [...assets].sort().map((url) => `  '${url}'`).join(',\n');

if (!sw.includes('/*__SHELL_ASSETS__*/')) {
  throw new Error('public/sw.js is missing the /*__SHELL_ASSETS__*/ placeholder');
}
sw = sw
  .replace("'fdc-shell-__BUILD_HASH__'", `'fdc-shell-${version}'`)
  .replace(/\s*\/\*__SHELL_ASSETS__\*\/\s*/, entries ? `\n${entries}\n` : '\n');

await writeFile(swPath, sw);
console.log(`service worker stamped: fdc-shell-${version} (${assets.size} built asset${assets.size === 1 ? '' : 's'})`);
