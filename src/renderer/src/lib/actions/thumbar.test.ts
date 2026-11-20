// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThumbarAction, ThumbarBridge, ThumbarButton } from '@shared/thumbar'
import { setSocket } from '@/lib/core'
import type { ThumbarIcons } from '@/lib/thumbar-icons'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { startThumbar, thumbarEnv } from './thumbar'

const ICONS: ThumbarIcons = { mic: 'png-mic', micOff: 'png-mic-off', headphones: 'png-fone', headphonesOff: 'png-fone-off', leave: 'png-sair' }

function fakeBridge() {
  const sent: ThumbarButton[][] = []
  let click: ((action: ThumbarAction) => void) | null = null
  const bridge: ThumbarBridge = {
    setButtons: (buttons) => sent.push(buttons),
    onClick: (listener) => {
      click = listener
      return () => (click = null)
    }
  }
  return { bridge, sent, click: (action: ThumbarAction) => click?.(action), listening: () => click !== null }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const inVoice = { myVoiceChannelId: 'sala', voiceCanSpeak: true }
const summary = (buttons: ThumbarButton[] | undefined) => buttons?.map((b) => [b.action, b.tooltip, b.icon])

let fake: ReturnType<typeof fakeBridge>
let stop: () => void
let socket: FakeSocket

beforeEach(() => {
  useApp.setState({ ...initialState })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  fake = fakeBridge()
  vi.spyOn(thumbarEnv, 'bridge').mockReturnValue(fake.bridge)
  vi.spyOn(thumbarEnv, 'drawIcons').mockResolvedValue(ICONS)
  vi.spyOn(voice, 'setMuted').mockImplementation(() => {})
  vi.spyOn(voice, 'setDeafened').mockImplementation(() => {})
  vi.spyOn(voice, 'leave').mockImplementation(() => {})
})
afterEach(() => {
  stop?.()
  vi.restoreAllMocks()
})

describe('botões na miniatura da barra de tarefas', () => {
  it('fora de chamada não há botões; ao entrar aparecem os três', async () => {
    stop = startThumbar()
    await flush()
    expect(fake.sent).toEqual([[]])

    useApp.setState(inVoice)
    await flush()
    expect(summary(fake.sent.at(-1))).toEqual([
      ['mute', 'Silenciar', 'png-mic'],
      ['deafen', 'Desativar áudio', 'png-fone'],
      ['leave', 'Sair da chamada', 'png-sair']
    ])
  })

  it('o ícone e a dica trocam com o silenciar e o desativar áudio', async () => {
    useApp.setState(inVoice)
    stop = startThumbar()
    useApp.setState({ muted: true })
    await flush()
    expect(summary(fake.sent.at(-1))?.slice(0, 2)).toEqual([
      ['mute', 'Ativar microfone', 'png-mic-off'],
      ['deafen', 'Desativar áudio', 'png-fone']
    ])

    useApp.setState({ deafened: true })
    await flush()
    expect(summary(fake.sent.at(-1))?.[1]).toEqual(['deafen', 'Ativar áudio', 'png-fone-off'])
  })

  it('sem microfone ou sem permissão de falar o microfone aparece silenciado', async () => {
    useApp.setState({ ...inVoice, noMic: true })
    stop = startThumbar()
    await flush()
    expect(fake.sent.at(-1)?.[0]?.icon).toBe('png-mic-off')

    useApp.setState({ noMic: false, voiceCanSpeak: false })
    await flush()
    expect(fake.sent.at(-1)?.[0]?.icon).toBe('png-mic-off')
  })

  it('sair da chamada tira os botões', async () => {
    useApp.setState(inVoice)
    stop = startThumbar()
    await flush()
    useApp.setState({ myVoiceChannelId: null })
    await flush()
    expect(fake.sent.at(-1)).toEqual([])
  })

  it('mudança que não mexe na chamada não reenvia os botões', async () => {
    useApp.setState(inVoice)
    stop = startThumbar()
    await flush()
    const count = fake.sent.length
    useApp.setState({ unread: { canal: true } })
    await flush()
    expect(fake.sent).toHaveLength(count)
  })

  it('sem como desenhar os ícones não manda botões quebrados', async () => {
    vi.mocked(thumbarEnv.drawIcons).mockResolvedValue(null)
    useApp.setState(inVoice)
    stop = startThumbar()
    await flush()
    expect(fake.sent.every((buttons) => buttons.length === 0)).toBe(true)
  })

  it('sair da chamada enquanto os ícones são desenhados não deixa botões para trás', async () => {
    let finishDrawing: (icons: ThumbarIcons) => void = () => {}
    vi.mocked(thumbarEnv.drawIcons).mockReturnValue(new Promise((resolve) => (finishDrawing = resolve)))
    useApp.setState(inVoice)
    stop = startThumbar()
    useApp.setState({ myVoiceChannelId: null })
    finishDrawing(ICONS)
    await flush()
    expect(fake.sent).toEqual([[]])
  })

  it('clique nos botões silencia, desativa o áudio e sai da chamada', async () => {
    useApp.setState(inVoice)
    stop = startThumbar()

    fake.click('mute')
    expect(useApp.getState().muted).toBe(true)
    fake.click('mute')
    fake.click('deafen')
    expect(useApp.getState()).toMatchObject({ muted: true, deafened: true })
    fake.click('leave')
    expect(voice.leave).toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBeNull()
  })

  it('parar desliga o clique e tira os botões; fora do app desktop não faz nada', async () => {
    useApp.setState(inVoice)
    stop = startThumbar()
    await flush()
    stop()
    expect(fake.listening()).toBe(false)
    expect(fake.sent.at(-1)).toEqual([])

    vi.mocked(thumbarEnv.bridge).mockReturnValue(null)
    expect(() => (stop = startThumbar())).not.toThrow()
  })
})
