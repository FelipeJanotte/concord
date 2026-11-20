// Hospedagem (A14): a configuração de produção é coerente entre si (compose, LiveKit, Caddy, imagem,
// .env de exemplo) e com o que o servidor lê. Não sobe Docker: confere os arquivos.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readLiveKitConfig } from './livekit'

const root = join(__dirname, '..')
const read = (file: string): string => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')

const compose = read('docker-compose.prod.yml')
const devCompose = read('docker-compose.yml')
const livekit = read('deploy/livekit.yaml')
const caddy = read('deploy/Caddyfile')
const dockerfile = read('Dockerfile')
const dockerignore = read('.dockerignore')
const envExample = read('deploy/.env.example')
const initScript = read('deploy/postgres/02-app-role.sh')

/** Variáveis `${NOME...}` que o compose lê do .env. */
const composeVars = [...new Set([...compose.matchAll(/\$\{([A-Z_]+)[:?}-]/g)].map((m) => m[1]))]
/** Variáveis definidas no .env de exemplo. */
const exampleVars = [...envExample.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1])

describe('docker-compose.prod.yml', () => {
  it('tem os serviços: servidor, banco, backup, LiveKit e Caddy', () => {
    for (const service of ['server', 'postgres', 'pg-backup', 'livekit', 'caddy']) expect(compose).toMatch(new RegExp(`^  ${service}:$`, 'm'))
  })

  it('toda variável que o compose lê está no .env de exemplo', () => {
    expect(composeVars.length).toBeGreaterThan(5)
    for (const name of composeVars) expect(exampleVars, name).toContain(name)
  })

  it('obrigatórias falham com mensagem clara; Google é opcional', () => {
    for (const name of ['POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'FILES_SIGNING_SECRET', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'CONCORD_DOMAIN', 'LIVEKIT_DOMAIN']) {
      expect(compose).toContain(`\${${name}:?defina ${name} no .env}`)
    }
    expect(compose).toContain('${GOOGLE_CLIENT_ID:-}')
  })

  it('o Postgres não fica exposto; só o Caddy (80/443) e a mídia do LiveKit', () => {
    const published = [...compose.matchAll(/- '(\d+):(\d+)(\/udp)?'/g)].map((m) => `${m[1]}${m[3] ?? ''}`)
    expect(published.sort()).toEqual(['3478/udp', '443', '7881', '7882/udp', '80'].sort())
  })

  it('servidor atrás de proxy, com usuário de privilégio mínimo e as migrations como dono', () => {
    expect(compose).toContain("TRUST_PROXY: '1'")
    expect(compose).toMatch(/DATABASE_URL: postgres:\/\/concord_app:/)
    expect(compose).toMatch(/DATABASE_MIGRATE_URL: postgres:\/\/concord:/)
  })

  it('a mesma versão do LiveKit do desenvolvimento', () => {
    const version = (text: string) => /livekit\/livekit-server:(v[\d.]+)/.exec(text)?.[1]
    expect(version(compose)).toBe(version(devCompose))
  })

  it('o servidor aceita os endereços do LiveKit do compose (wss pelo domínio, API por dentro)', () => {
    const cfg = readLiveKitConfig({ LIVEKIT_URL: 'wss://voz.exemplo.com.br', LIVEKIT_API_URL: 'http://livekit:7880', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's'.repeat(32) })
    expect(cfg).toMatchObject({ url: 'wss://voz.exemplo.com.br', apiUrl: 'http://livekit:7880' })
    expect(compose).toContain('LIVEKIT_URL: wss://${LIVEKIT_DOMAIN')
    expect(compose).toContain('LIVEKIT_API_URL: http://livekit:7880')
  })
})

describe('LiveKit, Caddy, imagem e banco', () => {
  it('as portas do livekit.yaml batem com as publicadas e o TURN está ligado', () => {
    expect(livekit).toMatch(/tcp_port: 7881/)
    expect(livekit).toMatch(/udp_port: 7882/)
    expect(livekit).toMatch(/turn:\n {2}enabled: true\n {2}udp_port: 3478/)
    expect(livekit).toMatch(/use_external_ip: true/)
    // a chave não fica no arquivo: vem do LIVEKIT_KEYS
    expect(livekit).not.toMatch(/^keys:/m)
    expect(compose).toContain('LIVEKIT_KEYS:')
  })

  it('o Caddy serve os dois domínios para o servidor e o LiveKit', () => {
    expect(caddy).toMatch(/\{\$CONCORD_DOMAIN\} \{[\s\S]*reverse_proxy server:3001/)
    expect(caddy).toMatch(/\{\$LIVEKIT_DOMAIN\} \{[\s\S]*reverse_proxy livekit:7880/)
  })

  it('a imagem leva só o servidor e o contrato, roda sem root e não leva segredos', () => {
    expect(dockerfile).toContain('COPY server ./server')
    expect(dockerfile).toContain('COPY src/shared ./src/shared')
    expect(dockerfile).toContain('USER node')
    expect(dockerfile).toContain('CMD ["npx", "tsx", "server/index.ts"]')
    for (const ignored of ['server/.env', 'server/data', 'node_modules', 'src/renderer']) expect(dockerignore.split('\n')).toContain(ignored)
  })

  it('o script do banco cria o concord_app com a senha do .env', () => {
    expect(initScript).toContain("CREATE ROLE concord_app LOGIN PASSWORD '${APP_DB_PASSWORD}'")
    expect(initScript).toContain('ALTER DEFAULT PRIVILEGES')
  })
})

describe('vercel.json (versão web do app)', () => {
  const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>
  const viteConfig = read('vite.config.ts')

  it('gera o renderer com o Vite e publica out/renderer', () => {
    expect(vercel.buildCommand).toBe('npx vite build')
    expect(vercel.outputDirectory).toBe('out/renderer')
    expect(viteConfig).toContain("outDir: resolve(__dirname, 'out/renderer')")
    expect(viteConfig).toContain("index: resolve(__dirname, 'src/renderer/index.html')")
  })
})

describe('tauri.conf.json (instalador)', () => {
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json')) as { build: Record<string, string> }

  it('o instalador embute o renderer que o Vite gera e a Vercel publica', () => {
    expect(tauri.build.frontendDist).toBe('../out/renderer')
    expect(tauri.build.beforeBuildCommand).toBe('vite build')
  })
})
