// Silêncio pelo servidor (B6) guardado no banco. Quem chama (server/modules/voice.ts) mantém o cache em memória.
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { serverMutes } from '../db/schema'
import { isUuid } from './util'

/** Todas as contas silenciadas (carregadas uma vez quando o servidor sobe). */
export async function listServerMutes(): Promise<string[]> {
  const rows = await db().select({ accountId: serverMutes.accountId }).from(serverMutes)
  return rows.map((r) => r.accountId)
}

/**
 * Liga ou desliga o silêncio da conta. Repetir não dá erro (silenciar quem já está silenciado mantém
 * quem silenciou primeiro). Id inválido ou conta que não existe: não faz nada.
 */
export async function setServerMute(accountId: string, muted: boolean, mutedBy: string | null = null): Promise<void> {
  if (!isUuid(accountId)) return
  if (!muted) {
    await db().delete(serverMutes).where(eq(serverMutes.accountId, accountId))
    return
  }
  try {
    await db()
      .insert(serverMutes)
      .values({ accountId, mutedBy: mutedBy && isUuid(mutedBy) ? mutedBy : null })
      .onConflictDoNothing()
  } catch (err) {
    // conta apagada no meio do caminho (chave estrangeira, 23503; o Drizzle embrulha em `cause`): nada para guardar
    const e = err as { code?: string; cause?: { code?: string } }
    if ((e?.code ?? e?.cause?.code) !== '23503') throw err
  }
}
