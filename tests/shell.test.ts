import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function pngSize(path: string) {
  const bytes = readFileSync(join(root, path));
  const isPng = bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  if (!isPng) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('the installable shell', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  it('declares a standalone app with relative paths for any subpath', () => {
    expect(manifest.name).toBe('Fridge Door Companion');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  it('offers a 192, a 512, and a maskable 512 icon at the stated sizes', () => {
    const wanted = [
      ['icons/icon-192.png', 192],
      ['icons/icon-512.png', 512],
      ['icons/icon-maskable-512.png', 512],
    ] as const;
    for (const [path, size] of wanted) {
      expect(manifest.icons.some((icon: { src: string }) => icon.src === path), path).toBe(true);
      expect(pngSize(join('public', path)), path).toEqual({ width: size, height: size });
    }
    expect(
      manifest.icons.some(
        (icon: { src: string; purpose?: string }) =>
          icon.src === 'icons/icon-maskable-512.png' && icon.purpose === 'maskable',
      ),
    ).toBe(true);
  });

  it('serves the privacy page the door links to', () => {
    expect(existsSync(join(root, 'public/privacy.html'))).toBe(true);
    expect(read('public/privacy.html')).toMatch(/<title>[^<]*Privacy/i);
    expect(read('index.html')).toContain('href="privacy.html"');
  });
});

describe('index.html points at the built app, not the v1 scripts', () => {
  const html = read('index.html');

  it('loads one module entry and the public shell files', () => {
    expect(html).toContain('<script type="module" src="/src/app.js"></script>');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).not.toContain('data/ingredients.js');
    expect(html).not.toContain('data/recipes.js');
    expect(html).not.toMatch(/<script src="app\.js"/);
  });

  it('has no duplicate ids', () => {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(duplicates)]).toEqual([]);
  });

  it('contains every element the UI looks up', () => {
    const app = read('src/app.js');
    const wanted = [...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(wanted.length).toBeGreaterThan(30);
    const missing = wanted.filter((id) => !html.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
});

describe('the service worker precaches what the build emits', () => {
  it('keeps a placeholder for the hashed bundle and no v1 files', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain('/*__SHELL_ASSETS__*/');
    expect(sw).toContain("var CACHE = 'fdc-shell-__BUILD_HASH__'");
    expect(sw).not.toContain("./app.js'");
    expect(sw).not.toContain("./data/ingredients.js'");
  });

  it('only lists files that exist at the site root', () => {
    const sw = read('public/sw.js');
    const shell = sw.slice(sw.indexOf('var SHELL = ['), sw.indexOf('];', sw.indexOf('var SHELL = [')));
    const entries = [...shell.matchAll(/'(\.[^']*)'/g)].map((m) => m[1]!);
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      const path = entry === './' || entry === './index.html'
        ? 'index.html'
        : join('public', entry.replace(/^\.\//, ''));
      expect(existsSync(join(root, path)), entry).toBe(true);
    }
  });
});
