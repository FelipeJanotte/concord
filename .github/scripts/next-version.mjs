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
  const names = normalize(labels)
  if (names.includes(SKIP_LABEL)) return null
  const pkg = parseVersion(packageVersion)
  if (!pkg) throw new Error(`versão inválida no package.json: ${packageVersion}`)
  const released = tags.map(parseVersion).filter(Boolean).sort(compareVersions)
  const latest = released[released.length - 1]
  if (!latest) return bump(pkg, names).join('.')
  if (compareVersions(pkg, latest) > 0) return pkg.join('.')
  return bump(latest, names).join('.')
}

export function prVersion({ tags, mainVersion, labels = [] }) {
  const names = normalize(labels)
  const main = parseVersion(mainVersion)
  if (!main) throw new Error(`versão inválida no package.json da main: ${mainVersion}`)
  const base = [main, ...tags.map(parseVersion).filter(Boolean)].sort(compareVersions).pop()
  if (names.includes(SKIP_LABEL)) return base.join('.')
  return bump(base, names).join('.')
}

function normalize(labels) {
  return labels.map((label) => label.trim().toLowerCase())
}

function bump([major, minor, patch], names) {
  if (names.includes(MAJOR_LABEL)) return [major + 1, 0, 0]
  if (names.includes(MINOR_LABEL)) return [major, minor + 1, 0]
  return [major, minor, patch + 1]
}

function readVersion(json) {
  return JSON.parse(json).version
}

function runFromCommandLine() {
  const prMode = process.argv[2] === 'pr'
  const labels = (process.argv[prMode ? 3 : 2] ?? '').split(',').filter(Boolean)
  const tags = execSync('git tag -l "v*"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  const version = prMode
    ? prVersion({ tags, mainVersion: readVersion(execSync('git show origin/main:package.json', { encoding: 'utf8' })), labels })
    : nextVersion({ tags, packageVersion: readVersion(readFileSync('package.json', 'utf8')), labels })
  if (version) process.stdout.write(version)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runFromCommandLine()
