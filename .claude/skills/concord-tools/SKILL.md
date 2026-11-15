---
name: concord-tools
description: Como funcionam as ferramentas do grupo do Concord (v4) — sorteio no servidor com crypto.randomInt, resultado postado como mensagem kind 'tool' (Message.tool tipado + content por extenso), o sorteador de times (A8: validação, Fisher–Yates, times equilibrados, lanes sem repetir com preferências e lanes disponíveis (laneSet), accountId de cada pessoa), mover os times para salas de voz (tools:move-teams/tools:moved), dado, moeda, sortear 1 nome e enquete (votos anônimos, poll:vote/close/mine/updated), e os eventos tools:*. Use ao mexer em server/modules/tools.ts, server/tools/move.ts, server/modules/polls.ts, server/repo/polls.ts, server/tools/**, src/shared/types/tools.ts, no kind/tool de src/shared/types/message.ts e server/db/schema/messages.ts, nos painéis e cartões (components/tools/**: TeamRandomizerPanel, DicePanel, CoinPanel, PickPanel, PollPanel, ToolResultCard, TeamResultCard, PollCard, shared, people), no cartão do ChatView (B7/B10), ao criar uma ferramenta nova, ou ao investigar sorteio recusado, "Muitos sorteios seguidos", resultado diferente entre telas ou alguém que não foi levado para a sala do time.
---

A documentação desta área fica em **`docs/areas/tools.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
