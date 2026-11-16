---
name: concord-notifications
description: Como funcionam as notificações do Concord (B9) — notificação nativa do Windows/macOS para mensagem de conversa privada, chamada recebida e pedido de amizade (só com a janela fora de foco), clique que abre a conversa ou a tela de amigos, e o selo no ícone (número no macOS/Linux, imagem por cima do ícone + piscar a barra de tarefas no Windows), e silenciar canal/conversa (botão direito → Silenciar canal, mutedChannels nas preferências da conta). Use ao mexer em components/MuteChannelMenu.tsx, setChannelMuted, src/main/notifications.ts, src/shared/notifications.ts, src/preload (window.api.notifications), src/renderer/src/lib/notifications.ts, lib/actions/notifications.ts, ou ao investigar notificação que não aparece, aparece com o app aberto, selo errado ou que não some, ou clique que não abre a conversa.
---

A documentação desta área fica em **`docs/areas/notifications.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
