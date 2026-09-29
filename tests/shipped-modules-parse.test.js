// Every client script the service worker ships must at least PARSE.
//
// Why this exists: v1.7.35 shipped a changelog string with an unescaped apostrophe
// (`'...today's bar...'`) in version.js. That is a SyntaxError, so the whole module
// graph failed to load and the app rendered nothing but the tab bar — and the suite
// stayed green, because no test imports version.js. This test parses every .js file
// listed in sw.js PRECACHE (so a newly added module is covered automatically), which
// catches that whole class of break regardless of test coverage.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const root = new URL('..', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');

function precachedScripts() {
  const sw = read('sw.js');
  const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!block) throw new Error('Could not find the PRECACHE list in sw.js');
  return [...block[1].matchAll(/'([^']+\.js)'/g)]
    .map(m => m[1])
    .filter(p => !/^https?:/.test(p)); // CDN scripts are not ours to parse
}

const files = [...precachedScripts(), 'sw.js'];

test('the precache list was found and is non-trivial', () => {
  expect(files.length).toBeGreaterThan(20);
  expect(files).toContain('version.js');
  expect(files).toContain('app.js');
});

test.each(files)('%s parses as an ES module', file => {
  const src = read(file);
  // Throws with the file, line and column on any syntax error.
  expect(() => transformSync(src, { loader: 'js', format: 'esm', sourcefile: file, logLevel: 'silent' })).not.toThrow();
});
