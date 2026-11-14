// Cargos, membros e regras dos canais (v2). Vem no `hello` e em `access:updated`.
import type { AccessState } from '@shared/types'

export interface PermissionsState {
  /**
   * Estado de acesso que esta conta pode ver (`accessFor` no servidor).
   * `null` = ainda não chegou: a tela não esconde nada (o servidor bloqueia de qualquer jeito).
   */
  access: AccessState | null
}

export const permissionsInitial: PermissionsState = {
  access: null
}
