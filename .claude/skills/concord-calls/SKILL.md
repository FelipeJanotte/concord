---
name: concord-calls
description: Chamadas privadas do Concord (v3, B8) — o "telefone" das conversas: ligar, tocar, atender, recusar, cancelar, desligar, tempo limite (CALL_RING_MS) e fim quando os dois saem da sala; o áudio é a sala de voz da própria conversa (voice:join com o canal dm). Eventos call:invite/accept/decline/cancel/end/list, call:updated e call:ended. Use ao mexer em server/modules/calls.ts, src/shared/types/calls.ts, lib/actions/calls.ts, store/calls.ts, lib/sounds/ringtone.ts, components/call/** (CallButton, CallPanel, IncomingCall), ou ao investigar chamada que não toca, toque que não para, "Essa pessoa está em outra chamada", "Não foi possível ligar" ou chamada que acaba sozinha.
---

A documentação desta área fica em **`docs/areas/calls.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
