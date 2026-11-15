/**
 * Contrato entre o servidor (Node) e o app (renderer).
 *
 * Cada domínio fica no seu arquivo (tipos + eventos daquele domínio). Este
 * arquivo só junta tudo: para um domínio novo, crie `<dominio>.ts`, exporte
 * aqui e acrescente os mapas de eventos nos dois `extends` abaixo.
 */
import type { AccountClientEvents, AccountServerEvents } from './account'
import type { ChannelClientEvents, ChannelServerEvents } from './channel'
import type { DmsClientEvents, DmsServerEvents } from './dms'
import type { FriendsClientEvents, FriendsServerEvents } from './friends'
import type { LimitsServerEvents } from './limits'
import type { MessageClientEvents, MessageServerEvents } from './message'
import type { ModerationClientEvents, ModerationServerEvents } from './moderation'
import type { PermissionsClientEvents, PermissionsServerEvents } from './permissions'
import type { PreferencesClientEvents, PreferencesServerEvents } from './preferences'
import type { PresenceClientEvents, PresenceServerEvents } from './presence'
import type { SoundsClientEvents, SoundsServerEvents } from './sounds'
import type { ToolsClientEvents } from './tools'
import type { VoiceClientEvents, VoiceServerEvents } from './voice'

export * from './account'
export * from './attachment'
export * from './channel'
export * from './dms'
export * from './friends'
export * from './limits'
export * from './message'
export * from './moderation'
export * from './permissions'
export * from './preferences'
export * from './presence'
export * from './sounds'
export * from './theme'
export * from './tools'
export * from './voice'

export interface ServerToClientEvents
  extends AccountServerEvents,
    ChannelServerEvents,
    DmsServerEvents,
    FriendsServerEvents,
    LimitsServerEvents,
    MessageServerEvents,
    ModerationServerEvents,
    PermissionsServerEvents,
    PreferencesServerEvents,
    PresenceServerEvents,
    SoundsServerEvents,
    VoiceServerEvents {}

export interface ClientToServerEvents
  extends AccountClientEvents,
    ChannelClientEvents,
    DmsClientEvents,
    FriendsClientEvents,
    MessageClientEvents,
    ModerationClientEvents,
    PermissionsClientEvents,
    PreferencesClientEvents,
    PresenceClientEvents,
    SoundsClientEvents,
    ToolsClientEvents,
    VoiceClientEvents {}
