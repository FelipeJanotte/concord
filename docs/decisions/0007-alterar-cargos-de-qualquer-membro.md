# 0007 — Alterar cargos de qualquer membro, sem hierarquia no alvo

- **Data:** 2026-11-17
- **Situação:** aceita

## Contexto

`member:set-roles` exigia duas coisas de quem tem `assignRoles` ou `manageMembers`: o **alvo** com cargo mais alto
**abaixo** do seu (`canChangeMemberRoles`) e cada **cargo** dado ou tirado abaixo do seu (`canAssignRole`). O grupo
relatou que, mesmo com a permissão, só dava para aplicar cargos em quem estava abaixo; o esperado é poder aplicar em
qualquer membro.

## Decisão

Quem tem `assignRoles` ou `manageMembers` altera os cargos de **qualquer** membro, exceto a dona e a si mesmo; a
trava de **quais** cargos podem ser dados ou tirados (só abaixo do seu cargo mais alto, nunca o @todos) continua.
A regra mora em `canChangeMemberRoles` (`src/shared/types/permissions.ts`), usada pelo servidor e pela tela.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Manter a hierarquia no alvo | É o bloqueio relatado: ter a permissão não bastava para dar um cargo a quem está acima. |
| Tirar também a trava dos cargos (dar/tirar qualquer cargo) | Quem tem só `assignRoles` se daria poder indireto: daria a um amigo (ou tiraria de um admin) um cargo acima do seu, com permissões globais que não tem. Escalada de privilégio. |
| Liberar também mexer nos próprios cargos | Já foi recusado antes: deixava quem tinha `manageMembers` se dar um cargo inferior com permissão global que não tinha (ex.: `manageChannels`). |
| Liberar mexer nos cargos da dona | A dona tem todas as permissões por ser a dona, não pelos cargos; mexer neles não muda nada útil e só abre espaço para confusão. |
| Separar em outra permissão ("alterar cargos de quem está acima") | Permissão a mais para um grupo de amigos, que ninguém pediu (P6). |

## Consequências

- **Risco aceito:** quem tem `assignRoles` ou `manageMembers` dá e tira, de quem está no seu nível ou acima
  (inclusive admins), os cargos **abaixo do seu**. Ex.: um gerente pode tirar o cargo "VIP" de um admin. Não consegue
  tirar dele o cargo que o faz admin (está acima) nem dar a ninguém um cargo acima do seu.
- A moderação (`canModerate`/`canMoveMember` em `src/shared/types/moderation.ts`) não muda: expulsar, silenciar e
  mover continuam só para quem está abaixo.
- Na tela, a aba Membros e o submenu "Cargos" do botão direito passam a aparecer para quem está acima; os cargos
  acima do meu ficam travados.
