/**
 * CONTRATO — v2 (A4 servidor / B5 tela de administração / B1-B2-B6 voz e moderação).
 * Revisado pelo Dev B no PR #8. Decisões:
 * - cada pessoa recebe cargos e membros inteiros, mas só as regras dos canais que vê
 *   (`accessFor`), para não revelar que existem canais privados;
 * - o estado vem dentro do `hello` (`ServerState.access`); `access:get` só para recarregar;
 * - `voice:join` devolve `canSpeak`/`canShare`/`canVideo`: sem `speak` o app entra só para ouvir;
 *   no token do LiveKit, microfone (`speak`) e tela (`share`) são liberados separadamente;
 * - perdeu `view`/`connect` na sala → sai; perdeu `speak`/`share` → o servidor atualiza
 *   o participante no LiveKit (ponto único: `applyVoiceAccess` em server/modules/voice.ts);
 * - o @todos começa sem permissões de administração: só a dona (e cargos que ela criar)
 *   gerencia canais. Ela pode liberar `manageChannels` ao @todos se o grupo preferir.
 * Limitação registrada: não há transferência de posse da comunidade (fica para depois da v2).
 *
 * Cargos estilo Discord simplificado: cada pessoa tem o cargo implícito @todos
 * mais os cargos atribuídos; cada canal pode liberar/negar permissões por cargo.
 * A regra de cálculo fica aqui (função pura) para o servidor bloquear e a tela
 * esconder os botões com o MESMO resultado.
 */
import type { Channel } from './channel'

/** Permissões da comunidade inteira. */
export const GLOBAL_PERMISSIONS = ['manageChannels', 'manageRoles', 'manageMembers', 'manageMessages'] as const
/** Permissões que cada canal pode liberar ou negar por cargo. */
export const CHANNEL_PERMISSIONS = ['view', 'send', 'attach', 'connect', 'speak', 'share', 'video'] as const

export type GlobalPermission = (typeof GLOBAL_PERMISSIONS)[number]
export type ChannelPermission = (typeof CHANNEL_PERMISSIONS)[number]
export type Permission = GlobalPermission | ChannelPermission

/** Textos para a tela (pt-BR). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  manageChannels: 'Gerenciar canais (criar, apagar, editar permissões; vê todos os canais)',
  manageRoles: 'Gerenciar cargos (abaixo do seu cargo mais alto)',
  manageMembers: 'Gerenciar membros (atribuir cargos, silenciar e expulsar da voz)',
  manageMessages: 'Gerenciar mensagens (apagar mensagens de outras pessoas)',
  view: 'Ver o canal',
  send: 'Enviar mensagens',
  attach: 'Enviar anexos',
  connect: 'Entrar na voz',
  speak: 'Falar na voz',
  share: 'Compartilhar a tela',
  video: 'Ligar a câmera'
}

/** Id fixo do cargo @todos (existe sempre, não pode ser apagado; todo mundo tem). */
export const EVERYONE_ROLE_ID = '00000000-0000-0000-0000-000000000000'

/** Permissões do @todos numa comunidade nova (tudo dos canais, nada de administração). */
export const DEFAULT_EVERYONE_PERMISSIONS: Permission[] = [...CHANNEL_PERMISSIONS]

export interface Role {
  id: string
  name: string
  /** cor do nome na lista de membros (#rrggbb) ou null */
  color: string | null
  /** maior = mais importante; @todos é sempre 0 */
  position: number
  permissions: Permission[]
}

/** O que um cargo pode/não pode num canal. Permissão fora das duas listas = herda do cargo. */
export interface ChannelOverride {
  channelId: string
  roleId: string
  allow: ChannelPermission[]
  deny: ChannelPermission[]
}

/** Cargos atribuídos a uma conta (sem o @todos, que é implícito). */
export interface MemberRoles {
  accountId: string
  roleIds: string[]
}

/** Tudo o que define o acesso. Pequeno para um grupo de amigos: vai inteiro para todos. */
export interface AccessState {
  /** primeira conta criada: pode tudo e não pode ser rebaixada */
  ownerAccountId: string
  roles: Role[]
  members: MemberRoles[]
  overrides: ChannelOverride[]
}

// ---------- Regra de cálculo ----------

function rolesOf(access: AccessState, accountId: string): Role[] {
  const assigned = new Set(access.members.find((m) => m.accountId === accountId)?.roleIds ?? [])
  return access.roles.filter((r) => r.id === EVERYONE_ROLE_ID || assigned.has(r.id))
}

/** Permissões globais da conta. A dona tem todas. */
export function globalPermissions(access: AccessState, accountId: string): Set<GlobalPermission> {
  if (accountId === access.ownerAccountId) return new Set(GLOBAL_PERMISSIONS)
  const all = new Set(rolesOf(access, accountId).flatMap((r) => r.permissions))
  return new Set(GLOBAL_PERMISSIONS.filter((p) => all.has(p)))
}

/**
 * Permissões da conta num canal:
 * 1. dona → todas;
 * 2. base = permissões de canal do @todos + dos cargos da pessoa;
 * 3. aplica a regra do canal para o @todos (nega, depois libera);
 * 4. aplica as regras do canal para os cargos da pessoa (junta as negações,
 *    junta as liberações; liberação vence negação);
 * 5. `manageChannels` sempre vê o canal (admin não se tranca para fora);
 * 6. dependências: sem `view` não há nada; sem `send` não há `attach`;
 *    sem `connect` não há `speak` nem `share`.
 */
export function channelPermissions(access: AccessState, accountId: string, channelId: string): Set<ChannelPermission> {
  if (accountId === access.ownerAccountId) return new Set(CHANNEL_PERMISSIONS)
  const roles = rolesOf(access, accountId)
  const perms = new Set<ChannelPermission>(
    roles.flatMap((r) => r.permissions).filter((p): p is ChannelPermission => (CHANNEL_PERMISSIONS as readonly string[]).includes(p))
  )

  const overrides = access.overrides.filter((o) => o.channelId === channelId)
  const everyone = overrides.find((o) => o.roleId === EVERYONE_ROLE_ID)
  if (everyone) {
    for (const p of everyone.deny) perms.delete(p)
    for (const p of everyone.allow) perms.add(p)
  }
  const roleIds = new Set(roles.map((r) => r.id).filter((id) => id !== EVERYONE_ROLE_ID))
  const mine = overrides.filter((o) => roleIds.has(o.roleId))
  for (const p of mine.flatMap((o) => o.deny)) perms.delete(p)
  for (const p of mine.flatMap((o) => o.allow)) perms.add(p)

  if (globalPermissions(access, accountId).has('manageChannels')) perms.add('view')

  if (!perms.has('view')) return new Set()
  if (!perms.has('send')) perms.delete('attach')
  if (!perms.has('connect')) {
    perms.delete('speak')
    perms.delete('share')
    perms.delete('video')
  }
  return perms
}

/** Atalho: a conta tem a permissão? (de canal exige `channelId`) */
export function can(access: AccessState, accountId: string, permission: Permission, channelId?: string): boolean {
  if ((GLOBAL_PERMISSIONS as readonly string[]).includes(permission)) {
    return globalPermissions(access, accountId).has(permission as GlobalPermission)
  }
  if (!channelId) return false
  return channelPermissions(access, accountId, channelId).has(permission as ChannelPermission)
}

/** Posição do cargo mais alto da conta (dona = infinito). Só se gerencia cargo abaixo dele. */
export function highestPosition(access: AccessState, accountId: string): number {
  if (accountId === access.ownerAccountId) return Number.POSITIVE_INFINITY
  return Math.max(0, ...rolesOf(access, accountId).map((r) => r.position))
}

/**
 * Pode dar estas permissões ao cargo `roleId`?
 * - ninguém concede permissão global que não tem (contra escalada de privilégio);
 * - permissões globais no @todos (valem para todo mundo): só a dona concede.
 * A dona pode tudo. (Gerenciar o cargo em si — hierarquia — é conferido à parte.)
 */
export function canGrantPermissions(access: AccessState, accountId: string, roleId: string, permissions: Permission[]): boolean {
  if (accountId === access.ownerAccountId) return true
  const globals = permissions.filter((p): p is GlobalPermission => (GLOBAL_PERMISSIONS as readonly string[]).includes(p))
  if (roleId === EVERYONE_ROLE_ID && globals.length > 0) return false
  const mine = globalPermissions(access, accountId)
  return globals.every((p) => mine.has(p))
}

/** Cor do nome da pessoa: a do cargo mais alto que tem cor, ou null (usar a cor da conta). */
export function displayColor(access: AccessState, accountId: string): string | null {
  const colored = rolesOf(access, accountId).filter((r) => r.color)
  if (colored.length === 0) return null
  return colored.reduce((a, b) => (b.position > a.position ? b : a)).color
}

/**
 * O estado que a conta recebe: cargos e membros inteiros, mas só as regras dos canais
 * que ela pode ver (`manageChannels` e a dona recebem todas). Assim ninguém descobre
 * que existe um canal privado.
 */
export function accessFor(access: AccessState, accountId: string, channelIds: string[]): AccessState {
  if (accountId === access.ownerAccountId || globalPermissions(access, accountId).has('manageChannels')) return access
  const visible = new Set(channelIds.filter((id) => channelPermissions(access, accountId, id).has('view')))
  return { ...access, overrides: access.overrides.filter((o) => visible.has(o.channelId)) }
}

// ---------- Eventos ----------

export type RoleResult = { ok: true; role: Role } | { ok: false; error: string }
export type OkResult = { ok: true } | { ok: false; error: string }

export interface PermissionsServerEvents {
  /** cargos, membros ou regras mudaram: o estado que ESTA conta pode ver (`accessFor`) */
  'access:updated': (state: AccessState) => void
  /** os canais que ESTA conexão pode ver mudaram (canal ficou privado, ganhou/perdeu cargo...) */
  'channels:visible': (channels: Channel[]) => void
}

export interface PermissionsClientEvents {
  /** estado atual (`accessFor`); o inicial já vem no `hello`, isto serve para recarregar */
  'access:get': (ack: (state: AccessState) => void) => void
  /**
   * exige manageRoles; o cargo novo entra logo abaixo do cargo mais alto de quem cria;
   * só permissões que quem cria pode conceder (`canGrantPermissions`)
   */
  'role:create': (payload: { name: string; color: string | null; permissions: Permission[] }, ack: (res: RoleResult) => void) => void
  /** exige manageRoles e cargo abaixo do seu; @todos aceita só `permissions` (globais nele, só a dona) */
  'role:update': (
    payload: { id: string; name?: string; color?: string | null; permissions?: Permission[] },
    ack: (res: RoleResult) => void
  ) => void
  'role:delete': (roleId: string, ack: (res: OkResult) => void) => void
  /** ids do menos para o mais importante (sem o @todos); só cargos abaixo do seu */
  'role:reorder': (roleIds: string[], ack: (res: OkResult) => void) => void
  /** exige manageMembers; só atribui/tira cargos abaixo do seu */
  'member:set-roles': (payload: { accountId: string; roleIds: string[] }, ack: (res: OkResult) => void) => void
  /** exige manageChannels; substitui todas as regras do canal */
  'channel:set-overrides': (
    payload: { channelId: string; overrides: { roleId: string; allow: ChannelPermission[]; deny: ChannelPermission[] }[] },
    ack: (res: OkResult) => void
  ) => void
}
