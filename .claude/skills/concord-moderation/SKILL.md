---
name: concord-moderation
description: Como funciona a moderação do Concord (v2, B6) — expulsar da voz, silenciar pelo servidor (para todos, por conta, também no LiveKit, guardado no banco em server_mutes) e apagar mensagem (autor ou manageMessages; em DM só o autor), com as regras canModerate/canDeleteMessage, eventos moderation:voice-kick, moderation:voice-mute, moderation:kicked, message:delete e message:deleted. Use ao mexer em server/modules/moderation.ts, em kickFromVoice/setServerMuted/serverMuted de server/modules/voice.ts, em server/repo/moderation.ts ou server/db/schema/moderation.ts, em deleteMessage/findMessageMeta de server/repo/messages.ts, em src/shared/types/moderation.ts, lib/actions/moderation.ts, components/voice/ModerationMenu.tsx, components/chat/MessageActions.tsx, ou ao investigar "Você não pode expulsar essa pessoa", alguém que não consegue se dessilenciar, mensagem que não some para os outros ou anexo que fica no disco.
---

A documentação desta área fica em **`docs/areas/moderation.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
