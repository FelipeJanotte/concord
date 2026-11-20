import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, type AuditEntry, type AuditRecord } from '@shared/types'
import { AUDIT_ACTION_LABELS, auditSentence, durationText } from './audit'

const fulano = { accountId: 'f', name: 'Fulano', tag: 'ful' }
const ciclano = { accountId: 'c', name: 'Ciclano', tag: 'cic' }

function entry(record: AuditRecord, over: Partial<Pick<AuditEntry, 'actor' | 'target'>> = {}): AuditEntry {
  return { id: '1', createdAt: 0, actor: fulano, target: ciclano, ...record, ...over } as AuditEntry
}

describe('auditSentence', () => {
  it.each<[AuditRecord, string]>([
    [{ action: 'voice-kick', targetId: 'c', details: { channelName: 'Jogos' } }, 'Fulano expulsou Ciclano da sala Jogos'],
    [{ action: 'voice-move', targetId: 'c', details: { channelName: 'Jogos' } }, 'Fulano moveu Ciclano para a sala Jogos'],
    [{ action: 'voice-mute', targetId: 'c', details: {} }, 'Fulano silenciou Ciclano para todos'],
    [{ action: 'voice-unmute', targetId: 'c', details: {} }, 'Fulano tirou o silêncio de Ciclano'],
    [{ action: 'kick', targetId: 'c', details: {} }, 'Fulano expulsou Ciclano da comunidade'],
    [{ action: 'ban', targetId: 'c', details: { reason: 'spam' } }, 'Fulano baniu Ciclano (motivo: spam)'],
    [{ action: 'ban', targetId: 'c', details: { reason: null } }, 'Fulano baniu Ciclano'],
    [{ action: 'unban', targetId: 'c', details: {} }, 'Fulano tirou o banimento de Ciclano'],
    [{ action: 'timeout', targetId: 'c', details: { minutes: 10 } }, 'Fulano pôs Ciclano de castigo por 10 minutos'],
    [{ action: 'timeout-clear', targetId: 'c', details: {} }, 'Fulano tirou o castigo de Ciclano'],
    [
      { action: 'message-delete', targetId: 'c', details: { messageId: 'm', channel: { name: 'geral', type: 'text' } } },
      'Fulano apagou uma mensagem de Ciclano no canal #geral'
    ],
    [
      { action: 'message-delete', targetId: 'c', details: { messageId: 'm', channel: { name: 'Jogos', type: 'voice' } } },
      'Fulano apagou uma mensagem de Ciclano na sala Jogos'
    ],
    [{ action: 'role-create', targetId: 'r', details: { name: 'Mod' } }, 'Fulano criou o cargo Mod'],
    [{ action: 'role-update', targetId: 'r', details: { name: 'Mod' } }, 'Fulano alterou o cargo Mod'],
    [{ action: 'role-delete', targetId: 'r', details: { name: 'Mod' } }, 'Fulano apagou o cargo Mod'],
    [{ action: 'member-roles', targetId: 'c', details: { added: ['Mod', 'VIP'], removed: ['Novato'] } }, 'Fulano deu Mod e VIP e tirou Novato de Ciclano'],
    [{ action: 'member-roles', targetId: 'c', details: { added: ['Mod'], removed: [] } }, 'Fulano deu Mod a Ciclano'],
    [{ action: 'member-roles', targetId: 'c', details: { added: [], removed: ['A', 'B', 'C'] } }, 'Fulano tirou A, B e C de Ciclano'],
    [{ action: 'member-roles', targetId: 'c', details: { added: [], removed: [] } }, 'Fulano manteve os cargos de Ciclano'],
    [{ action: 'channel-overrides', targetId: 'ch', details: { name: 'geral', type: 'text' } }, 'Fulano mudou as permissões do canal #geral'],
    [{ action: 'channel-create', targetId: 'ch', details: { name: 'geral', type: 'text' } }, 'Fulano criou o canal #geral'],
    [{ action: 'channel-create', targetId: 'ch', details: { name: 'Jogos', type: 'voice' } }, 'Fulano criou a sala Jogos'],
    [{ action: 'channel-delete', targetId: 'ch', details: { name: 'Jogos', type: 'voice' } }, 'Fulano apagou a sala Jogos'],
    [{ action: 'category-create', targetId: 'cat', details: { name: 'Jogos' } }, 'Fulano criou a categoria Jogos'],
    [{ action: 'category-rename', targetId: 'cat', details: { name: 'Games', previousName: 'Jogos' } }, 'Fulano renomeou a categoria Jogos para Games'],
    [{ action: 'category-delete', targetId: 'cat', details: { name: 'Games' } }, 'Fulano apagou a categoria Games'],
    [{ action: 'channel-layout', targetId: null, details: {} }, 'Fulano reorganizou os canais']
  ])('%o', (record, sentence) => {
    expect(auditSentence(entry(record))).toBe(sentence)
  })

  it('conta apagada no lugar de quem fez ou do alvo', () => {
    expect(auditSentence(entry({ action: 'kick', targetId: 'c', details: {} }, { actor: null, target: null }))).toBe(
      'Conta apagada expulsou conta apagada da comunidade'
    )
  })

  it('toda ação tem um rótulo para o filtro', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...AUDIT_ACTIONS].sort())
  })
})

describe('durationText', () => {
  it.each([
    [1, '1 minuto'],
    [10, '10 minutos'],
    [60, '1 hora'],
    [120, '2 horas'],
    [1440, '1 dia'],
    [2880, '2 dias'],
    [10080, '1 semana'],
    [90, '90 minutos']
  ])('%i minutos = %s', (minutes, text) => {
    expect(durationText(minutes)).toBe(text)
  })
})
