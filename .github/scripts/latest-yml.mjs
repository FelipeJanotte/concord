import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSET_NAME = /^[A-Za-z0-9._-]+$/

export function latestYml({ version, fileName, sha512, size, releaseDate }) {
  if (!ASSET_NAME.test(fileName)) throw new Error(`nome de arquivo inválido para o release: ${fileName}`)
  if (!Number.isInteger(size) || size <= 0) throw new Error(`tamanho inválido: ${size}`)
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    ''
  ].join('\n')
}

function runFromCommandLine() {
  const [installerPath, version] = process.argv.slice(2)
  const bytes = readFileSync(installerPath)
  process.stdout.write(
    latestYml({
      version,
      fileName: basename(installerPath),
      sha512: createHash('sha512').update(bytes).digest('base64'),
      size: bytes.length,
      releaseDate: new Date().toISOString()
    })
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runFromCommandLine()
