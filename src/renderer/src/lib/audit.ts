import type { AuditAction, AuditDetailsByAction, AuditEntry, ChannelKind } from '@shared/types'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'voice-kick': 'Expulsar da sala',
  'voice-move': 'Mover de sala',
  'voice-mute': 'Silenciar para todos',
  'voice-unmute': 'Tirar silêncio',
  kick: 'Expulsar da comunidade',
  ban: 'Banir',
  unban: 'Tirar banimento',
  timeout: 'Castigo',
  'timeout-clear': 'Tirar castigo',
  'message-delete': 'Apagar mensagem',
  'role-create': 'Criar cargo',
  'role-update': 'Alterar cargo',
  'role-delete': 'Apagar cargo',
  'member-roles': 'Cargos de membro',
  'channel-overrides': 'Permissões de canal',
  'channel-create': 'Criar canal',
  'channel-delete': 'Apagar canal',
  'channel-layout': 'Reorganizar canais',
  'category-create': 'Criar categoria',
  'category-rename': 'Renomear categoria',
  'category-delete': 'Apagar categoria'
}

const UNITS: [minutes: number, singular: string, plural: string][] = [
  [10080, 'semana', 'semanas'],
  [1440, 'dia', 'dias'],
  [60, 'hora', 'horas'],
  [1, 'minuto', 'minutos']
]

export function durationText(minutes: number): string {
  const [size, singular, plural] = UNITS.find(([size]) => minutes % size === 0) ?? UNITS[UNITS.length - 1]
  const count = minutes / size
  return `${count} ${count === 1 ? singular : plural}`
}

function listText(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

const channelText = ({ name, type }: { name: string; type: ChannelKind }): { the: string; of: string; in: string } =>
  type === 'voice'
    ? { the: `a sala ${name}`, of: `da sala ${name}`, in: `na sala ${name}` }
    : { the: `o canal #${name}`, of: `do canal #${name}`, in: `no canal #${name}` }

function roleChanges({ added, removed }: AuditDetailsByAction['member-roles'], target: string): string {
  if (added.length && removed.length) return `deu ${listText(added)} e tirou ${listText(removed)} de ${target}`
  if (added.length) return `deu ${listText(added)} a ${target}`
  if (removed.length) return `tirou ${listText(removed)} de ${target}`
  return `manteve os cargos de ${target}`
}

function predicate(entry: AuditEntry, target: string): string {
  switch (entry.action) {
    case 'voice-kick':
      return `expulsou ${target} da sala ${entry.details.channelName}`
    case 'voice-move':
      return `moveu ${target} para a sala ${entry.details.channelName}`
    case 'voice-mute':
      return `silenciou ${target} para todos`
    case 'voice-unmute':
      return `tirou o silêncio de ${target}`
    case 'kick':
      return `expulsou ${target} da comunidade`
    case 'ban':
      return entry.details.reason ? `baniu ${target} (motivo: ${entry.details.reason})` : `baniu ${target}`
    case 'unban':
      return `tirou o banimento de ${target}`
    case 'timeout':
      return `pôs ${target} de castigo por ${durationText(entry.details.minutes)}`
    case 'timeout-clear':
      return `tirou o castigo de ${target}`
    case 'message-delete':
      return `apagou uma mensagem de ${target} ${channelText(entry.details.channel).in}`
    case 'role-create':
      return `criou o cargo ${entry.details.name}`
    case 'role-update':
      return `alterou o cargo ${entry.details.name}`
    case 'role-delete':
      return `apagou o cargo ${entry.details.name}`
    case 'member-roles':
      return roleChanges(entry.details, target)
    case 'channel-overrides':
      return `mudou as permissões ${channelText(entry.details).of}`
    case 'channel-create':
      return `criou ${channelText(entry.details).the}`
    case 'channel-delete':
      return `apagou ${channelText(entry.details).the}`
    case 'channel-layout':
      return 'reorganizou os canais'
    case 'category-create':
      return `criou a categoria ${entry.details.name}`
    case 'category-rename':
      return `renomeou a categoria ${entry.details.previousName} para ${entry.details.name}`
    case 'category-delete':
      return `apagou a categoria ${entry.details.name}`
  }
}

export function auditSentence(entry: AuditEntry): string {
  return `${entry.actor?.name ?? 'Conta apagada'} ${predicate(entry, entry.target?.name ?? 'conta apagada')}`
}
