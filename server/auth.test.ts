/**
 * Regras de conta (server/auth.ts). Servem também de rede de segurança para a
 * refatoração da F0-A: o comportamento observável aqui não pode mudar.
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Roda antes dos imports: db.ts lê DATA_DIR e auth.ts lê GOOGLE_CLIENT_ID ao carregar.
const env = await vi.hoisted(async () => {
  // vi.hoisted roda antes dos imports estáticos, então importa o que precisa por conta própria.
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dataDir = mkdtempSync(join(tmpdir(), 'concord-auth-test-'))
  process.env.DATA_DIR = dataDir
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  return { dataDir }
})

// Persistência desligada: os testes trabalham só no objeto `db` em memória.
vi.mock('./db', async (importOriginal) => ({ ...(await importOriginal<typeof import('./db')>()), save: vi.fn() }))

import type { AuthResult, ProfileUpdate, ProfileUpdateResult } from '../src/shared/types'
import { accountFromToken, findAccount, googleLogin, login, register, revokeSession, updateProfile } from './auth'
import { AVATAR_DIR, db } from './db'
import type { Account } from './repo/types'

/** O registro salvo da conta (o repo devolve cópias; aqui olhamos o que ficou gravado). */
function stored(id: string): Account {
  const account = db.accounts.find((a) => a.id === id)
  if (!account) throw new Error(`conta ${id} não existe`)
  return account
}

/** Como o servidor faz: busca a conta atual e aplica a alteração. */
async function update(id: string, payload: Partial<ProfileUpdate>): Promise<ProfileUpdateResult> {
  return updateProfile((await findAccount(id))!, payload)
}

let seq = 0
const unique = (): string => (++seq).toString(36)

function newAccount(overrides: Record<string, unknown> = {}): Promise<AuthResult> {
  const n = unique()
  return register({ email: `pessoa${n}@exemplo.test`, password: 'senha-segura', name: 'Pessoa Teste', tag: `t${n}`, ...overrides })
}

function ok<T extends AuthResult | ProfileUpdateResult>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio erro: ${r.error}`)
  return r as Extract<T, { ok: true }>
}

function errorOf(r: AuthResult | ProfileUpdateResult): string {
  if (r.ok) throw new Error('esperava erro, veio ok')
  return r.error
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  db.accounts = []
  db.sessions = []
})

afterAll(() => {
  rmSync(env.dataDir, { recursive: true, force: true })
})

it('usa uma pasta temporária, nunca server/data', () => {
  expect(AVATAR_DIR.startsWith(env.dataDir)).toBe(true)
})

describe('register', () => {
  it('cria a conta, devolve token e não expõe a senha', async () => {
    const r = ok(await register({ email: '  Ana@Exemplo.TEST ', password: 'senha-segura', name: '  Ana   Souza ', tag: 'Ana1' }))
    expect(r.token).toMatch(/^[\w-]{43}$/)
    expect(r.account).toMatchObject({
      email: 'ana@exemplo.test',
      name: 'Ana Souza',
      tag: 'Ana1',
      tagLocked: true,
      hasPassword: true,
      hasGoogle: false,
      avatarUrl: null
    })
    expect(r.account).not.toHaveProperty('passwordHash')
    expect(db.accounts[0].passwordHash).toMatch(/^scrypt\$/)
    expect(db.accounts[0].passwordHash).not.toContain('senha-segura')
  })

  it.each([
    [{ email: 'sem-arroba' }, 'E-mail inválido'],
    [{ email: `${'a'.repeat(250)}@x.test` }, 'E-mail inválido'],
    [{ password: '1234567' }, 'A senha precisa ter pelo menos 8 caracteres'],
    [{ password: 'x'.repeat(201) }, 'Senha longa demais'],
    [{ name: '#' }, 'O nome precisa ter pelo menos 2 caracteres (sem "#")'],
    [{ name: 'a' }, 'O nome precisa ter pelo menos 2 caracteres (sem "#")'],
    [{ tag: '' }, 'O id precisa ter de 1 a 5 letras ou números'],
    [{ tag: 'abcdef' }, 'O id precisa ter de 1 a 5 letras ou números'],
    [{ tag: 'a-b' }, 'O id precisa ter de 1 a 5 letras ou números']
  ])('rejeita dados inválidos %o', async (override, error) => {
    expect(errorOf(await newAccount(override))).toBe(error)
    expect(db.accounts).toHaveLength(0)
  })

  it('ignora tipos errados vindos do cliente', async () => {
    expect(errorOf(await register({ email: 42 as unknown as string, password: 'senha-segura', name: 'Ana', tag: 'a' }))).toBe(
      'E-mail inválido'
    )
  })

  it('remove "#" do nome e corta em 32 caracteres', async () => {
    const r = ok(await newAccount({ name: `Ana#1234 ${'x'.repeat(40)}` }))
    expect(r.account.name.startsWith('Ana1234 ')).toBe(true)
    expect(r.account.name).toHaveLength(32)
  })

  it('não aceita e-mail repetido (sem diferenciar maiúsculas)', async () => {
    ok(await newAccount({ email: 'dup@exemplo.test' }))
    expect(errorOf(await newAccount({ email: 'DUP@exemplo.test' }))).toBe('Este e-mail já está cadastrado')
  })

  it('não aceita id repetido (sem diferenciar maiúsculas)', async () => {
    ok(await newAccount({ tag: 'Zed' }))
    expect(errorOf(await newAccount({ tag: 'zED' }))).toBe('O id #zED já está em uso. Escolha outro.')
  })

  it('permite nomes iguais com ids diferentes', async () => {
    ok(await newAccount({ name: 'Mesmo Nome', tag: 'a1' }))
    ok(await newAccount({ name: 'Mesmo Nome', tag: 'a2' }))
    expect(db.accounts).toHaveLength(2)
  })
})

describe('login', () => {
  it('entra com a senha certa (e-mail sem diferenciar maiúsculas)', async () => {
    const created = ok(await newAccount({ email: 'login@exemplo.test' }))
    const r = ok(await login({ email: 'LOGIN@exemplo.test', password: 'senha-segura' }))
    expect(r.account.id).toBe(created.account.id)
    expect(r.token).not.toBe(created.token)
  })

  it('usa a mesma mensagem para senha errada e conta inexistente', async () => {
    ok(await newAccount({ email: 'x@exemplo.test' }))
    expect(errorOf(await login({ email: 'x@exemplo.test', password: 'errada-123' }))).toBe('E-mail ou senha incorretos')
    expect(errorOf(await login({ email: 'ninguem@exemplo.test', password: 'senha-segura' }))).toBe('E-mail ou senha incorretos')
    expect(errorOf(await login({ email: 'x@exemplo.test' }))).toBe('E-mail ou senha incorretos')
  })

  it('bloqueia depois de 10 tentativas erradas e libera após 15 min', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      ok(await newAccount({ email: 'alvo@exemplo.test' }))
      for (let i = 0; i < 10; i++) await login({ email: 'alvo@exemplo.test', password: `errada-${i}xx` })
      expect(errorOf(await login({ email: 'alvo@exemplo.test', password: 'senha-segura' }))).toBe(
        'Muitas tentativas. Tente de novo em alguns minutos.'
      )
      vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1)
      ok(await login({ email: 'alvo@exemplo.test', password: 'senha-segura' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('o bloqueio é por e-mail: outras contas continuam entrando', async () => {
    ok(await newAccount({ email: 'livre@exemplo.test' }))
    for (let i = 0; i < 10; i++) await login({ email: 'bloqueado@exemplo.test', password: 'qualquer-coisa' })
    ok(await login({ email: 'livre@exemplo.test', password: 'senha-segura' }))
  })

  it('conta só do Google pede para usar o Google', async () => {
    const created = ok(await newAccount({ email: 'g@exemplo.test' }))
    stored(created.account.id).passwordHash = null
    expect(errorOf(await login({ email: 'g@exemplo.test', password: 'senha-segura' }))).toBe(
      'Esta conta foi criada com o Google. Use "Entrar com Google".'
    )
  })
})

describe('sessões', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('o token identifica a conta; o banco guarda só o hash', async () => {
    const r = ok(await newAccount())
    expect((await accountFromToken(r.token))?.id).toBe(r.account.id)
    expect(db.sessions[0].tokenHash).not.toBe(r.token)
    expect(db.sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each([null, undefined, '', 123, 'token-inventado'])('token inválido (%o) não acha conta', async (token) => {
    expect(await accountFromToken(token)).toBeUndefined()
  })

  it('revogar invalida só aquela sessão', async () => {
    const a = ok(await newAccount({ email: 'rev@exemplo.test' }))
    const b = ok(await login({ email: 'rev@exemplo.test', password: 'senha-segura' }))
    await revokeSession(a.token)
    expect(await accountFromToken(a.token)).toBeUndefined()
    expect((await accountFromToken(b.token))?.id).toBe(a.account.id)
    await revokeSession(42)
    await revokeSession('inexistente')
    expect(db.sessions).toHaveLength(1)
  })

  it('expira em 30 dias e sessões vencidas são limpas no próximo login', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const r = ok(await newAccount({ email: 'exp@exemplo.test' }))
    vi.setSystemTime(Date.now() + 29 * 24 * 60 * 60 * 1000)
    expect(await accountFromToken(r.token)).toBeDefined()
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000)
    expect(await accountFromToken(r.token)).toBeUndefined()
    ok(await login({ email: 'exp@exemplo.test', password: 'senha-segura' }))
    expect(db.sessions).toHaveLength(1)
  })
})

describe('updateProfile', () => {
  const PNG_1PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  /** Cria uma conta e devolve o id. */
  async function account(): Promise<string> {
    return ok(await newAccount({ tag: 'perf' })).account.id
  }

  it('troca o nome', async () => {
    const id = await account()
    const r = ok(await update(id, { name: '  Novo   Nome ' }))
    expect(r.account.name).toBe('Novo Nome')
    expect(stored(id).name).toBe('Novo Nome')
  })

  it('rejeita nome inválido sem mudar nada', async () => {
    const id = await account()
    expect(errorOf(await update(id, { name: 'x' }))).toBe('O nome precisa ter pelo menos 2 caracteres (sem "#")')
    expect(stored(id).name).toBe('Pessoa Teste')
  })

  it('o id travado não muda (mas reenviar o mesmo id é aceito)', async () => {
    const id = await account()
    expect(errorOf(await update(id, { name: 'Ok Ok', tag: 'outro' }))).toBe('O id não pode ser alterado')
    ok(await update(id, { name: 'Ok Ok', tag: 'perf' }))
    expect(stored(id).tag).toBe('perf')
  })

  it('id provisório (Google) pode ser escolhido uma única vez', async () => {
    ok(await newAccount({ tag: 'usado' }))
    const id = await account()
    stored(id).tagLocked = false
    expect(errorOf(await update(id, { name: 'Ok Ok', tag: 'USADO' }))).toBe('O id #USADO já está em uso. Escolha outro.')
    expect(errorOf(await update(id, { name: 'Ok Ok', tag: 'inválido!' }))).toBe('O id precisa ter de 1 a 5 letras ou números')
    expect(stored(id).tagLocked).toBe(false)
    ok(await update(id, { name: 'Ok Ok', tag: 'meu' }))
    expect(stored(id)).toMatchObject({ tag: 'meu', tagLocked: true })
    expect(errorOf(await update(id, { name: 'Ok Ok', tag: 'outro' }))).toBe('O id não pode ser alterado')
  })

  it('confirmar o id provisório sem trocar também trava', async () => {
    const id = await account()
    stored(id).tagLocked = false
    ok(await update(id, { name: 'Ok Ok', tag: stored(id).tag }))
    expect(stored(id).tagLocked).toBe(true)
  })

  it('salva e remove a foto, mudando a versão da URL', async () => {
    const id = await account()
    const withPhoto = ok(await update(id, { name: 'Ok Ok', avatar: PNG_1PX }))
    expect(withPhoto.account.avatarUrl).toBe(`/avatars/${id}?v=1`)
    expect(stored(id).avatarType).toBe('image/png')
    expect(existsSync(join(AVATAR_DIR, id))).toBe(true)

    const removed = ok(await update(id, { name: 'Ok Ok', avatar: null }))
    expect(removed.account.avatarUrl).toBeNull()
    expect(stored(id).avatarVersion).toBe(2)
    expect(existsSync(join(AVATAR_DIR, id))).toBe(false)
  })

  it.each([
    ['tipo não permitido', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['não é data URL', 'https://exemplo.test/foto.png'],
    ['grande demais', `data:image/png;base64,${Buffer.alloc(400_001).toString('base64')}`]
  ])('rejeita foto inválida: %s', async (_caso, avatar) => {
    const id = await account()
    expect(errorOf(await update(id, { name: 'Ok Ok', avatar }))).toBe('Imagem inválida ou grande demais')
    expect(stored(id).avatarType).toBeNull()
  })
})

describe('googleLogin', () => {
  const REDIRECT = 'http://127.0.0.1:53123/'

  function idToken(claims: Record<string, unknown>): string {
    const payload = {
      iss: 'https://accounts.google.com',
      aud: process.env.GOOGLE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'google-sub-1',
      email: 'gente@gmail.test',
      email_verified: true,
      name: 'Gente Google',
      ...claims
    }
    return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.assinatura`
  }

  function mockGoogle(claims: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const req = { code: 'codigo', codeVerifier: 'verificador', redirectUri: REDIRECT }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cria conta nova com id provisório e sem senha', async () => {
    const fetchMock = mockGoogle()
    const r = ok(await googleLogin(req))
    expect(r.account).toMatchObject({
      email: 'gente@gmail.test',
      name: 'Gente Google',
      tagLocked: false,
      hasPassword: false,
      hasGoogle: true
    })
    expect(r.account.tag).toMatch(/^[a-z0-9]{5}$/)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(String(init.body)).toContain('client_secret=test-secret')
  })

  it('entrar de novo reaproveita a mesma conta', async () => {
    mockGoogle()
    const first = ok(await googleLogin(req))
    const second = ok(await googleLogin(req))
    expect(second.account.id).toBe(first.account.id)
    expect(db.accounts).toHaveLength(1)
  })

  it('vincula a uma conta de e-mail existente com o mesmo e-mail verificado', async () => {
    const created = ok(await newAccount({ email: 'gente@gmail.test' }))
    mockGoogle()
    const r = ok(await googleLogin(req))
    expect(r.account).toMatchObject({ id: created.account.id, hasPassword: true, hasGoogle: true, tagLocked: true })
  })

  it.each([
    ['sem code', { ...req, code: '' }],
    ['redirect fora do loopback', { ...req, redirectUri: 'http://evil.test:5000/' }],
    ['redirect em localhost', { ...req, redirectUri: 'http://localhost:53123/' }]
  ])('rejeita requisição inválida: %s', async (_caso, body) => {
    const fetchMock = mockGoogle()
    expect(errorOf(await googleLogin(body))).toBe('Requisição de login inválida')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['aud de outro app', { aud: 'outro-app' }],
    ['emissor errado', { iss: 'https://evil.test' }],
    ['token vencido', { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['sem sub', { sub: '' }]
  ])('rejeita id_token inválido: %s', async (_caso, claims) => {
    mockGoogle(claims)
    expect(errorOf(await googleLogin(req))).toBe('Resposta inválida do Google')
    expect(db.accounts).toHaveLength(0)
  })

  it('exige e-mail verificado', async () => {
    mockGoogle({ email_verified: false })
    expect(errorOf(await googleLogin(req))).toBe('Sua conta Google não tem e-mail verificado')
  })

  it('não vincula a conta existente se o e-mail não for verificado', async () => {
    ok(await newAccount({ email: 'gente@gmail.test' }))
    mockGoogle({ email_verified: false })
    errorOf(await googleLogin(req))
    expect(db.accounts[0].googleId).toBeNull()
  })

  it('erro do Google na troca do código', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })))
    expect(errorOf(await googleLogin(req))).toBe('O Google recusou o login. Tente de novo.')
  })

  it('falha de rede ao falar com o Google', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    expect(errorOf(await googleLogin(req))).toBe('Não foi possível falar com o Google')
  })
})
