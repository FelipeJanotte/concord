import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel, ChannelCategory } from '@shared/types'
import { bindCategoryEvents, createCategory, deleteCategory, renameCategory, saveChannelLayout } from '@/lib/actions/categories'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ch = (id: string, position: number, categoryId: string | null = null): Channel => ({ id, name: id, type: 'text', createdAt: 0, position, categoryId })
const jogos: ChannelCategory = { id: 'k1', name: 'Jogos', position: 0 }

let socket: FakeSocket
const st = () => useApp.getState()

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindCategoryEvents(socket.asSocket())
  useApp.setState({ ...initialState, channels: [ch('a', 0), ch('b', 1)], categories: [jogos] })
})
afterEach(() => setSocket(null))

describe('categorias no app', () => {
  it('channels:layout troca as categorias e as posições dos canais', () => {
    socket.receive('channels:layout', {
      categories: [{ ...jogos, name: 'Jogatina' }],
      channels: [
        { id: 'b', categoryId: null, position: 0 },
        { id: 'a', categoryId: 'k1', position: 1 }
      ]
    })
    expect(st().categories).toEqual([{ ...jogos, name: 'Jogatina' }])
    expect(st().channels).toEqual([ch('a', 1, 'k1'), ch('b', 0)])
  })

  it('saveChannelLayout aplica na hora e manda a ordem inteira', async () => {
    socket.replyTo('channel:layout', () => ({ ok: true }))
    const layout = { categories: ['k1'], channels: [{ id: 'b', categoryId: 'k1' }, { id: 'a', categoryId: null }] }
    await saveChannelLayout(layout)
    expect(socket.sent('channel:layout')[0][0]).toEqual(layout)
    expect(st().channels).toEqual([ch('a', 1), ch('b', 0, 'k1')])
  })

  it('saveChannelLayout recusado volta a ordem de antes e lança o erro', async () => {
    socket.replyTo('channel:layout', () => ({ ok: false, error: 'A lista de canais mudou. Tente de novo.' }))
    await expect(saveChannelLayout({ categories: ['k1'], channels: [{ id: 'b', categoryId: null }, { id: 'a', categoryId: null }] })).rejects.toThrow(
      'A lista de canais mudou'
    )
    expect(st().channels).toEqual([ch('a', 0), ch('b', 1)])
  })

  it('criar, renomear e apagar mandam o pedido e lançam o erro do servidor', async () => {
    socket.replyTo('category:create', () => ({ ok: true, category: jogos }))
    await expect(createCategory('Jogos')).resolves.toEqual(jogos)
    expect(socket.sent('category:create')[0][0]).toEqual({ name: 'Jogos' })

    socket.replyTo('category:rename', () => ({ ok: false, error: 'Dê um nome à categoria' }))
    await expect(renameCategory('k1', ' ')).rejects.toThrow('Dê um nome à categoria')
    expect(socket.sent('category:rename')[0][0]).toEqual({ categoryId: 'k1', name: ' ' })

    socket.replyTo('category:delete', () => ({ ok: true }))
    await deleteCategory('k1')
    expect(socket.sent('category:delete')[0][0]).toEqual({ categoryId: 'k1' })
  })
})
