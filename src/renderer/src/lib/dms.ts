// Conversas privadas na tela (B7): achar a conversa de um canal e o nome que aparece no chat.
import type { Channel, DmEntry } from '@shared/types'

/** A conversa privada deste canal (os canais `dm` não vêm em `channels`, só em `dms`). */
export function findDm(dms: readonly DmEntry[], channelId: string): DmEntry | undefined {
  return dms.find((d) => d.channel.id === channelId)
}

/** Como o chat é chamado no cabeçalho e no campo de texto: `#geral` ou `@Ana`. */
export function chatLabel(channel: Channel, dms: readonly DmEntry[]): string {
  const dm = channel.type === 'dm' ? findDm(dms, channel.id) : undefined
  return dm ? `@${dm.other.name}` : `#${channel.name}`
}

/** Permissões que valem numa conversa privada: lá não há cargos, só os dois membros (servidor: `allowedInDm`). */
export const DM_PERMISSIONS = new Set(['view', 'send', 'attach'])
