# Sobreposição em jogos (overlay, B15)

Uma janela pequena e transparente por cima do jogo com **só quem está falando na minha sala de voz** (anel verde),
com o ícone de microfone ou áudio desligado. Some quando ninguém fala, quando não estou em sala, com o overlay
desligado ou **enquanto a janela do Concord está em foco** (estou olhando o próprio app).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/overlay.ts` | Contrato da ponte (não é Socket.IO): `OverlayConfig { enabled, corner, size, position, width }` (`OverlayPosition { x, y }` ou null = no canto; `width` arrastada ou null = a do tamanho), `OverlayRoom { members, more }` (só as pessoas: o nome da sala saiu do overlay), `OVERLAY_METRICS` (largura, altura da linha e da foto por tamanho), `OVERLAY_GAP`, `OVERLAY_PADDING` e `overlayHeight(tamanho, linhas)`, `overlayWidth`/`cleanWidth` (`OVERLAY_MIN_WIDTH` 140 a `OVERLAY_MAX_WIDTH` 640), `OverlayMember`, atalhos: `OverlayShortcuts { toggle, edit }` (aceleradores do Electron), `DEFAULT_OVERLAY_SHORTCUTS` (`Shift+\`` e `CommandOrControl+Shift+\``), `shortcutFromKey` (tecla do navegador para acelerador), `cleanShortcut`/`cleanShortcuts` (validação; repetido ou inválido volta ao padrão), `shortcutLabel` (como aparece na tela), `OverlayShortcutStatus` (registrou ou não), `OVERLAY_MAX_MEMBERS` (12), pontes `OverlayBridge` (janela principal) e `OverlayViewBridge` (página do overlay). |
| `src/main/overlay.ts` | `overlayVisible` (pura: quando a janela aparece), `overlayBounds` (posição arrastada presa à área útil da tela onde ela está, ou canto da tela primária com margem 16; altura pelas pessoas, +1 linha no modo de mover), `cleanConfig`/`cleanRoom`/`cleanPosition` (validação), `createOverlayController` (lógica: cria a janela só quando precisa, `setAppFocused` (foco da janela principal), mostra sem foco com `showInactive`, esconde, atalhos, modo de mover `setEditing`/`toggleEditing`, `moved`, `resize`, atalhos `setShortcuts`/`pauseShortcuts`/`releaseShortcuts`, tema `setTheme`, destruir) e `setupOverlay` (`app` `browser-window-focus`/`browser-window-blur` filtrados pela janela principal, IPC `overlay-config`/`overlay-room`/`overlay-edit`/`overlay-resize`/`overlay-theme`/`overlay-shortcuts-pause` e `overlay-shortcuts` (invoke), `globalShortcut` com aviso no log quando não registra, janela de verdade com `setInteractive`, o evento `moved` e `overlay-theme` no `did-finish-load`). `teardownOverlay` solta os atalhos do controlador ativo. |
| `src/main/index.ts` | `setupOverlay(() => mainWindow)`; destrói o overlay quando a janela principal fecha (senão o app não sairia) e solta o atalho no `will-quit`. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.overlay` (janela principal) e `window.api.overlayView` (página do overlay; o mesmo preload serve as duas janelas). |
| `electron.vite.config.ts` | Duas páginas no renderer: `index` e `overlay` (`build.rollupOptions.input`). |
| `src/renderer/overlay.html` | Página da janela do overlay: fundo transparente e CSP só com o necessário. |
| `src/renderer/src/overlay/{main,OverlayApp}.tsx` | Aplica o último tema da máquina ao abrir e o tema que chega por `overlayView.onTheme` (troca ao vivo), e desenha a sala que chega por `overlayView.onUpdate` (tokens do tema; cor própria só na bolinha sem foto). No modo de mover: moldura tracejada, a página inteira com `-webkit-app-region: drag`, barra "Arraste para mover" + "Concluir" (`no-drag`), alça "Redimensionar" na lateral (`no-drag`, `ResizeGrip`: arrastar manda `overlayView.resize(largura, false)` e, ao soltar, `resize(largura, true)`), Esc e uma prévia ("Sala de voz"/"Prévia") fora de sala. |
| `src/renderer/src/store/overlay.ts` | `overlayEnabled`, `overlayCorner`, `overlaySize`, `overlayPosition`, `overlayWidth`, `overlayShortcuts` (salvos), `overlayShortcutTaken` (atalhos que o sistema recusou), `overlayRecording` (gravando qual atalho) e `overlayEditing` (modo de mover agora); os três últimos não são salvos. |
| `src/renderer/src/lib/actions/overlay.ts` | `overlayRoom(state)` (pura: só quem fala na minha sala; ninguém falando = `{ members: [] }`), `loadOverlayPreferences`/`setOverlay*` (salvo em `concord:overlay`), `syncOverlay` (manda só o que mudou), `setOverlayEditing` (botão "Mover"/"Concluir"; sincroniza a configuração antes), `startOverlay` (chamado no `main.tsx`: assina a store, ouve o atalho, `onEditing`, `onMoved` e `onResized`, e registra os atalhos salvos). `setOverlayCorner` zera a posição; `setOverlaySize` zera a largura. Atalhos: `startOverlayShortcutRecording`, `recordOverlayShortcutKey`, `cancelOverlayShortcutRecording`, `resetOverlayShortcuts`. Tema: `syncOverlay` manda `theme` da store (depois de `preferencesLoaded`, só quando muda). `overlayEnv.bridge` é substituído nos testes. |
| `src/renderer/src/components/settings/VoiceSettings.tsx` (Configurações → "Voz e vídeo") | Seção "Sobreposição em jogos" (só no app: some sem `overlayEnv.bridge()`): interruptor, canto (com "Onde você arrastou" quando há posição), tamanho, botão "Mover"/"Concluir" (com o overlay ligado), explicação da tela cheia e `OverlayShortcutSettings`: os dois atalhos com "Trocar", aviso "já é usado por outro programa" e "Restaurar padrão". A gravação ouve `keydown` na janela (captura); Esc, perder o foco ou fechar a tela desistem. |

## Fluxo

```
store (voz, quem fala, preferência) ──syncOverlay──► IPC overlay-config / overlay-room ──► main
janela principal ganha/perde o foco (browser-window-focus/blur) ──► main.setAppFocused
main: overlayVisible (ligado + alguém falando + Concord sem foco, ou modo de mover)? ──► cria/posiciona a janela (setBounds) + overlay-update ──► página do overlay
atalho de ligar (globalShortcut, com o jogo na frente) ──► main.toggle() ──► overlay-toggled ──► setOverlayEnabled (salva)
atalho do modo de mover ou botão Mover (overlay-edit true) ──► main.setEditing ──► janela recebe o mouse + overlay-editing ──► overlayEditing
arrastar e soltar (evento 'moved' da janela) ──► main.moved ──► overlay-moved ──► overlayPosition (salva) ──► overlay-config
alça Redimensionar (overlay-resize largura, false) ──► main.resize ──► setBounds; ao soltar (true) ──► overlay-resized ──► overlayWidth (salva)
"Concluir" / Esc na página (overlay-edit false) ou o atalho de novo ──► trava (o clique volta a passar para o jogo)
Trocar atalho ──► overlay-shortcuts-pause true ──► keydown ──► shortcutFromKey ──► invoke overlay-shortcuts ──► globalShortcut.register ──► { toggle, edit } registrou? ──► overlayShortcutTaken
setTheme / preferences:updated ──► store.theme ──► overlay-theme ──► main.setTheme (guarda) ──► overlay-theme ──► página (applyTheme sem efeito de janela)
```

## Regras e limites

- **A janela:** `transparent`, `frame: false`, `focusable: false`, `skipTaskbar`, `alwaysOnTop` no nível
  `'screen-saver'`, `setIgnoreMouseEvents(true)` (o clique passa para o jogo) e visível em todos os workspaces.
  Aparece com `showInactive` (não tira o foco do jogo).
- **Quando aparece** (`overlayVisible`): overlay ligado **e** alguém falando na minha sala de voz (da comunidade ou
  chamada privada) **e** a janela principal do Concord sem foco. Só quem está falando (`speaking` da store), até 12;
  o resto vira "+N". Ninguém falando: o renderer manda a sala vazia e a janela some. A janela cresce e encolhe
  conforme as pessoas começam e param de falar.
- **"Concord aberto" = janela principal em foco.** Regra pelos eventos `browser-window-focus`/`browser-window-blur`
  do `app` (só os da janela principal contam; o foco da própria janela do overlay no modo de mover não conta).
  Minimizar, esconder ou clicar em outro programa (o jogo) tira o foco e o overlay volta; clicar no Concord esconde.
  Por que foco e não "visível": com dois monitores o Concord pode estar visível atrás do jogo, e aí o overlay é útil;
  foco é o sinal de que a pessoa está olhando o app. Começa como "sem foco" até o primeiro evento.
- **Modo de mover ignora o foco:** o botão "Mover" é clicado dentro do Concord (em foco), então no modo de mover o
  overlay aparece mesmo com o Concord em foco (e mesmo sem ninguém falando, com a prévia). Ao concluir, volta à regra
  normal.
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
- **Atalhos escolhidos:** padrões `Shift + `` (liga/desliga) e `Ctrl + Shift + `` (modo de mover); a pessoa grava outra
  combinação em Configurações → Voz e vídeo. Vale combinação com Ctrl, Alt, Shift ou Win + letra, número, tecla de
  pontuação, setas, Espaço etc.; F1–F24 valem sozinhas; letra sozinha não (atrapalharia digitar). A tecla vem do
  `code` (posição física), não do caractere. Os dois atalhos não podem ser iguais (aviso na tela). Salvos em
  `concord:overlay` (`shortcuts`); o main valida de novo (`cleanShortcuts`). Se outro programa já usa a combinação,
  `globalShortcut.register` falha: o main devolve `{ toggle, edit }` e a tela mostra "já é usado por outro programa"
  (e o log `[overlay]`). **Por que gravar no renderer e não com o `uiohook` do pressione para falar:** aqui é uma
  combinação para o `globalShortcut` (formato de acelerador), gravada com a janela do Concord em foco; o gancho do
  sistema só é necessário para saber quando a tecla é solta. Enquanto grava, os atalhos do overlay ficam soltos
  (`overlay-shortcuts-pause`), senão apertar a combinação atual dispararia o overlay em vez de chegar na tela.
- **Redimensionar arrastando (só a largura):** no modo de mover aparece uma alça na lateral (à direita; à esquerda
  quando o overlay está num canto da direita, porque ali ele cresce para a esquerda). A largura vai de 140 a 640 px,
  fica em `width` (como a posição) e escolher um tamanho no seletor volta à largura dele. A altura continua sendo a
  das linhas (`overlayHeight`): mudar a altura arrastando cortaria pessoas ou deixaria sobra. Durante o arrasto o
  main só muda a janela; avisa a janela principal (`overlay-resized`) uma vez, ao soltar, para o eco da configuração
  não brigar com o arrasto. A janela continua `resizable: false` (janela transparente sem borda não redimensiona
  bem pelo sistema no Windows).
- **Tema ao vivo:** a página abre com o último tema da máquina (`concord:theme`) e depois segue o tema da conta: a
  janela principal manda `theme` da store por `overlay-theme` quando as preferências chegam e a cada troca; o main
  valida (`validateTheme`), guarda e repassa (também quando a janela do overlay termina de carregar). A prévia do
  editor de temas (`previewTheme`, sem salvar) não vai para o overlay.
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
| `src/shared/overlay.test.ts` | `shortcutFromKey`, `cleanShortcut`/`cleanShortcuts`, `shortcutLabel`, `overlayWidth`/`cleanWidth`. |
| `src/main/overlay.test.ts` | `overlayVisible` e Concord em foco (esconde no foco, volta no blur, não cria a janela em foco, modo de mover aparece mesmo em foco), posição nos quatro cantos, tamanhos, teto de altura, validação, quando cria/mostra/esconde, "+N" na altura, altura exata das linhas (`overlayHeight`, sem linha do nome da sala, foto cabe com o anel), atalho (avisa a janela principal), destruir e recriar; posição arrastada (presa à tela, outro monitor, validação, área útil do ponto) e modo de mover (destrava, prévia fora de sala, só ligado, desligar trava, atalho liga junto, `moved` só no modo de mover); atalhos (registra os dois, troca solta os antigos, ocupado volta `false`, erro do Electron, repetido/inválido = padrão, pausar e soltar); redimensionar (largura no lugar da do tamanho, só no modo de mover, aviso só ao soltar, limites); tema (repassa válido, guarda, ignora inválido). |
| `src/renderer/src/lib/actions/overlay.test.ts` | `overlayRoom` (só quem fala, ninguém falando = sala vazia, foto completa, mute/deafen, chamada privada, "+N", sem nome da sala), preferência salva/lida/inválida, sincronia só quando muda e atalho virando preferência, sem ponte; mover (configuração antes do pedido, `onEditing` na store, posição salva e enviada, inválida ignorada, canto zera a posição, posição volta ao reabrir); largura solta salva e enviada, tamanho zera a largura; atalhos (salvos enviados ao abrir, ocupado marcado, gravar/pausar/salvar, Esc, repetido recusado, restaurar padrão, inválidos = padrão); tema só depois das preferências e só quando muda. |
| `src/renderer/src/overlay/overlay.test.tsx` | Página: nada sem sala, só as pessoas (sem o nome da sala), linhas com destaque de quem fala, ícones, foto, "+N", parar de ouvir; alturas de `OVERLAY_METRICS` em cada linha, margem e espaço compartilhados, moldura `outline` no modo de mover; modo de mover (moldura arrastável, "Concluir", prévia, Esc, sem alinhar pelo canto com posição); alça de redimensionar (só no modo de mover, largura ao arrastar e ao soltar, lado esquerdo no canto da direita); tema ao vivo (aplica válido, ignora inválido). |
| `src/renderer/src/components/settings/VoiceSettings.test.tsx` | Seção nas configurações: interruptor, canto, tamanho e o que fica salvo; "Mover"/"Concluir", "Onde você arrastou" e sem o botão fora do app; atalhos (mostra, grava, Esc, fechar no meio, aviso de ocupado, restaurar padrão). |

À mão: `npm run dev:all`, ligue o overlay em Configurações de voz, entre numa sala com outra conta e abra um jogo
(ou qualquer janela) em tela cheia sem bordas: o overlay fica vazio até alguém falar, aí a pessoa aparece no canto
(e some quando para) e o clique passa para o que está embaixo. Clique no Concord: o overlay some; volte ao jogo: volta. `Shift + \`` liga/desliga. `Ctrl + Shift + \`` (ou "Mover"): arraste para outro lugar
(e para o segundo monitor), "Concluir"/Esc, confira que o clique volta a passar para o jogo e que a posição continua
depois de reiniciar o app; escolher um canto volta para ele. No modo de mover, arraste a alça da lateral: a largura muda e
continua depois de reiniciar; escolher um tamanho volta ao padrão. Troque os atalhos em Voz e vídeo e teste dentro do jogo;
escolha uma combinação que outro programa já usa e confira o aviso. Troque o tema em Aparência com o overlay visível
("Mover"): as cores mudam na hora.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Não aparece por cima do jogo | Jogo em tela cheia exclusiva: troque para "tela cheia sem bordas" (ou janela). |
| Não aparece nunca | Overlay desligado, fora de sala, ninguém falando ou o Concord em foco (clique no jogo). No navegador (`localhost:5173`) não existe: só no Electron. |
| Atalho não faz nada | Outro programa registrou a combinação antes: Voz e vídeo mostra "já é usado por outro programa" (e o log `[overlay]`). Troque o atalho ou use o interruptor. |
| Cores diferentes do app | Antes do login vale o último tema da máquina (`concord:theme`); o tema da conta chega depois das preferências (`preferencesLoaded`). A prévia do editor de temas não vai para o overlay, só o tema escolhido. |
| Não dá para arrastar | O modo de mover não está ligado (sem a moldura tracejada) ou o overlay está desligado. O atalho do modo de mover pode estar em uso por outro programa (aviso em Voz e vídeo): troque-o ou use o botão "Mover". |
| Voltou para outro lugar sozinho | A posição salva ficava fora da tela atual (monitor desligado, resolução menor): ela é presa à área útil. Escolha um canto ou arraste de novo. |
| Ficou recebendo cliques | Modo de mover ainda ligado: "Concluir", Esc (com o overlay em foco) ou o atalho do modo de mover. |
| Última pessoa cortada embaixo | A altura de alguma linha na página não bate com `OVERLAY_METRICS` (alguém mudou a classe da linha em vez das medidas, ou pôs `border`/padding novo). A janela é calculada só com `overlayHeight`. |
| Não dá para mudar a altura arrastando | De propósito: a altura é a das pessoas falando (`overlayHeight`). A alça muda só a largura; para fotos e letras maiores, use o seletor de tamanho. |
