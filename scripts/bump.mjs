// Bump the version in every place it is written, in one shot.
//
// Doing this by hand is how releases half-ship: package.json goes to 1.0.7 while
// the settings panel still says 1.0.6, and the next person cannot tell which
// code is actually running.
//
//   npm run bump -- 1.0.7
//
// Then fill in the CHANGELOG section it creates, run `npm run verify`, commit.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[3] || '.')
const next = process.argv[2]
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const write = (file, text) => fs.writeFileSync(path.join(root, file), text)

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  process.stderr.write('usage: npm run bump -- <major.minor.patch>\n')
  process.exit(1)
}

const now = new Date()
const pad = (value) => String(value).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
const day = stamp.slice(0, 10)

const pkgText = read('package.json')
const pkg = JSON.parse(pkgText)
const previous = pkg.version
pkg.version = next
write('package.json', JSON.stringify(pkg, null, 2) + '\n')

let client = read('client.js')
client = client.replace(/(PLUGIN_VERSION\s*=\s*')[\d.]+(')/, `$1${next}$2`)
client = client.replace(/(BUILD\s*=\s*')[^']+(')/, `$1${stamp}$2`)
write('client.js', client)

let readme = read('README.md')
readme = readme.replace(/(badge\/version-)[\d.]+(-)/, `$1${next}$2`)
write('README.md', readme)

let changelog = read('CHANGELOG.md')
const heading = `## ${next} — ${day}\n\n- \n\n`
if (changelog.includes(`## ${next} —`)) {
  process.stdout.write(`changelog already has ${next}, left untouched\n`)
} else {
  changelog = changelog.replace(/# Changelog\n\n/, `# Changelog\n\n${heading}`)
  write('CHANGELOG.md', changelog)
}

process.stdout.write(`bumped ${previous} -> ${next} · build ${stamp}\n`)
process.stdout.write('next: fill the CHANGELOG section, run `npm run verify`, commit\n')
