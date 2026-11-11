#!/usr/bin/env node
/**
 * Packaging check: every non-glob entry in package.json `files` must exist, and
 * the locale tables must parse. These used to live in the CI YAML, which meant
 * `npm run verify` (the only entry the repo promises) did not cover them, and
 * the YAML could drift from the script list. They belong in `check`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.argv[2] || '.';
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const failures = [];

for (const file of pkg.files || []) {
  if (file.includes('*')) continue;
  if (!existsSync(resolve(root, file))) failures.push(`package.json files: missing ${file}`);
}

for (const file of ['locale/zh.json', 'locale/en.json']) {
  try {
    JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

if (failures.length) {
  console.error('package check FAILED');
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}

console.log(`package ok — ${pkg.name}@${pkg.version}, ${pkg.files.length} files entries, locale tables parse`);
