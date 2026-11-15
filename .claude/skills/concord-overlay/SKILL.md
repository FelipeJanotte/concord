---
name: concord-overlay
description: Como funciona a sobreposição em jogos do Concord (overlay, B15) — janela extra do Electron transparente, sem borda, sempre no topo e que não recebe cliques, mostrando quem está na minha sala de voz e quem fala; liga/desliga nas Configurações de voz e pelo atalho global Shift + `, canto e tamanho configuráveis, segunda página no electron-vite. Use ao mexer em src/main/overlay.ts, src/shared/overlay.ts, src/renderer/overlay.html, src/renderer/src/overlay/**, lib/actions/overlay.ts, store/overlay.ts, na seção "Sobreposição em jogos" do DeviceSettings, no electron.vite.config.ts (rollupOptions.input), ou ao investigar overlay que não aparece, aparece por cima de tudo sem estar em sala, rouba o clique do jogo ou atalho que não funciona.
---

# Sobreposição em jogos (overlay, B15)

Uma janela pequena e transparente por cima do jogo com **quem está na minha sala de voz**, **quem está falando**
(anel verde) e quem está com microfone ou áudio desligado. Some quando não estou em sala ou com o overlay desligado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/overlay.ts` | Contrato da ponte (não é Socket.IO): `OverlayConfig { enabled, corner, size }`, `OverlayRoom { channelName, members, more }`, `OverlayMember`, `OVERLAY_SHORTCUT` (`Shift+\``), `OVERLAY_MAX_MEMBERS` (12), pontes `OverlayBridge` (janela principal) e `OverlayViewBridge` (página do overlay). |
| `src/main/overlay.ts` | `overlayBounds` (canto da área útil da tela primária, margem 16, altura pelas pessoas), `cleanConfig`/`cleanRoom` (validação), `createOverlayController` (lógica: cria a janela só quando precisa, mostra sem foco com `showInactive`, esconde, atalho, destruir) e `setupOverlay` (IPC `overlay-config`/`overlay-room`, `globalShortcut`, janela de verdade). |
| `src/main/index.ts` | `setupOverlay(() => mainWindow)`; destrói o overlay quando a janela principal fecha (senão o app não sairia) e solta o atalho no `will-quit`. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.overlay` (janela principal) e `window.api.overlayView` (página do overlay; o mesmo preload serve as duas janelas). |
| `electron.vite.config.ts` | Duas páginas no renderer: `index` e `overlay` (`build.rollupOptions.input`). |
| `src/renderer/overlay.html` | Página da janela do overlay: fundo transparente e CSP só com o necessário. |
| `src/renderer/src/overlay/{main,OverlayApp}.tsx` | Aplica o último tema da máquina e desenha a sala que chega por `overlayView.onUpdate` (tokens do tema; cor própria só na bolinha sem foto). |
| `src/renderer/src/store/overlay.ts` | `overlayEnabled`, `overlayCorner`, `overlaySize`. |
| `src/renderer/src/lib/actions/overlay.ts` | `overlayRoom(state)` (pura), `loadOverlayPreferences`/`setOverlay*` (salvo em `concord:overlay`), `syncOverlay` (manda só o que mudou), `startOverlay` (chamado no `main.tsx`: assina a store e ouve o atalho). `overlayEnv.bridge` é substituído nos testes. |
| `src/renderer/src/components/voice/DeviceSettings.tsx` | Seção "Sobreposição em jogos": interruptor, canto, tamanho e a explicação do atalho e da tela cheia. |

## Fluxo

```
store (voz, quem fala, preferência) ──syncOverlay──► IPC overlay-config / overlay-room ──► main
main: ligado + em sala com gente? ──► cria/posiciona a janela (setBounds) + overlay-update ──► página do overlay
atalho Shift+` (globalShortcut, com o jogo na frente) ──► main.toggle() ──► overlay-toggled ──► setOverlayEnabled (salva)
```

## Regras e limites

- **A janela:** `transparent`, `frame: false`, `focusable: false`, `skipTaskbar`, `alwaysOnTop` no nível
  `'screen-saver'`, `setIgnoreMouseEvents(true)` (o clique passa para o jogo) e visível em todos os workspaces.
  Aparece com `showInactive` (não tira o foco do jogo).
- **Quando aparece:** overlay ligado **e** eu numa sala de voz (da comunidade ou chamada privada, "Chamada com
  Ana") **e** com alguém nela. Até 12 pessoas; o resto vira "+N".
- **Preferência da máquina** (como os dispositivos da B4): `concord:overlay`, vale antes do login e continua depois
  de sair da conta (`disconnect` chama `loadOverlayPreferences`).
- O main valida tudo que chega: canto/tamanho desconhecidos voltam ao padrão, textos cortados, foto só `http(s):`
  ou `data:`.
- **Tela cheia exclusiva** (DirectX/Vulkan com o monitor só para o jogo): uma janela comum não aparece por cima. O
  Discord resolve injetando código no jogo, o que é frágil e pode ser bloqueado por anti-cheat; fica fora. A tela de
  configurações explica: "use tela cheia sem bordas".
- **Atalho:** se outro programa já usa `Shift+\``, o registro falha (log `[overlay]`) e fica só o interruptor.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/main/overlay.test.ts` | Posição nos quatro cantos, tamanhos, teto de altura, validação, quando cria/mostra/esconde, "+N" na altura, atalho (avisa a janela principal), destruir e recriar. |
| `src/renderer/src/lib/actions/overlay.test.ts` | `overlayRoom` (foto completa, quem fala, mute/deafen, chamada privada, "+N"), preferência salva/lida/inválida, sincronia só quando muda e atalho virando preferência, sem ponte. |
| `src/renderer/src/overlay/overlay.test.tsx` | Página: nada sem sala, linhas com destaque de quem fala, ícones, foto, "+N", parar de ouvir. |
| `src/renderer/src/components/voice/DeviceSettings.test.tsx` | Seção nas configurações: interruptor, canto, tamanho e o que fica salvo. |

À mão: `npm run dev:all`, ligue o overlay em Configurações de voz, entre numa sala com outra conta e abra um jogo
(ou qualquer janela) em tela cheia sem bordas: o overlay fica no canto, o anel acende quando alguém fala e o clique
passa para o que está embaixo. `Shift + \`` liga/desliga.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Não aparece por cima do jogo | Jogo em tela cheia exclusiva: troque para "tela cheia sem bordas" (ou janela). |
| Não aparece nunca | Overlay desligado, fora de sala ou sala vazia. No navegador (`localhost:5173`) não existe: só no Electron. |
| Atalho não faz nada | Outro programa registrou `Shift+\`` antes (veja o log `[overlay]`); use o interruptor. |
| Cores diferentes do app | A página aplica o último tema salvo na máquina (`concord:theme`) ao abrir; trocar o tema só vale no próximo carregamento do overlay. |
| Pendente | Escolher outro atalho, arrastar a posição livremente e acompanhar a troca de tema ao vivo. |
