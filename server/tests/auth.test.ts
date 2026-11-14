// Contas: rotas HTTP, sessões e handshake do socket.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestServer, uniqueCredentials } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await TestServer.start()
})

afterAll(async () => {
  await server?.destroy()
})

describe('rotas HTTP gerais', () => {
  it('GET /auth/config informa que o Google está desativado', async () => {
    const res = await fetch(server.url + '/auth/config')
    expect(await res.json()).toEqual({ googleClientId: null })
  })

  it('responde o preflight de CORS', async () => {
    const res = await fetch(server.url + '/auth/login', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rota desconhecida devolve 404', async () => {
    expect((await fetch(server.url + '/nada')).status).toBe(404)
  })

  it('JSON inválido devolve 400', async () => {
    const res = await fetch(server.url + '/auth/login', { method: 'POST', body: '{nao é json' })
    expect(res.status).toBe(400)
  })

  it('Google sem configuração recusa o login', async () => {
    const res = await server.post('/auth/google', { code: 'x', codeVerifier: 'y', redirectUri: 'http://127.0.0.1:5000' })
    expect(res).toMatchObject({ ok: false })
  })
})

describe('cadastro', () => {
  it('cria a conta e devolve token e dados da conta', async () => {
    const creds = uniqueCredentials('Ana')
    const res = await server.register(creds)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.token).toMatch(/^[\w-]{20,}$/)
    expect(res.account).toMatchObject({
      email: creds.email,
      name: 'Ana',
      tag: creds.tag,
      hasPassword: true,
      hasGoogle: false,
      tagLocked: true,
      avatarUrl: null
    })
  })

  it.each([
    ['e-mail inválido', { email: 'sem-arroba' }, /E-mail inválido/],
    ['senha curta', { password: '123' }, /pelo menos 8/],
    ['nome curto', { name: 'A' }, /nome/],
    ['nome só com #', { name: '###' }, /nome/],
    ['tag com símbolo', { tag: 'a-b' }, /id precisa/],
    ['tag longa demais', { tag: 'abcdef' }, /id precisa/]
  ])('recusa %s', async (_label, override, error) => {
    const res = await server.register({ ...uniqueCredentials(), ...override })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(error)
  })

  it('recusa e-mail repetido (sem diferenciar maiúsculas)', async () => {
    const creds = uniqueCredentials()
    await server.register(creds)
    const res = await server.register({ ...uniqueCredentials(), email: creds.email.toUpperCase() })
    expect(res).toMatchObject({ ok: false, error: 'Este e-mail já está cadastrado' })
  })

  it('recusa tag repetida (sem diferenciar maiúsculas)', async () => {
    const creds = uniqueCredentials()
    await server.register(creds)
    const res = await server.register({ ...uniqueCredentials(), tag: creds.tag.toUpperCase() })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/já está em uso/)
  })

  it('remove # e espaços extras do nome', async () => {
    const res = await server.register({ ...uniqueCredentials(), name: '  Jo#ão   da  Silva ' })
    expect(res.ok && res.account.name).toBe('João da Silva')
  })
})

describe('login', () => {
  it('entra com e-mail (qualquer caixa) e senha certos', async () => {
    const creds = uniqueCredentials()
    await server.register(creds)
    const res = await server.login(creds.email.toUpperCase(), creds.password)
    expect(res.ok && res.account.tag).toBe(creds.tag)
  })

  it('recusa senha errada e e-mail inexistente com a mesma mensagem', async () => {
    const creds = uniqueCredentials()
    await server.register(creds)
    expect(await server.login(creds.email, 'senha-errada')).toEqual({ ok: false, error: 'E-mail ou senha incorretos' })
    expect(await server.login('ninguem@teste.com', 'qualquer-coisa')).toEqual({
      ok: false,
      error: 'E-mail ou senha incorretos'
    })
  })

  it('bloqueia o e-mail depois de 10 senhas erradas', async () => {
    const creds = uniqueCredentials()
    await server.register(creds)
    for (let i = 0; i < 10; i++) await server.login(creds.email, 'senha-errada')
    const res = await server.login(creds.email, creds.password)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Muitas tentativas/)
  })
})

describe('sessão e socket', () => {
  it('recusa socket sem token ou com token inválido', async () => {
    await expect(server.connect('')).rejects.toThrow('unauthorized')
    await expect(server.connect('token-que-nao-existe')).rejects.toThrow('unauthorized')
  })

  it('aceita o token do cadastro e o do login', async () => {
    const creds = uniqueCredentials()
    const reg = await server.register(creds)
    const log = await server.login(creds.email, creds.password)
    if (!reg.ok || !log.ok) throw new Error('falha ao preparar')
    const a = await server.connect(reg.token)
    const b = await server.connect(log.token)
    expect(a.connected && b.connected).toBe(true)
    a.close()
    b.close()
  })

  it('logout revoga só aquele token', async () => {
    const creds = uniqueCredentials()
    const reg = await server.register(creds)
    const log = await server.login(creds.email, creds.password)
    if (!reg.ok || !log.ok) throw new Error('falha ao preparar')
    expect(await server.post('/auth/logout', { token: reg.token })).toEqual({ ok: true })
    await expect(server.connect(reg.token)).rejects.toThrow('unauthorized')
    const still = await server.connect(log.token)
    expect(still.connected).toBe(true)
    still.close()
  })

  it('hello devolve self, account e o estado inicial', async () => {
    const user = await server.newUser('Bia')
    expect(user.self).toMatchObject({ id: user.socket.id, accountId: user.account.id, name: 'Bia', tag: user.tag })
    expect(user.account.email).toBe(user.email)
    expect(user.state.channels.map((c) => c.name)).toEqual(
      expect.arrayContaining(['geral', 'off-topic', 'Sala de Voz', 'Jogos'])
    )
    expect(user.state.users.some((u) => u.id === user.socket.id)).toBe(true)
    user.socket.close()
  })
})

describe('foto de perfil', () => {
  const PNG_1PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  it('salva, serve com o tipo certo e remove', async () => {
    const user = await server.newUser()
    expect((await fetch(`${server.url}/avatars/${user.account.id}`)).status).toBe(404)

    const set = await user.socket.emitWithAck('account:update', { name: user.name, avatar: PNG_1PX })
    expect(set.ok && set.account.avatarUrl).toMatch(new RegExp(`^/avatars/${user.account.id}\\?v=1$`))
    const res = await fetch(`${server.url}/avatars/${user.account.id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')

    const removed = await user.socket.emitWithAck('account:update', { name: user.name, avatar: null })
    expect(removed.ok && removed.account.avatarUrl).toBeNull()
    expect((await fetch(`${server.url}/avatars/${user.account.id}`)).status).toBe(404)
    user.socket.close()
  })

  it('recusa imagem que não é png/jpeg/webp/gif', async () => {
    const user = await server.newUser()
    const res = await user.socket.emitWithAck('account:update', {
      name: user.name,
      avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    })
    expect(res).toEqual({ ok: false, error: 'Imagem inválida ou grande demais' })
    user.socket.close()
  })
})
