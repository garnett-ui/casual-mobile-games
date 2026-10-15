import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;

test('service worker precache manifest is up to date', () => {
  execFileSync('node', ['tools/build-sw.mjs', '--check'], { cwd: root, stdio: 'pipe' });
});

test('web app manifest is installable', () => {
  const m = JSON.parse(readFileSync(`${root}manifest.webmanifest`, 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) assert.ok(existsSync(`${root}${icon.src}`), icon.src);
});

test('app version is semver and has a changelog entry', () => {
  const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(readFileSync(`${root}js/version.js`, 'utf8'), new RegExp(`VERSION = '${version}'`));
  assert.match(readFileSync(`${root}CHANGELOG.md`, 'utf8'), new RegExp(`## ${version.replace(/\./g, '\\.')}`));
});
