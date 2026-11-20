import { useCallback, useEffect, useState, type RefObject } from 'react'
import { notify } from './core'

export async function toggleFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  } catch (err) {
    console.warn('[tela cheia] recusada:', err)
    notify('Não foi possível abrir em tela cheia.')
  }
}

export function useFullscreen(ref: RefObject<HTMLElement | null>): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const update = (): void => setActive(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [ref])
  const toggle = useCallback(() => void toggleFullscreen(ref.current), [ref])
  return { active, toggle }
}
