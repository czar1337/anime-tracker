'use strict';
// One version source (v3 Phase 7): version.json is the app's version (the exe
// and the update check read it); package.json's version must match it. With a
// tag argument (CI on a `v*` tag), the tag must be `v` + that version.
//
//   node scripts/check-version.js            -> version.json == package.json
//   node scripts/check-version.js v3.0.0     -> ... and == the tag

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const tag = process.argv[2] ? process.argv[2].replace(/^refs\/tags\//, '') : null;

const problems = [];
if (!/^\d+\.\d+\.\d+$/.test(app)) problems.push(`version.json has "${app}", not MAJOR.MINOR.PATCH`);
if (pkg !== app) problems.push(`package.json has ${pkg}, version.json has ${app}`);
if (tag && tag !== `v${app}`) problems.push(`the tag is ${tag}, but version.json has ${app} (expected v${app})`);

if (problems.length) {
  console.error(`check-version: ${problems.join('; ')}`);
  process.exit(1);
}
console.log(`check-version: ${app}${tag ? ` matches ${tag}` : ''}`);
