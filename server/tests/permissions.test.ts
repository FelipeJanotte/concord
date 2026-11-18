// Cargos e permissões de ponta a ponta (A4): o servidor real bloqueia e só entrega o que cada um pode ver.
import { TokenVerifier } from 'livekit-server-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type ChannelPermission, type Role } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, liveKitEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
let owner: TestUser
const open: ClientSocket[] = []
const livekit = new FakeLiveKit()
const verifier = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

beforeAll(async () => {
  server = await TestServer.start({ env: liveKitEnv(await livekit.start()) })
  owner = await server.asOwner()
})

afterEach(async () => {
  for (const s of open.splice(0)) s.close()
  // volta ao estado inicial: sem cargos extras e o @todos com o padrão
  const access = await owner.socket.emitWithAck('access:get')
  for (const r of access.roles) if (r.id !== EVERYONE_ROLE_ID) await owner.socket.emitWithAck('role:delete', r.id)
  await owner.socket.emitWithAck('role:update', {
    id: EVERYONE_ROLE_ID,
    permissions: ['view', 'send', 'attach', 'connect', 'speak', 'share', 'video']
  })
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

async function createRole(by: TestUser, name: string, permissions: Role['permissions'] = [], color: string | null = null): Promise<Role> {
  const res = await by.socket.emitWithAck('role:create', { name, color, permissions })
  if (!res.ok) throw new Error(res.error)
  return res.role
}

async function overrides(channelId: string, list: { roleId: string; allow?: ChannelPermission[]; deny?: ChannelPermission[] }[]) {
  const res = await owner.socket.emitWithAck('channel:set-overrides', {
    channelId,
    overrides: list.map((o) => ({ roleId: o.roleId, allow: o.allow ?? [], deny: o.deny ?? [] }))
  })
  if (!res.ok) throw new Error(res.error)
}

async function setRoles(by: TestUser, accountId: string, roleIds: string[]) {
  return by.socket.emitWithAck('member:set-roles', { accountId, roleIds })
}

describe('estado de acesso', () => {
  it('a primeira conta é a dona e o @todos existe', async () => {
    const access = await owner.socket.emitWithAck('access:get')
    expect(access.ownerAccountId).toBe(owner.account.id)
    expect(access.roles.find((r) => r.id === EVERYONE_ROLE_ID)).toMatchObject({ name: '@todos', position: 0 })
  })

  it('qualquer mudança manda access:updated para todos', async () => {
    const b = await user()
    const updated = waitFor(b.socket, 'access:updated', (s) => s.roles.some((r) => r.name === 'Novo'))
    await createRole(owner, 'Novo')
    await updated
  })
})

describe('o que cada um recebe (revisão do Dev B)', () => {
  it('o estado de acesso já vem no hello; regras de canal privado só para quem vê', async () => {
    const vip = await createRole(owner, 'VIP hello', [], '#ff0088')
    const ch = await server.createChannel('privado-hello')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }, { roleId: vip.id, allow: ['view'] }])

    const z = await user('Zé')
    expect(z.state.access.roles.some((r) => r.id === vip.id && r.color === '#ff0088')).toBe(true) // cores para todos
    expect(z.state.access.overrides.some((o) => o.channelId === ch.id)).toBe(false) // não sabe que existe

    const b = await user('Bia')
    await setRoles(owner, b.account.id, [vip.id])
    const fresh = await (await server.connect(b.token)).emitWithAck('hello')
    expect(fresh.state.access.overrides.filter((o) => o.channelId === ch.id)).toHaveLength(2)
    expect((await owner.socket.emitWithAck('access:get')).overrides.filter((o) => o.channelId === ch.id)).toHaveLength(2)
  })

  it('access:updated também vem filtrado por pessoa', async () => {
    const z = await user('Zé')
    const ch = await server.createChannel('privado-update')
    const update = waitFor(z.socket, 'access:updated')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }])
    const [state] = await update
    expect(state.overrides.some((o) => o.channelId === ch.id)).toBe(false)
  })

  it('quem gerencia cargos não dá permissão de administração ao @todos (só a dona)', async () => {
    const admin = await createRole(owner, 'Admin @todos', ['manageRoles', 'manageMembers'])
    const c = await user('Carla')
    await setRoles(owner, c.account.id, [admin.id])
    expect(
      await c.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, permissions: ['view', 'send', 'manageMembers'] })
    ).toEqual({ ok: false, error: 'Só a dona pode dar permissões de administração ao @todos' })
    // permissões de canal no @todos ela pode
    expect((await c.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, permissions: ['view', 'send'] })).ok).toBe(true)
  })

  it('voice:join diz se pode falar e compartilhar; sem "falar" aparece silenciado', async () => {
    const b = await user()
    const room = await server.createChannel('Ouvintes', 'voice')
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['speak'] }])
    const res = await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    expect(res).toMatchObject({ ok: true, canSpeak: false, canShare: true })

    const stillMuted = waitFor(owner.socket, 'voice:state', (s) =>
      s.some((v) => v.userId === b.socket.id && v.muted && v.deafened)
    )
    b.socket.emit('voice:update', { muted: false, deafened: true }) // tenta se dessilenciar
    await stillMuted
    b.socket.emit('voice:leave')
  })
})

describe('LiveKit: o que a pessoa pode publicar', () => {
  it('o token só libera microfone com "falar" e tela com "compartilhar"', async () => {
    const b = await user()
    const room = await server.createChannel('Só tela', 'voice')
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['speak'] }])
    const res = await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    if (!res.ok) throw new Error(res.error)
    const claims = await verifier.verify(res.token)
    expect(claims.video?.canPublishSources).toEqual(['screen_share', 'screen_share_audio', 'camera'])
    expect(claims.video?.canPublish).toBe(true)
    b.socket.emit('voice:leave')

    const mute = await server.createChannel('Plateia', 'voice')
    await overrides(mute.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['speak', 'share', 'video'] }])
    const res2 = await b.socket.emitWithAck('voice:join', { channelId: mute.id, muted: false, deafened: false })
    if (!res2.ok) throw new Error(res2.error)
    expect((await verifier.verify(res2.token)).video).toMatchObject({ canPublish: false, canPublishSources: [] })
    b.socket.emit('voice:leave')
  })

  it('câmera (B21) só com "ligar a câmera"; perder com a pessoa na sala tira a câmera do LiveKit', async () => {
    const b = await user()
    const room = await server.createChannel('Sem câmera', 'voice')
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['video'] }])
    const res = await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    if (!res.ok) throw new Error(res.error)
    expect(res).toMatchObject({ canSpeak: true, canShare: true, canVideo: false })
    expect((await verifier.verify(res.token)).video?.canPublishSources).not.toContain('camera')
    b.socket.emit('voice:leave')

    const live = await server.createChannel('Câmeras', 'voice')
    const joined = await b.socket.emitWithAck('voice:join', { channelId: live.id, muted: false, deafened: false })
    expect(joined).toMatchObject({ ok: true, canVideo: true })
    await overrides(live.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['video'] }])
    const call = await livekit.waitCall('UpdateParticipant', (body) => body.identity === b.socket.id)
    expect(call.body).toMatchObject({ room: live.id, permission: { canPublishSources: ['MICROPHONE', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'] } })
    b.socket.emit('voice:leave')
  })

  it('perder "falar" com a pessoa na sala: LiveKit atualizado na hora e ela fica silenciada', async () => {
    const b = await user()
    const room = await server.createChannel('Debate', 'voice')
    const joined = await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    expect(joined).toMatchObject({ ok: true, canSpeak: true })

    const muted = waitFor(owner.socket, 'voice:state', (s) => s.some((v) => v.userId === b.socket.id && v.muted))
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['speak'] }])
    const call = await livekit.waitCall('UpdateParticipant', (body) => body.identity === b.socket.id)
    expect(call.body).toMatchObject({
      room: room.id,
      permission: { canPublishSources: ['SCREEN_SHARE', 'SCREEN_SHARE_AUDIO', 'CAMERA'] }
    })
    await muted
    b.socket.emit('voice:leave')
  })

  it('perder "entrar" com a pessoa na sala: sai também do LiveKit', async () => {
    const b = await user()
    const room = await server.createChannel('Fechando', 'voice')
    await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['connect'] }])
    const call = await livekit.waitCall('RemoveParticipant', (body) => body.identity === b.socket.id)
    expect(call.body).toMatchObject({ room: room.id })
  })

  it('mudança que não afeta a sala não chama o LiveKit', async () => {
    const b = await user()
    const room = await server.createChannel('Tranquila', 'voice')
    await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    const before = livekit.calls.filter((c) => c.method === 'UpdateParticipant' && c.body.identity === b.socket.id).length
    await createRole(owner, 'Irrelevante')
    await new Promise((r) => setTimeout(r, 200))
    const after = livekit.calls.filter((c) => c.method === 'UpdateParticipant' && c.body.identity === b.socket.id).length
    expect(after).toBe(before)
    b.socket.emit('voice:leave')
  })
})

describe('canal privado', () => {
  it('quem não pode ver: some da lista, não recebe mensagens nem "digitando" e não lê o histórico', async () => {
    const b = await user('Bia')
    const ch = await server.createChannel('segredo')
    const hidden = waitFor(b.socket, 'channels:visible', (list) => !list.some((c) => c.id === ch.id))
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }])
    await hidden

    const helloAgain = await (await server.connect(b.token)).emitWithAck('hello')
    expect(helloAgain.state.channels.some((c) => c.id === ch.id)).toBe(false)

    const noMessage = expectNoEvent(b.socket, 'message:new', (m) => m.channelId === ch.id)
    const noTyping = expectNoEvent(b.socket, 'typing', (t) => t.channelId === ch.id)
    owner.socket.emit('typing', ch.id)
    owner.socket.emit('message:send', { channelId: ch.id, content: 'só a dona vê' })
    await waitFor(owner.socket, 'message:new', (m) => m.channelId === ch.id)
    await noMessage
    await noTyping

    expect(await b.socket.emitWithAck('message:history', { channelId: ch.id })).toEqual({ messages: [], hasMore: false })
    const silent = expectNoEvent(owner.socket, 'message:new', (m) => m.channelId === ch.id)
    b.socket.emit('message:send', { channelId: ch.id, content: 'invasão' })
    await silent
  })

  it('ganhar um cargo liberado mostra o canal; perder o cargo esconde de novo', async () => {
    const b = await user()
    const vip = await createRole(owner, 'VIP')
    const ch = await server.createChannel('vip')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }, { roleId: vip.id, allow: ['view'] }])

    const shown = waitFor(b.socket, 'channels:visible', (list) => list.some((c) => c.id === ch.id))
    expect(await setRoles(owner, b.account.id, [vip.id])).toEqual({ ok: true })
    await shown
    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    owner.socket.emit('message:send', { channelId: ch.id, content: 'bem-vinda' })
    await got

    const hiddenAgain = waitFor(b.socket, 'channels:visible', (list) => !list.some((c) => c.id === ch.id))
    await setRoles(owner, b.account.id, [])
    await hiddenAgain
  })

  it('sala de voz privada: não entra, não vê quem está lá; perder o acesso tira da sala', async () => {
    const b = await user()
    const vip = await createRole(owner, 'VIP voz')
    const room = await server.createChannel('Sala VIP', 'voice')
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }, { roleId: vip.id, allow: ['view'] }])

    expect(await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })).toEqual({
      ok: false,
      error: 'Canal de voz não encontrado'
    })
    const ownerInRoom = waitFor(owner.socket, 'voice:state', (s) => s.some((v) => v.userId === owner.socket.id))
    const bSeesNothing = expectNoEvent(b.socket, 'voice:state', (s) => s.some((v) => v.channelId === room.id))
    await owner.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })
    await ownerInRoom
    await bSeesNothing

    await setRoles(owner, b.account.id, [vip.id])
    expect((await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })).ok).toBe(true)
    const kicked = waitFor(b.socket, 'voice:state', (s) => !s.some((v) => v.userId === b.socket.id))
    await setRoles(owner, b.account.id, [])
    await kicked
    owner.socket.emit('voice:leave')
  })
})

describe('regras de enviar, anexar e entrar', () => {
  it('sem "enviar": mensagem recusada com o motivo, mas continua vendo', async () => {
    const b = await user()
    const ch = await server.createChannel('anuncios')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['send'] }])
    const silent = expectNoEvent(owner.socket, 'message:new', (m) => m.channelId === ch.id)
    expect(await b.socket.emitWithAck('message:send', { channelId: ch.id, content: 'posso?' })).toEqual({
      ok: false,
      error: 'Você não tem permissão para enviar mensagens neste canal'
    })
    await silent
    const reads = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    owner.socket.emit('message:send', { channelId: ch.id, content: 'aviso' })
    await reads
  })

  it('perder o acesso ao canal invalida na hora o link do anexo que a pessoa já tinha', async () => {
    const b = await user()
    const ch = await server.createChannel('fotos-privadas')
    const up = await server.upload(owner.token, Buffer.from('conteudo'), { name: 'foto.txt' })
    if (!up.body.ok) throw new Error('upload falhou')
    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    owner.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [up.body.attachment.id] })
    const link = (await got)[0].attachments[0].url
    expect((await fetch(server.url + link)).status).toBe(200)

    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }])
    expect((await fetch(server.url + link)).status).toBe(404)
  })

  it('sem "anexar": texto passa, mensagem com anexo é ignorada', async () => {
    const b = await user()
    const ch = await server.createChannel('so-texto')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['attach'] }])
    const up = await server.upload(b.token, 'arquivo')
    if (!up.body.ok) throw new Error('upload falhou')
    const silent = expectNoEvent(owner.socket, 'message:new', (m) => m.channelId === ch.id && m.attachments.length > 0)
    b.socket.emit('message:send', { channelId: ch.id, content: 'com anexo', attachmentIds: [up.body.attachment.id] })
    await silent
    const text = waitFor(owner.socket, 'message:new', (m) => m.channelId === ch.id && m.content === 'só texto')
    b.socket.emit('message:send', { channelId: ch.id, content: 'só texto' })
    await text
  })

  it('sem "entrar": erro claro na sala de voz', async () => {
    const b = await user()
    const room = await server.createChannel('Palco', 'voice')
    await overrides(room.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['connect'] }])
    expect(await b.socket.emitWithAck('voice:join', { channelId: room.id, muted: false, deafened: false })).toEqual({
      ok: false,
      error: 'Você não tem permissão para entrar nesta sala'
    })
  })

  it('@todos sem "enviar" vale para todos os canais', async () => {
    const b = await user()
    const geral = b.state.channels.find((c) => c.name === 'geral')!
    await owner.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, permissions: ['view', 'connect'] })
    const silent = expectNoEvent(owner.socket, 'message:new', (m) => m.channelId === geral.id)
    b.socket.emit('message:send', { channelId: geral.id, content: 'mudo' })
    await silent
  })
})

describe('hierarquia e validação', () => {
  it('sem "gerenciar cargos" não cria cargo', async () => {
    const b = await user()
    expect(await b.socket.emitWithAck('role:create', { name: 'x', color: null, permissions: [] })).toEqual({
      ok: false,
      error: 'Você não tem permissão para gerenciar cargos'
    })
  })

  it('admin cria cargo abaixo do seu, não dá permissão que não tem, não mexe em cargo igual/acima nem na dona', async () => {
    const admin = await createRole(owner, 'Admin', ['manageRoles', 'manageMembers'])
    const c = await user('Carla')
    await setRoles(owner, c.account.id, [admin.id])

    const mod = await createRole(c, 'Mod', ['manageMembers'])
    const access = await c.socket.emitWithAck('access:get')
    const pos = (id: string) => access.roles.find((r) => r.id === id)!.position
    expect(pos(mod.id)).toBeLessThan(pos(admin.id))

    expect(await c.socket.emitWithAck('role:create', { name: 'Canais', color: null, permissions: ['manageChannels'] })).toEqual({
      ok: false,
      error: 'Você não pode dar permissões que não tem'
    })
    expect(await c.socket.emitWithAck('role:update', { id: admin.id, name: 'Eu mando' })).toEqual({
      ok: false,
      error: 'Você só pode alterar cargos abaixo do seu'
    })
    expect(await c.socket.emitWithAck('role:delete', EVERYONE_ROLE_ID)).toEqual({ ok: false, error: 'O @todos não pode ser apagado' })
    expect((await c.socket.emitWithAck('role:update', { id: mod.id, color: '#AABBCC' })).ok).toBe(true)

    const d = await user('Davi')
    expect(await setRoles(c, d.account.id, [mod.id])).toEqual({ ok: true })
    expect(await setRoles(c, d.account.id, [admin.id])).toEqual({ ok: false, error: 'Você só pode dar ou tirar cargos abaixo do seu' })
    expect(await setRoles(c, owner.account.id, [mod.id])).toEqual({
      ok: false,
      error: 'Você não pode alterar os cargos da dona da comunidade'
    })
  })

  it('quem tem "gerenciar membros" não dá a si mesmo um cargo abaixo com permissão que não tem', async () => {
    const mod = await createRole(owner, 'Mod', ['manageMembers'])
    const canais = await createRole(owner, 'Canais', ['manageChannels'])
    await owner.socket.emitWithAck('role:reorder', [canais.id, mod.id])
    const m = await user('Marta')
    await setRoles(owner, m.account.id, [mod.id])

    expect(await setRoles(m, m.account.id, [mod.id, canais.id])).toEqual({
      ok: false,
      error: 'Você não pode alterar os próprios cargos'
    })
    const access = await m.socket.emitWithAck('access:get')
    expect(access.members.find((x) => x.accountId === m.account.id)?.roleIds).toEqual([mod.id])
  })

  describe('alterar cargos dos membros (assignRoles)', () => {
    async function setup() {
      const gerente = await createRole(owner, 'Gerente', ['assignRoles'])
      const vip = await createRole(owner, 'VIP')
      const acima = await createRole(owner, 'Acima')
      await owner.socket.emitWithAck('role:reorder', [vip.id, gerente.id, acima.id])
      const g = await user('Gil')
      await setRoles(owner, g.account.id, [gerente.id])
      return { gerente, vip, acima, g }
    }

    it('dá e tira cargo abaixo do seu de alguém abaixo', async () => {
      const { vip, g } = await setup()
      const h = await user('Hugo')
      expect(await setRoles(g, h.account.id, [vip.id])).toEqual({ ok: true })
      expect(await setRoles(g, h.account.id, [])).toEqual({ ok: true })
    })

    it('recusa cargo igual ou acima do seu', async () => {
      const { gerente, acima, g } = await setup()
      const h = await user('Hugo')
      const error = 'Você só pode dar ou tirar cargos abaixo do seu'
      expect(await setRoles(g, h.account.id, [gerente.id])).toEqual({ ok: false, error })
      expect(await setRoles(g, h.account.id, [acima.id])).toEqual({ ok: false, error })
    })

    it('dá e tira cargo abaixo do seu de quem está no seu nível ou acima, sem tocar nos cargos altos dele', async () => {
      const { gerente, vip, acima, g } = await setup()
      const igual = await user('Igor')
      await setRoles(owner, igual.account.id, [gerente.id])
      const alto = await user('Julia')
      await setRoles(owner, alto.account.id, [acima.id])
      expect(await setRoles(g, igual.account.id, [gerente.id, vip.id])).toEqual({ ok: true })
      expect(await setRoles(g, alto.account.id, [acima.id, vip.id])).toEqual({ ok: true })
      const rolesOf = async (accountId: string) =>
        (await g.socket.emitWithAck('access:get')).members.find((m) => m.accountId === accountId)?.roleIds.sort()
      expect(await rolesOf(alto.account.id)).toEqual([acima.id, vip.id].sort())
      expect(await setRoles(g, alto.account.id, [acima.id])).toEqual({ ok: true })
      expect(await rolesOf(alto.account.id)).toEqual([acima.id])
      const error = 'Você só pode dar ou tirar cargos abaixo do seu'
      expect(await setRoles(g, alto.account.id, [vip.id])).toEqual({ ok: false, error })
      expect(await setRoles(g, igual.account.id, [vip.id])).toEqual({ ok: false, error })
    })

    it('recusa a dona e a si mesmo', async () => {
      const { gerente, vip, g } = await setup()
      expect(await setRoles(g, owner.account.id, [vip.id])).toEqual({
        ok: false,
        error: 'Você não pode alterar os cargos da dona da comunidade'
      })
      expect(await setRoles(g, g.account.id, [gerente.id, vip.id])).toEqual({
        ok: false,
        error: 'Você não pode alterar os próprios cargos'
      })
    })

    it('sem a permissão é recusado, mesmo com cargo mais alto', async () => {
      const { vip } = await setup()
      const semPerm = await createRole(owner, 'Enfeite')
      const k = await user('Kel')
      await setRoles(owner, k.account.id, [semPerm.id])
      const h = await user('Hugo')
      expect(await setRoles(k, h.account.id, [vip.id])).toEqual({
        ok: false,
        error: 'Você não tem permissão para alterar cargos dos membros'
      })
    })
  })

  it('reordenar: só a lista exata dos cargos que dá para mexer', async () => {
    const a = await createRole(owner, 'A')
    const b = await createRole(owner, 'B')
    expect(await owner.socket.emitWithAck('role:reorder', [a.id])).toEqual({ ok: false, error: 'Lista de cargos inválida' })
    expect(await owner.socket.emitWithAck('role:reorder', [b.id, a.id])).toEqual({ ok: true })
    const access = await owner.socket.emitWithAck('access:get')
    const pos = (id: string) => access.roles.find((r) => r.id === id)!.position
    expect(pos(b.id)).toBeLessThan(pos(a.id))
  })

  it('valida nome, cor, permissões e regras de canal', async () => {
    const bad = (payload: Parameters<typeof owner.socket.emitWithAck<'role:create'>>[1]) =>
      owner.socket.emitWithAck('role:create', payload)
    expect(await bad({ name: '   ', color: null, permissions: [] })).toMatchObject({ ok: false })
    expect(await bad({ name: '@todos', color: null, permissions: [] })).toMatchObject({ ok: false })
    expect(await bad({ name: 'Cor', color: 'azul', permissions: [] })).toEqual({ ok: false, error: 'Cor inválida' })
    expect(await bad({ name: 'Perm', color: null, permissions: ['voar' as never] })).toEqual({ ok: false, error: 'Permissões inválidas' })
    expect(await owner.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, name: 'todos' })).toEqual({
      ok: false,
      error: 'No @todos só dá para mudar as permissões'
    })

    const ch = await server.createChannel('validacao')
    expect(
      await owner.socket.emitWithAck('channel:set-overrides', {
        channelId: ch.id,
        overrides: [{ roleId: EVERYONE_ROLE_ID, allow: ['send'], deny: ['send'] }]
      })
    ).toEqual({ ok: false, error: 'Uma permissão não pode ser liberada e negada ao mesmo tempo' })
    expect(
      await owner.socket.emitWithAck('channel:set-overrides', {
        channelId: ch.id,
        overrides: [{ roleId: '11111111-1111-1111-1111-111111111111', allow: [], deny: ['view'] }]
      })
    ).toEqual({ ok: false, error: 'Regras inválidas' })
    const b = await user()
    expect(await b.socket.emitWithAck('channel:set-overrides', { channelId: ch.id, overrides: [] })).toEqual({
      ok: false,
      error: 'Você não tem permissão para gerenciar canais'
    })
  })

  it('quem tem "gerenciar canais" cria canal e vê canais privados', async () => {
    const manager = await createRole(owner, 'Canais', ['manageChannels'])
    const e = await user('Eva')
    const ch = await server.createChannel('privado-adm')
    await overrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, deny: ['view'] }])
    const shown = waitFor(e.socket, 'channels:visible', (list) => list.some((c) => c.id === ch.id))
    await setRoles(owner, e.account.id, [manager.id])
    await shown
    expect((await e.socket.emitWithAck('channel:create', { name: 'da-eva', type: 'text' })).ok).toBe(true)
  })
})

describe('reordenar cargos', () => {
  async function ladder() {
    const fundo = await createRole(owner, 'Fundo')
    const meio = await createRole(owner, 'Meio')
    const gerente = await createRole(owner, 'Gerente', ['manageRoles'])
    const topo = await createRole(owner, 'Topo')
    const g = await user('Gil')
    await setRoles(owner, g.account.id, [gerente.id])
    return { fundo, meio, gerente, topo, g }
  }
  const positions = async (by: TestUser) =>
    Object.fromEntries((await by.socket.emitWithAck('access:get')).roles.map((r) => [r.name, r.position]))

  it('quem gerencia cargos troca a ordem dos cargos abaixo do seu e todos recebem access:updated', async () => {
    const { fundo, meio, g } = await ladder()
    const before = await positions(g)
    const other = await user('Outra')
    const updated = waitFor(other.socket, 'access:updated', (s) => {
      const pos = (id: string) => s.roles.find((r) => r.id === id)?.position ?? -1
      return pos(meio.id) < pos(fundo.id)
    })
    expect(await g.socket.emitWithAck('role:reorder', [meio.id, fundo.id])).toEqual({ ok: true })
    await updated
    const after = await positions(g)
    expect(after.Meio).toBe(before.Fundo)
    expect(after.Fundo).toBe(before.Meio)
    expect(after.Gerente).toBe(before.Gerente)
    expect(after.Topo).toBe(before.Topo)
  })

  it('não move o próprio cargo, os de cima nem o @todos', async () => {
    const { fundo, meio, gerente, topo, g } = await ladder()
    const before = await positions(g)
    const error = 'Você só pode mover cargos abaixo do seu'
    expect(await g.socket.emitWithAck('role:reorder', [meio.id, gerente.id, fundo.id])).toEqual({ ok: false, error })
    expect(await g.socket.emitWithAck('role:reorder', [meio.id, fundo.id, topo.id])).toEqual({ ok: false, error })
    expect(await g.socket.emitWithAck('role:reorder', [EVERYONE_ROLE_ID, meio.id, fundo.id])).toEqual({ ok: false, error })
    expect(await positions(g)).toEqual(before)
  })

  it('ordem inválida é recusada sem mudar nada', async () => {
    const { fundo, meio, g } = await ladder()
    const before = await positions(g)
    const error = 'Lista de cargos inválida'
    expect(await g.socket.emitWithAck('role:reorder', [meio.id])).toEqual({ ok: false, error })
    expect(await g.socket.emitWithAck('role:reorder', [meio.id, meio.id])).toEqual({ ok: false, error })
    expect(await g.socket.emitWithAck('role:reorder', [meio.id, fundo.id, '11111111-1111-1111-1111-111111111111'])).toEqual({
      ok: false,
      error
    })
    expect(await g.socket.emitWithAck('role:reorder', 'x' as unknown as string[])).toEqual({ ok: false, error })
    expect(await positions(g)).toEqual(before)
  })

  it('a dona move qualquer cargo; o @todos fica sempre na posição 0', async () => {
    const { fundo, meio, gerente, topo } = await ladder()
    expect(await owner.socket.emitWithAck('role:reorder', [topo.id, gerente.id, meio.id, fundo.id])).toEqual({ ok: true })
    const after = await positions(owner)
    expect(after.Topo).toBeLessThan(after.Fundo)
    expect(after['@todos']).toBe(0)
  })
})

describe('Administrador', () => {
  async function crew() {
    const adm = await createRole(owner, 'Adm', ['administrator'])
    const topo = await createRole(owner, 'Topo', ['manageMembers'])
    const a = await user('Adriana')
    await setRoles(owner, a.account.id, [adm.id])
    return { adm, topo, a }
  }

  it('vê e usa canal com regra que nega a ele e ao @todos', async () => {
    const { adm, a } = await crew()
    const b = await user('Bruno')
    const ch = await server.createChannel('segredo-adm')
    const hiddenFromB = waitFor(b.socket, 'channels:visible', (list) => !list.some((c) => c.id === ch.id))
    const hiddenFromAdmin = expectNoEvent(a.socket, 'channels:visible', (list) => !list.some((c) => c.id === ch.id))
    await overrides(ch.id, [
      { roleId: EVERYONE_ROLE_ID, deny: ['view'] },
      { roleId: adm.id, deny: ['view', 'send'] }
    ])
    await hiddenFromB
    await hiddenFromAdmin
    const got = waitFor(owner.socket, 'message:new', (m) => m.content === 'admin aqui')
    a.socket.emit('message:send', { channelId: ch.id, content: 'admin aqui' })
    await got
  })

  it('edita, dá, reordena e apaga cargo acima do seu', async () => {
    const { adm, topo, a } = await crew()
    const b = await user('Bruno')
    expect((await a.socket.emitWithAck('role:update', { id: topo.id, name: 'Topo editado' })).ok).toBe(true)
    expect(await setRoles(a, b.account.id, [topo.id, adm.id])).toEqual({ ok: true })
    expect(await a.socket.emitWithAck('role:reorder', [topo.id, adm.id])).toEqual({ ok: true })
    expect(await a.socket.emitWithAck('role:delete', topo.id)).toEqual({ ok: true })
  })

  it('modera quem tem cargo acima do seu', async () => {
    const { topo, a } = await crew()
    const alto = await user('Alto')
    await setRoles(owner, alto.account.id, [topo.id])
    const sala = await server.createChannel('sala-adm', 'voice')
    const joined = await alto.socket.emitWithAck('voice:join', { channelId: sala.id, muted: false, deafened: false })
    expect(joined.ok).toBe(true)
    const kicked = waitFor(alto.socket, 'moderation:kicked')
    expect(await a.socket.emitWithAck('moderation:voice-kick', { userId: alto.self.id })).toEqual({ ok: true })
    await kicked
  })

  it('não mexe na dona nem nos próprios cargos', async () => {
    const { adm, topo, a } = await crew()
    expect(await setRoles(a, owner.account.id, [topo.id])).toEqual({
      ok: false,
      error: 'Você não pode alterar os cargos da dona da comunidade'
    })
    expect(await setRoles(a, a.account.id, [adm.id, topo.id])).toEqual({
      ok: false,
      error: 'Você não pode alterar os próprios cargos'
    })
  })

  it('só a dona ou um admin cria, liga, dá ou mexe num cargo com Administrador', async () => {
    const { adm, topo, a } = await crew()
    const gerente = await createRole(owner, 'Gerente', ['manageRoles', 'assignRoles'])
    const vip = await createRole(owner, 'VIP')
    await owner.socket.emitWithAck('role:reorder', [vip.id, adm.id, gerente.id, topo.id])
    const g = await user('Gil')
    await setRoles(owner, g.account.id, [gerente.id])
    const h = await user('Hugo')

    const noGrant = { ok: false, error: 'Você não pode dar permissões que não tem' }
    expect(await g.socket.emitWithAck('role:create', { name: 'Admin 2', color: null, permissions: ['administrator'] })).toEqual(noGrant)
    expect(await g.socket.emitWithAck('role:update', { id: vip.id, permissions: ['administrator'] })).toEqual(noGrant)
    const onlyFull = { ok: false, error: 'Só a dona ou um administrador mexe em cargos com Administrador' }
    expect(await setRoles(g, h.account.id, [adm.id])).toEqual(onlyFull)
    expect(await g.socket.emitWithAck('role:update', { id: adm.id, name: 'Rebaixado' })).toEqual(onlyFull)
    expect(await g.socket.emitWithAck('role:delete', adm.id)).toEqual(onlyFull)

    expect((await a.socket.emitWithAck('role:create', { name: 'Admin 2', color: null, permissions: ['administrator'] })).ok).toBe(true)
    expect((await a.socket.emitWithAck('role:update', { id: vip.id, permissions: ['administrator'] })).ok).toBe(true)
    expect(await setRoles(a, h.account.id, [adm.id])).toEqual({ ok: true })
  })
})
