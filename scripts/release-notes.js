'use strict';
// Prints one version's section of CHANGELOG.md, for the GitHub release notes
// (CI, on a `v*` tag). Fails when the section is missing or empty.
//
//   node scripts/release-notes.js 3.0.0 > notes.md

const fs = require('node:fs');
const path = require('node:path');

const version = (process.argv[2] || '').replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.js <version>');
  process.exit(1);
}
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');
// "## 3.0.0" or "## 3.0.0 (2026-10-04)", never "## 3.0.01".
const isHeading = (l) => l === `## ${version}` || l.startsWith(`## ${version} `);
const start = lines.findIndex(isHeading);
if (start < 0) {
  console.error(`release-notes: no "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
if (end < 0) end = lines.length;
const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  console.error(`release-notes: the "## ${version}" section is empty`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);
