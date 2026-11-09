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
  'the media origin is learned before first paint and re-renders',
  /function loadMediaOriginScript\(\)/.test(client) &&
    /origin\.js/.test(client) &&
    /function applyMediaOrigin\(value\)/.test(client) &&
    /store\.touch\(\)/.test(client),
  'a fetch-only origin can lose the race with the host listen(); use the script tag'
);

check(
  'a failed load retries the origin instead of giving up',
  /if \(!window\.__skinMediaOrigin\) \{[\s\S]{0,120}syncMediaOrigin\(0\)/.test(client),
  'NotSupportedError on dsh-app:// must trigger one more origin lookup'
);

check(
  'media keys are claimed through the Media Session API',
  /navigator\.mediaSession/.test(client) &&
    /bind\('previoustrack'/.test(client) &&
    /bind\('nexttrack'/.test(client) &&
    /session\.metadata = new MediaMetadata/.test(client),
  'macOS routes F7/F8/F9 to the active Now Playing session, not to a focused page'
);

check(
  'the strip follows the video backdrop, not the play state',
  /const showChip = active;/.test(client) &&
    !/holdClock/.test(client) &&
    /data-visible/.test(client),
  'pausing must not hide the whale: it is the only way back to play, so it may only go away when the wallpaper stops being a video'
);


check(
  'cards get a poster, not a black <video> frame',
  /async function handlePoster\(request, url\)/.test(host) &&
    /ROUTE_PREFIX\}\/poster/.test(host) &&
    /className: 'dsh-skin-video-poster'/.test(client),
  'the grid must render a cached JPEG; a <video> per card is slow and shows black'
);

check(
  'episode order and folder scope drive the playlist',
  /function videoRank\(item\)/.test(client) &&
    /const list = state\.customVideos\s*\n?\s*\.filter\(\(item\) => !folder \|\| videoScopeKey\(item\) === folder\)/.test(client) &&
    /function playFolder\(folder\)/.test(client),
  'clicking a folder must play it in S/E order, and next/prev must stay in scope'
);

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL  ${failure.name}\n      ${failure.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log('media wiring ok — src derivation, origin, loopback server, visibility');
}