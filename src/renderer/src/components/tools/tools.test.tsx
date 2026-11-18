// @vitest-environment jsdom
// B10 na tela: painéis das ferramentas (o que vai para o servidor, canal sugerido, erro, resultado) e os
// cartões no chat (times + mover para as salas, dado, moeda, sortear 1, enquete).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, DmEntry, Message, PollResult, ToolPayload, User, VoiceState } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { CoinPanel } from './CoinPanel'
import { DicePanel } from './DicePanel'
import { onlinePeople, peopleInRoom } from './people'
import { PickPanel } from './PickPanel'
import { PollPanel } from './PollPanel'
import { TOOLS } from './registry'
import { mergePlayers, TeamRandomizerPanel } from './TeamRandomizerPanel'
import { ToolResultCard } from './ToolResultCard'

const user = (id: string, name: string, accountId = `acc-${id}`): User => ({ id, accountId, name, tag: id, color: '#fff', avatarUrl: null })
const me = user('sock-eu', 'Eu', 'acc-eu')
const ana = user('sock-ana', 'Ana')
const bia = user('sock-bia', 'Bia')
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const jogos: Channel = { id: 'jogos', name: 'jogos', type: 'text', createdAt: 0 }
const lobby: Channel = { id: 'lobby', name: 'Lobby', type: 'voice', createdAt: 0 }
const sala1: Channel = { id: 'sala1', name: 'Time A', type: 'voice', createdAt: 0 }
const sala2: Channel = { id: 'sala2', name: 'Time B', type: 'voice', createdAt: 0 }
const dm: DmEntry = { channel: { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const inVoice = (u: User, channelId: string): VoiceState => ({ userId: u.id, channelId, muted: false, deafened: false, sharing: false })

const toolMessage = (tool: ToolPayload, over: Partial<Message> = {}): Message => ({
  id: 'm1',
  channelId: 'geral',
  author: me,
  content: 'texto por extenso',
  attachments: [],
  createdAt: 1,
  kind: 'tool',
  tool,
  ...over
})
const poll = (over: Partial<PollResult> = {}): PollResult => ({
  question: 'Qual mapa?',
  options: ['Dust', 'Mirage'],
  multiple: false,
  counts: [2, 1],
  voters: 3,
  closed: false,
  ...over
})

/** @todos com as permissões de canal comuns e sem manageMessages; a dona é outra conta */
const basicAccess = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect'] as const }],
  members: [],
  overrides: []
} as unknown as NonNullable<ReturnType<typeof useApp.getState>['access']>

let socket: FakeSocket

function setup(over: Partial<ReturnType<typeof useApp.getState>> = {}): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me, ana, bia],
    channels: [geral, jogos, lobby, sala1, sala2],
    section: 'tool',
    view: { kind: 'text', channelId: 'jogos' },
    ...over
  })
}
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('registro', () => {
  it('as cinco ferramentas estão no registro', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['teams', 'dice', 'coin', 'pick', 'poll'])
  })
})

describe('importar pessoas', () => {
  it('sala de voz e online: uma pessoa por conta, com o accountId', () => {
    const outraJanela = user('sock-ana-2', 'Ana', 'acc-sock-ana')
    const voice = [inVoice(ana, 'lobby'), inVoice(outraJanela, 'lobby'), inVoice(bia, 'sala1')]
    expect(peopleInRoom(voice, [me, ana, outraJanela, bia], 'lobby')).toEqual([{ name: 'Ana', accountId: 'acc-sock-ana' }])
    expect(peopleInRoom(voice, [ana], null)).toEqual([])
    expect(onlinePeople([ana, outraJanela, bia]).map((p) => p.name)).toEqual(['Ana', 'Bia'])
  })

  it('mergePlayers não repete conta nem nome (sem diferenciar maiúsculas)', () => {
    const list = mergePlayers([{ name: 'Ana', accountId: 'a' }], [{ name: 'ana' }, { name: 'Outro nome', accountId: 'a' }, { name: '  Caio  ' }, { name: ' ' }])
    expect(list).toEqual([{ name: 'Ana', accountId: 'a' }, { name: 'Caio' }])
  })
})

describe('painéis', () => {
  it('dado: sugere o canal que estava aberto, manda lados e quantidade e mostra o resultado', async () => {
    setup()
    const posted = toolMessage({ tool: 'dice', result: { sides: 20, rolls: [7, 12], total: 19 } }, { channelId: 'jogos' })
    socket.replyTo('tools:dice', () => ({ ok: true, message: posted }))
    ui(<DicePanel />)
    expect(screen.getByLabelText('Postar em')).toHaveProperty('value', 'jogos')
    await userEvent.click(screen.getByRole('button', { name: 'd20' }))
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } })
    await userEvent.click(screen.getByRole('button', { name: 'Rolar' }))
    expect(socket.sent('tools:dice')[0][0]).toEqual({ channelId: 'jogos', sides: 20, count: 2 })
    expect((await screen.findByRole('status')).textContent).toContain('Postado em #jogos.')
    const card = screen.getByRole('region', { name: 'Resultado do dado' })
    expect((card).textContent).toContain('19')
    expect(screen.getByRole('button', { name: 'Rolar de novo' })).toBeTruthy()
  })

  it('erro do servidor aparece no painel', async () => {
    setup()
    socket.replyTo('tools:coin', () => ({ ok: false, error: 'Muitos sorteios seguidos. Tente de novo em 3 s.' }))
    ui(<CoinPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Jogar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Muitos sorteios seguidos')
  })

  it('sem canal de comunidade aberto, sugere a conversa privada aberta', () => {
    setup({ view: { kind: 'voice', channelId: 'lobby' }, dms: [dm], homeView: { kind: 'dm', channelId: 'dm-ana' } })
    ui(<CoinPanel />)
    expect(screen.getByLabelText('Postar em')).toHaveProperty('value', 'dm-ana')
    expect(within(screen.getByLabelText('Postar em')).getAllByRole('option').map((o) => o.textContent)).toEqual(['#geral', '#jogos', '@Ana'])
  })

  it('canal sem permissão de mandar mensagem não aparece na lista', () => {
    setup({
      access: {
        ownerAccountId: 'acc-dona',
        roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect'] }],
        members: [],
        overrides: [{ channelId: 'jogos', roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['send'] }]
      }
    })
    ui(<CoinPanel />)
    expect(within(screen.getByLabelText('Postar em')).getAllByRole('option').map((o) => o.textContent)).toEqual(['#geral'])
  })

  it('sortear 1: importa quem está na minha sala de voz e manda o texto', async () => {
    setup({ myVoiceChannelId: 'lobby', voice: [inVoice(me, 'lobby'), inVoice(ana, 'lobby'), inVoice(bia, 'sala1')] })
    socket.replyTo('tools:pick', () => ({ ok: true, message: toolMessage({ tool: 'pick', result: { options: ['Eu', 'Ana'], picked: 'Ana' } }) }))
    ui(<PickPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Da minha sala de voz (2)' }))
    expect(screen.getByLabelText(/Opções/)).toHaveProperty('value', 'Eu\nAna')
    await userEvent.click(screen.getByRole('button', { name: 'Sortear' }))
    expect(socket.sent('tools:pick')[0][0]).toEqual({ channelId: 'jogos', options: ['Eu', 'Ana'] })
    expect((await screen.findByRole('region', { name: 'Resultado do sorteio' })).textContent).toContain('Ana')
  })

  it('enquete: pergunta, opções (adicionar/tirar) e várias respostas', async () => {
    setup()
    socket.replyTo('tools:poll', () => ({ ok: true, message: toolMessage({ tool: 'poll', result: poll() }) }))
    ui(<PollPanel />)
    const criar = screen.getByRole('button', { name: 'Criar enquete' })
    expect(criar).toHaveProperty('disabled', true)
    await userEvent.type(screen.getByLabelText('Pergunta'), 'Qual mapa?')
    await userEvent.type(screen.getByLabelText('Opção 1'), 'Dust')
    await userEvent.type(screen.getByLabelText('Opção 2'), 'Mirage')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar opção' }))
    await userEvent.type(screen.getByLabelText('Opção 3'), 'Inferno')
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a opção 2' }))
    await userEvent.click(screen.getByLabelText('Cada pessoa pode marcar várias opções'))
    await userEvent.click(criar)
    expect(socket.sent('tools:poll')[0][0]).toEqual({ channelId: 'jogos', question: 'Qual mapa?', options: ['Dust', 'Inferno'], multiple: true })
  })

  it('sorteador de times: digita, importa online com a conta, lanes e manda tudo', async () => {
    setup()
    socket.replyTo('tools:teams', () => ({
      ok: true,
      message: toolMessage({ tool: 'teams', result: { lanes: true, teams: [{ members: [{ name: 'Caio', lane: 'mid' }] }, { members: [{ name: 'Ana' }] }] } })
    }))
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'Caio, Duda{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Online (3)' }))
    const list = screen.getByRole('list', { name: 'Pessoas do sorteio' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Caio', 'Duda', 'Eu', 'Ana', 'Bia'])
    await userEvent.click(screen.getByRole('button', { name: 'Tirar Duda' }))
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    await userEvent.click(within(screen.getByRole('group', { name: 'Lanes preferidas de Caio' })).getByRole('button', { name: 'Meio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sortear times' }))
    expect(socket.sent('tools:teams')[0][0]).toEqual({
      channelId: 'jogos',
      players: [
        { name: 'Caio', lanes: ['mid'] },
        { name: 'Eu', accountId: 'acc-eu' },
        { name: 'Ana', accountId: 'acc-sock-ana' },
        { name: 'Bia', accountId: 'acc-sock-bia' }
      ],
      teamCount: 2,
      lanes: true
    })
    expect((await screen.findByRole('region', { name: 'Times sorteados' })).textContent).toContain('Meio')
  })

  it('sorteador: escolhe as lanes disponíveis; preferência fora delas some e o limite acompanha', async () => {
    setup()
    socket.replyTo('tools:teams', () => ({ ok: true, message: toolMessage({ tool: 'teams', result: { lanes: true, teams: [] } }) }))
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'A,B,C,D,E,F,G{Enter}')
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    const group = screen.getByRole('group', { name: 'Lanes disponíveis' })
    expect(within(group).getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true)
    const prefsOfA = (): HTMLElement => screen.getByRole('group', { name: 'Lanes preferidas de A' })
    await userEvent.click(within(prefsOfA()).getByRole('button', { name: 'Selva' }))
    await userEvent.click(within(prefsOfA()).getByRole('button', { name: 'Meio' }))
    for (const name of ['Selva', 'Suporte']) await userEvent.click(within(group).getByRole('button', { name }))
    expect(screen.getByText('Lanes disponíveis (3/5)')).toBeTruthy()
    expect(within(prefsOfA()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Topo', 'Meio, 1ª preferência', 'Atirador'])
    // 7 pessoas em 2 times de no máximo 3
    expect(screen.getByText(/Com 3 lanes, cada time tem no máximo 3/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sortear times' })).toHaveProperty('disabled', true)
    await userEvent.click(screen.getByRole('button', { name: 'Tirar G' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Lanes preferidas de B' })).getByRole('button', { name: 'Meio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sortear times' }))
    const req = socket.sent('tools:teams')[0][0] as { laneSet: string[]; players: Array<{ name: string; lanes?: string[] }> }
    expect(req.laneSet).toEqual(['top', 'mid', 'adc'])
    expect(req.players.slice(0, 2)).toEqual([
      { name: 'A', lanes: ['mid'] },
      { name: 'B', lanes: ['mid'] }
    ])
  })

  it('sorteador: várias lanes preferidas por pessoa, em ordem, e tirar uma renumera as outras', async () => {
    setup()
    socket.replyTo('tools:teams', () => ({ ok: true, message: toolMessage({ tool: 'teams', result: { lanes: true, teams: [] } }) }))
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'Ana,Bia{Enter}')
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    const prefs = within(screen.getByRole('group', { name: 'Lanes preferidas de Ana' }))
    for (const name of ['Meio', 'Topo', 'Suporte']) await userEvent.click(prefs.getByRole('button', { name }))
    expect(prefs.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Topo, 2ª preferência',
      'Selva',
      'Meio, 1ª preferência',
      'Atirador',
      'Suporte, 3ª preferência'
    ])
    expect(prefs.getByRole('button', { name: /Suporte/ }).textContent).toContain('3ª')
    await userEvent.click(prefs.getByRole('button', { name: /Topo/ }))
    expect(prefs.getByRole('button', { name: /Suporte/ }).getAttribute('aria-label')).toBe('Suporte, 2ª preferência')
    expect(prefs.getByRole('button', { name: 'Topo' }).getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Sortear times' }))
    const req = socket.sent('tools:teams')[0][0] as { players: Array<{ name: string; lanes?: string[] }> }
    expect(req.players).toEqual([{ name: 'Ana', lanes: ['mid', 'support'] }, { name: 'Bia' }])
  })

  it('sorteador: sem nenhuma lane escolhida não deixa sortear', async () => {
    setup()
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'A,B{Enter}')
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    const group = screen.getByRole('group', { name: 'Lanes disponíveis' })
    for (const b of within(group).getAllByRole('button')) await userEvent.click(b)
    expect(screen.getByText('Escolha pelo menos uma lane.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sortear times' })).toHaveProperty('disabled', true)
  })

  it('sorteador: times menores que as lanes avisam que nem todas serão usadas', async () => {
    setup()
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'A,B,C,D{Enter}')
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    expect(screen.getByText('Times de até 2 pessoas: nem todas as 5 lanes serão usadas em cada time.')).toBeTruthy()
  })

  it('sorteador: com lanes e gente demais para os times, avisa e não deixa sortear', async () => {
    setup()
    ui(<TeamRandomizerPanel />)
    await userEvent.type(screen.getByLabelText(/Pessoas/), 'A,B,C,D,E,F,G,H,I,J,K{Enter}')
    await userEvent.click(screen.getByLabelText('Sortear lanes'))
    expect(screen.getByText(/no máximo 5 pessoas/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sortear times' })).toHaveProperty('disabled', true)
  })
})

describe('cartões no chat', () => {
  const teams = toolMessage({
    tool: 'teams',
    result: { lanes: false, teams: [{ members: [{ name: 'Ana', accountId: 'acc-sock-ana' }] }, { members: [{ name: 'Bia' }] }, { members: [{ name: 'Caio' }] }] }
  })

  it('o chat mostra o cartão da ferramenta no lugar do texto', async () => {
    setup({ section: 'community', view: { kind: 'text', channelId: 'geral' }, messages: { geral: [toolMessage({ tool: 'coin', result: { flips: ['cara', 'coroa', 'cara'] } })] } })
    ui(<ChatView channelId="geral" />)
    const card = screen.getByRole('region', { name: 'Resultado da moeda' })
    expect((card).textContent).toContain('2 caras, 1 coroa')
    expect(screen.queryByText('texto por extenso')).toBeNull()
  })

  it('ferramenta desconhecida (servidor mais novo) mostra o texto por extenso', () => {
    setup()
    ui(<ToolResultCard message={toolMessage({ tool: 'nova' } as unknown as ToolPayload)} />)
    expect(screen.getByText('texto por extenso')).toBeTruthy()
  })

  it('mover para as salas: uma sala por time (ou não mover) e o resumo com quem foi pulado', async () => {
    setup()
    socket.replyTo('tools:move-teams', () => ({ ok: true, moved: 1, skipped: [{ name: 'Bia', reason: 'not-in-voice' }] }))
    ui(<ToolResultCard message={teams} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mover para as salas' }))
    const mover = screen.getByRole('button', { name: 'Mover' })
    expect(mover).toHaveProperty('disabled', true)
    // só salas de voz
    expect(within(screen.getByLabelText('Sala do time 1')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Não mover', 'Lobby', 'Time A', 'Time B'])
    await userEvent.selectOptions(screen.getByLabelText('Sala do time 1'), 'sala1')
    await userEvent.selectOptions(screen.getByLabelText('Sala do time 2'), 'sala1')
    expect(screen.getByText('Escolha uma sala diferente para cada time.')).toBeTruthy()
    expect(mover).toHaveProperty('disabled', true)
    await userEvent.selectOptions(screen.getByLabelText('Sala do time 2'), 'sala2')
    await userEvent.click(mover)
    expect(socket.sent('tools:move-teams')[0][0]).toEqual({ messageId: 'm1', channelIds: ['sala1', 'sala2', null] })
    const status = await screen.findByRole('status')
    expect((status).textContent).toContain('1 pessoa levada para a sala do time.')
    expect((status).textContent).toContain('Bia: não está numa sala de voz')
  })

  it('mover: erro do servidor aparece no cartão', async () => {
    setup()
    socket.replyTo('tools:move-teams', () => ({ ok: false, error: 'Sorteio de times não encontrado' }))
    ui(<ToolResultCard message={teams} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mover para as salas' }))
    await userEvent.selectOptions(screen.getByLabelText('Sala do time 1'), 'sala1')
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Sorteio de times não encontrado')
  })

  describe('enquete', () => {
    it('mostra contagens e o que eu votei; clicar troca o voto (voto único)', async () => {
      setup({ myPollVotes: { m1: [0] }, access: basicAccess })
      socket.replyTo('poll:vote', () => ({ ok: true, result: poll({ counts: [1, 2] }), mine: [1] }))
      ui(<ToolResultCard message={toolMessage({ tool: 'poll', result: poll() }, { author: ana })} />)
      expect((screen.getByRole('button', { name: 'Dust: 2 votos' })).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByText('3 pessoas votaram')).toBeTruthy()
      await userEvent.click(screen.getByRole('button', { name: 'Mirage: 1 voto' }))
      expect(socket.sent('poll:vote')[0][0]).toEqual({ messageId: 'm1', choices: [1] })
      // não é minha e não tenho manageMessages: sem "Encerrar"
      expect(screen.queryByRole('button', { name: 'Encerrar' })).toBeNull()
    })

    it('várias opções: soma ao voto; clicar no marcado tira só ele', async () => {
      setup({ myPollVotes: { m1: [1] } })
      socket.replyTo('poll:vote', () => ({ ok: true, result: poll({ multiple: true }), mine: [] }))
      ui(<ToolResultCard message={toolMessage({ tool: 'poll', result: poll({ multiple: true }) })} />)
      await userEvent.click(screen.getByRole('button', { name: 'Dust: 2 votos' }))
      expect(socket.sent('poll:vote')[0][0]).toEqual({ messageId: 'm1', choices: [0, 1] })
    })

    it('quem criou encerra; encerrada não deixa votar', async () => {
      setup()
      socket.replyTo('poll:close', () => ({ ok: true, result: poll({ closed: true }) }))
      ui(<ToolResultCard message={toolMessage({ tool: 'poll', result: poll() })} />)
      await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }))
      expect(socket.sent('poll:close')[0][0]).toBe('m1')
      cleanup()
      ui(<ToolResultCard message={toolMessage({ tool: 'poll', result: poll({ closed: true }) })} />)
      expect(screen.getByText('Enquete encerrada')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Dust: 2 votos' })).toHaveProperty('disabled', true)
      expect(screen.queryByRole('button', { name: 'Encerrar' })).toBeNull()
    })
  })
})
