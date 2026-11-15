import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SKIP_LABEL = 'sem release'
export const MINOR_LABEL = 'release: minor'
export const MAJOR_LABEL = 'release: major'

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/

export function parseVersion(text) {
  const match = SEMVER.exec(String(text).trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export function nextVersion({ tags, packageVersion, labels = [] }) {
  const names = labels.map((label) => label.trim().toLowerCase())
  if (names.includes(SKIP_LABEL)) return null
  const pkg = parseVersion(packageVersion)
  if (!pkg) throw new Error(`versão inválida no package.json: ${packageVersion}`)
  const released = tags.map(parseVersion).filter(Boolean).sort(compareVersions)
  const latest = released[released.length - 1]
  if (!latest) return bump(pkg, names).join('.')
  if (compareVersions(pkg, latest) > 0) return pkg.join('.')
  return bump(latest, names).join('.')
}

function bump([major, minor, patch], names) {
  if (names.includes(MAJOR_LABEL)) return [major + 1, 0, 0]
  if (names.includes(MINOR_LABEL)) return [major, minor + 1, 0]
  return [major, minor, patch + 1]
}

function runFromCommandLine() {
  const labels = (process.argv[2] ?? '').split(',').filter(Boolean)
  const tags = execSync('git tag -l "v*"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
  const version = nextVersion({ tags, packageVersion, labels })
  if (version) process.stdout.write(version)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runFromCommandLine()
