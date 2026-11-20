import type { ChannelKind } from './channel'

interface ChannelDetails {
  name: string
  type: ChannelKind
}

export interface AuditDetailsByAction {
  'voice-kick': { channelName: string }
  'voice-move': { channelName: string }
  'voice-mute': Record<string, never>
  'voice-unmute': Record<string, never>
  kick: Record<string, never>
  ban: { reason: string | null }
  unban: Record<string, never>
  timeout: { minutes: number }
  'timeout-clear': Record<string, never>
  'message-delete': { messageId: string; channel: ChannelDetails }
  'role-create': { name: string }
  'role-update': { name: string }
  'role-delete': { name: string }
  'member-roles': { added: string[]; removed: string[] }
  'channel-overrides': ChannelDetails
  'channel-create': ChannelDetails
  'channel-delete': ChannelDetails
  'channel-layout': Record<string, never>
  'category-create': { name: string }
  'category-rename': { name: string; previousName: string }
  'category-delete': { name: string }
}

export type AuditAction = keyof AuditDetailsByAction

export type AuditTargetType = 'account' | 'role' | 'channel' | 'category'

const TARGET_TYPE_BY_ACTION: Record<AuditAction, AuditTargetType> = {
  'voice-kick': 'account',
  'voice-move': 'account',
  'voice-mute': 'account',
  'voice-unmute': 'account',
  kick: 'account',
  ban: 'account',
  unban: 'account',
  timeout: 'account',
  'timeout-clear': 'account',
  'message-delete': 'account',
  'role-create': 'role',
  'role-update': 'role',
  'role-delete': 'role',
  'member-roles': 'account',
  'channel-overrides': 'channel',
  'channel-create': 'channel',
  'channel-delete': 'channel',
  'channel-layout': 'channel',
  'category-create': 'category',
  'category-rename': 'category',
  'category-delete': 'category'
}

export const AUDIT_ACTIONS = Object.keys(TARGET_TYPE_BY_ACTION) as AuditAction[]

export const auditTargetType = (action: AuditAction): AuditTargetType => TARGET_TYPE_BY_ACTION[action]

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && Object.hasOwn(TARGET_TYPE_BY_ACTION, value)

export type AuditRecord<A extends AuditAction = AuditAction> = A extends AuditAction
  ? { action: A; targetId: string | null; details: AuditDetailsByAction[A] }
  : never

export interface AuditPerson {
  accountId: string
  name: string
  tag: string
}

export type AuditEntry = AuditRecord & {
  id: string
  actor: AuditPerson | null
  target: AuditPerson | null
  createdAt: number
}

export const AUDIT_PAGE_SIZE = 50

export interface AuditFilter {
  before?: string
  actorId?: string
  action?: AuditAction
}

export type AuditListResult = { ok: true; entries: AuditEntry[]; hasMore: boolean } | { ok: false; error: string }

export interface AuditClientEvents {
  'audit:list': (filter: AuditFilter, ack: (res: AuditListResult) => void) => void
}
