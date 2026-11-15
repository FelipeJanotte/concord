# Sobreposição em jogos (overlay, B15)

Uma janela pequena e transparente por cima do jogo com **quem está na minha sala de voz**, **quem está falando**
(anel verde) e quem está com microfone ou áudio desligado. Some quando não estou em sala ou com o overlay desligado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/overlay.ts` | Contrato da ponte (não é Socket.IO): `OverlayConfig { enabled, corner, size, position }` (`OverlayPosition { x, y }` ou null = no canto), `OverlayRoom { members, more }` (só as pessoas: o nome da sala saiu do overlay), `OVERLAY_METRICS` (largura, altura da linha e da foto por tamanho), `OVERLAY_GAP`, `OVERLAY_PADDING` e `overlayHeight(tamanho, linhas)`, `OverlayMember`, `OVERLAY_SHORTCUT` (`Shift+\``), `OVERLAY_EDIT_SHORTCUT` (`CommandOrControl+Shift+\``, modo de mover), `OVERLAY_MAX_MEMBERS` (12), pontes `OverlayBridge` (janela principal) e `OverlayViewBridge` (página do overlay). |
| `src/main/overlay.ts` | `overlayBounds` (posição arrastada presa à área útil da tela onde ela está, ou canto da tela primária com margem 16; altura pelas pessoas, +1 linha no modo de mover), `cleanConfig`/`cleanRoom`/`cleanPosition` (validação), `createOverlayController` (lógica: cria a janela só quando precisa, mostra sem foco com `showInactive`, esconde, atalhos, modo de mover `setEditing`/`toggleEditing`, `moved`, destruir) e `setupOverlay` (IPC `overlay-config`/`overlay-room`/`overlay-edit`, dois `globalShortcut`, janela de verdade com `setInteractive` e o evento `moved`). |
| `src/main/index.ts` | `setupOverlay(() => mainWindow)`; destrói o overlay quando a janela principal fecha (senão o app não sairia) e solta o atalho no `will-quit`. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.overlay` (janela principal) e `window.api.overlayView` (página do overlay; o mesmo preload serve as duas janelas). |
| `electron.vite.config.ts` | Duas páginas no renderer: `index` e `overlay` (`build.rollupOptions.input`). |
| `src/renderer/overlay.html` | Página da janela do overlay: fundo transparente e CSP só com o necessário. |
| `src/renderer/src/overlay/{main,OverlayApp}.tsx` | Aplica o último tema da máquina e desenha a sala que chega por `overlayView.onUpdate` (tokens do tema; cor própria só na bolinha sem foto). No modo de mover: moldura tracejada, a página inteira com `-webkit-app-region: drag`, barra "Arraste para mover" + "Concluir" (`no-drag`), Esc e uma prévia ("Sala de voz"/"Prévia") fora de sala. |
| `src/renderer/src/store/overlay.ts` | `overlayEnabled`, `overlayCorner`, `overlaySize`, `overlayPosition` (salvos) e `overlayEditing` (modo de mover agora; não salvo). |
| `src/renderer/src/lib/actions/overlay.ts` | `overlayRoom(state)` (pura), `loadOverlayPreferences`/`setOverlay*` (salvo em `concord:overlay`), `syncOverlay` (manda só o que mudou), `setOverlayEditing` (botão "Mover"/"Concluir"; sincroniza a configuração antes), `startOverlay` (chamado no `main.tsx`: assina a store e ouve o atalho, `onEditing` e `onMoved`). `setOverlayCorner` zera a posição. `overlayEnv.bridge` é substituído nos testes. |
| `src/renderer/src/components/settings/VoiceSettings.tsx` (Configurações → "Voz e vídeo") | Seção "Sobreposição em jogos": interruptor, canto (com "Onde você arrastou" quando há posição), tamanho, botão "Mover"/"Concluir" (só no app, com o overlay ligado) e a explicação dos atalhos e da tela cheia. |

## Fluxo

```
store (voz, quem fala, preferência) ──syncOverlay──► IPC overlay-config / overlay-room ──► main
main: ligado + em sala com gente? ──► cria/posiciona a janela (setBounds) + overlay-update ──► página do overlay
atalho Shift+` (globalShortcut, com o jogo na frente) ──► main.toggle() ──► overlay-toggled ──► setOverlayEnabled (salva)
Ctrl+Shift+` ou botão Mover (overlay-edit true) ──► main.setEditing ──► janela recebe o mouse + overlay-editing ──► overlayEditing
arrastar e soltar (evento 'moved' da janela) ──► main.moved ──► overlay-moved ──► overlayPosition (salva) ──► overlay-config
"Concluir" / Esc na página (overlay-edit false) ou o atalho de novo ──► trava (o clique volta a passar para o jogo)
```

## Regras e limites

- **A janela:** `transparent`, `frame: false`, `focusable: false`, `skipTaskbar`, `alwaysOnTop` no nível
  `'screen-saver'`, `setIgnoreMouseEvents(true)` (o clique passa para o jogo) e visível em todos os workspaces.
  Aparece com `showInactive` (não tira o foco do jogo).
- **Quando aparece:** overlay ligado **e** eu numa sala de voz (da comunidade ou chamada privada) **e** com alguém
  nela. Até 12 pessoas; o resto vira "+N". Mostra **só as pessoas**, sem a linha com o nome da sala em cima.
- **Altura sem cortar:** as medidas vivem num lugar só (`OVERLAY_METRICS`, `OVERLAY_GAP`, `OVERLAY_PADDING` em
  `src/shared/overlay.ts`). A página dá a cada linha (pessoa, "+N", barra do modo de mover) a altura exata
  `line` (foto `avatar`, com folga para o anel de quem fala), e o processo principal calcula a janela com
  `overlayHeight` = margem × 2 + linhas × `line` + espaços. Antes eram números separados: a linha real (foto +
  margem interna + espaço) era maior que a reservada e a última pessoa ficava cortada embaixo. No modo de mover a
  moldura é `outline` (não `border`): borda ocuparia 4 px da altura e voltaria a cortar. **Mudou o visual da linha?
  Mude `OVERLAY_METRICS`, não a classe da linha.**
- **Preferência da máquina** (como os dispositivos da B4): `concord:overlay`, vale antes do login e continua depois
  de sair da conta (`disconnect` chama `loadOverlayPreferences`).
- O main valida tudo que chega: canto/tamanho desconhecidos voltam ao padrão, textos cortados, foto só `http(s):`
  ou `data:`.
- **Tela cheia exclusiva** (DirectX/Vulkan com o monitor só para o jogo): uma janela comum não aparece por cima. O
  Discord resolve injetando código no jogo, o que é frágil e pode ser bloqueado por anti-cheat; fica fora. A tela de
  configurações explica: "use tela cheia sem bordas".
- **Atalho:** se outro programa já usa `Shift+\``, o registro falha (log `[overlay]`) e fica só o interruptor.
- **Modo de mover (como no Discord):** `Ctrl + Shift + \`` (mesmo dentro do jogo; liga o overlay junto se estava
  desligado) ou o botão "Mover". A janela troca para `setIgnoreMouseEvents(false)`, `setMovable(true)`,
  `setFocusable(true)` e ganha foco (para o Esc); o arrasto é nativo (`-webkit-app-region: drag`). Aparece mesmo
  fora de sala, com uma prévia. Termina com "Concluir", Esc, o atalho de novo ou desligando o overlay (interruptor
  e `Shift + \`` também travam). Só o `moved` **durante** o modo de mover vira posição: o `setBounds` do próprio
  app não conta.
- **Posição arrastada:** canto de cima à esquerda, em pixels da tela (vale em outro monitor: a área útil é a da tela
  mais perto do ponto, `screen.getDisplayNearestPoint`). Sempre presa dentro da área útil (monitor desligado ou
  resolução menor não deixam o overlay fora da tela). Com posição, cresce para baixo e alinha à esquerda. Escolher
  um canto no seletor volta para o canto.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/main/overlay.test.ts` | Posição nos quatro cantos, tamanhos, teto de altura, validação, quando cria/mostra/esconde, "+N" na altura, altura exata das linhas (`overlayHeight`, sem linha do nome da sala, foto cabe com o anel), atalho (avisa a janela principal), destruir e recriar; posição arrastada (presa à tela, outro monitor, validação, área útil do ponto) e modo de mover (destrava, prévia fora de sala, só ligado, desligar trava, atalho liga junto, `moved` só no modo de mover). |
| `src/renderer/src/lib/actions/overlay.test.ts` | `overlayRoom` (foto completa, quem fala, mute/deafen, chamada privada, "+N", sem nome da sala), preferência salva/lida/inválida, sincronia só quando muda e atalho virando preferência, sem ponte; mover (configuração antes do pedido, `onEditing` na store, posição salva e enviada, inválida ignorada, canto zera a posição, posição volta ao reabrir). |
| `src/renderer/src/overlay/overlay.test.tsx` | Página: nada sem sala, só as pessoas (sem o nome da sala), linhas com destaque de quem fala, ícones, foto, "+N", parar de ouvir; alturas de `OVERLAY_METRICS` em cada linha, margem e espaço compartilhados, moldura `outline` no modo de mover; modo de mover (moldura arrastável, "Concluir", prévia, Esc, sem alinhar pelo canto com posição). |
| `src/renderer/src/components/settings/VoiceSettings.test.tsx` | Seção nas configurações: interruptor, canto, tamanho e o que fica salvo; "Mover"/"Concluir", "Onde você arrastou" e sem o botão fora do app. |

À mão: `npm run dev:all`, ligue o overlay em Configurações de voz, entre numa sala com outra conta e abra um jogo
(ou qualquer janela) em tela cheia sem bordas: o overlay fica no canto, o anel acende quando alguém fala e o clique
passa para o que está embaixo. `Shift + \`` liga/desliga. `Ctrl + Shift + \`` (ou "Mover"): arraste para outro lugar
(e para o segundo monitor), "Concluir"/Esc, confira que o clique volta a passar para o jogo e que a posição continua
depois de reiniciar o app; escolher um canto volta para ele.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Não aparece por cima do jogo | Jogo em tela cheia exclusiva: troque para "tela cheia sem bordas" (ou janela). |
| Não aparece nunca | Overlay desligado, fora de sala ou sala vazia. No navegador (`localhost:5173`) não existe: só no Electron. |
| Atalho não faz nada | Outro programa registrou `Shift+\`` antes (veja o log `[overlay]`); use o interruptor. |
| Cores diferentes do app | A página aplica o último tema salvo na máquina (`concord:theme`) ao abrir; trocar o tema só vale no próximo carregamento do overlay. |
| Não dá para arrastar | O modo de mover não está ligado (sem a moldura tracejada) ou o overlay está desligado. `Ctrl + Shift + \`` pode estar em uso por outro programa (log `[overlay]`): use o botão "Mover". |
| Voltou para outro lugar sozinho | A posição salva ficava fora da tela atual (monitor desligado, resolução menor): ela é presa à área útil. Escolha um canto ou arraste de novo. |
| Ficou recebendo cliques | Modo de mover ainda ligado: "Concluir", Esc (com o overlay em foco) ou `Ctrl + Shift + \``. |
| Última pessoa cortada embaixo | A altura de alguma linha na página não bate com `OVERLAY_METRICS` (alguém mudou a classe da linha em vez das medidas, ou pôs `border`/padding novo). A janela é calculada só com `overlayHeight`. |
| Pendente | Escolher outros atalhos, redimensionar arrastando e acompanhar a troca de tema ao vivo. |
