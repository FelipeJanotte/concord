// Pressione para falar (push-to-talk, B20). Não é evento do Socket.IO: vai pela ponte do preload.
// O processo principal (`src/main/push-to-talk.ts`) ouve o teclado e o mouse do sistema inteiro
// (também com o jogo em primeiro plano) e avisa a janela principal quando a tecla escolhida é
// pressionada e solta; a janela abre e fecha o microfone.

/** Tecla do teclado (código do `uiohook`) ou botão do mouse (3 = meio, 4 e 5 = laterais). */
export interface PttBinding {
  kind: 'key' | 'mouse'
  code: number
  /** como aparece na tela ("V", "Botão 4 do mouse"...) */
  label: string
}

export interface PttConfig {
  enabled: boolean
  binding: PttBinding | null
}

/** Tecla padrão: V (como em vários jogos), escolhida de novo nas Configurações de voz. */
export const DEFAULT_PTT_BINDING: PttBinding = { kind: 'key', code: 47, label: 'V' }

/**
 * Depois de soltar, o microfone ainda fica aberto um instante para não cortar o fim da palavra
 * (o Discord faz o mesmo: "atraso ao soltar").
 */
export const PTT_RELEASE_DELAY_MS = 200

/** Escolher a tecla desiste sozinho depois desse tempo sem nada pressionado. */
export const PTT_CAPTURE_TIMEOUT_MS = 10_000

/** Botões do mouse aceitos (o esquerdo e o direito atrapalhariam o uso normal). */
export const PTT_MOUSE_BUTTONS = [3, 4, 5] as const

/** Confere uma escolha de tecla vinda de fora (localStorage, IPC); inválida = null. */
export function cleanBinding(raw: unknown): PttBinding | null {
  const b = raw as Partial<PttBinding> | null
  if (!b || (b.kind !== 'key' && b.kind !== 'mouse')) return null
  if (typeof b.code !== 'number' || !Number.isInteger(b.code) || b.code <= 0 || b.code > 0xffff) return null
  if (b.kind === 'mouse' && !PTT_MOUSE_BUTTONS.includes(b.code as never)) return null
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 32) : `Tecla ${b.code}`
  return { kind: b.kind, code: b.code, label }
}

export function cleanPttConfig(raw: unknown): PttConfig {
  const c = raw as Partial<PttConfig> | null
  return { enabled: c?.enabled === true, binding: cleanBinding(c?.binding) }
}

/** Ponte da janela principal. */
export interface PushToTalkBridge {
  /** liga/desliga a escuta e troca a tecla (desligado = nada do teclado é ouvido) */
  setConfig: (config: PttConfig) => void
  /** espera a próxima tecla ou botão do mouse (Esc ou tempo esgotado = null) */
  capture: () => Promise<PttBinding | null>
  /** a tecla foi pressionada (true) ou solta (false) */
  onChange: (listener: (pressed: boolean) => void) => () => void
  /** o processo principal não conseguiu ouvir o teclado do sistema (biblioteca nativa ausente) */
  onUnavailable: (listener: () => void) => () => void
}
