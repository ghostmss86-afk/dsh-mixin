#!/usr/bin/env node
/**
 * Host-half wiring check.
 *
 * 1.0.15 shipped with `apply()` returning early because it looked for a
 * `webServer` service that the Host no longer exposes. Nothing threw, nothing
 * logged, the settings page still rendered — and every route (/pick, /poster,
 * /video, /report) answered 404. The symptom the user saw was "none of it is
 * implemented", which is indistinguishable from "the code was never written".
 *
 * So: mount `index.js` against a stub Host context and assert that it actually
 * registers what the client calls, and that the loopback media server answers.
 * A plugin whose `apply()` returns without registering anything now fails CI.
 */
import { apply, __internals } from '../index.js';

const REQUIRED = [
  '/ping',
  '/origin.js',
  '/prepare',
  '/pick',
  '/pick-many',
  '/pick-folder',
  '/relink',
  '/proxy',
  '/video',
  '/poster',
  '/report'
];

const registered = new Map();
const effects = [];

const scope = {
  connection: {
    fetch: {
      register(options) {
        registered.set(options.path, options);
        return () => registered.delete(options.path);
      }
    }
  },
  effect(factory) {
    effects.push(factory);
    const dispose = factory();
    return typeof dispose === 'function' ? dispose : () => {};
  }
};

const ctx = {
  inject(_deps, callback) {
    callback(scope);
  },
  effect(factory) {
    effects.push(factory);
    const dispose = factory();
    return typeof dispose === 'function' ? dispose : () => {};
  }
};

const failures = [];
const reset = () => {
  for (const [path, options] of registered) {
    if (!options || typeof options.fetch !== 'function') failures.push(`${path} has no fetch handler`);
  }
};

apply(ctx);
reset();

for (const suffix of REQUIRED) {
  const path = `${__internals.ROUTE_PREFIX}${suffix}`;
  if (!registered.has(path)) failures.push(`route not registered: ${path}`);
}

// The client calls these with POST + JSON body; without `buffered` the Host
// hands over a stream and `request.json()` throws.
const report = registered.get(`${__internals.ROUTE_PREFIX}/report`);
if (report && report.requestBody !== 'buffered') {
  failures.push('/report must declare requestBody: "buffered"');
}

// The loopback server is the only path that can stream a multi-GB video with
// Range support; if it is not listening, playback is dead even with routes.
const server = __internals.startMediaServer();
await server.ready();
const base = server.base();
if (!/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{24}$/.test(base)) {
  failures.push(`media server base looks wrong: "${base}"`);
} else {
  const response = await fetch(`${base}${__internals.ROUTE_PREFIX}/ping`, { method: 'GET' });
  if (response.status !== 404) {
    // /ping is not a data-plane route; 404 here is the expected answer and
    // proves the token prefix is enforced.
    failures.push(`media server answered /ping with ${response.status} (expected 404)`);
  }
  const wrong = await fetch(`${base.replace(/[0-9a-f]{24}$/, '0'.repeat(24))}${__internals.ROUTE_PREFIX}/video?path=/tmp/x.mp4`);
  if (wrong.status !== 403) failures.push(`bad media token was not rejected (${wrong.status})`);
}
server.close();

if (effects.length === 0) failures.push('apply() registered no effects at all');

if (failures.length) {
  console.error('host wiring FAILED');
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}

console.log(`host wiring ok — ${registered.size} routes, media server ${base ? 'up' : 'down'}`);
// The stub Host keeps sockets alive; exit explicitly so `npm run check` ends.
process.exit(0);
