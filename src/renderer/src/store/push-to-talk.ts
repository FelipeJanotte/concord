// Pressione para falar (push-to-talk, B20): preferência desta máquina (salva em `concord:ptt`).
import { DEFAULT_PTT_BINDING, type PttBinding } from '@shared/push-to-talk'

export interface PushToTalkState {
  /** modo ligado: o microfone só abre com a tecla pressionada */
  pushToTalk: boolean
  /** tecla ou botão do mouse escolhido */
  pttBinding: PttBinding
  /** som curto ao abrir/fechar o microfone */
  pttSounds: boolean
  /** a tecla está pressionada agora (microfone aberto) */
  pttPressed: boolean
  /** esperando a pessoa pressionar a tecla nova */
  pttCapturing: boolean
  /** o app consegue ouvir o teclado do sistema (só no Electron, com a biblioteca nativa) */
  pttAvailable: boolean
}

export const pushToTalkInitial: PushToTalkState = {
  pushToTalk: false,
  pttBinding: DEFAULT_PTT_BINDING,
  pttSounds: true,
  pttPressed: false,
  pttCapturing: false,
  pttAvailable: true
}
