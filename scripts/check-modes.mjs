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
  /html\[data-dsh-skin-mode="pure"\] body > :not\(\.dsh-skin-video-layer\)\{display:none !important;\}/.test(source),
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
    /wanted === MODE_PURE && lock !== MODE_PURE && isTextEntryFocused\(\)/.test(source),
  'the shortcut can black out the screen while the caret is in the input box'
)

// 7. The lock has to survive a reload, otherwise "locked" is a lie.
const persisted = source.slice(source.indexOf('function pickPersisted'), source.indexOf('function noticeText'))
expect(
  'modeLock and modeKeys are persisted',
  /modeLock: state\.modeLock/.test(persisted) && /modeKeys: \{/.test(persisted),
  'pickPersisted drops the lock on save'
)

if (failures.length) {
  process.stdout.write(`\n${failures.length} wiring check(s) failed\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\nmode wiring ok — ${used.size} strings checked\n`)
}
