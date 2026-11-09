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
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const ROUTE_PREFIX = '/api/skin-studio/media';
const CACHE_DIR = join(tmpdir(), 'dsh-skin-studio-audio');
const PROXY_DIR = join(tmpdir(), 'dsh-skin-studio-proxy');
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
  if (SUPPORTED_AUDIO.has(codec)) return { codec, url: '', file: 'file://' + encodeURI(source), reason: 'supported' };
  const key = createHash('sha1')
    .update(`${source}:${info.size}:${info.mtimeMs}:${codec}:aac192`)
    .digest('hex')
    .slice(0, 20);
  const output = join(CACHE_DIR, `${key}.m4a`);
  try {
    const existing = await stat(output);
    if (existing.isFile() && existing.size > 1024) {
      return { codec, url: `${ROUTE_PREFIX}/audio/${basename(output)}`, file: 'file://' + encodeURI(output), reason: 'cached' };
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
  return { codec, url: `${ROUTE_PREFIX}/audio/${basename(output)}`, file: 'file://' + encodeURI(output), reason: 'transcoded' };
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

async function pickVideo() {
  const script = 'POSIX path of (choose file with prompt "选择视频壁纸" of type {"public.movie"})';
  try {
    const result = await run('osascript', ['-e', script]);
    const source = (result.stdout || '').trim();
    if (!source) return { ok: false, canceled: true };
    const info = await stat(source);
    return { ok: true, path: source, name: basename(source), size: info.size };
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
        if (!/\.(mp4|m4v|webm|mov|mkv|avi|mpg|mpeg|ts|m2ts|ogv|ogg|wmv|flv|3gp)$/i.test(entry.name)) continue;
        const info = await stat(full);
        files.push({ path: full, name: entry.name, size: info.size });
      }
    };
    await walk(folder);
    return { ok: true, folder, files };
  } catch (error) {
    if (/User canceled|-128/i.test(String(error && error.message || ''))) return { ok: false, canceled: true };
    throw error;
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
      if (url.pathname === `${ROUTE_PREFIX}/ping`) {
        return json({ ok: true, service: 'skin-studio-media' });
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
