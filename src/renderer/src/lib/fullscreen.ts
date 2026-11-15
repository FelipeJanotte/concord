/**
 * Tela cheia de um elemento (a tela compartilhada em destaque). Põe em tela cheia o quadro inteiro,
 * não só o <video>, para a barra com o nome, o seletor de telas e "Sair da tela cheia" continuarem
 * à vista. No Electron depende da permissão `fullscreen` (src/main/permissions.ts).
 */
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { notify } from './core'

/** Entra (ou sai, se já estiver) em tela cheia com `el`. Recusa do sistema vira aviso. */
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

/** `active` = este elemento está em tela cheia agora (Esc, F11 e o botão atualizam). */
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
