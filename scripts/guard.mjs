#!/usr/bin/env node
/**
 * 工程经验守门器 — 把教训变成可执行的静态检查。
 *
 *   node tools/guard.mjs --root ../skin-studio
 *   node tools/guard.mjs --root . --json
 *   node tools/guard.mjs --root . --rules ./tools/rules.json --print-config
 *
 * 设计原则：
 *  - 零依赖，Node >= 18，CI 与 pre-push 都能直接跑；
 *  - 规则即数据（rules.json），一条教训对应一条规则，附 why / hint；
 *  - 只做"能静态判定"的那部分，语义正确性交给检查单。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', 'vendor', '.cache', '.turbo']);

function parseArgs(argv) {
  const args = { root: process.cwd(), rules: join(HERE, 'rules.json'), json: false, printConfig: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') args.root = argv[++i];
    else if (token === '--rules') args.rules = argv[++i];
    else if (token === '--json') args.json = true;
    else if (token === '--print-config') args.printConfig = true;
    else if (token === '--quiet') args.quiet = true;
    else if (token === '-h' || token === '--help') args.help = true;
  }
  return args;
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// A guard that flags the comment explaining the anti-pattern is a guard people
// turn off. Matches that start on a comment line are documentation, not code.
const COMMENT_PREFIX = /^(\/\/|\/\*|\*|#|--)/;

function commentLine(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end === -1) end = text.length;
  return COMMENT_PREFIX.test(text.slice(start, end).trim());
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function snippet(text, index, length) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index + length);
  if (end === -1) end = text.length;
  const line = text.slice(start, end).trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('用法: node tools/guard.mjs --root <repo> [--rules <rules.json>] [--json] [--quiet]');
    return 0;
  }
  const root = resolve(args.root);
  if (!existsSync(root)) {
    console.error(`guard: root 不存在: ${root}`);
    return 2;
  }
  const rulesDoc = JSON.parse(await readFile(resolve(args.rules), 'utf8'));

  if (args.printConfig) {
    // 生成"当前仓库"的规则副本：路径固定为 ./guard.rules.json，方便项目自带。
    process.stdout.write(`${JSON.stringify(rulesDoc, null, 2)}\n`);
    return 0;
  }

  const files = await walk(root);
  const rules = (rulesDoc.rules || []).map((rule) => ({
    ...rule,
    fileRe: new RegExp(rule.file, 'i'),
    forbidRe: new RegExp(rule.forbid, 'gm'),
    unlessRe: rule.unless ? new RegExp(rule.unless, 'm') : null,
    // Some rules are about state construction, not about the toggle that
    // legitimately flips the same field. `skipLine` keeps them quiet.
    skipLineRe: rule.skipLine ? new RegExp(rule.skipLine) : null,
  }));

  const findings = [];
  for (const file of files) {
    const rel = relative(root, file);
    const applicable = rules.filter((rule) => rule.fileRe.test(rel));
    if (!applicable.length) continue;
    let text;
    try {
      const info = await stat(file);
      if (info.size > 4 * 1024 * 1024) continue;
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    for (const rule of applicable) {
      if (rule.unlessRe && rule.unlessRe.test(text)) continue;
      rule.forbidRe.lastIndex = 0;
      let match;
      while ((match = rule.forbidRe.exec(text)) !== null) {
        if (commentLine(text, match.index)) continue;
        if (rule.skipLineRe) {
          const start = text.lastIndexOf('\n', match.index) + 1;
          let end = text.indexOf('\n', match.index);
          if (end === -1) end = text.length;
          if (rule.skipLineRe.test(text.slice(start, end))) continue;
        }
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          title: rule.title,
          why: rule.why,
          hint: rule.hint,
          file: rel,
          line: lineAt(text, match.index),
          snippet: snippet(text, match.index, match[0].length),
        });
        if (match[0] === '') rule.forbidRe.lastIndex += 1;
        if (rule.max && findings.filter((item) => item.rule === rule.id).length >= rule.max) break;
      }
    }
  }

  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity !== 'error');

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ root, errors: errors.length, warnings: warnings.length, findings }, null, 2)}\n`);
    return errors.length ? 1 : 0;
  }

  if (!findings.length) {
    if (!args.quiet) console.log(`guard: 通过 — ${files.length} 个文件，${rules.length} 条规则，0 命中。`);
    return 0;
  }

  const byRule = new Map();
  for (const item of findings) {
    if (!byRule.has(item.rule)) byRule.set(item.rule, { rule: item, hits: [] });
    byRule.get(item.rule).hits.push(item);
  }
  for (const { rule, hits } of byRule.values()) {
    const mark = rule.severity === 'error' ? '✗' : '!';
    console.log(`${mark} ${rule.rule} ${rule.title} — ${hits.length} 处 (${rule.severity})`);
    console.log(`  为什么: ${rule.why}`);
    console.log(`  怎么改: ${rule.hint}`);
    for (const hit of hits.slice(0, 6)) console.log(`  ${hit.file}:${hit.line}  ${hit.snippet}`);
    if (hits.length > 6) console.log(`  … 另有 ${hits.length - 6} 处`);
    console.log('');
  }
  console.log(`guard: ${errors.length} 个错误, ${warnings.length} 个警告（${files.length} 个文件 / ${rules.length} 条规则）`);
  return errors.length ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(`guard 自身出错: ${error && error.stack ? error.stack : error}`);
  process.exit(2);
});
