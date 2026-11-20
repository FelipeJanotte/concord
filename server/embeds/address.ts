import { BlockList, isIPv4, isIPv6 } from 'node:net'

const blockedV4 = new BlockList()
const blockedV6 = new BlockList()

const IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

const IPV6_RANGES: Array<[string, number]> = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8]
]

for (const [net, prefix] of IPV4_RANGES) blockedV4.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of IPV6_RANGES) blockedV6.addSubnet(net, prefix, 'ipv6')

const MAPPED_DOTTED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

function mappedIPv4(ip: string): string | null {
  const dotted = MAPPED_DOTTED.exec(ip)
  if (dotted) return dotted[1]
  const hex = MAPPED_HEX.exec(ip)
  if (!hex) return null
  const high = parseInt(hex[1], 16)
  const low = parseInt(hex[2], 16)
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

export function isPublicAddress(ip: string): boolean {
  if (isIPv4(ip)) return !blockedV4.check(ip, 'ipv4')
  if (!isIPv6(ip)) return false
  const mapped = mappedIPv4(ip)
  if (mapped) return isIPv4(mapped) && !blockedV4.check(mapped, 'ipv4')
  return !blockedV6.check(ip, 'ipv6')
}
