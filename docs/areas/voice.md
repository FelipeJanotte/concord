# Voz

Fluxo: o app pede para entrar (`voice:join`), o servidor do Concord valida e devolve `{ url, token }`, e o app
conecta direto no **LiveKit** (SFU self-hosted, sobe com `docker compose up -d`). Cada pessoa tem **uma** conexão
com o LiveKit, que repassa o áudio para os outros. Sem o LiveKit rodando, ninguém entra na voz.

## Servidor (LiveKit) — `server/livekit.ts` + `server/modules/voice.ts`

O áudio (e a tela, na B3) passa pelo LiveKit, um SFU self-hosted que roda pelo `docker compose` (ver
`docs/areas/dev-workflow.md`). O servidor do Concord não toca na mídia; ele:

1. **Valida e emite o token.** `voice:join {channelId, muted, deafened}` exige `hello`, LiveKit configurado, um
   canal de voz existente e as permissões do canal (v2, `docs/areas/permissions.md`): sem `view` responde "Canal de
   voz não encontrado" (não revela sala privada), sem `connect` "Você não tem permissão para entrar nesta sala".
   O ack é `{ ok: true, url, token, canSpeak, canShare }` (`JoinVoiceResult` = `VoiceCredentials` +
   `VoicePermissions` em `shared/types/voice.ts`). O JWT (`createVoiceCredentials`) vale **60 s** (só para
   conectar; depois o LiveKit renova a sessão — curto para quem foi tirado não voltar com um token guardado) e
   libera **uma sala** (`room` = id do canal) com:
   - identidade = `User.id` (= `socket.id`; duas conexões da mesma conta não se derrubam no LiveKit);
   - `name` = `nome#tag` e atributo `accountId`;
   - `canPublishSources` (`publishSources`) = microfone se `canSpeak`, tela e áudio da tela se `canShare`
     (câmera bloqueada); `canPublish` = tem alguma fonte; `canPublishData` = false; sem `roomAdmin`/`roomCreate`/`roomList`.
2. **Mantém o estado.** O mapa `voice` (socket.id → `VoiceState`) continua sendo a fonte da lista de quem está em
   cada sala; cada conexão recebe `voice:state` **só das salas que pode ver** (`voiceStatesFor`) ao entrar, sair,
   trocar de sala, em `voice:update` e em `voice:sharing` (indicador "ao vivo"; entrar ou trocar de sala zera
   `sharing`). Sem `speak`, a pessoa fica sempre `muted: true` (mesmo mandando `voice:update`); sem `share`,
   `voice:sharing true` é ignorado.
3. **Tira da sala no LiveKit** quando a pessoa sai pelo Concord (`voice:leave`, `disconnect`, troca de sala):
   `kickFromRoom` → `RoomService.RemoveParticipant`. Canal apagado → `closeRoom` → `DeleteRoom` (sempre, mesmo se
   a lista estiver vazia: pode haver alguém no LiveKit que ela não conhece). Sem isso, um cliente modificado
   continuaria ouvindo depois de "sair". Erros `not_found` são ignorados; outros só geram log
   (`[livekit] ... falhou`), nunca derrubam o handler.
4. **Reaplica permissões ao vivo** (`applyVoiceAccess`, chamado pela v2 a cada mudança de cargos/regras): quem
   perdeu `connect` sai (e é removido do LiveKit); quem perdeu/ganhou `speak` ou `share` tem as permissões trocadas
   no LiveKit (`updateVoicePermissions` → `RoomService.UpdateParticipant`, conjunto completo, só quando muda).

5. **Chamada numa conversa privada (v3, servidor da B8).** O `voice:join` também aceita um canal `dm` (sala LiveKit =
   id da conversa). Nele, cargos e regras não valem: só os dois membros entram (`allowed`, que usa os membros da DM),
   e só se ninguém tiver bloqueado o outro. O bloqueio responde "Não foi possível entrar na chamada", sem dizer quem
   bloqueou. Para quem não é membro, inclusive a dona, a resposta é "Canal de voz não encontrado". As permissões de
   falar e compartilhar vêm de `voicePermissionsIn`; o `voice:state` da sala vai só para os membros (`seesRoom`).
   O `applyVoiceAccess` ignora DMs. Quando alguém bloqueia, o `friend:block` chama `leaveDmVoice`, que tira os dois
   da sala e do LiveKit. Canal de texto continua sem voz.
   O "telefone" (tocar, atender, desligar) é o `server/modules/calls.ts` (B8, `docs/areas/calls.md`): ele usa
   `onVoiceRoomsChange` (aviso depois de toda mudança nas salas, junto com o `voice:state`) para encerrar a chamada
   quando os dois saem da sala. No app, `joinVoice` com um canal `dm` não troca a tela (fica na conversa).

Não existe mais `voice:signal`, `voice:peer-left` nem `peers` no ack.

Configuração (`server/.env`, valores de dev em `server/.env.example`):

| Variável | Para quê |
|---|---|
| `LIVEKIT_URL` | endereço `ws://`/`wss://` que o **app** usa (vai no ack). Para a rede local, use o IP da máquina. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | mesmos de `livekit.yaml` (`keys:`). O segredo precisa de 32+ caracteres. |
| `LIVEKIT_API_URL` (opcional) | endereço que o **servidor** usa para a API. Padrão: `LIVEKIT_URL` com `ws`→`http`. |

Sem as três primeiras, o servidor sobe com `Voz (LiveKit): desativada` e `voice:join` responde
"A voz não está configurada neste servidor".

Testes: `server/livekit.test.ts` (config e token) e `server/tests/voice.test.ts` (integração com o LiveKit falso
de `server/tests/fake-livekit.ts`, que registra as chamadas `RemoveParticipant`/`DeleteRoom`/`UpdateParticipant`;
o token é conferido com `TokenVerifier`). Permissões na voz (token sem microfone/tela, atualização ao vivo, saída
ao perder `connect`): `server/tests/permissions.test.ts`. Chamada em DM (membros, quem é de fora, bloqueio, cargos
não afetam): `server/tests/voice-dm.test.ts`. Para um teste novo com voz:
`TestServer.start({ env: liveKitEnv(await livekit.start()) })` e crie as salas com `server.createChannel(nome, 'voice')`
(só a dona cria canal).

## Cliente (`livekit-client`) — `src/renderer/src/lib/voice.ts`

Classe `VoiceClient`, exportada como `voice`, chamada por `joinVoice`, `leaveVoice`, `toggleMute` e `toggleDeafen`
em `lib/actions/voice.ts` (reexportados por `lib/client.ts`). A API pública (`join`, `leave`, `setMuted`,
`setDeafened`, `teardown`, `setSocket`) é a mesma da antiga malha P2P, então a interface não mudou.

```
clica na sala ─► createLocalAudioTrack(echoCancellation/noiseSuppression/autoGainControl)
                 (falhou? entra só para ouvir e devolve micError)
              ─► emitWithAck('voice:join', {channelId, muted, deafened}) ─► { url, token }
              ─► new Room(...).connect(url, token, { autoSubscribe: true })
              ─► publishTrack(mic, { source: Microphone })  +  room.startAudio()
```

- **Áudio dos outros:** `TrackSubscribed` (só `Track.Kind.Audio`; vídeo/tela fica para a B3) → `track.attach()`
  cria o `<audio>`; `TrackUnsubscribed` → `detach()` + `remove()`.
- **Mute:** `mic.mute()` / `unmute()` (o LiveKit para de enviar e avisa os outros).
- **Deafen:** `muted` em todos os `<audio>` anexados, inclusive os de quem chega depois. Na UI, deafen também
  silencia o microfone (`applyAudio` em `lib/actions/voice.ts`).
- O estado de mute/deafen vai para o servidor em `voice:join` (inicial) e `voice:update`; todos recebem por
  `voice:state`, que mostra os ícones vermelhos.
- **Quem está falando:** `ActiveSpeakersChanged` do LiveKit (sem `AnalyserNode`). `publishSpeaking()` filtra a
  própria pessoa quando está silenciada e os outros quando está em deafen, e só atualiza `store.speaking`
  quando o conjunto muda.
- **Troca de sala:** a Room atual só fecha **depois** que o servidor aceita a nova (`teardown()` vem depois do ack do
  `voice:join`). Troca recusada (canal apagado, sem permissão, voz desligada): o `join` lança o erro, libera o
  microfone aberto para a sala nova e a pessoa continua na antiga, com áudio; o servidor também a mantém lá. O
  servidor troca de sala sozinho no `voice:join` aceito, sem precisar de `voice:leave`.
  Ao aceitar, o servidor **tira a pessoa da sala antiga no LiveKit** (`RemoveParticipant`), e o aviso pode chegar
  antes da resposta. Por isso, do envio do `voice:join` até fechar a antiga, o `Disconnected` dela é esperado
  (`switchingFrom`): não vira "Você foi removido" nem manda `voice:leave` (que tiraria a pessoa da sala nova). Só se a
  troca for **recusada** e a antiga tiver caído nesse meio-tempo, aí é tratado como queda (`endSwitch`). Testes: bloco
  "bug: trocar de sala" em `lib/voice.test.ts`.
- **Falha ao conectar no LiveKit** (depois do ack): emite `voice:leave` (o servidor já tinha colocado a pessoa na
  lista) e lança "Não foi possível conectar ao servidor de voz..."; o `joinVoice` vê `voice.inRoom === false` e zera
  o estado (`OUT_OF_VOICE`), inclusive quando era uma troca de sala. Enquanto o `connect` não termina, um
  `RoomEvent.Disconnected` **não** vira "queda" (`connecting`): quem trata é o `join`, com a mensagem certa.
- **Entrada interrompida:** se a pessoa sair, trocar de sala ou o socket do Concord cair enquanto o LiveKit conecta,
  o `join` devolve `{ cancelled: true }` (sem erro) e o `joinVoice` **não** grava `myVoiceChannelId` (antes a UI
  mostrava a pessoa na sala sem áudio). Testes: bloco "revisão do #9" em `lib/voice.test.ts` e
  `lib/actions/voice-join.test.ts`.
- **Queda não pedida** (`RoomEvent.Disconnected` com a Room ainda ativa: removido pelo servidor, sala encerrada,
  LiveKit fora do ar): sai, avisa o servidor e chama `voice.onUnexpectedDisconnect(mensagem)`, que em
  `lib/actions/voice.ts` limpa a store e mostra o toast. `teardown()` remove os listeners antes de desconectar,
  então sair por conta própria não dispara esse aviso.
- **Queda do socket do Concord:** `lib/client.ts` chama `voice.teardown()` (sem avisar o servidor).
- Dependências injetáveis (`new VoiceClient({ createRoom, createMicTrack })`): os testes em
  `lib/voice.test.ts` usam Room, microfone e faixas falsos.

## Permissões de voz no app (v2)

O servidor decide `canSpeak` (`speak`) e `canShare` (`share`) e o token do LiveKit já sai com elas (seção do
servidor acima). O app acompanha:

- **Entrar sem `speak`:** o `join` lê `canSpeak`/`canShare` do ack (ausentes = `true`, servidor antigo) e, sem
  `speak`, descarta o microfone antes de conectar. Publicar mesmo assim faria o `livekit-client` lançar
  `PublishTrackError ... insufficient permissions (403)` e a entrada falharia. A pessoa entra **só ouvindo**:
  `store.voiceCanSpeak = false`, aviso "Você não tem permissão para falar nesta sala: entrou só para ouvir.", botão de
  microfone cortado e que só avisa (o deafen ainda pode ser tirado). O `voice:update` sempre vai com `muted: true`.
- **Sem `share`:** `store.voiceCanShare = false`, o botão "Compartilhar a tela" some e o `toggleScreenShare` só avisa.
- **Mudança com a pessoa na sala:** o servidor troca as permissões no LiveKit (`UpdateParticipant`), e o app recebe
  `RoomEvent.ParticipantPermissionsChanged` (só o da própria conexão conta). `permissionsFrom`
  (`lib/voice-permissions.ts`) aplica a mesma regra do `hasPermissionsToPublish` do `livekit-client`: precisa de
  `canPublish` e a fonte na lista; lista vazia = qualquer fonte; `MICROPHONE` = 2 e `SCREEN_SHARE` = 3 no protocolo.
  Ao **perder `speak`**: despublica e libera o microfone. Ao **recuperar**: abre o microfone de novo (mudo se estava
  mudo), liga a supressão de ruído e publica. O `voice.onPermissionsChange` atualiza a store, avisa a pessoa e reenvia
  o `voice:update` (o servidor mantém silenciado quem não pode falar). Ao **perder `share`** compartilhando: o LiveKit
  despublica a tela, e o "ao vivo" é desligado.
- **Saída forçada** (`voice:state` sem a própria conexão, ex.: perdeu `connect`): sai localmente, zera o estado e toca
  o som de saída (B16).
- **Silenciado por um moderador (B6):** o servidor trata como perder `speak` (mesmo caminho acima); o
  `VoiceState.serverMuted` troca os avisos por "Um moderador silenciou você nas salas de voz." e mostra o escudo
  vermelho. Expulsão da voz chega como `moderation:kicked` antes do `voice:state`. Detalhes na `docs/areas/moderation.md`.
- **Testes:** `lib/voice-permissions.test.ts`, `lib/voice.test.ts` (bloco "permissões de voz (v2)"),
  `lib/actions/voice-permissions.test.ts` e `components/VoiceView.test.tsx`.

## Compartilhar a tela (B3)

```
botão "Compartilhar a tela" (VoiceView) ─► toggleScreenShare()
  Electron:  abre o ScreenPicker ─► window.api.screen.getSources() ─► IPC screen-sources (desktopCapturer)
             escolhe ─► startScreenShare(id, áudio) ─► IPC screen-select (guarda a escolha no main, 15 s)
  navegador: (npm run dev em localhost:5173) o próprio navegador pergunta
  ─► voice.startScreenShare(áudio) ─► localParticipant.setScreenShareEnabled(true, {...})
  ─► getDisplayMedia ─► setDisplayMediaRequestHandler entrega a fonte escolhida (sem escolha: recusa)
  ─► emit('voice:sharing', true)  ─► todos veem "ao vivo" na sidebar e no tile
```

- **Main** (`src/main/screen-share.ts`): `createScreenShareController` (testável sem Electron) só aceita ids da
  última listagem; a escolha vale para **um** `getDisplayMedia` e expira em 15 s. Áudio = `'loopback'` (só Windows;
  `window.api.screen.canShareAudio`). O loopback captura **todo** o áudio do PC, inclusive a voz dos outros que o
  Concord toca: quem assiste pode ouvir eco. Por isso o áudio vem desmarcado.
- **Captura:** 1080p a 15 fps, `contentHint: 'detail'` (texto legível). O token já libera `screen_share` e
  `screen_share_audio`.
- **Receber:** `TrackSubscribed` de vídeo com `source === ScreenShare` entra em `store.screens` (ids de conexão);
  a própria tela entra como prévia via `LocalTrackPublished`. O áudio da tela toca como os outros áudios (respeita
  deafen). O `ScreenVideo` (em `ScreenTile.tsx`) liga a faixa num `<video muted>` com `attachScreen(userId, el)` (de `@/lib/client`).
- **Parar:** botão de novo (`stopScreenShare`) ou pelo sistema (janela fechada): `LocalTrackUnpublished` chama
  `voice.onScreenShareEnded`, que desliga `sharing` e avisa o servidor uma vez só.
- **Assistir** (`components/voice/VoiceGrid.tsx` + `ScreenTile.tsx` + `lib/featured-screens.ts`): podem ficar
  **várias telas em destaque ao mesmo tempo**. `featuredScreens(telas, eu, escolhidas, grade)` devolve a lista em
  ordem: as escolhidas que ainda estão ao vivo; se nenhuma, a primeira de **outra pessoa** (a própria só se for a
  única); `[]` = sem telas ou "Ver grade". `toggleFeatured` põe no fim/tira do destaque (a última não sai) e
  `moveScreen(ordem, arrastada, destino)` leva a arrastada para o lugar do destino.
  - `ScreenStage` (destaque, prop `featured`): barra de cima **sempre à vista** com "Ao vivo", "Assistindo: Tela de
    Ana e Tela de Bia" (`Intl.ListFormat` pt-BR), o seletor "Telas ao vivo" (um botão por tela, com mais de uma;
    clicar **põe ou tira do destaque**, `aria-pressed` nas que estão; a única em destaque fica desabilitada),
    "Ver grade" e "Tela cheia". Cada tela em destaque é um `ScreenPane` (`data-screen-pane`) com o próprio
    `<video>`, todos dividindo o espaço (`flex-1`).
  - **Organizar** (com 2 ou mais em destaque): arrastar uma tela sobre outra muda a ordem (HTML5 drag and drop; o id
    arrastado fica num `ref` do `ScreenStage`, sem `dataTransfer`) e o botão "Empilhar as telas"/"Pôr as telas lado
    a lado" (`Rows2`/`Columns2`, `data-arrangement` = `side-by-side`|`stacked`) alterna lado a lado e empilhadas.
    Cada tela mostra o nome embaixo. Ordem e arranjo são locais do `VoiceGrid` (não salvos).
  - Embaixo, a fileira "Membros da chamada" (`role="group"`), **centralizada**, com as miniaturas das
    telas que não estão em destaque (`ScreenTile`, clicar = assistir **só** essa) e os participantes. A centralização usa `ml-auto` no primeiro e
    `mr-auto` no último filho (não `justify-center`, que cortaria o começo quando a fileira rola de lado).
  - "Esconder membros"/"Mostrar membros" (ícones `UserX`/`Users`, `aria-pressed`, ao lado de "Ver grade"; some em
    tela cheia): esconde/mostra essa fileira para a tela ganhar espaço. Props `membersHidden`/`onToggleMembers` do
    `ScreenStage`; o estado (`membersHidden`) é local do `VoiceGrid`, não salvo. Na grade todos aparecem sempre.
  - No quadro de quem compartilha, o "Ao vivo" vira o botão "Assistir" (só essa) quando a tela dela já chegou (e
    não está em destaque).
  - "Ver grade": todas as telas lado a lado na grade (antes dos participantes); clicar numa volta ao destaque.
  - Escolha e grade são estado local do `VoiceGrid` (não salvos): ao trocar de sala, volta ao automático.
- **Grade centralizada com tamanho automático** (`TileGrid` em `VoiceGrid.tsx` + `lib/tile-layout.ts`): os quadros
  (pessoas e, na "Ver grade", as telas) ficam centralizados na horizontal e na vertical, e o tamanho sai de
  `bestTileLayout(quantos, largura, altura)`: testa de 1 a N colunas e fica com a que deixa o quadro 16:9 maior sem
  passar da área (empate: menos colunas). A área é medida com `useElementSize` (`ResizeObserver`), então os quadros
  crescem/encolhem com a janela e com quem entra/sai; a última linha fica no meio. Largura vai em `--tile-w`
  (`data-columns` mostra as colunas). Gente demais: mínimo de 160 px e a grade rola (`align-content: safe center`
  não corta o topo). No painel da chamada privada (`CallPanel`, sem altura definida) a `VoiceGrid` recebe
  `fill={false}`: só a largura conta, com máximo de 320 px, e no empate prefere mais colunas (lado a lado). Antes de
  medir (ou sem `ResizeObserver`), 240 px.
- **Tela cheia** (`lib/fullscreen.ts`: `useFullscreen`, `toggleFullscreen`): vai para tela cheia o **quadro inteiro**
  do `ScreenStage` (não só o `<video>`), então a barra com o seletor e "Sair da tela cheia" continua à vista. Botão,
  duplo clique no vídeo ou Esc. Recusa do sistema vira o aviso "Não foi possível abrir em tela cheia.". **No
  Electron precisa da permissão `fullscreen`**: `src/main/permissions.ts` (`allowPermission`) libera `media`,
  `notifications` e `fullscreen` no `setPermissionRequestHandler`. Antes só as duas primeiras eram liberadas e o
  botão "Tela cheia" não fazia nada (o `requestFullscreen` era recusado em silêncio).
- `sharing` no servidor é só indicador (o cliente avisa); quem pode publicar a tela é decidido pelo token do LiveKit.
- **Testes:** `src/main/screen-share.test.ts` (controlador, sem Electron), `lib/voice.test.ts` (bloco "tela"),
  `lib/actions/screen.test.ts` (botão, seletor, erros, aviso único ao servidor), `components/voice/voice.test.tsx`
  (jsdom: seletor, miniatura, destaque com "Assistindo" e seletor, duas telas em destaque, arrastar para reordenar,
  lado a lado/empilhadas, uma das telas em destaque que acaba, "Assistir" no quadro, "Ver
  grade", esconder/mostrar membros, tela que acaba, tela cheia do quadro com botão/duplo clique e a recusa, grade centralizada com o tamanho
  medido), `lib/featured-screens.test.ts` (escolha, pôr/tirar, reordenar), `lib/tile-layout.test.ts` (colunas e tamanho, limites, sem altura, gente demais), `src/main/permissions.test.ts`
  e `server/tests/voice.test.ts` (`voice:sharing`). À mão: três janelas na mesma sala com o LiveKit rodando; duas
  compartilham, a terceira põe as duas em destaque pelo seletor, arrasta para trocar a ordem, empilha, troca pelo
  "Assistir", usa "Ver grade", entra e sai da tela cheia (botão,
  duplo clique, Esc) e o "ao vivo" some ao parar.

## Câmera na sala de voz (B21)

Cada um liga a própria câmera na sala; o vídeo ocupa o quadro da pessoa na grade (no lugar da foto). A tela
compartilhada continua em destaque e as câmeras vão para a faixa de miniaturas.

- **Permissão:** permissão de canal nova `video` ("Ligar a câmera", depende de `connect` como `speak`/`share`).
  `voice:join` devolve `canVideo`; o token só libera a fonte `camera` com ela (`publishSources`) e perder com a
  pessoa na sala troca as permissões no LiveKit (`UpdateParticipant`), que despublica a câmera. Comunidades que já
  existiam ganham `video` em todo cargo que tinha `share` (migration `0010_camera_permission`, só dados).
- **Cliente** (`lib/voice.ts`): `setCamera(on)` usa `setCameraEnabled` com **640x360 a 24 fps, ~350 kbps e sem
  simulcast** (`CAMERA_CAPTURE`/`CAMERA_PUBLISH`: não pesa no upload de quem joga). Câmeras da sala (a própria
  inclusa) ficam em `store.cameras` (ids de conexão), separadas de `store.screens`; `attachCamera(userId, el)`
  liga num `<video>`. A câmera parar sozinha (perdeu `video`, desconectou) chama `onCameraEnded`.
- **Desligar não despublica:** `setCameraEnabled(false)` do `livekit-client` só **silencia** a faixa (a publicação
  continua; a luz da câmera apaga). Por isso o `VoiceClient` ouve `TrackMuted`/`TrackUnmuted` da fonte câmera (a
  própria e as remotas): silenciada sai de `store.cameras` (o quadro volta para a foto) e religar põe de volta. Quem
  entra depois recebe a câmera desligada já silenciada (`track.isMuted`) e não a mostra. Sem isso o quadro ficava
  com o último frame parado depois de desligar.
- **Câmera escolhida:** "Câmera" em Configurações de voz (`selectCamera`, salva em `concord:audio.camera`,
  `store.cameraId`); com a câmera ligada troca na hora (`switchActiveDevice('videoinput')`).
- **Ações** (`lib/actions/voice.ts`): `toggleCamera` (avisa fora da sala/sem permissão; erros do sistema em pt-BR:
  negada, não encontrada, em uso), `attachCamera`. `store.cameraOn` e `store.voiceCanVideo`; sair da sala zera.
- **Tela:** botão "Ligar a câmera"/"Desligar a câmera" no `VoiceView` e no "Voz conectada" (some sem `video`);
  ícone mostra o estado atual, como microfone/áudio: desligada `VideoOff` (riscada), ligada `Video`
  (teste em `components/camera-icon.test.tsx`). Os `ControlButton` (56px, redondos) têm `shrink-0` e a
  fileira dos controles tem `flex-wrap`: com o chat da sala aberto (painel de 360 px) ou em janela estreita eles
  quebram linha em vez de virar ovais achatados (mesmo teste; o `CallPanel` usa a mesma regra); `CameraVideo` em
  `components/voice/CameraTile.tsx`, usado pelo `ParticipantTile`; a própria câmera aparece espelhada.
- **Testes:** `lib/voice.test.ts` (blocos "câmera (B21)" e "câmera desligada e religada (B21)"), `lib/actions/camera.test.ts`, `components/VoiceView.test.tsx`,
  `lib/voice-permissions.test.ts`, `server/livekit.test.ts`, `server/tests/permissions.test.ts` (token e perda ao
  vivo) e `server/db/camera-permission.test.ts` (migration). À mão: duas janelas na mesma sala, as duas ligam a
  câmera e se veem.
- **Pendente:** câmera no painel da chamada privada (B8), câmera em destaque/tela cheia e fundo desfocado.

## Chat de texto da sala

Botão "Chat" no topo da `VoiceView` abre, ao lado da sala, o chat de texto do canal de voz (mesmo `ChatView` dos
canais de texto). Detalhes, permissões e testes em `docs/areas/messages.md` ("Chat de texto da sala de voz").

## Controles fora da sala: "Voz conectada"

Na sala de voz os controles ficam embaixo da grade (`VoiceView`); em **qualquer outra tela** (chat de texto, Home,
ferramentas) ficam no painel "Voz conectada" (`VoiceStatusPanel` em `components/UserPanel.tsx`, em cima da conta nas
duas barras laterais), como no Discord:

- linha de cima: "Voz conectada", o nome da sala (clique volta para ela; chamada privada abre a conversa),
  Configurações de voz e Desconectar;
- linha de baixo: **Câmera** (só com `voiceCanVideo`), **Compartilhar a tela** (só com `voiceCanShare`) e **Efeitos
  sonoros**, verdes quando ligados (`aria-pressed`). Microfone e áudio ficam nos botões do `UserPanel`.
- **O `ScreenPicker` e o `Soundboard` ficam montados uma vez só, no `UserPanel`** (junto das Configurações, `UserSettingsDialog`), e não
  mais dentro da `VoiceView`/`CallPanel`: antes, fora da sala o `toggleScreenShare` abria `screenPickerOpen` sem
  nenhum seletor na tela. Não monte de novo em outra tela (abriria duas janelas).
- **Testes:** `components/voice-panel.test.tsx` (botões, permissões, câmera, seletor de tela e sons abrindo do painel,
  parar de compartilhar). Testes que abrem essas janelas a partir da sala ou da chamada montam o `<Soundboard />` junto.

## Dispositivos, volume e menu de botão direito (B4)

**Só cliente:** nada vai para o servidor e não há evento novo.

- **Voz e vídeo** (`components/settings/VoiceSettings.tsx`, seção das Configurações, `docs/areas/settings.md`):
  microfone e saída. O botão de ondas sonoras na `VoiceView`, no painel da chamada e no "Voz conectada"
  (`VoiceStatusPanel`) abre as Configurações direto nessa seção (`openDeviceSettings`). As Configurações ficam
  montadas no `UserPanel`, então dá para escolher o microfone antes de entrar numa sala. Fora da rede local, a voz precisa do LiveKit com TURN e domínio com HTTPS (A14: `docs/areas/deploy.md`).
  Também tem a seção "Sobreposição em jogos" (overlay, B15:
  `docs/areas/overlay.md`).
  **Altura:** a janela tem muitas seções (dispositivos, volumes, ruído, pressione para falar, sons, sobreposição) e
  passa da altura de uma tela comum. Por isso o `DialogContent` é `flex max-h-[85vh] flex-col` (como os diálogos de
  administração) e tudo abaixo do título fica numa área que rola (`data-testid="device-settings-body"`,
  `min-h-0 flex-1 overflow-y-auto`). Seção nova entra **dentro** dessa área; fora dela volta a cortar.
- **Botão direito sobre uma pessoa** (`components/voice/MemberContextMenu.tsx`, shadcn `ui/context-menu`), no tile
  da sala de voz (`VoiceGrid`) e na lista embaixo do canal na barra lateral (`ChannelSidebar`):
  1. nome#tag;
  2. **Volume** (controle de 0 a 100%; as setas do teclado mexem nele, não no menu);
  3. **Silenciar** (só para mim; o menu fica aberto para dar para ajustar o volume na mesma vez);
  4. **Ver perfil** (`components/UserProfileDialog.tsx`: avatar, nome#tag, online e sala de voz em que está).
  Em si mesmo, só "Ver perfil". Quem eu silenciei ganha um ícone de alto-falante cortado no tile e na barra lateral.
  **Itens que ainda vão entrar neste menu:** "Cargos" (B5, só para quem pode gerenciar membros, depende da A4) e
  "Mensagem" (A7/B7, abre a DM com a pessoa).

| Peça | Papel |
|---|---|
| `lib/voice.ts` | `listDevices(kind)`, `setInputDevice(id)`, `setOutputDevice(id)`, `setUserVolume(accountId, 0–1)`, `setUserMuted(accountId, bool)`. `null` = padrão do sistema. |
| `lib/actions/devices.ts` | `listAudioDevices`, `selectAudioInput`, `selectAudioOutput`, `setUserVolume`, `setUserMuted`, `openDeviceSettings` (abre as Configurações em "Voz e vídeo"), `canChooseAudioOutput`, `loadAudioPreferences`. |
| `store/devices.ts` | `audioInputId`, `audioOutputId`, `userVolumes[accountId]`, `userMuted[accountId]`. |

- **Microfone:** fora da sala, a escolha vale para a próxima entrada (`createMicTrack(deviceId)`); dentro, troca na
  hora com `room.switchActiveDevice('audioinput', id)` (sem microfone, "só ouvindo", não mexe). Se o escolhido
  sumiu (desconectado), entra com o padrão do sistema em vez de cair no modo só ouvir.
- **Saída:** vai na criação da `Room` (`audioOutput`) e troca na hora com `switchActiveDevice('audiooutput', id)`.
  Só aparece se o ambiente tem `HTMLMediaElement.setSinkId` (o Electron tem).
- **Volume por pessoa:** guardado por **conta** (o token traz `attributes.accountId`; a identidade muda a cada
  conexão). Aplicado com `RemoteAudioTrack.setVolume` ao receber o microfone da pessoa e na hora ao mexer no
  controle. Só o microfone; o áudio da tela não muda. Vai de 0 a 100%: passar de 100% exigiria `webAudioMix`, que
  mixa o áudio pela Web Audio e quebraria o deafen (feito com `muted` nos `<audio>`).
- **Silenciar alguém:** também por conta. O volume aplicado vira 0, mas o valor ajustado continua em `userVolumes`;
  ao tirar o silêncio, volta ao que era. Mexer no volume enquanto silenciado só guarda o valor. Não afeta os outros:
  é só no meu app (para silenciar para todos, B6 "silenciar pelo servidor").
- **Preferências desta máquina:** `localStorage` `concord:audio` = `{ input, output, camera, volumes, muted, sounds, noise, micGain, outputVolume }`, lido ao carregar o
  app (`loadAudioPreferences`) e de novo depois do `disconnect()` (sair da conta não apaga). Dados inválidos ou
  armazenamento bloqueado: volta aos padrões sem quebrar.
- **Lista:** `Room.getLocalDevices(kind, false)` (não pede permissão só para listar). Os apelidos do Windows
  `default`/`communications` saem da lista (a opção "Padrão do sistema" cobre). Sem permissão de microfone os nomes
  vêm vazios: viram "Microfone 1", "Saída 1" e o diálogo explica. Ligar/desligar um fone com o diálogo aberto
  atualiza a lista (`devicechange`). Escolha salva de um aparelho desconectado aparece como "Dispositivo desconectado".
- **Testes:** `lib/voice.test.ts` (blocos "dispositivos e volume" e "silenciar alguém"), `lib/actions/devices.test.ts`
  (preferências, silenciar, erros, filtro da lista), `components/settings/VoiceSettings.test.tsx` (jsdom: seletores,
  desconectado, sem `setSinkId`, altura limitada com as seções na área que rola) e `components/voice/MemberContextMenu.test.tsx` (jsdom: menu no tile e na barra
  lateral, só "Ver perfil" em si mesmo, volume, silenciar mantendo o volume e o menu aberto, cartão de perfil).
  À mão: trocar de fone no meio da conversa e conferir que o outro continua ouvindo; botão direito numa pessoa,
  baixar o volume, silenciar, tirar o silêncio (volta ao volume ajustado) e reiniciar o app (tudo continua).

## Volume do microfone e volume de saída

Dois controles em Configurações de voz (`VolumeSettings` em `settings/VoiceSettings.tsx`), cada um com "Voltar para 100%".
**Só cliente:** nenhum evento novo; salvos em `concord:audio` como `micGain` e `outputVolume`.

| Peça | Papel |
|---|---|
| `lib/mic-gain.ts` | `clampMicGain` (0 a `MIC_GAIN_MAX` = 2), `clampOutputVolume` (0 a 1; inválido volta a 1), interface `GainControl` e `MicGainProcessor` (processador do `livekit-client`: microfone → `GainNode` → faixa publicada). |
| `lib/noise/processor.ts` | O `AutoNoiseProcessor` ganhou um `GainNode` "volume" entre seco/molhado e a saída, e `setGain`. |
| `lib/voice.ts` | `setMicGain(0–2)` e `setOutputVolume(0–1)`; `attachProcessor` escolhe o processador antes de publicar; `gainControl` é quem aplica o volume agora. |
| `lib/actions/devices.ts` + `store/devices.ts` | `micGain`/`outputVolume` (padrão 1), `setMicGain`, `setOutputVolume`, carregados em `loadAudioPreferences`. |

- **Microfone (0–200%):** com a supressão de ruído ligada, o volume vai no próprio processador de ruído (não há dois
  processadores: o `livekit-client` aceita só um por faixa). Com ela desligada e em 100%, o microfone vai **cru, sem
  processador** (como antes); ao sair de 100% dentro da sala entra o `MicGainProcessor` e fica até sair da sala.
  Desligar a supressão dentro da sala troca o de ruído pelo de volume (se o volume não está em 100%). Fora da sala só
  guarda o valor. A mudança é suave (`setTargetAtTime`), sem estalo. Quem escuta recebe o áudio já com o volume.
  O `autoGainControl` do WebRTC continua ligado: ele age antes, este volume multiplica depois.
- **Saída (0–100%):** multiplica o volume de cada pessoa (`applyVolume` = pessoa × saída) e vale também para o áudio
  das telas, os efeitos sonoros (`sounds.ts`) e os sons de entrar/sair (`voice-sounds.ts`, inclusive o "Testar").
  Não passa de 100% pelo mesmo motivo do volume por pessoa (`webAudioMix` quebraria o deafen). O toque de chamada
  (`Ringer`) não é afetado, para não perder uma ligação com o volume baixo.
- **Testes:** `lib/mic-gain.test.ts` (limites, ligação dos nós, `setGain`, `destroy`), `lib/noise/noise.test.ts` (nó de
  volume no processador de ruído), `lib/voice.test.ts` (bloco "volume do microfone e de saída": com/sem supressão,
  antes de publicar, troca ao desligar a supressão, limites, pessoa × saída, áudio da tela),
  `lib/actions/devices.test.ts` (salvar, reabrir, dados ruins, erro), `components/settings/VoiceSettings.test.tsx`
  (controles, "Voltar para 100%", "Testar" com o volume de saída), `sounds.test.ts` e `voice-sounds.test.ts`.
  À mão: numa sala com outra janela, subir o microfone para 200% e baixar para 0% (o outro ouve mudar na hora, com e
  sem a supressão de ruído); baixar a saída e conferir voz, tela e efeitos sonoros.

## Sons de entrar e sair da sala (B16)

Um som curto quando alguém **entra** na sala de voz em que estou (duas notas subindo) e outro quando alguém **sai**
(descendo). Também toca quando eu mesmo entro ou saio. **Só cliente:** nenhum evento novo.

| Peça | Papel |
|---|---|
| `lib/sounds/chime.ts` | `ChimePlayer`: gera os sons **na hora pela Web Audio** (osciladores senoidais com envelope; sem arquivos de áudio, sem licença para conferir). Volume com teto baixo (25% do máximo no "100%"), usa a saída escolhida (`AudioContext.setSinkId`, quando existe) e junta o mesmo som repetido em menos de 400 ms (`MERGE_WINDOW_MS`). |
| `lib/sounds/transitions.ts` | `roomChanges(prev, next, minhaSala, eu)`: quem apareceu e quem sumiu da minha sala entre dois `voice:state` (função pura; eu fico de fora). |
| `lib/actions/voice-sounds.ts` | `handleVoiceStateChange` (chamado no listener de `voice:state` em `lib/actions/voice.ts`), `enteredVoiceRoom`/`leftVoiceRoom` (chamados em `joinVoice`, `leaveVoice` e na queda da sala), `playVoiceSound`, `previewVoiceSound` (botão Testar). |
| `store/devices.ts` + `lib/actions/devices.ts` | `voiceSoundsEnabled` (padrão ligado) e `voiceSoundsVolume` (padrão 50%), salvos em `concord:audio` (`sounds`); `setVoiceSounds`. Interruptor, volume e "Testar" em Configurações de voz. |

- **Não toca:** fora de uma sala; na carga inicial (o `hello` não passa pelo listener); com deafen; com o interruptor
  desligado; quando só muda mute/deafen/tela de alguém. Quem já estava na sala quando eu entro não conta como "entrou"
  (a lista anterior já tem essas pessoas). Queda do socket do Concord não toca som de saída (só a queda da sala do LiveKit).
- **Várias mudanças juntas** (mesmo `voice:state` ou rajada) viram no máximo um som de cada tipo.
- **Testes:** `lib/sounds/sounds.test.ts` (notas, volume, junção, saída escolhida, sem `setSinkId`, erro de áudio;
  `roomChanges`), `lib/actions/voice-sounds.test.ts` (com socket falso: entra/sai, outras salas, fora de sala,
  lista da minha entrada, deafen, interruptor, trocar de sala, própria entrada/saída, falha ao entrar, queda, Testar),
  `lib/actions/devices.test.ts` e `components/settings/VoiceSettings.test.tsx` (preferência e controles). À mão: três
  janelas na mesma sala; a terceira entra e sai e as outras ouvem os dois sons; com deafen, silêncio.

## Supressão de ruído automática (B13)

Tira teclado, ventilador e ruído de fundo do microfone **antes de enviar**, sem a pessoa escolher nada. Roda no app
de quem fala (processador da faixa do microfone no `livekit-client`); quem ouve recebe limpo. Um único interruptor
("Supressão de ruído automática", ligado por padrão, salvo em `concord:audio` como `noise`) desliga tudo: microfone cru.

| Peça | Papel |
|---|---|
| `lib/noise/decide.ts` | `NoiseDecider` (função pura): ruído de fundo = percentil 20% do nível dos últimos 4 s (a fala é alta e intermitente; o fundo fica nos valores baixos). Fundo acima de **-50 dBFS por 2 s** liga o avançado; abaixo de **-58 dBFS por 10 s** desliga. O vão entre os dois evita ficar trocando. |
| `lib/noise/processor.ts` | `AutoNoiseProcessor` (`TrackProcessor` do LiveKit): microfone → seco + (RNNoise → molhado) → faixa publicada, e um analisador que mede o nível a cada 250 ms. A troca de modo é um crossfade (sem estalo, sem republicar). Com o avançado ligado, desliga a supressão nativa do WebRTC (`applyConstraints`) para não processar duas vezes. |
| `lib/noise/engine.ts` | Motor: **RNNoise** (MIT) de `@sapphi-red/web-noise-suppressor`, WASM + AudioWorklet, carregado com `import()` só quando o filtro liga. Os arquivos (`rnnoise*.wasm`, worklet) vão empacotados pelo Vite (`?url`). O WASM é baixado uma vez e o worklet é registrado uma vez por AudioContext. |
| `lib/voice.ts` | `setNoiseSuppression(on)`, `onNoiseModeChange`. Antes de publicar o microfone: `mic.setAudioContext(ctx48k)` + `mic.setProcessor(...)` (o AudioContext a 48 kHz é criado uma vez e reaproveitado). Desligar na sala: `stopProcessor` + nativa desligada. |
| `store/devices.ts` | `noiseSuppression` e `noiseMode` (`'light' \| 'advanced' \| 'light-fallback' \| 'off' \| null`), mostrado como frase em Configurações de voz. |

- **Modos:** `light` = só a nativa do WebRTC (ambiente silencioso); `advanced` = RNNoise; `light-fallback` = o avançado
  não está disponível (não carregou, erro no AudioWorklet, PC com menos de 3 núcleos, ou o `setProcessor` falhou);
  `off` = desligada pela pessoa; `null` = fora de sala.
- **Nunca derruba a voz:** qualquer falha do filtro cai para a supressão nativa e a pessoa entra/continua falando; só
  aparece um log `[ruído]` e a frase do diálogo muda.
- **CSP:** `script-src` ganhou `'wasm-unsafe-eval'` (necessário para compilar WebAssembly; não libera `eval` de JS).
- **Trocar de motor:** outra função com a assinatura de `NoiseEngineLoader` (ex.: o GTCRN do mesmo pacote, ou
  DeepFilterNet3). O resto não muda.
- **Testes:** `lib/noise/noise.test.ts` (decisor: silêncio, ventilador, fala sobre silêncio × sobre ruído, histerese,
  barulho curto; processador com Web Audio falso: crossfade, nativa liga/desliga, motor que falha, PC fraco, erro no
  worklet, destroy, `applyConstraints` recusado), `lib/voice.test.ts` (bloco B13: filtro antes de publicar, contexto
  reaproveitado, falha → entra com a nativa, desligado = cru, ligar/desligar dentro da sala, sair), `lib/actions/devices.test.ts`
  e `components/settings/VoiceSettings.test.tsx`. **À mão (o que os testes não medem):** a qualidade e o atraso do filtro
  e o uso de CPU; falar teclando e com ventilador e ouvir na outra janela.

## Pressione para falar (B20)

Modo em que o microfone **só abre enquanto uma tecla (ou botão do mouse) está pressionada**, mesmo com um jogo em
primeiro plano. Fica em Configurações de voz ("Pressione para falar"), é preferência desta máquina (`concord:ptt`:
`enabled`, `binding`, `sounds`) e vem desligado. Tecla padrão: **V**.

| Peça | Papel |
|---|---|
| `src/shared/push-to-talk.ts` | `PttBinding` (`kind: 'key' \| 'mouse'`, `code`, `label`), `PttConfig`, `PushToTalkBridge`, `cleanBinding`/`cleanPttConfig`, `PTT_RELEASE_DELAY_MS` (200 ms), `PTT_CAPTURE_TIMEOUT_MS` (10 s), `PTT_MOUSE_BUTTONS` (3, 4, 5). |
| `src/main/push-to-talk.ts` | `createPushToTalkController` (lógica, testável) e `setupPushToTalk` (IPC `ptt-config`, `ptt-capture`; avisos `ptt-change` e `ptt-unavailable` para a janela principal). Nomes das teclas em `keyLabel`. |
| `src/preload/index.ts` | `window.api.pushToTalk`: `setConfig`, `capture`, `onChange`, `onUnavailable`. |
| `lib/actions/push-to-talk.ts` | Preferência, `syncMicGate`, `handlePttChange` (abre/fecha + som), `setPushToTalk`, `setPttSounds`, `choosePttKey`, `startPushToTalk` (chamado em `main.tsx`; `disconnect` recarrega a preferência). |
| `store/push-to-talk.ts` | `pushToTalk`, `pttBinding`, `pttSounds`, `pttPressed`, `pttCapturing`, `pttAvailable`. |
| `lib/voice.ts` | `setMicGate(open)`: portão do microfone separado do mute (`micSilenced = muted \|\| gateClosed`). |
| `components/voice/PushToTalk.tsx` | `PushToTalkSettings` (seção do diálogo) e `PushToTalkHint` (indicador "Pressione V para falar" / "Microfone aberto" na sala e no painel da chamada). |
| `lib/sounds/chime.ts` | Sons `ptt-on` (Lá5) e `ptt-off` (Mi5), uma nota curta cada. |

**Por que `uiohook-napi`:** o `globalShortcut` do Electron só avisa quando o atalho é pressionado, nunca quando é solto.
O `uiohook-napi` (MIT, N-API com binários prontos para Windows/macOS/Linux, sem compilar e sem `electron-rebuild`)
é um gancho de teclado e mouse do sistema inteiro. Está em `dependencies` (vai no instalador; o
`externalizeDepsPlugin` deixa fora do bundle) e é carregado com `require` só na primeira vez que o gancho é preciso:
se o binário faltar, o resto do app continua e a janela recebe `ptt-unavailable` (o modo desliga com aviso).
O `electron-builder.yml` tem `npmRebuild: false`: sem isso o `npm run dist` tentava recompilar o `uiohook-napi` com
o `node-gyp` (exige Python e Visual Studio) mesmo ele já trazendo o binário pronto em `prebuilds/win32-x64`.

**Fluxo:** ligar o modo → `setConfig({ enabled: true, binding })` → o main liga o gancho → tecla pressionada →
`ptt-change true` → `pttPressed` + `voice.setMicGate(true)` (+ som `ptt-on`) → solta → depois de 200 ms
`ptt-change false` → portão fecha (+ `ptt-off`).

**Regras:**
- **Privacidade:** o gancho só roda com o modo ligado e uma tecla escolhida, ou enquanto a pessoa escolhe a tecla.
  Só a tecla escolhida é comparada; nenhuma outra tecla sai do processo principal.
- **Não é "silenciado":** o portão fechado não muda `muted` no `voice:join`/`voice:update`; os outros não veem o ícone
  de microfone cortado, só deixam de ouvir (o LiveKit recebe o `mute()` da faixa). O "falando" da própria pessoa some.
- Silenciado (mute/deafen), sem microfone ou sem `speak` ganham do portão: pressionar não abre nada e não toca som.
- A repetição automática do teclado (tecla segurada) não conta; pressionar de novo dentro dos 200 ms mantém aberto.
- Trocar a tecla ou desligar com a tecla pressionada fecha o microfone na hora.
- Escolher a tecla: a próxima tecla ou botão do meio/lateral do mouse; clique esquerdo/direito são ignorados; Esc ou
  10 s sem nada = desiste. Durante a escolha a tecla atual não abre o microfone.
- O som respeita o interruptor da seção e usa o volume dos sons de entrar/sair (B16) e a saída escolhida (B4).
- No navegador (`npm run dev` sem Electron) não existe a ponte: a seção mostra "Disponível só no app instalado".

**Testes:** `src/main/push-to-talk.test.ts` (gancho só quando precisa, indisponível, pressionar/repetir/soltar com
atraso, mouse, trocar tecla, escolher tecla, Esc, tempo esgotado, nomes), `src/shared/push-to-talk.test.ts`
(validação), `lib/actions/push-to-talk.test.ts` (preferência, portão, sons, trocar tecla, indisponível, fora do
Electron), `lib/voice.test.ts` (bloco B20: portão fechado entra mudo mas não "silenciado", abre/fecha, mute ganha),
`lib/sounds/sounds.test.ts` e `components/voice/PushToTalk.test.tsx`. **À mão:** com um jogo (ou outro programa) na
frente, segurar a tecla e conferir na outra janela que ela ouve e vê o "falando"; soltar e o som some.

**Problemas conhecidos:**
- macOS exige permissão de **Acessibilidade/Monitoramento de entrada** para o gancho; sem ela, nenhuma tecla chega
  (ainda não há aviso específico; o Concord hoje só gera instalador Windows).
- Jogos rodando **como administrador** no Windows não repassam teclas para programas sem privilégio: o push-to-talk
  não vê a tecla enquanto esse jogo está em foco (mesma limitação do Discord; rodar o Concord como administrador resolve).
- A tecla escolhida continua chegando aos outros programas (não é "engolida"): escolher uma tecla que o jogo não usa.

## Limites e evolução

- **Escala:** o SFU aguenta salas grandes (dezenas de pessoas); o gargalo passa a ser a banda/CPU do servidor do
  LiveKit, não de cada cliente.
- **NAT:** em dev o LiveKit usa UDP 7882 e TCP 7881 (fallback). Entre redes restritivas (4G, empresas), ative o
  TURN embutido do LiveKit (`turn.enabled` em `livekit.yaml`, com domínio e TLS) antes de ir para a internet.
- **Volume acima de 100%** e volume do áudio da tela separado do microfone: precisariam de `webAudioMix` e de
  refazer o deafen sobre a Web Audio.
- **Teste de microfone** (medidor de nível no diálogo) ainda não existe.
- **Supressão de ruído e CPU:** o "se adapta ao PC" hoje é por núcleos (≥ 3) e por erro no AudioWorklet; ainda não
  mede atraso real do processamento. Se o RNNoise pesar em algum PC, o próximo passo é medir a carga do worklet e
  cair para o leve automaticamente.
- **Áudio da tela sem eco:** excluir o próprio Concord do loopback exigiria captura por processo (não existe no
  Electron hoje).

## Depuração

1. Servidor: o log ao iniciar mostra `Voz (LiveKit): <url>` ou `desativada`. Falhas da API do LiveKit aparecem
   como `[livekit] ... falhou`.
2. LiveKit: `docker compose logs -f livekit` mostra quem entrou, candidatos ICE e erros de token.
3. App: no DevTools do Electron (Ctrl+Shift+I), filtre o console por `[voz]` (`livekit-client` também loga lá).
4. "Não foi possível conectar ao servidor de voz": o LiveKit não está rodando, `LIVEKIT_URL` aponta para um
   endereço que o app não alcança (ex.: `localhost` em outro PC) ou as chaves de `server/.env` não batem com
   `livekit.yaml`.
5. Conecta mas não passa áudio: ICE não fecha. Confira `LIVEKIT_NODE_IP` e a porta 7882/UDP no firewall (ver
   `docs/areas/dev-workflow.md`). `chrome://webrtc-internals` numa janela do Electron mostra bytes enviados/recebidos.
6. Microfone negado: `main/index.ts` libera `media` em `setPermissionRequestHandler`. O toast traduz
   `NotAllowedError`, `NotFoundError` e `NotReadableError`.
7. Testar sozinho numa máquina: duas janelas no mesmo PC funcionam, mas dá microfonia sem fone.
8. Trocou de fone e não ouve nada: a saída salva pode ser um aparelho desconectado; volte para "Padrão do
   sistema" em Configurações de voz. Alguém baixinho ou mudo: botão direito na pessoa e confira o volume e o
   "Silenciar" (ficam salvos por conta, neste computador; o ícone de alto-falante cortado indica silenciado por você).
9. Não toca o som de entrar/sair: confira em Configurações de voz se o interruptor está ligado, o volume acima de 0 e
   se você não está em deafen; o botão "Testar" toca mesmo com o interruptor desligado.
10. Outros me ouvem baixo/alto demais: confira o "Volume do microfone" em Configurações de voz (100% = como o
    sistema entrega). Ouço todo mundo baixo: "Volume de saída" (multiplica o volume de cada pessoa). Log
    `[voz] não foi possível ajustar o volume do microfone` = o processador não entrou (o áudio segue a 100%).
11. Supressão de ruído "indisponível neste computador": veja no console o log `[ruído]` (WASM bloqueado pela CSP,
    AudioWorklet sem suporte, menos de 3 núcleos). A voz continua com a supressão nativa. Som "abafado" ou robótico:
    desligue o interruptor para comparar com o microfone cru.
