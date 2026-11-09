// Version single-source check.
//
// The version lives in four places and they drift silently: package.json feeds
// npm, client.js shows it in the settings panel, CHANGELOG is what users read,
// README carries the badge. A half-bumped release looks fine in every one of
// them individually.
//
// This is also the cheap defense against "the interface went backwards":
// a stale build string is the first symptom of running old code.
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || '.'
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const failures = []
const check = (name, ok, detail) => {
  if (ok) process.stdout.write(`  ok   ${name}\n`)
  else {
    failures.push(`${name}: ${detail}`)
    process.stdout.write(`  FAIL ${name} — ${detail}\n`)
  }
}

const pkg = JSON.parse(read('package.json'))
const client = read('client.js')
const changelog = read('CHANGELOG.md')
const readme = read('README.md')

const pkgVersion = pkg.version
const clientVersion = (client.match(/PLUGIN_VERSION\s*=\s*'([^']+)'/) || [])[1]
const build = (client.match(/BUILD\s*=\s*'([^']+)'/) || [])[1]
const changelogVersion = (changelog.match(/^##\s+(\d+\.\d+\.\d+)/m) || [])[1]
const badgeVersion = (readme.match(/badge\/version-(\d+\.\d+\.\d+)-/) || [])[1]

check('package.json has a version', Boolean(pkgVersion), 'missing version field')
check('client.js declares PLUGIN_VERSION', Boolean(clientVersion), 'PLUGIN_VERSION not found')
check(
  'package.json matches client.js',
  pkgVersion === clientVersion,
  `package.json ${pkgVersion} vs client.js ${clientVersion} — the panel would show a version npm never published`
)
check(
  'CHANGELOG top entry matches package.json',
  changelogVersion === pkgVersion,
  `CHANGELOG ${changelogVersion} vs package.json ${pkgVersion}`
)
check(
  'README badge matches package.json',
  badgeVersion === pkgVersion,
  `badge ${badgeVersion} vs package.json ${pkgVersion}`
)
check(
  'BUILD is an ISO minute stamp',
  Boolean(build) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(build),
  `BUILD ${build} should look like 2026-11-09T20:30 — it is what tells a user which code is actually loaded`
)
check(
  'BUILD is not older than the newest changelog date',
  (() => {
    const date = (changelog.match(/^##\s+\d+\.\d+\.\d+\s+—\s+(\d{4}-\d{2}-\d{2})/m) || [])[1]
    if (!build || !date) return false
    return build.slice(0, 10) >= date
  })(),
  'the build stamp predates the release it belongs to — bump it with `npm run bump`'
)

if (failures.length) {
  process.stdout.write(`\n${failures.length} version check(s) failed\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\nversion ${pkgVersion} · build ${build} — consistent in 4 places\n`)
}
