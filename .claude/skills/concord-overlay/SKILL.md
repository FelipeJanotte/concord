---
name: concord-overlay
description: Como funciona a sobreposição em jogos do Concord (overlay, B15) — janela extra do Electron transparente, sem borda, sempre no topo e que não recebe cliques, mostrando só quem está falando na minha sala de voz e escondida enquanto a janela do Concord está em foco; liga/desliga em Configurações → Voz e vídeo e pelo atalho global Shift + `, canto e tamanho configuráveis, modo de mover para arrastar como no Discord (Ctrl + Shift + `, botão "Mover", IPC overlay-edit/overlay-editing/overlay-moved, posição salva), segunda página no electron-vite. Use ao mexer em src/main/overlay.ts, src/shared/overlay.ts, src/renderer/overlay.html, src/renderer/src/overlay/**, lib/actions/overlay.ts, store/overlay.ts, na seção "Sobreposição em jogos" do VoiceSettings (Configurações → Voz e vídeo), no electron.vite.config.ts (rollupOptions.input), ou ao investigar overlay que não aparece (ninguém falando, Concord em foco), aparece por cima de tudo sem estar em sala, rouba o clique do jogo, não dá para arrastar, volta para outro lugar sozinho ou atalho que não funciona.
---

A documentação desta área fica em **`docs/areas/overlay.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
