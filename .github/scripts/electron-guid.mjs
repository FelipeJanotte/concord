import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ELECTRON_BUILDER_NAMESPACE = '50e065bc-3134-11e6-9bab-38c9862bdaf3'

function toBytes(uuid) {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex')
}

export function uuidV5(name, namespace) {
  const digest = createHash('sha1').update(toBytes(namespace)).update(name, 'utf8').digest().subarray(0, 16)
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = digest.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

export function electronAppGuid(appId) {
  return uuidV5(appId, ELECTRON_BUILDER_NAMESPACE)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write(electronAppGuid(process.argv[2]))
