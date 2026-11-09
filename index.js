/**
 * Skin studio — host side.
 *
 * The visual skin itself is a browser-side feature. This host row also exposes
 * a tiny media helper used by the video wallpaper: some containers carry audio
 * codecs (E-AC-3, DTS, TrueHD, …) that Chromium cannot decode even though it
 * can decode the video stream. When that happens the client asks this route to
 * build a local AAC audio sidecar with ffmpeg; the video element keeps showing
 * the untouched original picture while a synchronised <audio> element plays
 * the compatible track.
 */
import { basename, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const ROUTE_PREFIX = '/api/skin-studio/media';
const CACHE_DIR = join(tmpdir(), 'dsh-skin-studio-audio');
const PROXY_DIR = join(tmpdir(), 'dsh-skin-studio-proxy');
const POSTER_DIR = join(CACHE_DIR, 'posters');
const PROXY_JOBS = new Map();
const SUPPORTED_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function run(command, args, { capture = true } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore'] });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
        if (stderr.length > 20000) stderr = stderr.slice(-20000);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.split('\n').filter(Boolean).slice(-3).join(' | ')}`));
    });
  });
}

async function probeAudioCodec(source) {
  try {
    const result = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', source
    ]);
    return (result.stdout || '').trim().split(/\s+/)[0] || '';
  } catch (error) {
    console.warn('[skin-studio] ffprobe failed', error && error.message);
    return '';
  }
}

async function ensureAudio(source) {
  const info = await stat(source);
  if (!info.isFile()) throw new Error('not a file');
  const codec = await probeAudioCodec(source);
  if (!codec) return { codec: '', url: '', reason: 'no-audio' };
  // Natively supported audio stays inside the <video> element. Handing the
  // client a file:// URL here used to force it into "sidecar mode": the video
  // was muted and the sidecar could never load over http(s), so every ordinary
  // mp4 lost its sound. Report no sidecar and let the video play its own track.
  if (SUPPORTED_AUDIO.has(codec)) return { codec, url: '', reason: 'supported' };
  const key = createHash('sha1')
    .update(`${source}:${info.size}:${info.mtimeMs}:${codec}:aac192`)
    .digest('hex')
    .slice(0, 20);
  const output = join(CACHE_DIR, `${key}.m4a`);
  try {
    const existing = await stat(output);
    if (existing.isFile() && existing.size > 1024) {
      return { codec, url: `${ROUTE_PREFIX}/audio/${basename(output)}`, reason: 'cached' };
    }
  } catch (error) { /* not cached */ }
  await mkdir(CACHE_DIR, { recursive: true });
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-map', '0:a:0', '-vn', '-sn', '-dn',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-movflags', '+faststart', output
  ], { capture: true });
  return { codec, url: `${ROUTE_PREFIX}/audio/${basename(output)}`, reason: 'transcoded' };
}


async function probeVideoCodec(source) {
  try {
    const result = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', source
    ]);
    return (result.stdout || '').trim().split(/\s+/)[0] || '';
  } catch (error) {
    return '';
  }
}

async function proxyInfo(source) {
  const info = await stat(source);
  if (!info.isFile()) throw new Error('not a file');
  const codec = await probeVideoCodec(source);
  if (codec === 'h264') {
    return { codec, ready: true, needed: false, file: source, url: `${ROUTE_PREFIX}/video?path=${encodeURIComponent(source)}` };
  }
  const key = createHash('sha1')
    .update(`${source}:${info.size}:${info.mtimeMs}:${codec}:h264_720p`)
    .digest('hex')
    .slice(0, 20);
  const output = join(PROXY_DIR, `${key}.mp4`);
  try {
    const existing = await stat(output);
    if (existing.isFile() && existing.size > 1024) {
      return { codec, ready: true, needed: true, file: output, url: `${ROUTE_PREFIX}/proxy-file?path=${encodeURIComponent(output)}` };
    }
  } catch (error) { /* not ready */ }
  if (!PROXY_JOBS.has(key)) {
    await mkdir(PROXY_DIR, { recursive: true });
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-hwaccel', 'videotoolbox', '-i', source,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'h264_videotoolbox', '-b:v', '3M', '-maxrate', '5M', '-bufsize', '10M',
      '-vf', 'scale=-2:720', '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart', output
    ], { stdio: 'ignore', detached: true });
    child.unref();
    PROXY_JOBS.set(key, output);
    child.on('exit', () => PROXY_JOBS.delete(key));
  }
  return { codec, ready: false, needed: true, file: output, url: '' };
}

async function handleFile(request, file, mime) {
  let info;
  try { info = await stat(file); } catch (error) { return new Response('Not found', { status: 404 }); }
  if (!info.isFile()) return new Response('Not found', { status: 404 });
  const headers = {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0',
    'access-control-allow-origin': '*'
  };
  const range = parseRange(request.headers.get('range'), info.size);
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['content-length'] = String(range.end - range.start + 1);
    return new Response(Readable.toWeb(createReadStream(file, { start: range.start, end: range.end })), { status: 206, headers });
  }
  headers['content-length'] = String(info.size);
  return new Response(Readable.toWeb(createReadStream(file)), { status: 200, headers });
}

function mimeFor(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogv') || lower.endsWith('.ogg')) return 'video/ogg';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mpg') || lower.endsWith('.mpeg')) return 'video/mpeg';
  return 'video/mp4';
}

const VIDEO_EXT_RE = /\.(mp4|m4v|webm|mov|mkv|avi|mpg|mpeg|ts|m2ts|ogv|ogg|wmv|flv|3gp)$/i;
function isVideoName(name) {
  return VIDEO_EXT_RE.test(String(name || ''));
}

async function pickVideo() {
  // No `of type {"public.movie"}` filter: macOS does not classify .mkv/.ts/.m2ts
  // as public.movie, so filtered dialogs grey those files out and users cannot
  // pick their shows at all. Filter by extension on our side instead.
  const script = 'POSIX path of (choose file with prompt "选择视频壁纸")';
  try {
    const result = await run('osascript', ['-e', script]);
    const source = (result.stdout || '').trim();
    if (!source) return { ok: false, canceled: true };
    if (!isVideoName(source)) return { ok: false, reason: 'not-a-video' };
    const info = await stat(source);
    return { ok: true, path: source, name: basename(source), size: info.size };
  } catch (error) {
    if (/User canceled|-128/i.test(String(error && error.message || ''))) return { ok: false, canceled: true };
    throw error;
  }
}

/**
 * Recover the on-disk path of an already-imported video.
 *
 * Electron 32+ removed `File.path`, so videos added through a plain
 * <input type=file> end up as multi-gigabyte blobs in IndexedDB with no path.
 * Without a path this host cannot probe the audio, which is why such a video
 * can play its picture (H.264 is supported) but stay silent (E-AC-3/DTS are
 * not). Given the file name we already know, look for it where users keep
 * videos and hand the path back so the client can upgrade the record.
 */
function findOriginalFile(name, size) {
  if (!name || name.length > 200 || /[\\/\0*?]/.test(name)) return Promise.resolve(null);
  const roots = ['Downloads', 'Desktop', 'Movies', 'Documents', 'Pictures'].map((dir) => join(homedir(), dir));
  const wanted = Number(size) || 0;
  // The client stores a display name without the extension ("Show.S01E01...").
  const patterns = [name, `${name}.*`];
  // One `find` over every root, exact byte size, `-quit` on the first hit:
  // the startup repair sweep runs this per pathless record, so it has to stay
  // in the ~100ms range. `-size Nc` is exact bytes, which is also what keeps
  // us from binding the wrong release of the same episode.
  const args = [...roots, '-maxdepth', '8', '-type', 'f', '('];
  patterns.forEach((pattern, index) => {
    if (index > 0) args.push('-o');
    args.push('-name', pattern);
  });
  args.push(')');
  if (wanted > 0) args.push('-size', `${wanted}c`);
  args.push('-print', '-quit');
  return new Promise((resolve) => {
    execFile('find', args, { timeout: 9000, maxBuffer: 1 << 20 }, (error, stdout) => {
      const first = String(stdout || '').split('\n').map((line) => line.trim()).filter(Boolean)[0];
      if (!first) return resolve(null);
      stat(first).then((info) => {
        if (!info.isFile()) return resolve(null);
        if (wanted > 0 && info.size !== wanted) return resolve(null);
        resolve({ path: first, name, size: info.size });
      }).catch(() => resolve(null));
      if (error && !stdout) return resolve(null);
    });
  });
}

async function pickVideos() {
  // Multi-select variant used by the "add local videos" tile: one dialog,
  // many files, real POSIX paths (needed for host streaming + audio probing).
  const script = [
    'set theFiles to choose file with prompt "选择视频壁纸" with multiple selections allowed',
    'set out to ""',
    'repeat with f in theFiles',
    'set out to out & (POSIX path of (contents of f)) & linefeed',
    'end repeat',
    'return out'
  ].join('\n');
  try {
    const result = await run('osascript', ['-e', script]);
    const paths = (result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!paths.length) return { ok: false, canceled: true };
    const files = [];
    for (const source of paths) {
      try {
        const info = await stat(source);
        if (!info.isFile() || !isVideoName(source)) continue;
        files.push({ path: source, name: basename(source), size: info.size });
      } catch (error) { /* skip vanished file */ }
    }
    return { ok: true, files };
  } catch (error) {
    if (/User canceled|-128/i.test(String(error && error.message || ''))) return { ok: false, canceled: true };
    throw error;
  }
}

async function pickVideoFolder() {
  const script = 'POSIX path of (choose folder with prompt "选择视频文件夹")';
  try {
    const result = await run('osascript', ['-e', script]);
    const folder = (result.stdout || '').trim().replace(/\/$/, '');
    if (!folder) return { ok: false, canceled: true };
    const files = [];
    const walk = async (dir) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { await walk(full); continue; }
        if (!isVideoName(entry.name)) continue;
        const info = await stat(full);
        files.push({ path: full, name: entry.name, size: info.size });
      }
    };
    await walk(folder);
    // Deterministic playlist: folders come back in readdir order otherwise.
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return { ok: true, folder, files };
  } catch (error) {
    if (/User canceled|-128/i.test(String(error && error.message || ''))) return { ok: false, canceled: true };
    throw error;
  }
}


/**
 * One frame per video, cached by (path, size, mtime). The grid used to render a
 * <video> per card, which is heavy and shows a black frame; a 560px JPEG loads
 * instantly and looks like the photo grid next to it.
 */
async function handlePoster(request, url) {
  const source = url.searchParams.get('path') || '';
  if (!source || !source.startsWith('/')) return new Response('Bad request', { status: 400 });
  let info;
  try {
    info = await stat(source);
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
  if (!info.isFile()) return new Response('Not found', { status: 404 });
  const key = createHash('sha1')
    .update(`${source}:${info.size}:${Math.round(info.mtimeMs)}:poster560`)
    .digest('hex')
    .slice(0, 20);
  const file = join(POSTER_DIR, `${key}.jpg`);
  let exists = true;
  try { await stat(file); } catch (error) { exists = false; }
  if (!exists) {
    await mkdir(POSTER_DIR, { recursive: true });
    // Skip idents/recaps: sample deeper into longer files.
    const at = info.size > 120 * 1024 * 1024 ? '00:02:30' : '00:00:20';
    await new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      const child = spawn('ffmpeg', [
        '-y', '-ss', at, '-i', source, '-frames:v', '1',
        '-vf', 'scale=560:-2', '-q:v', '4', file
      ], { stdio: 'ignore' });
      child.on('error', done);
      child.on('close', done);
      setTimeout(() => { try { child.kill('SIGKILL'); } catch (error) { /* ignore */ } done(); }, 25000);
    });
  }
  try {
    return await handleFile(request, file, 'image/jpeg');
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
}

async function handleVideo(request, url) {
  const source = url.searchParams.get('path') || '';
  if (!source || !source.startsWith('/')) return new Response('Bad request', { status: 400 });
  let info;
  try {
    info = await stat(source);
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
  if (!info.isFile()) return new Response('Not found', { status: 404 });
  const headers = {
    'content-type': mimeFor(source),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0',
    'access-control-allow-origin': '*'
  };
  const range = parseRange(request.headers.get('range'), info.size);
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['content-length'] = String(range.end - range.start + 1);
    return new Response(Readable.toWeb(createReadStream(source, { start: range.start, end: range.end })), { status: 206, headers });
  }
  headers['content-length'] = String(info.size);
  return new Response(Readable.toWeb(createReadStream(source)), { status: 200, headers });
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) return null;
  return { start, end };
}

async function handleAudio(request, url) {
  const name = basename(decodeURIComponent(url.pathname.slice(`${ROUTE_PREFIX}/audio/`.length)));
  if (!name || name.includes('/') || name.includes('\\') || !name.endsWith('.m4a')) {
    return new Response('Not found', { status: 404 });
  }
  const file = join(CACHE_DIR, name);
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
  const headers = {
    'content-type': 'audio/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
    'access-control-allow-origin': '*'
  };
  const range = parseRange(request.headers.get('range'), info.size);
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['content-length'] = String(range.end - range.start + 1);
    const stream = createReadStream(file, { start: range.start, end: range.end });
    return new Response(Readable.toWeb(stream), { status: 206, headers });
  }
  headers['content-length'] = String(info.size);
  return new Response(Readable.toWeb(createReadStream(file)), { status: 200, headers });
}


/**
 * The DSH web route is behind the desktop session cookie, and the renderer runs
 * from `dsh-app://app`, where a large video over the custom scheme is not
 * playable (Range requests get dropped). So the plugin also serves the exact
 * same handlers from a loopback HTTP server with a per-process path token.
 *
 * Same implementation, two mounts: nothing about streaming is duplicated here,
 * only the adaptor from a web `Response` to a node `ServerResponse`.
 */
function requestShim(request) {
  const headers = request.headers || {};
  return {
    method: request.method,
    url: request.url,
    headers: { get: (name) => headers[String(name).toLowerCase()] }
  };
}

async function pipeHandler(request, response, handler, url) {
  const result = await handler(requestShim(request), url);
  const headers = {};
  if (result.headers && typeof result.headers.forEach === 'function') {
    result.headers.forEach((value, key) => { headers[key] = value; });
  }
  response.writeHead(result.status || 200, headers);
  if (!result.body) { response.end(); return; }
  Readable.fromWeb(result.body).pipe(response);
}

function startMediaServer() {
  const token = randomBytes(12).toString('hex');
  const prefix = `/${token}`;
  const server = createServer((request, response) => {
    const fail = (status) => { try { response.writeHead(status); response.end(); } catch (error) { /* ignore */ } };
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (!url.pathname.startsWith(prefix)) return fail(403);
      const route = url.pathname.slice(prefix.length);
      const inner = new URL(url.href);
      inner.pathname = route;
      if (route === `${ROUTE_PREFIX}/poster`) {
        pipeHandler(request, response, handlePoster, inner).catch(() => fail(500));
        return undefined;
      }
      if (route === `${ROUTE_PREFIX}/video`) {
        pipeHandler(request, response, handleVideo, inner).catch(() => fail(500));
        return undefined;
      }
      if (route.startsWith(`${ROUTE_PREFIX}/audio/`)) {
        pipeHandler(request, response, handleAudio, inner).catch(() => fail(500));
        return undefined;
      }
      if (route === `${ROUTE_PREFIX}/proxy-file`) {
        const file = inner.searchParams.get('path') || '';
        if (!file.startsWith(PROXY_DIR)) return fail(403);
        pipeHandler(request, response, (req, target) => handleFile(req, target.searchParams.get('path'), 'video/mp4'), inner)
          .catch(() => fail(500));
        return undefined;
      }
      return fail(404);
    } catch (error) {
      return fail(500);
    }
  });
  server.on('error', (error) => console.warn('[skin-studio] media server error', error && error.message));
  // `listen` is async: address() is null until 'listening' fires. Reporting an
  // empty base here is what silently disabled the loopback path in 1.0.12.
  const ready = new Promise((resolve) => {
    const settle = () => resolve();
    server.once('listening', settle);
    server.once('error', settle);
    setTimeout(settle, 1500);
  });
  server.listen(0, '127.0.0.1');
  const port = () => {
    try { return server.address().port; } catch (error) { return 0; }
  };
  return {
    ready: () => ready,
    base: () => (port() ? `http://127.0.0.1:${port()}${prefix}` : ''),
    close: () => { try { server.close(); } catch (error) { /* ignore */ } }
  };
}

// Exposed for the integration test: the media server is the one part that
// cannot be checked by inspecting source.
export const __internals = { startMediaServer, handleVideo, CACHE_DIR, ROUTE_PREFIX };

export function apply(ctx) {
  let webServer;
  try {
    webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : ctx.webServer;
  } catch (error) {
    webServer = undefined;
  }
  if (!webServer || typeof webServer.register !== 'function') {
    console.warn('[skin-studio] webServer service unavailable; video audio helper disabled');
    return;
  }

  const mediaServer = startMediaServer();
  if (typeof ctx.effect === 'function') ctx.effect(() => () => mediaServer.close());

  const resource = async (request) => {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'content-type, range'
          }
        });
      }
      // The plugin posts its own runtime diagnostics here so the state of a
      // silent video can be read from disk instead of asking the user to open
      // a console they do not have. GET returns the last report.
      if (url.pathname === `${ROUTE_PREFIX}/report`) {
        if ((request.method || 'GET').toUpperCase() === 'POST') {
          try {
            const body = await request.text();
            await mkdir(CACHE_DIR, { recursive: true });
            await writeFile(join(CACHE_DIR, 'diag.json'), String(body || '{}').slice(0, 20000), 'utf8');
            return json({ ok: true });
          } catch (error) {
            return json({ ok: false, error: String((error && error.message) || error) }, 500);
          }
        }
        try {
          const text = await readFile(join(CACHE_DIR, 'diag.json'), 'utf8');
          return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
        } catch (error) {
          return json({ ok: false, reason: 'no-report' });
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/origin.js`) {
        // A classic <script> tag cannot hit CORS, cannot be blocked by the
        // dsh-app:// shell and runs before the first render, so the media
        // origin is known synchronously instead of "eventually, maybe".
        const mediaBase = mediaServer.base();
        const host = typeof webServer.getOrigin === 'function' ? webServer.getOrigin() : '';
        const body = 'window.__skinMediaOrigin=' + JSON.stringify(mediaBase) +
          ';window.__skinMediaHost=' + JSON.stringify(host || '') +
          ';window.dispatchEvent(new Event("skin:media-origin"));';
        return new Response(body, {
          headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
      if (url.pathname === `${ROUTE_PREFIX}/ping`) {
        await mediaServer.ready();
        // The renderer may run from the desktop's dsh-app:// shell, where a
        // relative /api/... URL is not a playable media URL. Handing back the
        // real HTTP origin lets the client build absolute src values instead
        // of guessing (and losing playback to NotSupportedError).
        const origin = typeof webServer.getOrigin === 'function' ? webServer.getOrigin() : '';
        return json({
          ok: true,
          service: 'skin-studio-media',
          origin: origin || '',
          media: ROUTE_PREFIX,
          mediaServer: mediaServer.base()
        });
      }
      if (url.pathname === `${ROUTE_PREFIX}/prepare`) {
        let payload = null;
        try {
          payload = await request.json();
        } catch (error) {
          payload = null;
        }
        const source = (payload && typeof payload.path === 'string' && payload.path) ||
          url.searchParams.get('path') || '';
        if (!source || !source.startsWith('/')) return json({ error: 'absolute path required', method: request.method || null }, 400);
        try {
          const result = await ensureAudio(source);
          return json({ ok: true, ...result });
        } catch (error) {
          console.warn('[skin-studio] audio prepare failed', error && error.message);
          return json({ ok: false, error: String((error && error.message) || error) }, 500);
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/pick-folder`) {
        try {
          return json(await pickVideoFolder());
        } catch (error) {
          return json({ ok: false, error: String(error && error.message || error) }, 500);
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/relink`) {
        const name = url.searchParams.get('name') || '';
        const size = Number(url.searchParams.get('size')) || 0;
        try {
          const found = await findOriginalFile(name, size);
          if (!found) return json({ ok: false, reason: 'not-found' });
          return json({ ok: true, ...found });
        } catch (error) {
          return json({ ok: false, reason: 'error', error: String((error && error.message) || error) });
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/pick-many`) {
        try {
          return json(await pickVideos());
        } catch (error) {
          return json({ ok: false, error: String(error && error.message || error) }, 500);
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/pick`) {
        try {
          return json(await pickVideo());
        } catch (error) {
          return json({ ok: false, error: String(error && error.message || error) }, 500);
        }
      }
      if (url.pathname === `${ROUTE_PREFIX}/proxy`) {
        const source = url.searchParams.get('path') || '';
        if (!source || !source.startsWith('/')) return json({ error: 'absolute path required' }, 400);
        try { return json(await proxyInfo(source)); } catch (error) { return json({ error: String(error && error.message || error) }, 500); }
      }
      if (url.pathname === `${ROUTE_PREFIX}/proxy-file`) {
        const file = url.searchParams.get('path') || '';
        if (!file || !file.startsWith(PROXY_DIR)) return new Response('Forbidden', { status: 403 });
        return await handleFile(request, file, 'video/mp4');
      }
      if (url.pathname === `${ROUTE_PREFIX}/poster`) {
        return await handlePoster(request, url);
      }
      if (url.pathname === `${ROUTE_PREFIX}/video`) {
        return await handleVideo(request, url);
      }
      if (url.pathname.startsWith(`${ROUTE_PREFIX}/audio/`)) {
        return await handleAudio(request, url);
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.warn('[skin-studio] media route error', error && error.stack);
      return new Response('Internal error', { status: 500 });
    }
  };

  try {
    const dispose = webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, resource });
    if (typeof ctx.effect === 'function') ctx.effect(() => dispose);
    const origin = typeof webServer.getOrigin === 'function' ? webServer.getOrigin() : '';
    if (origin && typeof webServer.tapIndex === 'function') {
      const tap = webServer.tapIndex((html) => {
        const boot = `<script>window.__skinMediaOrigin=${JSON.stringify(origin)}</script>`;
        return String(html).includes('</head>') ? String(html).replace('</head>', boot + '</head>') : boot + String(html);
      });
      if (typeof ctx.effect === 'function') ctx.effect(() => tap);
    }
    console.log('[skin-studio] media route registered at', ROUTE_PREFIX, origin);
  } catch (error) {
    console.warn('[skin-studio] media route registration failed', error && error.message);
  }
}
