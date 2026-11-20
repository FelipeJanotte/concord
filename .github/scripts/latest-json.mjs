import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ASSET_NAME = /^[A-Za-z0-9._-]+$/

export function latestJson({ version, fileName, signature, repository, notes, publishedAt }) {
  if (!ASSET_NAME.test(fileName)) throw new Error(`nome de arquivo inválido para o release: ${fileName}`)
  const manifest = {
    version,
    notes,
    pub_date: publishedAt,
    platforms: {
      'windows-x86_64': {
        signature: signature.trim(),
        url: `https://github.com/${repository}/releases/download/v${version}/${fileName}`
      }
    }
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function runFromCommandLine() {
  const [version, fileName, signaturePath, repository, notes] = process.argv.slice(2)
  process.stdout.write(
    latestJson({
      version,
      fileName,
      signature: readFileSync(signaturePath, 'utf8'),
      repository,
      notes,
      publishedAt: new Date().toISOString()
    })
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runFromCommandLine()
