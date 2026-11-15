---
name: concord-dms
description: Como funcionam as conversas privadas do Concord (v3, A7) — um DM é um canal do tipo dm com dois membros (channel_members), quem pode abrir (amigos, ou conversa que já existe), acesso só dos membros (nem a dona), bloqueio fechando a conversa, e os eventos dm:list/dm:open/dm:created. Use ao mexer em server/modules/dms.ts, server/repo/dms.ts, no cache de membros de server/access.ts (rememberDm, dmMembersOf, allowedInDm), em server/db/schema/channels.ts (channelMembers), src/shared/types/dms.ts, na lista de DMs da Home (B7) ou ao investigar mensagem de DM que vaza ou não chega, "Vocês precisam ser amigos para conversar" ou "Não foi possível abrir a conversa".
---

A documentação desta área fica em **`docs/areas/dms.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
