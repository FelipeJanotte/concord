// Próxima versão a publicar quando um PR entra na main (workflow auto-release.yml).
//
// - Base: a maior tag vX.Y.Z do repositório. Sem tag nenhuma, a versão do package.json.
// - Sobe o patch por padrão; label "release: minor" sobe o minor, "release: major" sobe o major.
// - Label "sem release": não publica nada.
// - Se o package.json tiver uma versão MAIOR que a última tag (alguém subiu à mão, ex.: 1.0.0), publica
//   exatamente essa versão.
//
// Uso no workflow: node .github/scripts/next-version.mjs "label 1,label 2"  → imprime a versão (ou nada).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SKIP_LABEL = 'sem release'
export const MINOR_LABEL = 'release: minor'
export const MAJOR_LABEL = 'release: major'

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/

/** "1.2.3" ou "v1.2.3" → [1, 2, 3]; outra coisa → null. */
export function parseVersion(text) {
  const m = SEMVER.exec(String(text).trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/**
 * @param {{ tags: string[], packageVersion: string, labels?: string[] }} input
 * @returns {string | null} versão sem o "v", ou null quando não deve publicar
 */
export function nextVersion({ tags, packageVersion, labels = [] }) {
  const names = labels.map((l) => l.trim().toLowerCase())
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

// Linha de comando (no workflow): lê as tags do git e a versão do package.json.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const labels = (process.argv[2] ?? '').split(',').filter(Boolean)
  const tags = execSync('git tag -l "v*"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
  const version = nextVersion({ tags, packageVersion, labels })
  if (version) process.stdout.write(version)
}
