'use strict';
// Prints the GitHub release notes for one version (CI, on a `v*` tag).
//
// When docs/release-notes-<version>.md exists, that is the text: its
// {{SHA256}}, {{SIZE}}, {{COMMIT}} and {{BUILT}} placeholders are filled from
// the exe this same CI run built (dist/AnimeTracker.exe and
// dist/build-info.json), so the checksum on the release page is always the one
// of the file attached to it. HTML comments are dropped.
// Otherwise it is that version's section of CHANGELOG.md.
// Fails when the text is missing or empty, or a placeholder cannot be filled.
//
//   node scripts/release-notes.js 3.0.0 > notes.md

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const version = (process.argv[2] || '').replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.js <version>');
  process.exit(1);
}

function fromNotesFile(file) {
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->\n?/g, '');
  if (/\{\{[A-Z0-9]+\}\}/.test(text)) {
    const exe = path.join(ROOT, 'dist', 'AnimeTracker.exe');
    const infoFile = path.join(ROOT, 'dist', 'build-info.json');
    if (!fs.existsSync(exe) || !fs.existsSync(infoFile)) {
      console.error('release-notes: the notes need the built exe (dist/AnimeTracker.exe, dist/build-info.json); build it first.');
      process.exit(1);
    }
    const bytes = fs.readFileSync(exe);
    const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    if (info.version !== version) {
      console.error(`release-notes: dist/AnimeTracker.exe is ${info.version}, not ${version}.`);
      process.exit(1);
    }
    const values = {
      SHA256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
      SIZE: bytes.length.toLocaleString('en-US'),
      COMMIT: info.commit || 'unknown',
      BUILT: new Date(info.builtAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    };
    text = text.replace(/\{\{([A-Z0-9]+)\}\}/g, (m, key) => {
      if (!(key in values)) {
        console.error(`release-notes: unknown placeholder ${m}`);
        process.exit(1);
      }
      return values[key];
    });
  }
  return text.trim();
}

function fromChangelog() {
  const lines = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  // "## 3.0.0" or "## 3.0.0 (2026-10-04)", never "## 3.0.01".
  const isHeading = (l) => l === `## ${version}` || l.startsWith(`## ${version} `);
  const start = lines.findIndex(isHeading);
  if (start < 0) {
    console.error(`release-notes: no "## ${version}" section in CHANGELOG.md`);
    process.exit(1);
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

const notesFile = path.join(ROOT, 'docs', `release-notes-${version}.md`);
const body = fs.existsSync(notesFile) ? fromNotesFile(notesFile) : fromChangelog();
if (!body) {
  console.error(`release-notes: the notes for ${version} are empty`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);
