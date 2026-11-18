# 0008 — Permissão "Administrador": acesso total sem hierarquia de cargos

- **Data:** 2026-11-17
- **Situação:** aceita

## Contexto

Só a dona podia tudo. Para dar poder total a outra pessoa era preciso marcar todas as permissões num cargo e, mesmo
assim, a hierarquia (`highestPosition`) a impedia de mexer nos cargos acima do seu e de moderar quem está acima. O
grupo pediu uma permissão "Administrador" que, como no Discord, dá acesso total, inclusive sobre os outros cargos.

## Decisão

Nova permissão global `administrator` (em `GLOBAL_PERMISSIONS`, guardada como texto no `roles.permissions` que já
existe: **sem migration**). `hasFullAccess(access, conta)` (dona ou cargo com `administrator`) faz `can()` passar em
tudo, em todos os canais, e as regras de hierarquia (`canManageRole`, `reorderableRoles`, `canAssignRole`,
`canModerate`, `canMoveMember`) deixam de olhar a posição. Tudo em `src/shared/types/permissions.ts` e
`moderation.ts`, usado igual pelo servidor e pela tela.

Limites mantidos:

| Limite | Por quê |
|---|---|
| Ninguém além da dona mexe nos cargos da dona nem a modera | Ela é a dona por ser a conta mais antiga; não há como rebaixá-la. |
| O admin **não mexe nos próprios cargos** (`canChangeMemberRoles`) | Evita tirar o próprio Administrador por engano. A escalada já é total, então a trava não protege nada além disso. |
| Conversas privadas continuam só dos dois membros | `allowed()` resolve o DM antes da `can()`; nem a dona vê. |
| Permissão global no @todos só a dona dá | Administrador no @todos tornaria todo mundo admin. |
| Cargo com `administrator` só a dona ou um admin edita, apaga, reordena, dá ou tira | Senão um gerente com `assignRoles` daria a alguém um cargo de admin que estivesse abaixo do seu e ganharia acesso total por tabela. Ligar a permissão já era barrado por `canGrantPermissions` (ninguém dá o que não tem). |

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Admin = `highestPosition` infinito (igual à dona) | Um admin não moderaria outro admin (infinito não é menor que infinito) e quebraria o `role:create` (posição do cargo novo vem do cargo mais alto). |
| Admin respeitando a hierarquia, só com todas as permissões | É o que já dava para fazer marcando tudo; não resolve "mexer nos cargos acima". |
| Liberar o admin a mexer nos próprios cargos | Risco de se trancar para fora sem ganho: ele já pode tudo nos outros. |
| Admin vê as DMs | Quebra a promessa da `docs/areas/dms.md` (nem a dona vê). |
| Coluna/flag `is_admin` no cargo em vez de permissão | Migration e caminho próprio na tela; a lista de permissões já existe e já vai para todos. |

## Consequências

- **Risco aceito:** quem tem Administrador pode apagar ou rebaixar outros admins, tirar o cargo de quem está acima
  dele e até desmarcar Administrador do próprio cargo pela aba Cargos (a trava é só em `member:set-roles`). Dar a
  permissão é dar a comunidade inteira, menos a dona e as DMs; a tela avisa em vermelho.
- Apps antigos (sem a permissão no `PERMISSION_LABELS`) não mostram a opção; o servidor aplica a regra de qualquer jeito.
- Reordenar cargos (`role:reorder`) ganhou regra pura no contrato (`reorderableRoles`/`reorderedPositions`) e
  `LIMITS.roleReorder`; o admin reordena todos os cargos menos o @todos.
