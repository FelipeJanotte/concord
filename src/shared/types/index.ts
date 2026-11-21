/**
 * Contrato entre o servidor (Node) e o app (renderer).
 *
 * Cada domínio fica no seu arquivo (tipos + eventos daquele domínio). Este
 * arquivo só junta tudo: para um domínio novo, crie `<dominio>.ts`, exporte
 * aqui e acrescente os mapas de eventos nos dois `extends` abaixo.
 */
import type { AccountClientEvents, AccountServerEvents } from './account'
import type { AuditClientEvents } from './audit'
import type { CallsClientEvents, CallsServerEvents } from './calls'
import type { CategoriesClientEvents, CategoriesServerEvents } from './categories'
import type { ChannelClientEvents, ChannelServerEvents } from './channel'
import type { DmsClientEvents, DmsServerEvents } from './dms'
import type { FriendsClientEvents, FriendsServerEvents } from './friends'
import type { LimitsServerEvents } from './limits'
import type { MessageClientEvents, MessageServerEvents } from './message'
import type { ModerationClientEvents, ModerationServerEvents } from './moderation'
import type { MusicClientEvents, MusicServerEvents } from './music'
import type { PermissionsClientEvents, PermissionsServerEvents } from './permissions'
import type { PlaylistsClientEvents, PlaylistsServerEvents } from './playlists'
import type { PreferencesClientEvents, PreferencesServerEvents } from './preferences'
import type { PresenceClientEvents, PresenceServerEvents } from './presence'
import type { ReactionsClientEvents, ReactionsServerEvents } from './reactions'
import type { ReadsClientEvents, ReadsServerEvents } from './reads'
import type { SoundsClientEvents, SoundsServerEvents } from './sounds'
import type { ToolsClientEvents, ToolsServerEvents } from './tools'
import type { VoiceClientEvents, VoiceServerEvents } from './voice'

export * from './account'
export * from './attachment'
export * from './audit'
export * from './calls'
export * from './categories'
export * from './channel'
export * from './dms'
export * from './friends'
export * from './limits'
export * from './mentions'
export * from './message'
export * from './moderation'
export * from './music'
export * from './permissions'
export * from './playlists'
export * from './preferences'
export * from './presence'
export * from './reactions'
export * from './reads'
export * from './sounds'
export * from './theme'
export * from './tools'
export * from './voice'

export interface ServerToClientEvents
  extends AccountServerEvents,
    CallsServerEvents,
    CategoriesServerEvents,
    ChannelServerEvents,
    DmsServerEvents,
    FriendsServerEvents,
    LimitsServerEvents,
    MessageServerEvents,
    ModerationServerEvents,
    MusicServerEvents,
    PermissionsServerEvents,
    PlaylistsServerEvents,
    PreferencesServerEvents,
    PresenceServerEvents,
    ReactionsServerEvents,
    ReadsServerEvents,
    SoundsServerEvents,
    ToolsServerEvents,
    VoiceServerEvents {}

export interface ClientToServerEvents
  extends AccountClientEvents,
    AuditClientEvents,
    CallsClientEvents,
    CategoriesClientEvents,
    ChannelClientEvents,
    DmsClientEvents,
    FriendsClientEvents,
    MessageClientEvents,
    ModerationClientEvents,
    MusicClientEvents,
    PermissionsClientEvents,
    PlaylistsClientEvents,
    PreferencesClientEvents,
    PresenceClientEvents,
    ReactionsClientEvents,
    ReadsClientEvents,
    SoundsClientEvents,
    ToolsClientEvents,
    VoiceClientEvents {}
