// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { ScreenQualitySelect } from './ScreenQualitySelect'

beforeEach(() => {
  useApp.setState({ ...initialState })
  vi.spyOn(voice, 'setScreenQuality').mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ScreenQualitySelect', () => {
  it('mostra a qualidade atual', () => {
    render(<ScreenQualitySelect />)
    expect(screen.getByRole('combobox', { name: 'Resolução' }).textContent).toContain('1080p')
    expect(screen.getByRole('combobox', { name: 'Taxa de quadros' }).textContent).toContain('15 fps')
  })

  it('escolher muda a qualidade e, com a tela no ar, troca sem parar', async () => {
    useApp.setState({ sharing: true })
    render(<ScreenQualitySelect />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Resolução' }))
    await userEvent.click(screen.getByRole('option', { name: '1440p' }))
    expect(useApp.getState().screenQuality).toEqual({ resolution: '1440p', fps: 15 })
    await userEvent.click(screen.getByRole('combobox', { name: 'Taxa de quadros' }))
    await userEvent.click(screen.getByRole('option', { name: '60 fps' }))
    expect(voice.setScreenQuality).toHaveBeenLastCalledWith({ resolution: '1440p', fps: 60 })
  })
})
