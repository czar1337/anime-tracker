// v3 Phase 2: index.html lists the entry module's whole static import graph as
// <link rel="modulepreload">, so ~60 modules load in parallel instead of one
// import level at a time.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { moduleGraph, injectModulePreloads } = require('../../modulePreload.js');

const files = {
  '/js/app.js': `import { a } from './a.js';\nimport * as B from "./sub/b.js";\nimport './side.js';\n// import { never } from './commented.js';\n/* import x from './blockcomment.js'; */\nconst lazy = () => import('./lazy.js');\nexport { c } from '../config/c.js';`,
  '/js/a.js': `import {\n  x,\n  y as z,\n} from './sub/b.js';\nconst url = 'https://example.com/x';`,
  '/js/sub/b.js': `import { a } from '../a.js';`,
  '/js/side.js': ``,
  '/config/c.js': `export const c = 1;`,
};
const read = (u) => (u in files ? files[u] : null);

test('follows static imports and re-exports, skips dynamic imports and comments', () => {
  const graph = moduleGraph('/js/app.js', read);
  assert.deepStrictEqual([...graph].sort(), ['/config/c.js', '/js/a.js', '/js/app.js', '/js/side.js', '/js/sub/b.js']);
});

test('injects one link per module before </head>', () => {
  const out = injectModulePreloads('<html><head><title>t</title></head><body></body></html>', '/js/app.js', read);
  assert.strictEqual((out.match(/rel="modulepreload"/g) || []).length, 5);
  assert.ok(out.indexOf('modulepreload') < out.indexOf('</head>'));
});

test('the real app graph covers every module app.js loads statically', () => {
  const root = path.join(__dirname, '..', '..');
  const readReal = (u) => {
    const f = u.startsWith('/config/') ? path.join(root, 'config', u.slice(8)) : path.join(root, 'public', u);
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return null;
    }
  };
  const graph = moduleGraph('/js/app.js', readReal);
  for (const must of ['/js/app.js', '/js/state.js', '/js/render.js', '/js/core/reconcile.js', '/js/views/library/view.js', '/config/tuning.js']) {
    assert.ok(graph.includes(must), must);
  }
});
