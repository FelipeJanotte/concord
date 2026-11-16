// @vitest-environment jsdom
// "Notificar mensagens de canal" (B9) em "Minha conta": mostra a escolha atual e troca na hora.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initialState, useApp } from '@/store'
import { ChannelNotificationSetting, NotificationSettings } from './NotificationSettings'

beforeEach(() => useApp.setState({ ...initialState }))
afterEach(cleanup)

describe('ChannelNotificationSetting', () => {
  it('padrão "Todas as mensagens"; escolher outra muda a preferência', () => {
    render(<ChannelNotificationSetting />)
    const select = screen.getByLabelText('Notificar mensagens de canal') as HTMLSelectElement
    expect(select.value).toBe('all')
    fireEvent.change(select, { target: { value: 'mentions' } })
    expect(useApp.getState().channelNotifications).toBe('mentions')
    expect(select.value).toBe('mentions')
    fireEvent.change(select, { target: { value: 'none' } })
    expect(useApp.getState().channelNotifications).toBe('none')
  })
})

describe('NotificationSettings', () => {
  it('interruptor geral desliga as notificações e trava a escolha de canal', () => {
    render(<NotificationSettings />)
    const toggle = screen.getByLabelText('Mostrar notificações do Concord') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(useApp.getState().notificationsEnabled).toBe(false)
    expect(toggle.checked).toBe(false)
    expect((screen.getByLabelText('Notificar mensagens de canal') as HTMLSelectElement).disabled).toBe(true)
  })

  it('cada tipo de som liga e desliga sozinho', () => {
    render(<NotificationSettings />)
    const dm = screen.getByLabelText('Mensagem em conversa privada') as HTMLInputElement
    const mention = screen.getByLabelText('Menção (@você ou @todos)') as HTMLInputElement
    const friend = screen.getByLabelText('Pedido de amizade') as HTMLInputElement
    expect([dm.checked, mention.checked, friend.checked]).toEqual([true, true, true])
    fireEvent.click(mention)
    expect(useApp.getState().notificationSounds).toEqual({ dm: true, mention: false, friend: true })
    expect(mention.checked).toBe(false)
    fireEvent.click(friend)
    expect(useApp.getState().notificationSounds).toEqual({ dm: true, mention: false, friend: false })
  })
})
