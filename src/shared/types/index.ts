/**
 * Contrato entre o servidor (Node) e o app (renderer).
 *
 * Cada domínio fica no seu arquivo (tipos + eventos daquele domínio). Este
 * arquivo só junta tudo: para um domínio novo, crie `<dominio>.ts`, exporte
 * aqui e acrescente os mapas de eventos nos dois `extends` abaixo.
 */
import type { AccountClientEvents, AccountServerEvents } from './account'
import type { ChannelClientEvents, ChannelServerEvents } from './channel'
import type { MessageClientEvents, MessageServerEvents } from './message'
import type { PresenceClientEvents, PresenceServerEvents } from './presence'
import type { VoiceClientEvents, VoiceServerEvents } from './voice'

export * from './account'
export * from './channel'
export * from './message'
export * from './presence'
export * from './voice'

export interface ServerToClientEvents
  extends AccountServerEvents,
    ChannelServerEvents,
    MessageServerEvents,
    PresenceServerEvents,
    VoiceServerEvents {}

export interface ClientToServerEvents
  extends AccountClientEvents,
    ChannelClientEvents,
    MessageClientEvents,
    PresenceClientEvents,
    VoiceClientEvents {}
