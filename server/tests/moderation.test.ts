// Moderação (B6): expulsar da voz, silenciar pelo servidor e apagar mensagem, com as regras de
// hierarquia. Servidor de verdade + LiveKit falso (registra as chamadas da API).
import { existsSync } from 'node:fs'
import { join as joinPath } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Channel, Message, Permission, VoiceState } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
let liveKitApiUrl = ''
const open: ClientSocket[] = []

beforeAll(async () => {
  const apiUrl = await livekit.start()
  liveKitApiUrl = apiUrl
  server = await withEnv(
    { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET },
    () => TestServer.start()
  )
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

/** Cria um cargo (como a dona) e dá para a pessoa. */
async function giveRole(u: TestUser, permissions: Permission[]): Promise<string> {
  const owner = await server.asOwner()
  const res = await owner.socket.emitWithAck('role:create', { name: `cargo-${u.tag}`, color: null, permissions })
  if (!res.ok) throw new Error(res.error)
  const set = await owner.socket.emitWithAck('member:set-roles', { accountId: u.self.accountId, roleIds: [res.role.id] })
  if (!set.ok) throw new Error(set.error)
  return res.role.id
}

const room = (): Promise<Channel> => server.createChannel(`Sala ${Math.random().toString(36).slice(2, 7)}`, 'voice')

async function join(u: TestUser, channelId: string): Promise<{ canSpeak: boolean }> {
  const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!res.ok) throw new Error(res.error)
  return res
}

const stateOf = (states: VoiceState[], u: TestUser): VoiceState | undefined => states.find((v) => v.userId === u.self.id)

describe('expulsar da voz', () => {
  it('a dona expulsa: a pessoa recebe quem expulsou, sai da lista e do LiveKit', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)
    const kicked = waitFor(ana.socket, 'moderation:kicked')
    const gone = waitFor(owner.socket, 'voice:state', (s) => !stateOf(s, ana))
    const res = await owner.socket.emitWithAck('moderation:voice-kick', { userId: ana.self.id })
    expect(res).toEqual({ ok: true })
    expect((await kicked)[0]).toEqual({ channelId: sala.id, by: owner.name })
    await gone
    await livekit.waitCall('RemoveParticipant', (b) => b.room === sala.id && b.identity === ana.self.id)
  })

  it('sem gerenciar membros não expulsa', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const sala = await room()
    await join(bia, sala.id)
    expect(await ana.socket.emitWithAck('moderation:voice-kick', { userId: bia.self.id })).toEqual({
      ok: false,
      error: 'Você não pode expulsar essa pessoa'
    })
  })

  it('moderador expulsa quem está abaixo, mas não a dona, nem quem tem cargo igual, nem a si mesmo', async () => {
    const owner = await server.asOwner()
    const mod = await user('Mod')
    const igual = await user('Igual')
    const semCargo = await user('Sem')
    const roleId = await giveRole(mod, ['manageMembers'])
    await owner.socket.emitWithAck('member:set-roles', { accountId: igual.self.accountId, roleIds: [roleId] })
    const sala = await room()
    for (const u of [owner, igual, semCargo, mod]) await join(u, sala.id)

    const no = { ok: false, error: 'Você não pode expulsar essa pessoa' }
    expect(await mod.socket.emitWithAck('moderation:voice-kick', { userId: owner.self.id })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:voice-kick', { userId: igual.self.id })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:voice-kick', { userId: mod.self.id })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:voice-kick', { userId: semCargo.self.id })).toEqual({ ok: true })
    owner.socket.emit('voice:leave')
  })

  it('quem não está em sala (ou id inventado) dá erro', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    expect(await owner.socket.emitWithAck('moderation:voice-kick', { userId: ana.self.id })).toEqual({
      ok: false,
      error: 'Essa pessoa não está numa sala de voz'
    })
    expect(await owner.socket.emitWithAck('moderation:voice-kick', { userId: 'nada' })).toMatchObject({ ok: false })
  })
})

describe('mover para outra sala', () => {
  it('a dona move: só a pessoa recebe o aviso com a sala e quem moveu', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const a = await room()
    const b = await room()
    await join(ana, a.id)
    await join(bia, a.id)
    const moved = waitFor(ana.socket, 'moderation:moved')
    const notBia = expectNoEvent(bia.socket, 'moderation:moved')
    expect(await owner.socket.emitWithAck('moderation:voice-move', { userId: ana.self.id, channelId: b.id })).toEqual({ ok: true })
    expect((await moved)[0]).toEqual({ channelId: b.id, by: owner.self.name })
    await notBia
    // o app entra pela entrada de sempre (o servidor confere de novo)
    expect((await join(ana, b.id)).canSpeak).toBe(true)
  })

  it('recusas: mesma sala, fora da voz, sala que não é de voz ou não existe, sem permissão', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const a = await room()
    const texto = await server.createChannel(`texto-${Math.random().toString(36).slice(2, 6)}`)
    const move = (by: TestUser, userId: string, channelId: string) => by.socket.emitWithAck('moderation:voice-move', { userId, channelId })

    expect(await move(owner, ana.self.id, a.id)).toEqual({ ok: false, error: 'Essa pessoa não está numa sala de voz' })
    await join(ana, a.id)
    expect(await move(owner, ana.self.id, a.id)).toEqual({ ok: false, error: 'Essa pessoa já está nessa sala' })
    expect(await move(owner, ana.self.id, texto.id)).toEqual({ ok: false, error: 'Sala de voz não encontrada' })
    expect(await move(owner, ana.self.id, 'nao-existe')).toEqual({ ok: false, error: 'Sala de voz não encontrada' })
    // sem gerenciar membros (ou movendo a dona) não pode
    const b = await room()
    expect(await move(bia, ana.self.id, b.id)).toEqual({ ok: false, error: 'Você não pode mover essa pessoa' })
    await join(owner, a.id)
    await giveRole(bia, ['manageMembers'])
    expect(await move(bia, owner.self.id, b.id)).toEqual({ ok: false, error: 'Você não pode mover essa pessoa' })
  })

  it('sala de destino em que a pessoa não pode entrar: recusa', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const a = await room()
    const fechada = await room()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: fechada.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['connect'] }]
    })
    await join(ana, a.id)
    const silent = expectNoEvent(ana.socket, 'moderation:moved')
    expect(await owner.socket.emitWithAck('moderation:voice-move', { userId: ana.self.id, channelId: fechada.id })).toEqual({
      ok: false,
      error: 'Essa pessoa não tem acesso a essa sala'
    })
    await silent
  })
})

describe('permissão "Mover membros" (moveMembers)', () => {
  it('cargo com moveMembers move quem está abaixo, mas não expulsa nem silencia', async () => {
    const mover = await user('Mover')
    const ana = await user('Ana')
    await giveRole(mover, ['moveMembers'])
    const a = await room()
    const b = await room()
    await join(ana, a.id)
    const moved = waitFor(ana.socket, 'moderation:moved')
    expect(await mover.socket.emitWithAck('moderation:voice-move', { userId: ana.self.id, channelId: b.id })).toEqual({ ok: true })
    expect((await moved)[0]).toEqual({ channelId: b.id, by: mover.self.name })
    expect(await mover.socket.emitWithAck('moderation:voice-kick', { userId: ana.self.id })).toEqual({
      ok: false,
      error: 'Você não pode expulsar essa pessoa'
    })
    expect(await mover.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })).toEqual({
      ok: false,
      error: 'Você não pode silenciar essa pessoa'
    })
  })

  it('sem a permissão recusa; com ela, não move a dona nem quem tem cargo igual', async () => {
    const owner = await server.asOwner()
    const mover = await user('Mover')
    const igual = await user('Igual')
    const ana = await user('Ana')
    const a = await room()
    const b = await room()
    for (const u of [owner, igual, ana]) await join(u, a.id)
    const no = { ok: false, error: 'Você não pode mover essa pessoa' }
    const move = (userId: string) => mover.socket.emitWithAck('moderation:voice-move', { userId, channelId: b.id })

    expect(await move(ana.self.id)).toEqual(no)
    const roleId = await giveRole(mover, ['moveMembers'])
    await owner.socket.emitWithAck('member:set-roles', { accountId: igual.self.accountId, roleIds: [roleId] })
    expect(await move(owner.self.id)).toEqual(no)
    expect(await move(igual.self.id)).toEqual(no)
    owner.socket.emit('voice:leave')
  })
})

describe('silenciar pelo servidor', () => {
  it('silencia na hora (lista e LiveKit), não deixa se dessilenciar e vale ao voltar para a sala', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)

    const muted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === true)
    expect(await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })).toEqual({
      ok: true
    })
    expect(stateOf((await muted)[0], ana)).toMatchObject({ muted: true, serverMuted: true })
    // no LiveKit: sem o microfone (fonte 2) entre as fontes permitidas
    await livekit.waitCall(
      'UpdateParticipant',
      (b) =>
        b.identity === ana.self.id &&
        !((b.permission as { canPublishSources?: unknown[] })?.canPublishSources ?? []).some((s) => s === 2 || s === 'MICROPHONE')
    )

    // tentar se dessilenciar não adianta
    const still = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.muted === true)
    ana.socket.emit('voice:update', { muted: false, deafened: false })
    await still

    // sair e voltar: continua sem poder falar
    ana.socket.emit('voice:leave')
    expect((await join(ana, sala.id)).canSpeak).toBe(false)

    // tirar o silêncio: volta a poder falar
    const unmuted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === false)
    expect(await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })).toEqual({
      ok: true
    })
    await unmuted
    ana.socket.emit('voice:leave')
    expect((await join(ana, sala.id)).canSpeak).toBe(true)
  })

  it('tirar o silêncio desmuta na hora, sem a pessoa precisar se desmutar', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)

    const muted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === true)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })
    await muted
    // enquanto silenciada, o app dela manda sempre "mutado" (ex.: ao ligar/desligar o áudio)
    const deaf = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.deafened === true)
    ana.socket.emit('voice:update', { muted: true, deafened: true })
    await deaf
    const undeaf = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.deafened === false)
    ana.socket.emit('voice:update', { muted: true, deafened: false })
    await undeaf

    // o moderador tira o silêncio: a lista já vem com ela desmutada (ela não mandou nada)
    const unmuted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === false)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })
    expect(stateOf((await unmuted)[0], ana)).toMatchObject({ muted: false, serverMuted: false })
    // e o LiveKit volta a aceitar o microfone (fonte 2)
    await livekit.waitCall(
      'UpdateParticipant',
      (b) =>
        b.identity === ana.self.id &&
        ((b.permission as { canPublishSources?: unknown[] })?.canPublishSources ?? []).some((s) => s === 2 || s === 'MICROPHONE')
    )
  })

  it('quem já tinha se mutado antes do silêncio continua mutado quando o silêncio acaba', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)
    const selfMuted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.muted === true)
    ana.socket.emit('voice:update', { muted: true, deafened: false })
    await selfMuted

    const muted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === true)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })
    await muted
    const unmuted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === false)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })
    expect(stateOf((await unmuted)[0], ana)).toMatchObject({ muted: true, serverMuted: false })
  })

  it('entrou já silenciada: quando o silêncio acaba, fica como entrou (desmutada)', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })
    ana.socket.emit('voice:leave')
    expect((await join(ana, sala.id)).canSpeak).toBe(false)

    const unmuted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === false)
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })
    expect(stateOf((await unmuted)[0], ana)).toMatchObject({ muted: false })
  })

  it('só silencia quem está numa sala; sem permissão ou acima de mim, não', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    expect(await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })).toEqual({
      ok: false,
      error: 'Essa pessoa não está numa sala de voz'
    })
    const sala = await room()
    await join(ana, sala.id)
    await join(owner, sala.id)
    expect(await bia.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })).toMatchObject({
      ok: false
    })
    expect(await ana.socket.emitWithAck('moderation:voice-mute', { accountId: owner.self.accountId, muted: true })).toMatchObject({
      ok: false
    })
    expect(await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: 'sim' as never })).toEqual({
      ok: false,
      error: 'Pedido inválido'
    })
    owner.socket.emit('voice:leave')
  })
})

describe('apagar mensagem', () => {
  async function send(u: TestUser, channelId: string, content: string, attachmentIds: string[] = []): Promise<Message> {
    const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
    u.socket.emit('message:send', { channelId, content, attachmentIds })
    return (await got)[0]
  }

  it('o autor apaga a própria: todos que veem o canal recebem message:deleted e o histórico não tem mais', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await server.createChannel(`geral-${Math.random().toString(36).slice(2, 6)}`)
    const msg = await send(ana, ch.id, 'oi, vou apagar')
    const seen = waitFor(owner.socket, 'message:deleted', (p) => p.messageId === msg.id)
    expect(await ana.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    expect((await seen)[0]).toEqual({ channelId: ch.id, messageId: msg.id })
    const page = await owner.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(page.messages.some((m) => m.id === msg.id)).toBe(false)
  })

  it('mensagem de outra pessoa: só com gerenciar mensagens', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const mod = await user('Mod')
    await giveRole(mod, ['manageMessages'])
    const ch = await server.createChannel(`geral-${Math.random().toString(36).slice(2, 6)}`)
    const msg = await send(ana, ch.id, 'mensagem da ana')
    expect(await bia.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({
      ok: false,
      error: 'Você não pode apagar esta mensagem'
    })
    expect(await mod.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    expect(await mod.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({
      ok: false,
      error: 'Mensagem não encontrada'
    })
  })

  it('canal que não vejo: responde como se a mensagem não existisse e não avisa ninguém de fora', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    await giveRole(ana, ['manageMessages'])
    const ch = await server.createChannel(`segredo-${Math.random().toString(36).slice(2, 6)}`)
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['view'] }]
    })
    const msg = await send(owner, ch.id, 'só a dona vê')
    expect(await ana.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({
      ok: false,
      error: 'Mensagem não encontrada'
    })
    const silent = expectNoEvent(ana.socket, 'message:deleted')
    expect(await owner.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    await silent
  })

  it('apaga o arquivo do anexo junto', async () => {
    const ana = await user('Ana')
    const ch = await server.createChannel(`anexos-${Math.random().toString(36).slice(2, 6)}`)
    const up = await server.upload(ana.token, 'conteúdo do arquivo', { name: 'nota.txt', type: 'text/plain' })
    if (!up.body.ok) throw new Error(up.body.error)
    const id = up.body.attachment.id
    const msg = await send(ana, ch.id, 'com anexo', [id])
    const file = joinPath(server.dataDir, 'uploads', id)
    expect(existsSync(file)).toBe(true)
    expect(await ana.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    expect(existsSync(file)).toBe(false)
  })

  it('id inválido dá "não encontrada"', async () => {
    const ana = await user('Ana')
    expect(await ana.socket.emitWithAck('message:delete', { messageId: 'xyz' })).toEqual({
      ok: false,
      error: 'Mensagem não encontrada'
    })
  })
})

describe('silêncio pelo servidor guardado no banco', () => {
  const restart = (): Promise<void> =>
    // o LiveKit falso entra pelo ambiente: reiniciar precisa das mesmas variáveis
    withEnv({ LIVEKIT_URL, LIVEKIT_API_URL: liveKitApiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }, () => server.restart())

  async function reconnect(u: TestUser): Promise<TestUser> {
    const socket = await server.connect(u.token)
    open.push(socket)
    const hello = await socket.emitWithAck('hello')
    return { ...u, socket, self: hello.self, account: hello.account, state: hello.state }
  }

  it('continua valendo depois de reiniciar o servidor; tirar o silêncio também fica guardado', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await join(ana, sala.id)
    expect(await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })).toEqual({ ok: true })

    await restart()
    const ana2 = await reconnect(ana)
    expect((await join(ana2, sala.id)).canSpeak).toBe(false)
    const owner2 = await server.asOwner()
    const states = waitFor(owner2.socket, 'voice:state', (s) => stateOf(s, ana2)?.serverMuted === false)
    expect(await owner2.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })).toEqual({ ok: true })
    await states

    await restart()
    const ana3 = await reconnect(ana)
    expect((await join(ana3, sala.id)).canSpeak).toBe(true)
    ana3.socket.emit('voice:leave')
  })
})
