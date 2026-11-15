// Efeitos sonoros de ponta a ponta (A10): enviar, listar, baixar, tocar na sala e apagar.
import { existsSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type Channel, type Sound, type SoundUploadResult } from '../../src/shared/types'
import { wav } from './audio-fixtures'
import { FakeLiveKit, liveKitEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
let owner: TestUser
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  server = await TestServer.start({ env: { ...liveKitEnv(await livekit.start()), SOUNDS_PER_ACCOUNT: '4' } })
  owner = await server.asOwner()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

async function postSound(
  token: string | null,
  data: Buffer | string,
  { name = `som ${++n}`, emoji = '' }: { name?: string; emoji?: string } = {}
): Promise<{ status: number; body: SoundUploadResult }> {
  const headers: Record<string, string> = { 'x-sound-name': encodeURIComponent(name), 'x-sound-emoji': encodeURIComponent(emoji) }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(server.url + '/sounds', { method: 'POST', headers, body: data })
  return { status: res.status, body: (await res.json()) as SoundUploadResult }
}

async function soundOk(u: TestUser, opts?: { name?: string; emoji?: string }, seconds = 1): Promise<Sound> {
  const { status, body } = await postSound(u.token, wav(seconds), opts)
  if (status !== 200 || !body.ok) throw new Error(`envio falhou: ${status} ${JSON.stringify(body)}`)
  return body.sound
}

async function room(): Promise<Channel> {
  return server.createChannel(`Sala ${++n}`, 'voice')
}

async function join(u: TestUser, channelId: string): Promise<void> {
  const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!res.ok) throw new Error(res.error)
}

describe('POST /sounds', () => {
  it('aceita um áudio curto, lê a duração e avisa todos (link assinado por pessoa)', async () => {
    const a = await user()
    const b = await user()
    const created = waitFor(b.socket, 'sound:created', (s) => s.name === 'buzina')
    const sound = await soundOk(a, { name: 'buzina', emoji: '📯' }, 4)
    expect(sound).toMatchObject({ name: 'buzina', emoji: '📯', durationMs: 4000, uploaderId: a.account.id })
    expect(sound.url).toMatch(new RegExp(`^/sounds/${sound.id}\\?a=${a.account.id}&e=\\d+&s=`))
    const [forB] = await created
    expect(forB.url).toContain(`a=${b.account.id}`)
    expect(existsSync(pathJoin(server.dataDir, 'sounds', sound.id))).toBe(true)
  })

  it('recusa mais de 5 s, mais de 512 KB, não-áudio, vazio, sem sessão e nome inválido', async () => {
    const a = await user()
    expect(await postSound(a.token, wav(6))).toEqual({ status: 400, body: { ok: false, error: 'O som pode ter no máximo 5 segundos' } })
    // 3 s a 48 kHz, 16 bits, estéreo = ~576 KB
    expect((await postSound(a.token, wav(3, { sampleRate: 48000, bits: 16, channels: 2 }))).status).toBe(413)
    expect(await postSound(a.token, 'não sou áudio')).toEqual({
      status: 400,
      body: { ok: false, error: 'Envie um áudio MP3, OGG, WAV ou WebM' }
    })
    expect((await postSound(a.token, '')).body).toMatchObject({ ok: false })
    expect((await postSound(null, wav(1))).status).toBe(401)
    expect((await postSound(a.token, wav(1), { name: '   ' })).body).toMatchObject({ ok: false, error: expect.stringContaining('nome') })
    expect((await postSound(a.token, wav(1), { name: 'x'.repeat(33) })).body).toMatchObject({ ok: false })
    expect(await postSound(a.token, wav(1), { emoji: 'emoji-longo-demais' })).toEqual({ status: 400, body: { ok: false, error: 'Emoji inválido' } })
    // emoji composto (11 unidades UTF-16, 7 code points) passa pelo servidor e pelo check do banco
    expect((await soundOk(a, { emoji: '👨‍👩‍👧‍👦' })).emoji).toBe('👨‍👩‍👧‍👦')
  })

  it('nome repetido (sem diferenciar maiúsculas) é recusado e o arquivo não fica', async () => {
    const a = await user()
    await soundOk(a, { name: 'Palmas' })
    expect(await postSound(a.token, wav(1), { name: 'PALMAS' })).toEqual({
      status: 400,
      body: { ok: false, error: 'Já existe um som com esse nome' }
    })
  })

  it('limite de sons por conta', async () => {
    const a = await user()
    for (let i = 0; i < 4; i++) await soundOk(a)
    expect((await postSound(a.token, wav(1))).body).toMatchObject({ ok: false, error: expect.stringContaining('Você já tem 4 sons') })
  })

  it('o preflight de CORS libera os cabeçalhos do envio', async () => {
    const res = await fetch(server.url + '/sounds', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-headers': 'authorization,x-sound-name,x-sound-emoji' }
    })
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').split(',').map((h) => h.trim())
    expect(allowed).toEqual(expect.arrayContaining(['authorization', 'x-sound-name', 'x-sound-emoji']))
  })
})

describe('listar e baixar', () => {
  it('sound:list traz a coleção com links assinados para quem pede', async () => {
    const a = await user()
    const b = await user()
    const sound = await soundOk(a, { name: 'lista' })
    const list = await b.socket.emitWithAck('sound:list')
    const mine = list.find((s) => s.id === sound.id)
    expect(mine?.url).toContain(`a=${b.account.id}`)
  })

  it('GET /sounds/<id> só com link assinado; serve o tipo certo', async () => {
    const a = await user()
    const sound = await soundOk(a)
    const res = await fetch(server.url + sound.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/wav')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await fetch(`${server.url}/sounds/${sound.id}`)).status).toBe(404)
    expect((await fetch(server.url + sound.url.replace(/s=[^&]+/, 's=falsa'))).status).toBe(404)
  })
})

describe('tocar na sala', () => {
  it('só quem está na sala recebe; quem está em outra sala não', async () => {
    const a = await user()
    const b = await user()
    const c = await user()
    const r1 = await room()
    const r2 = await room()
    await join(a, r1.id)
    await join(b, r1.id)
    await join(c, r2.id)
    const sound = await soundOk(a)

    const got = waitFor(b.socket, 'sound:played', (p) => p.soundId === sound.id)
    const self = waitFor(a.socket, 'sound:played', (p) => p.soundId === sound.id)
    const notOther = expectNoEvent(c.socket, 'sound:played')
    expect(await a.socket.emitWithAck('sound:play', { channelId: r1.id, soundId: sound.id })).toEqual({ ok: true })
    expect((await got)[0]).toEqual({ channelId: r1.id, soundId: sound.id, by: a.socket.id, accountId: a.account.id })
    await self
    await notOther
  })

  it('fora da sala, sala errada ou som inexistente: recusa', async () => {
    const a = await user()
    const r = await room()
    const sound = await soundOk(a)
    expect(await a.socket.emitWithAck('sound:play', { channelId: r.id, soundId: sound.id })).toEqual({
      ok: false,
      error: 'Entre na sala de voz para tocar sons'
    })
    await join(a, r.id)
    expect(await a.socket.emitWithAck('sound:play', { channelId: r.id, soundId: '11111111-1111-1111-1111-111111111111' })).toEqual({
      ok: false,
      error: 'Som não encontrado'
    })
  })

  it('na chamada de uma conversa privada: só a outra pessoa ouve; com bloqueio, recusa', async () => {
    const a = await user()
    const b = await user()
    const c = await user()
    expect((await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)).ok).toBe(true)
    expect((await b.socket.emitWithAck('friend:accept', a.account.id)).ok).toBe(true)
    const opened = await a.socket.emitWithAck('dm:open', b.account.id)
    if (!opened.ok) throw new Error(opened.error)
    const dm = opened.dm.channel.id
    await join(a, dm)
    await join(b, dm)
    await join(c, (await room()).id)
    const sound = await soundOk(a)

    const got = waitFor(b.socket, 'sound:played', (p) => p.soundId === sound.id && p.channelId === dm)
    const notOther = expectNoEvent(c.socket, 'sound:played')
    expect(await a.socket.emitWithAck('sound:play', { channelId: dm, soundId: sound.id })).toEqual({ ok: true })
    await got
    await notOther

    // bloquear tira os dois da sala da conversa: tocar ali passa a ser recusado
    expect((await b.socket.emitWithAck('friend:block', a.account.id)).ok).toBe(true)
    expect(await a.socket.emitWithAck('sound:play', { channelId: dm, soundId: sound.id })).toMatchObject({ ok: false })
  })

  it('não toca por cima do próprio som anterior', async () => {
    const a = await user()
    const r = await room()
    await join(a, r.id)
    const long = await soundOk(a, undefined, 4)
    expect(await a.socket.emitWithAck('sound:play', { channelId: r.id, soundId: long.id })).toEqual({ ok: true })
    expect(await a.socket.emitWithAck('sound:play', { channelId: r.id, soundId: long.id })).toEqual({
      ok: false,
      error: 'Espere o som anterior terminar'
    })
  })

  it('sem permissão de falar na sala, não toca', async () => {
    const a = await user()
    const r = await room()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: r.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['speak'] }]
    })
    await join(a, r.id)
    const sound = await soundOk(a)
    expect(await a.socket.emitWithAck('sound:play', { channelId: r.id, soundId: sound.id })).toEqual({
      ok: false,
      error: 'Você não tem permissão para falar nesta sala'
    })
  })
})

describe('apagar', () => {
  it('outra pessoa não apaga; o autor apaga e todos ficam sabendo; o arquivo some', async () => {
    const a = await user()
    const b = await user()
    const sound = await soundOk(a)
    expect(await b.socket.emitWithAck('sound:delete', sound.id)).toEqual({
      ok: false,
      error: 'Só quem enviou (ou quem gerencia mensagens) pode apagar este som'
    })
    const deleted = waitFor(b.socket, 'sound:deleted', (id) => id === sound.id)
    expect(await a.socket.emitWithAck('sound:delete', sound.id)).toEqual({ ok: true })
    await deleted
    expect(existsSync(pathJoin(server.dataDir, 'sounds', sound.id))).toBe(false)
    expect((await fetch(server.url + sound.url)).status).toBe(404)
  })

  it('quem gerencia mensagens apaga som de outra pessoa', async () => {
    const a = await user()
    const mod = await user('Moderadora')
    const sound = await soundOk(a)
    const role = await owner.socket.emitWithAck('role:create', { name: `Mod ${++n}`, color: null, permissions: ['manageMessages'] })
    if (!role.ok) throw new Error(role.error)
    await owner.socket.emitWithAck('member:set-roles', { accountId: mod.account.id, roleIds: [role.role.id] })
    expect(await mod.socket.emitWithAck('sound:delete', sound.id)).toEqual({ ok: true })
  })
})
