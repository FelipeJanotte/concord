// @vitest-environment jsdom
// "Notificar mensagens de canal" (B9) em "Minha conta": mostra a escolha atual e troca na hora.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initialState, useApp } from '@/store'
import { ChannelNotificationSetting } from './NotificationSettings'

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
