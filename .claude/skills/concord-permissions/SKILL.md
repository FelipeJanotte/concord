---
name: concord-permissions
description: Como funcionam os cargos e permissões do Concord (v2) — contrato e regra de cálculo compartilhados (can, channelPermissions, globalPermissions, highestPosition), dona da comunidade, permissão Administrador (hasFullAccess, acesso total sem hierarquia), @todos, regras por canal (allow/deny), hierarquia de cargos, reordenar cargos (role:reorder, reorderableRoles, arrastar na aba Cargos), eventos role:*/member:set-roles/channel:set-overrides/access:*, o que cada handler bloqueia e o que acontece quando o acesso muda. Use ao mexer em src/shared/types/permissions.ts, server/access.ts, server/modules/permissions.ts, server/repo/permissions.ts, server/db/schema/roles.ts, na tela de administração (components/settings/**, lib/permissions.ts, lib/actions/permissions.ts, store/permissions.ts), em qualquer handler que precise checar permissão, ou ao investigar canal que some, "Você não tem permissão", mensagem que não chega ou alguém saindo da voz sozinho.
---

A documentação desta área fica em **`docs/areas/permissions.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
