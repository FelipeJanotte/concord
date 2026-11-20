// Registros persistidos que só o servidor conhece (não vão para o app).
import type { CustomStatus } from '../../src/shared/types'

export interface Account {
  id: string
  /** sempre em minúsculas */
  email: string
  name: string
  /** id escolhido pela pessoa: único (sem diferenciar maiúsculas) e imutável depois de travado */
  tag: string
  /** false só em contas do Google que ainda não escolheram o id definitivo */
  tagLocked: boolean
  color: string
  /** `scrypt$<salt>$<hash>` ou null para contas só com Google */
  passwordHash: string | null
  /** `sub` do Google, quando vinculada */
  googleId: string | null
  /** content-type da foto salva em AVATAR_DIR/<id>, ou null sem foto */
  avatarType: string | null
  avatarVersion: number
  bio: string
  customStatus: CustomStatus | null
  createdAt: number
}

export type NewAccount = Omit<Account, 'bio' | 'customStatus'> & Partial<Pick<Account, 'bio' | 'customStatus'>>

export interface Session {
  /** sha256 do token (o token em si nunca é salvo) */
  tokenHash: string
  accountId: string
  expiresAt: number
}
