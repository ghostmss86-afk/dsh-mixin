#!/usr/bin/env node
/**
 * Media delivery wiring check.
 *
 * Every previous outage came from the same class of mistake: the <video> got a
 * src that could not work (empty, file://, a stale port, or a scheme that
 * cannot stream Range). Source inspection is cheap; video playback is not.
 *
 * Run: node scripts/check-media.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = await readFile(join(root, 'client.js'), 'utf8');
const host = await readFile(join(root, 'index.js'), 'utf8');

const failures = [];
const check = (name, ok, detail) => {
  if (ok) return;
  failures.push({ name, detail });
};

check(
  'video src is derivable from the stored path',
  /function videoRoute\(sourcePath\)[\s\S]{0,200}video\?path=/.test(client) &&
    /item\.proxyUrl \|\| item\.fullUrl \|\| item\.url \|\| videoRoute\(item\.sourcePath\)/.test(client),
  'resolveVideo must fall back to videoRoute(sourcePath), never to an empty string'
);

// Built by concatenation on purpose: the guard scans source text for the
// literal scheme, and a comment explaining the ban must not trip it.
const FILE_SCHEME = 'file:' + '//';
const stripComments = (text) => text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
const code = stripComments(client) + '\n' + stripComments(host);
check(
  'no file-scheme media url can reach the client',
  code.indexOf(FILE_SCHEME) === -1,
  'the host must hand out http media urls or nothing at all'
);

check(
  'media URLs are absolute only for real media assets',
  /const MEDIA_ASSET = [^\n]*video/.test(client) &&
    /const MEDIA_ASSET = [^\n]*proxy-file/.test(client) &&
    /if \(!MEDIA_ASSET\.test\(value\)\) return value;/.test(client),
  'mediaPath must not rewrite API endpoints onto the media server'
);

check(
  'host exposes a token-scoped loopback media server',
  /function startMediaServer\(\)/.test(host) &&
    /randomBytes\(12\)/.test(host) &&
    /mediaServer: mediaServer\.base\(\)/.test(host) &&
    /route === `\$\{ROUTE_PREFIX\}\/video`/.test(host),
  'the dsh-app:// shell cannot stream large video; a loopback server must serve it'
);

check(
  'the client learns the origin once and re-renders',
  /fetch\('\/api\/skin-studio\/media\/ping'/.test(client) &&
    /window\.__skinMediaOrigin = String\(data\.mediaServer\)/.test(client) &&
    /store\.touch\(\)/.test(client),
  'without store.touch() the first paint keeps the unusable relative URL'
);

check(
  'the last playback cluster is opt-in while playing',
  /const showChip = active && \(playing \|\| holdClock\)/.test(client) &&
    /data-visible/.test(client),
  'the clock + whale must disappear when nothing is playing'
);

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL  ${failure.name}\n      ${failure.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log('media wiring ok — src derivation, origin, loopback server, visibility');
}
