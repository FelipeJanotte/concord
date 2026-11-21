import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DmEntry, User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { backToRoom, closeScreenPip, enterRoomView, leaveRoomView, openScreenPip } from './screen-pip'
import { watchScreens } from './screen-watching'

const SELF = { id: 'eu' } as User
const me: VoiceState = { userId: 'eu', channelId: 'sala', muted: false, deafened: false, sharing: false }
let socket: FakeSocket

beforeEach(() => {
  useApp.setState({ myVoiceChannelId: null })
  useApp.setState({ ...initialState, self: SELF, myVoiceChannelId: 'sala', voice: [me], screens: ['ana', 'bia'], section: 'home' })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

afterEach(() => {
  closeScreenPip()
  setSocket(null)
})

const lastWatching = (): unknown => socket.sent('voice:watching').at(-1)?.[0]

describe('miniatura da tela', () => {
  it('abrir mostra a tela e passa a assisti-la', () => {
    openScreenPip('ana')
    expect(useApp.getState().pipScreenId).toBe('ana')
    expect(voice.watchedScreens).toEqual(['ana'])
    expect(lastWatching()).toEqual(['ana'])
  })

  it('fechar para de assistir só o que era da miniatura', () => {
    watchScreens('room', ['bia'])
    openScreenPip('ana')
    closeScreenPip()
    expect(useApp.getState().pipScreenId).toBeNull()
    expect(voice.watchedScreens).toEqual(['bia'])
  })

  it('trocar de tela troca o que assiste', () => {
    openScreenPip('ana')
    openScreenPip('bia')
    expect(voice.watchedScreens).toEqual(['bia'])
  })

  it('fora da sala ou tela que não existe não abre', () => {
    openScreenPip('caio')
    expect(useApp.getState().pipScreenId).toBeNull()
    useApp.setState({ myVoiceChannelId: null })
    openScreenPip('ana')
    expect(useApp.getState().pipScreenId).toBeNull()
  })

  it('a tela acabou: fecha e para de assistir', () => {
    openScreenPip('ana')
    useApp.setState({ screens: ['bia'] })
    expect(useApp.getState().pipScreenId).toBeNull()
    expect(voice.watchedScreens).toEqual([])
  })

  it('saiu da sala: fecha', () => {
    openScreenPip('ana')
    useApp.setState({ myVoiceChannelId: null })
    expect(useApp.getState().pipScreenId).toBeNull()
  })

  it('sair da sala com tela em destaque abre a miniatura; voltar fecha', () => {
    leaveRoomView(['bia', 'ana'])
    expect(useApp.getState().pipScreenId).toBe('bia')
    enterRoomView()
    expect(useApp.getState().pipScreenId).toBeNull()
  })

  it('sair sem tela em destaque não abre', () => {
    leaveRoomView([])
    expect(useApp.getState().pipScreenId).toBeNull()
  })

  it('"Voltar para a sala" abre a sala de voz da comunidade', () => {
    openScreenPip('ana')
    backToRoom()
    expect(useApp.getState()).toMatchObject({ section: 'community', view: { kind: 'voice', channelId: 'sala' } })
  })

  it('"Voltar para a sala" numa chamada abre a conversa', () => {
    useApp.setState({ dms: [{ channel: { id: 'sala' } } as DmEntry] })
    openScreenPip('ana')
    backToRoom()
    expect(useApp.getState()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'sala' } })
    expect(useApp.getState().pipScreenId).toBeNull()
  })
})
