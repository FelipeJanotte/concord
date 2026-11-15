// @vitest-environment jsdom
// Chamadas na tela (B8): botão de ligar, painel da chamada na conversa, cartão de chamada recebida
// e os indicadores (lista de conversas, painel "Voz conectada").
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallInfo, DmEntry, User, VoiceState } from '@shared/types'
import { DmList } from '@/components/dm/DmList'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VoiceStatusPanel } from '@/components/UserPanel'
import { ringer } from '@/lib/actions/calls'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { CallButton } from './CallButton'
import { CallPanel } from './CallPanel'
import { IncomingCall } from './IncomingCall'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const me: User = { id: 'sock-eu', accountId: 'eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const dm: DmEntry = {
  channel: { id: 'dm1', name: 'dm', type: 'dm', createdAt: 0 },
  other: { id: 'ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
}
const call = (over: Partial<CallInfo> = {}): CallInfo => ({
  channelId: 'dm1',
  callerId: 'ana',
  calleeId: 'eu',
  status: 'ringing',
  since: 0,
  ...over
})
const inRoom = (u: User): VoiceState => ({ userId: u.id, channelId: 'dm1', muted: false, deafened: false, sharing: false })

let socket: FakeSocket

function setup(over: Partial<ReturnType<typeof useApp.getState>> = {}) {
  useApp.setState({ ...initialState, self: me, users: [me, ana], dms: [dm], friendsLoaded: true, ...over })
}
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  vi.spyOn(ringer, 'start').mockImplementation(() => {})
  vi.spyOn(ringer, 'stop').mockImplementation(() => {})
  vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
  vi.spyOn(voice, 'inRoom', 'get').mockReturnValue(true)
  vi.spyOn(voice, 'setUserVolume').mockImplementation(() => {})
  vi.spyOn(voice, 'setUserMuted').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('ligar', () => {
  it('"Iniciar chamada" manda o convite e entra na sala; some enquanto há chamada', async () => {
    socket.replyTo('call:invite', () => ({ ok: true, call: call({ callerId: 'eu', calleeId: 'ana' }) }))
    setup()
    ui(<CallButton dm={dm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar chamada' }))
    expect(socket.sent('call:invite')[0][0]).toBe('dm1')
    expect(voice.join).toHaveBeenCalledWith('dm1')
    expect(screen.queryByRole('button', { name: 'Iniciar chamada' })).toBeNull()
  })

  it('erro ao ligar aparece no aviso', async () => {
    socket.replyTo('call:invite', () => ({ ok: false, error: 'Essa pessoa está em outra chamada' }))
    setup()
    ui(<CallButton dm={dm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar chamada' }))
    expect(useApp.getState().notice?.text).toBe('Essa pessoa está em outra chamada')
  })
})

describe('painel da chamada na conversa', () => {
  it('chamando: "Chamando Ana..." e cancelar', async () => {
    socket.replyTo('call:cancel', () => ({ ok: true }))
    setup({ calls: { dm1: call({ callerId: 'eu', calleeId: 'ana' }) } })
    ui(<CallPanel dm={dm} />)
    expect(screen.getByText('Chamando Ana...')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar chamada' }))
    expect(socket.sent('call:cancel')).toEqual([['dm1']])
  })

  it('tocando para mim: atender e recusar', async () => {
    socket.replyTo('call:decline', () => ({ ok: true }))
    socket.replyTo('call:accept', () => ({ ok: true, call: call({ status: 'active' }) }))
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    setup({ calls: { dm1: call() } })
    ui(<CallPanel dm={dm} />)
    expect(screen.getByText('Ana está ligando...')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(socket.sent('call:decline')).toEqual([['dm1']])
    await userEvent.click(screen.getByRole('button', { name: 'Atender' }))
    expect(socket.sent('call:accept')).toEqual([['dm1']])
    expect(voice.join).toHaveBeenCalledWith('dm1')
  })

  it('em andamento: grade de quem está na sala e "Desligar"', async () => {
    socket.replyTo('call:end', () => ({ ok: true }))
    setup({ calls: { dm1: call({ status: 'active' }) }, myVoiceChannelId: 'dm1', voice: [inRoom(me), inRoom(ana)] })
    ui(<CallPanel dm={dm} />)
    expect(screen.getByText('Ana')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Desligar' }))
    expect(socket.sent('call:end')).toEqual([['dm1']])
  })

  it('em andamento sem eu estar na sala (outra janela): "Entrar na chamada"', async () => {
    setup({ calls: { dm1: call({ status: 'active' }) }, voice: [inRoom(ana)] })
    ui(<CallPanel dm={dm} />)
    await userEvent.click(screen.getByRole('button', { name: /Entrar na chamada/ }))
    expect(voice.join).toHaveBeenCalledWith('dm1')
  })

  it('sem chamada: nada', () => {
    setup()
    const { container } = ui(<CallPanel dm={dm} />)
    expect(container.textContent).toBe('')
  })
})

describe('chamada recebida (cartão no canto)', () => {
  it('aparece em qualquer tela e atender abre a conversa', async () => {
    socket.replyTo('call:accept', () => ({ ok: true, call: call({ status: 'active' }) }))
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    setup({ calls: { dm1: call() } })
    ui(<IncomingCall />)
    expect(screen.getByRole('alertdialog', { name: 'Chamada de Ana' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Atender' }))
    expect(useApp.getState()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'dm1' } })
  })

  it('não aparece para quem ligou nem com a conversa já aberta', () => {
    setup({ calls: { dm1: call({ callerId: 'eu', calleeId: 'ana' }) } })
    ui(<IncomingCall />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    cleanup()

    setup({ calls: { dm1: call() }, section: 'home', homeView: { kind: 'dm', channelId: 'dm1' } })
    ui(<IncomingCall />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('indicadores', () => {
  it('telefone na lista de conversas e "Chamada com Ana" no painel de voz', async () => {
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    setup({ calls: { dm1: call({ status: 'active' }) }, myVoiceChannelId: 'dm1' })
    ui(
      <>
        <DmList />
        <VoiceStatusPanel />
      </>
    )
    expect(screen.getByLabelText('Em chamada')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Chamada com Ana' }))
    expect(useApp.getState().homeView).toEqual({ kind: 'dm', channelId: 'dm1' })
  })
})
