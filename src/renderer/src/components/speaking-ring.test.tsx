// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './UserAvatar'

const ana = { name: 'Ana', color: '#123456', avatarUrl: null }

describe('anel de quem está falando', () => {
  it('usa a cor de destaque do tema, não o verde fixo', () => {
    const { container } = render(<UserAvatar user={ana} speaking />)
    const avatar = container.firstElementChild!
    expect(avatar.classList).toContain('ring-primary')
    expect(avatar.classList).not.toContain('ring-success')
  })

  it('quieto: anel transparente', () => {
    const { container } = render(<UserAvatar user={ana} />)
    expect(container.firstElementChild!.classList).not.toContain('ring-primary')
  })
})
