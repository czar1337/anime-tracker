'use strict';
// <link rel="modulepreload"> for the whole static import graph of the page's
// entry module (v3 Phase 2). The frontend is ~60 unbundled ES modules; without
// this the browser discovers them one import level at a time, which cost about
// 400ms before the first card could render. With every module listed up front
// they are fetched in parallel.
//
// The graph is read from the sources themselves (static `import ... from` and
// `export ... from` only; dynamic import() stays lazy on purpose), so it can
// never drift from the code. `readText(urlPath)` returns a module's source or
// null; it hides whether assets come from disk or from the SEA blob.

const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g;

function resolve(fromUrl, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare specifiers: none in this app
  return new URL(spec, `http://x${fromUrl}`).pathname;
}

function moduleGraph(entryUrl, readText) {
  const seen = new Set();
  const order = [];
  const stack = [entryUrl];
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const source = readText(url);
    if (source == null) continue;
    order.push(url);
    // Comments can mention "import ... from '...'" too; strip them first.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(STATIC_IMPORT)) {
      const dep = resolve(url, m[1]);
      if (dep && !seen.has(dep)) stack.push(dep);
    }
  }
  return order;
}

function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Inserts the preload links right before </head>. The entry itself is listed
// too: it is at the end of <body>, so preloading it starts it sooner.
function injectModulePreloads(html, entryUrl, readText) {
  const urls = moduleGraph(entryUrl, readText);
  if (!urls.length || !html.includes('</head>')) return html;
  const links = urls.map((u) => `<link rel="modulepreload" href="${escapeAttr(u)}">`).join('\n');
  return html.replace('</head>', `${links}\n</head>`);
}

module.exports = { moduleGraph, injectModulePreloads };
