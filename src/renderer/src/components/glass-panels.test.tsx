// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initialState, useApp } from '@/store'
import { ChannelSidebar } from './ChannelSidebar'
import { HomeSidebar } from './home/HomeSidebar'
import { MemberList } from './MemberList'
import { ToolsSidebar } from '@/components/tools/ToolsSidebar'
import { UtilityRail } from './rail/UtilityRail'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => useApp.setState({ ...initialState }))
afterEach(cleanup)

const rootOf = (node: ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>).container.firstElementChild

describe('painéis do layout no vidro', () => {
  it('barra de úteis, barras laterais e lista de membros são cartões de vidro (data-glass="panel")', () => {
    for (const node of [<UtilityRail key="rail" />, <ChannelSidebar key="channels" />, <HomeSidebar key="home" />, <ToolsSidebar key="tools" />, <MemberList key="members" />]) {
      expect(rootOf(node)?.getAttribute('data-glass')).toBe('panel')
      cleanup()
    }
  })
})
