import { describe, expect, it } from 'vitest'
import { isPublicAddress } from './address'

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '142.250.78.14', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'])(
    'aceita o endereço público %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true)
    }
  )

  it.each([
    ['0.0.0.0', 'rede "esta"'],
    ['10.1.2.3', 'privado 10/8'],
    ['172.16.0.1', 'privado 172.16/12'],
    ['172.31.255.255', 'fim do 172.16/12'],
    ['192.168.0.10', 'privado 192.168/16'],
    ['127.0.0.1', 'loopback'],
    ['127.255.0.9', 'loopback inteiro'],
    ['169.254.169.254', 'link-local (metadados da nuvem)'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.254', 'fim do CGNAT'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reservado'],
    ['255.255.255.255', 'broadcast'],
    ['192.0.0.8', 'IETF'],
    ['192.0.2.1', 'documentação'],
    ['198.18.0.1', 'benchmark'],
    ['::', 'IPv6 não especificado'],
    ['::1', 'loopback IPv6'],
    ['fe80::1', 'link-local IPv6'],
    ['fc00::1', 'ULA'],
    ['fd12:3456::1', 'ULA'],
    ['ff02::1', 'multicast IPv6'],
    ['::ffff:127.0.0.1', 'IPv4 mapeado (loopback)'],
    ['::ffff:7f00:1', 'IPv4 mapeado em hexadecimal'],
    ['0:0:0:0:0:ffff:7f00:1', 'IPv4 mapeado por extenso'],
    ['::ffff:10.0.0.1', 'IPv4 mapeado (privado)'],
    ['::ffff:169.254.169.254', 'IPv4 mapeado (link-local)'],
    ['64:ff9b::7f00:1', 'NAT64'],
    ['2002:7f00:1::', '6to4'],
    ['2001:db8::1', 'documentação IPv6'],
    ['::127.0.0.1', 'IPv4 compatível'],
    ['', 'vazio'],
    ['localhost', 'nome, não endereço'],
    ['999.1.1.1', 'inválido']
  ])('recusa %s (%s)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })
})
