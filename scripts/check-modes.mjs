// Wiring check for the display-mode feature (1.0.6).
//
// This exists because of a real failure mode in this plugin: a feature ships
// with its strings, its CSS and its handler all present, but one of them is
// never actually mounted — so the UI looks done and does nothing. Static
// syntax checks cannot see that, and the media guard does not cover it.
//
// It is deliberately text-level: no bundler, no DOM, no dependencies.
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || '.'
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8')

const failures = []
const ok = (name) => process.stdout.write(`  ok   ${name}\n`)
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`)
  process.stdout.write(`  FAIL ${name} — ${detail}\n`)
}

function expect(name, condition, detail) {
  if (condition) ok(name)
  else fail(name, detail)
}

// 1. The pure-mode rule must keep the wallpaper layer alive. Hiding it would
//    leave a black screen with no way to tell playback is running.
expect(
  'pure mode keeps the video layer',
  /html\[data-dsh-skin-mode="pure"\] body > :not\(\.dsh-skin-video-layer\)[^{]*\{display:none !important;\}/.test(source),
  'the body-child rule must exclude .dsh-skin-video-layer'
)

// 2. Both halves of the lock: the attribute writer and the CSS selector.
expect(
  'attribute is written on lock',
  /setAttribute\('data-dsh-skin-mode', 'pure'\)/.test(source),
  'ModeController never sets the attribute'
)
expect(
  'attribute is cleared on unlock',
  /removeAttribute\('data-dsh-skin-mode'\)/.test(source),
  'ModeController never clears the attribute'
)

// 3. Mounted, not merely defined.
const overlay = source.slice(source.indexOf('function OverlayEntry'))
expect(
  'ModeController is mounted in OverlayEntry',
  /h\(ModeController, \{ key: 'mode' \}\)/.test(overlay),
  'the controller is defined but not rendered'
)
const settings = source.slice(source.indexOf('function SettingsPage'), source.indexOf('function QuickPanel'))
expect(
  'ModeSection is mounted in SettingsPage',
  /h\(ModeSection, \{ key: 'modes' \}\)/.test(settings),
  'the settings section is defined but never rendered'
)

// 4. Recorder flag: without it the global handler eats the combination the
//    user is trying to record.
expect(
  'recorder suppresses global hotkeys',
  /modeRecording\.current = true/.test(source) && /if \(modeRecording\.current\) return;/.test(source),
  'recording state is not shared with ModeController'
)

// 5. Every mode string used in code must exist in both locale tables.
const used = new Set()
for (const match of source.matchAll(/\bt\('((?:mode|section\.modes|notice\.mode)[^']*)'\)/g)) used.add(match[1])
for (const match of source.matchAll(/setError\('([^']+)'\)/g)) used.add(match[1])
for (const match of source.matchAll(/'(notice\.mode[A-Za-z]+)'/g)) used.add(match[1])

const enBlock = source.slice(source.indexOf('EN_TEXT'), source.indexOf('ZH_TEXT'))
const zhBlock = source.slice(source.indexOf('ZH_TEXT'))
const missing = []
for (const key of used) {
  const needle = `'${key}':`
  if (!enBlock.includes(needle)) missing.push(`en:${key}`)
  if (!zhBlock.includes(needle)) missing.push(`zh:${key}`)
}
expect(
  'every mode string exists in en and zh',
  missing.length === 0 && used.size > 0,
  missing.length ? `missing ${missing.join(', ')}` : 'no mode strings found — the scan is broken'
)

// 6. Typing wins over the hotkey. Entering pure mode while the caret is in the
//    composer would hide the conversation the user is reading; leaving it must
//    stay allowed, or the guard itself becomes a trap.
expect(
  'typing blocks entry into pure mode',
  /function isTextEntryFocused\(\)/.test(source) &&
    /caretInTextField\(event\)/.test(source) && /pure:auto-exit/.test(source),
  'the shortcut can black out the screen while the caret is in the input box'
)

// 6b. The interface may fade out after idle — but only after a long, explicit
//     delay and never while the caret is in a text field. The 5s version made
//     people think the app was closing itself.
expect(
  'cinema auto-hide waits 23s and yields to typing',
  /const CINEMA_IDLE_MS = 23000;/.test(source) &&
    /cinemaAutoHide: state\.cinemaAutoHide !== false,/.test(source) &&
    /if \(!document\.body \|\| isTextEntryFocused\(\)\) return;/.test(source) &&
    /document\.addEventListener\('focusin', onFocus, true\)/.test(source),
  'the idle timer is short, off by default, or ignores focused inputs'
)

// 6c. A refused autoplay must fall back to muted playback, not leave a frozen
//     first frame; the first gesture is what restores the sound.
expect(
  'refused autoplay falls back to muted playback',
  /error\.name !== 'NotAllowedError'\) return;/.test(source) &&
    /autoMutedRef\.current = true/.test(source) &&
    /autoMutedRef\.current && !current\.videoMuted/.test(source),
  'a blocked autoplay leaves the video paused with no fallback'
)

// 6d. Pure mode hides every control, so entering it must announce the exit.
expect(
  'pure mode announces its exit affordance',
  /dsh-skin-pure-hint/.test(source) && /mode\.pureHint/.test(source),
  'entering pure mode gives no visible way back'
)

// 7. The lock has to survive a reload, otherwise "locked" is a lie.
const persisted = source.slice(source.indexOf('function pickPersisted'), source.indexOf('function noticeText'))
expect(
  'modeLock and modeKeys are persisted',
  /modeLock: state\.modeLock/.test(persisted) && /modeKeys: \{/.test(persisted),
  'pickPersisted drops the lock on save'
)

// 8. With a wallpaper on, the chat column is transparent enough that the
//    composer is easy to lose; the halo is the only cue that the pointer is
//    actually over the input.
expect(
  'the composer lights up under the pointer',
  /\[data-composer-card\]:hover/.test(source) &&
    /\[data-composer-card\]:focus-within/.test(source) &&
    /0 0 50px 18px/.test(source),
  'the halo is the only cue that the pointer sits on the input'
)

// 9. The halo and the whale must take the colour the user picked in 皮肤,
//    not a hard-coded blue.
expect(
  'the halo and the whale follow the accent',
  /--dsh-skin-accent/.test(source) &&
    /color:var\(--dsh-skin-accent,#4d6bfe\)/.test(source) &&
    /color-mix\(in srgb,var\(--dsh-skin-accent,#4d6bfe\) 44%,transparent\)/.test(source),
  'both read --dsh-skin-accent with the old blue only as a fallback'
)

// 10. The audio sidecar needs a route the Host actually registers. The Host
//     matches exact paths, so `/audio/<hash>.m4a` 404'd and left the <video>
//     muted on an E-AC-3 track -- picture, no sound. The URL now carries the
//     file in a query string, and stored legacy URLs are refused so the client
//     asks for a fresh one.
const host = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
expect(
  'the sidecar audio has a registered route',
  host.includes("['/audio', ['GET', 'HEAD', 'OPTIONS']]") &&
    host.includes('/audio?file=') &&
    host.includes('sidecarUrl(output)'),
  'the host must serve the sidecar from an exact path it registered'
)
expect(
  'a 404 sidecar cannot keep the video muted',
  source.includes('/api\\/skin-studio\\/media\\/audio\\/') && source.includes('[?&]file='),
  'usableAudioUrl must reject the legacy path form so prepare runs again'
)

if (failures.length) {
  process.stdout.write(`\n${failures.length} wiring check(s) failed\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\nmode wiring ok — ${used.size} strings checked\n`)
}
