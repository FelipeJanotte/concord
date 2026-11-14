---
name: concord-voice
description: Como funcionam os canais de voz do Concord — LiveKit (SFU) com token emitido pelo servidor, livekit-client no app, estado das salas via Socket.IO, mute/deafen, quem está falando, compartilhar a tela, escolha de microfone/saída e volume por pessoa, limites e depuração. Use ao mexer em server/livekit.ts, server/modules/voice.ts, src/renderer/src/lib/voice.ts, nos eventos voice:* ou ao investigar áudio que não chega, token recusado, eco ou falha de conexão.
---

# Voz

Fluxo: o app pede para entrar (`voice:join`), o servidor do Concord valida e devolve `{ url, token }`, e o app
conecta direto no **LiveKit** (SFU self-hosted, sobe com `docker compose up -d`). Cada pessoa tem **uma** conexão
com o LiveKit, que repassa o áudio para os outros. Sem o LiveKit rodando, ninguém entra na voz.

## Servidor (LiveKit) — `server/livekit.ts` + `server/modules/voice.ts`

O áudio (e a tela, na B3) passa pelo LiveKit, um SFU self-hosted que roda pelo `docker compose` (ver
`concord-dev-workflow`). O servidor do Concord não toca na mídia; ele:

1. **Valida e emite o token.** `voice:join {channelId, muted, deafened}` exige `hello`, LiveKit configurado e um
   canal de voz existente. O ack é `{ ok: true, url, token }` (`JoinVoiceResult` / `VoiceCredentials` em
   `shared/types/voice.ts`). O JWT (`createVoiceCredentials`) vale 10 min (só para conectar; depois o LiveKit
   renova a sessão) e libera **uma sala** (`room` = id do canal) com:
   - identidade = `User.id` (= `socket.id`; duas conexões da mesma conta não se derrubam no LiveKit);
   - `name` = `nome#tag` e atributo `accountId`;
   - `canPublishSources` = microfone, tela e áudio da tela (câmera bloqueada); `canPublishData` = false;
     sem `roomAdmin`/`roomCreate`/`roomList`.
2. **Mantém o estado.** O mapa `voice` (socket.id → `VoiceState`) continua sendo a fonte da lista de quem está em
   cada sala; todos recebem `voice:state` (lista completa) ao entrar, sair, trocar de sala, em `voice:update` e em
   `voice:sharing` (indicador "ao vivo"; entrar ou trocar de sala zera `sharing`).
3. **Tira da sala no LiveKit** quando a pessoa sai pelo Concord (`voice:leave`, `disconnect`, troca de sala):
   `kickFromRoom` → `RoomService.RemoveParticipant`. Canal apagado → `closeRoom` → `DeleteRoom`. Sem isso, um
   cliente modificado continuaria ouvindo depois de "sair". Erros `not_found` são ignorados; outros só geram log
   (`[livekit] ... falhou`), nunca derrubam o handler.

Não existe mais `voice:signal`, `voice:peer-left` nem `peers` no ack.

Configuração (`server/.env`, valores de dev em `server/.env.example`):

| Variável | Para quê |
|---|---|
| `LIVEKIT_URL` | endereço `ws://`/`wss://` que o **app** usa (vai no ack). Para a rede local, use o IP da máquina. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | mesmos de `livekit.yaml` (`keys:`). O segredo precisa de 32+ caracteres. |
| `LIVEKIT_API_URL` (opcional) | endereço que o **servidor** usa para a API. Padrão: `LIVEKIT_URL` com `ws`→`http`. |

Sem as três primeiras, o servidor sobe com `Voz (LiveKit): desativada` e `voice:join` responde
"A voz não está configurada neste servidor".

Testes: `server/livekit.test.ts` (config e token) e `server/tests/voice.test.ts` (integração com um LiveKit falso
que registra as chamadas `RemoveParticipant`/`DeleteRoom` e confere o token com `TokenVerifier`).

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
- **Troca de sala:** `join` chama `teardown()` antes (fecha a Room anterior); o servidor troca de sala sozinho no
  `voice:join`, sem precisar de `voice:leave`.
- **Falha ao conectar no LiveKit:** emite `voice:leave` (o servidor já tinha colocado a pessoa na lista) e lança
  "Não foi possível conectar ao servidor de voz...". Sair enquanto conecta não gera erro.
- **Queda não pedida** (`RoomEvent.Disconnected` com a Room ainda ativa: removido pelo servidor, sala encerrada,
  LiveKit fora do ar): sai, avisa o servidor e chama `voice.onUnexpectedDisconnect(mensagem)`, que em
  `lib/actions/voice.ts` limpa a store e mostra o toast. `teardown()` remove os listeners antes de desconectar,
  então sair por conta própria não dispara esse aviso.
- **Queda do socket do Concord:** `lib/client.ts` chama `voice.teardown()` (sem avisar o servidor).
- Dependências injetáveis (`new VoiceClient({ createRoom, createMicTrack })`): os testes em
  `lib/voice.test.ts` usam Room, microfone e faixas falsos.

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
  deafen). O `ScreenTile` liga a faixa num `<video muted>` com `attachScreen(userId, el)` (de `@/lib/client`).
- **Parar:** botão de novo (`stopScreenShare`) ou pelo sistema (janela fechada): `LocalTrackUnpublished` chama
  `voice.onScreenShareEnded`, que desliga `sharing` e avisa o servidor uma vez só.
- **Grade** (`components/voice/VoiceGrid.tsx`): sem telas, grade de participantes; com telas, a de **outra pessoa**
  em destaque (a própria só se for a única), miniaturas clicáveis embaixo e botão de tela cheia.
- `sharing` no servidor é só indicador (o cliente avisa); quem pode publicar a tela é decidido pelo token do LiveKit.
- **Testes:** `src/main/screen-share.test.ts` (controlador, sem Electron), `lib/voice.test.ts` (bloco "tela"),
  `lib/actions/screen.test.ts` (botão, seletor, erros, aviso único ao servidor), `components/voice/voice.test.tsx`
  (jsdom: seletor, tile e grade) e `server/tests/voice.test.ts` (`voice:sharing`). À mão: duas janelas na mesma
  sala com o LiveKit rodando; uma compartilha, a outra vê a tela e o "ao vivo" some ao parar.

## Dispositivos, volume e menu de botão direito (B4)

**Só cliente:** nada vai para o servidor e não há evento novo.

- **Configurações de voz** (`components/voice/DeviceSettings.tsx`): microfone e saída. Aberto pelo botão de ondas
  sonoras na `VoiceView` e no painel "Voz conectada" (`VoiceStatusPanel`). Fica montado no `UserPanel`, então dá
  para escolher o microfone antes de entrar numa sala.
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
| `lib/actions/devices.ts` | `listAudioDevices`, `selectAudioInput`, `selectAudioOutput`, `setUserVolume`, `setUserMuted`, `open/closeDeviceSettings`, `canChooseAudioOutput`, `loadAudioPreferences`. |
| `store/devices.ts` | `audioInputId`, `audioOutputId`, `userVolumes[accountId]`, `userMuted[accountId]`, `deviceSettingsOpen`. |

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
- **Preferências desta máquina:** `localStorage` `concord:audio` = `{ input, output, volumes, muted }`, lido ao carregar o
  app (`loadAudioPreferences`) e de novo depois do `disconnect()` (sair da conta não apaga). Dados inválidos ou
  armazenamento bloqueado: volta aos padrões sem quebrar.
- **Lista:** `Room.getLocalDevices(kind, false)` (não pede permissão só para listar). Os apelidos do Windows
  `default`/`communications` saem da lista (a opção "Padrão do sistema" cobre). Sem permissão de microfone os nomes
  vêm vazios: viram "Microfone 1", "Saída 1" e o diálogo explica. Ligar/desligar um fone com o diálogo aberto
  atualiza a lista (`devicechange`). Escolha salva de um aparelho desconectado aparece como "Dispositivo desconectado".
- **Testes:** `lib/voice.test.ts` (blocos "dispositivos e volume" e "silenciar alguém"), `lib/actions/devices.test.ts`
  (preferências, silenciar, erros, filtro da lista), `components/voice/DeviceSettings.test.tsx` (jsdom: seletores,
  desconectado, sem `setSinkId`) e `components/voice/MemberContextMenu.test.tsx` (jsdom: menu no tile e na barra
  lateral, só "Ver perfil" em si mesmo, volume, silenciar mantendo o volume e o menu aberto, cartão de perfil).
  À mão: trocar de fone no meio da conversa e conferir que o outro continua ouvindo; botão direito numa pessoa,
  baixar o volume, silenciar, tirar o silêncio (volta ao volume ajustado) e reiniciar o app (tudo continua).

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
  `lib/actions/devices.test.ts` e `components/voice/DeviceSettings.test.tsx` (preferência e controles). À mão: três
  janelas na mesma sala; a terceira entra e sai e as outras ouvem os dois sons; com deafen, silêncio.

## Limites e evolução

- **Escala:** o SFU aguenta salas grandes (dezenas de pessoas); o gargalo passa a ser a banda/CPU do servidor do
  LiveKit, não de cada cliente.
- **NAT:** em dev o LiveKit usa UDP 7882 e TCP 7881 (fallback). Entre redes restritivas (4G, empresas), ative o
  TURN embutido do LiveKit (`turn.enabled` em `livekit.yaml`, com domínio e TLS) antes de ir para a internet.
- **Volume acima de 100%** e volume do áudio da tela separado do microfone: precisariam de `webAudioMix` e de
  refazer o deafen sobre a Web Audio.
- **Teste de microfone** (medidor de nível no diálogo) ainda não existe.
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
   `concord-dev-workflow`). `chrome://webrtc-internals` numa janela do Electron mostra bytes enviados/recebidos.
6. Microfone negado: `main/index.ts` libera `media` em `setPermissionRequestHandler`. O toast traduz
   `NotAllowedError`, `NotFoundError` e `NotReadableError`.
7. Testar sozinho numa máquina: duas janelas no mesmo PC funcionam, mas dá microfonia sem fone.
8. Trocou de fone e não ouve nada: a saída salva pode ser um aparelho desconectado; volte para "Padrão do
   sistema" em Configurações de voz. Alguém baixinho ou mudo: botão direito na pessoa e confira o volume e o
   "Silenciar" (ficam salvos por conta, neste computador; o ícone de alto-falante cortado indica silenciado por você).
9. Não toca o som de entrar/sair: confira em Configurações de voz se o interruptor está ligado, o volume acima de 0 e
   se você não está em deafen; o botão "Testar" toca mesmo com o interruptor desligado.
