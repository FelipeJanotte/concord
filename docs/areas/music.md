# Bot de música (A11 servidor / B14 tela / A17 pausa e playlists / B22 área Música)

Quem está numa sala de voz manda `/play <link ou nome da música>` no chat e um participante **"Música"** entra na sala
tocando a faixa para todos. Aceita faixa, álbum e playlist do Spotify, vídeo e playlist do YouTube e texto livre
(busca no YouTube). Do Spotify vêm só os **metadados**; o **áudio** sempre vem do YouTube (`yt-dlp` + `ffmpeg`) e é
publicado no LiveKit pelo próprio servidor com `@livekit/rtc-node`. Por que assim e o que foi descartado:
`docs/decisions/0006-bot-musica-spotify-youtube.md`.

## Arquivos

| Caminho | O que é |
|---|---|
| `src/shared/types/music.ts` | Contrato: `MusicTrack`, `MusicState` (`paused`, `elapsedMs`), `MusicCollection`/`MusicCollectionKind`, `MusicResult`, `MusicPlayResult` (`added`, `collection`: a playlist/álbum que o pedido leu ou `null`; erro com `posted: true` = o comando já foi postado), `MusicControl`/`MusicPlayRequest` (com `textChannelId?`), `MusicBotReply` (com `searching`/`failed`) + `musicBotReplyText`/`musicSearchingText`/`musicFailedText`/`musicTrackLabel` (resposta do bot no chat; vai em `ToolPayload` como `{ tool: 'music' }` em `tools.ts`), eventos `music:*`, limites `MUSIC_MAX_TRACK_MS` (15 min), `MUSIC_QUEUE_MAX` (100), `MUSIC_QUERY_MAX` (500), `MUSIC_BOT_NAME`. |
| `server/modules/music.ts` | Handlers `music:play/skip/stop/shuffle/jump/pause/resume/queue` (pausar, retomar e pular para uma da fila não postam nada no chat), conferência de sala e permissão (`roomControl`), limite `LIMITS.music` (`play`/`skip`/`stop`/`shuffle`/`jump`) e `LIMITS.musicControl` (`pause`/`resume`), `music:state` por `emitToViewers`, saída do bot quando a sala esvazia (`onVoiceRoomsChange` de `voice.ts`) e as mensagens no chat (`commandChat` confere o canal; `postToChat` grava o comando e a resposta pelo `insertMessage` e manda `message:new` por `emitToViewers`; no `/play`, `findAndEnqueue` busca e enfileira depois do "procurando" e `replaceBotReply` troca a resposta no lugar com `updateToolMessage` + `message:edited`; `<@todos>` no comando passa pelo `mentionSafeContent` de `messages.ts`). |
| `server/music/ports.ts` | Tipos do domínio: `MusicQuery` (o que o pedido é), `TrackMetadata` com `AudioLocator` (`youtube-search` = faixa a buscar no YouTube na hora de tocar; `audio-url` = link do vídeo), `QueuedTrack` (`MusicTrack` + `audio`, só no servidor), `TrackResolver`, `AudioSource.prepare` → `PreparedAudio` (`open()` dá o `AudioStream`, PCM 48 kHz estéreo em quadros de 10 ms; `close()` encerra tudo, aberto ou não), `RoomPublisher`/`RoomOutput` (`play`, `clearQueue`, `leave`), `MusicError` (mensagem pt-BR) e `PLAYLIST_READ_MAX` (200). |
| `server/music/query.ts` | `parseMusicQuery` (pura): texto → `MusicQuery` ou `null` (link de outro site). |
| `server/music/catalog.ts` | `MusicCatalog.find`: roteia a consulta para o resolvedor certo e aplica as regras (ao vivo, sem duração, acima de 15 min: recusa item único, pula em playlist). |
| `server/music/spotify.ts` | `SpotifyResolver`: faixa e álbum pela Web API (Client Credentials, token até 1 min antes de expirar, álbum paginado de 50 em 50); playlist pela página de incorporação (`parseSpotifyEmbed`). |
| `server/music/youtube.ts` | `YouTubeResolver`: vídeo lido inteiro (`yt-dlp -J --no-playlist --ignore-no-formats-error --extractor-args youtube:skip=hls`), busca e playlist em lista plana (`-J --flat-playlist`, sem abrir cada vídeo); `parseYtDlpVideo`/`parseYtDlpEntries` (JSON do yt-dlp → faixa com o link do vídeo como áudio), `SKIP_HLS`, `NODE_JS_RUNTIME` (`--js-runtimes node:<Node do servidor>`, em toda chamada do yt-dlp) e `ytDlpRunner` (roda o programa). |
| `server/music/audio-source.ts` | `YtDlpFfmpegSource.prepare` já inicia o `yt-dlp ... --format bestaudio/best -o -` (`ytDlpArgs`: `ytsearch1:<busca>` ou o link, com `NODE_JS_RUNTIME` e `SKIP_HLS`), que baixa para a saída e fica parado no pipe; `open()` inicia o `ffmpeg -i pipe:0` (`ffmpegArgs`) e liga a saída do yt-dlp na entrada dele → PCM s16le; `close()` mata os dois; sem nenhum quadro, erro `Sem áudio: <programa> (código N): <última linha do stderr>` de quem falhou, ou `Nada encontrado no YouTube para "<busca>"` quando a busca do yt-dlp termina com sucesso sem baixar nada (busca sem resultado); `PcmFramer` corta em quadros; `audioToolsFromEnv`. |
| `server/music/ports.ts`, `server/music/catalog.ts` | `Resolved` (`tracks` + `collectionTitle`): o `resolve` de `spotify.ts` (álbum: nome; playlist: `name`/`title` da página de incorporação via `parseSpotifyEmbed`) e de `youtube.ts` (`title` da lista plana) devolve o título; `MusicCatalog.find` monta o `MusicCollection` (`kind`, `title`, `url` canônica; título ausente → a própria `url`) só para playlist/álbum, `null` para faixa, vídeo e busca. |
| `server/music/queue.ts` | Fila pura por sala: `enqueue` (várias de uma vez; a primeira vai para "tocando agora"; entra só o que cabe e devolve `added`; recusa fila cheia), `advance`, `jumpTo` (a escolhida passa a tocar e as anteriores saem; id fora da fila → `null`) e `shuffleUpcoming` (Fisher-Yates só na fila, com o acaso recebido; o `MusicPlayer` passa `crypto.randomInt`). |
| `server/music/player.ts` | `MusicPlayer`: uma fila e um bot por sala; entra na primeira música, toca em sequência, pula, pausa, retoma, para e sai quando a fila acaba (`pause`/`resume`: `paused` por sala, `elapsedMs` = `playedMs` + tempo desde `playingSince`, relógio injetável `now`; `waitWhilePaused` segura o laço de quadros sem matar yt-dlp/ffmpeg; `pause` chama `RoomOutput.clearQueue`; avisa o estado também no 1º quadro de cada faixa); pré-busca (`prefetch`, seção "Pré-busca"). Avisa cada mudança (`onChange`) sem o `audio` (estado público). |
| `server/music/livekit-publisher.ts` | `LiveKitPublisher`: token do bot (identidade `music-bot:<canal>`, nome "Música", atributo `bot: music`, só publica microfone, não assina ninguém) e a faixa `AudioSource` do `@livekit/rtc-node`. |
| `server/music/drivers.ts` | Monta as peças a partir do ambiente (`musicDrivers`); `overrideMusicDrivers({ playback, ytDlp })` troca fonte/publicador e o yt-dlp (testes). |
| `server/tests/music.test.ts`, `server/tests/fake-music-playback.ts`, `server/tests/fake-youtube.ts` | Integração com servidor de verdade, Spotify falso (HTTP local), yt-dlp falso (JSON fixo por link) e fonte/publicador falsos carregados com `--import` (`TestServer.start({ imports })`). |
| `src/renderer/src/lib/actions/music.ts` | `playMusic` (guarda `roomCollection`), `dismissCollection`, `pauseMusic`, `resumeMusic`, `skipMusic`, `stopMusic`, `shuffleMusic` (com o `textChannelId` opcional), `jumpToTrack(sala, trackId)`, `loadMusicQueue`, `parseMusicCommand` (lê o registro por `parseCommand`)/`runMusicCommand(texto, chat)` (comandos do Composer; `null` = não é comando, senão `Promise<boolean>` = aceito ou já postado; `false` = o Composer devolve o texto), `openMusicQueue`/`closeMusicQueue` (painel da fila), `trackDuration`. |
| `src/renderer/src/lib/commands.ts` | **Registro dos comandos de chat** (`CHAT_COMMANDS`: nome, argumento opcional com dica e descrição curta) e as puras que leem dele: `commandSuggestions` (menu do `/`), `parseCommand`, `commandDraft` (destaque). Comando novo = uma entrada aqui (+ quem o executa). Menu: `docs/areas/messages.md`. |
| `src/renderer/src/components/voice/MusicBotReply.tsx` | Resposta do bot no chat: `MusicReplyCard` (capa pequena, "Tocando agora"/"Adicionou à fila"/"Adicionou N músicas à fila, começando por"/"Pulou" + "Tocando agora: …"/"Parou a música e limpou a fila"/"Embaralhou a fila (N músicas)", "Procurando “q”…" com indicador girando, "Não consegui tocar: …" em vermelho, "Pedido por"), `MusicBotAvatar`, `MusicBotName` ("Música" + selo BOT) e `isMusicBotMessage`. |
| `src/renderer/src/store/music.ts` | `musicRooms` (estado de cada sala com música tocando), `musicSyncedAt` (`Date.now()` de quando cada `music:state` chegou), `musicQueueChannelId` (sala cujo painel da fila está aberto; `null` = fechado) e `roomCollection` (`{ channelId, collection }`: playlist/álbum do último `music:play` e a sala em que tocou, para o convite de salvar; zera quando o `music:state` dessa sala chega sem `nowPlaying`). |
| `src/renderer/src/lib/music-progress.ts` | `playbackElapsedMs(state, syncedAt, now)`: `elapsedMs` do servidor + o tempo desde que o estado chegou (parado se `paused`), limitado à duração. |
| `src/renderer/src/components/music/` | **Área "Música"** (tela inteira): `MusicView` (cabeçalho, sala atual, `MusicRequestBar`: campo de pedir + botão "Playlists" do `PlaylistsDrawer` à direita; busca a fila da sala e as playlists ao abrir), `NowPlaying` (capa, título numa linha só com "Tocando agora"/"Pausada" à direita, quem pediu, `PlaybackProgress` e `PlaybackControls`; `NothingPlaying` sem música), `PlaybackControls` (Pausar/Retomar, Pular, "Parar e limpar a fila"), `PlaybackProgress` (barra e tempos, interpolada a cada 1 s; refaz o relógio ao chegar estado novo, então retomar não espera o próximo segundo), `MusicVolumeSlider` (volume do bot), `MusicRequestForm` (campo para `music:play`), `MusicQueue` (fila com "Tocar agora" em cada música e "Embaralhar"), `CoverArt`, `SaveCollectionChip` (convite "Salvar playlist") e `PlaylistsDrawer` (gaveta "Playlists da comunidade"). |
| `src/renderer/src/lib/actions/playlists.ts`, `src/renderer/src/store/playlists.ts` | `loadPlaylists`, `savePlaylist`, `deletePlaylist`, `bindPlaylistsEvents` (`playlist:created`/`playlist:deleted`); `playlists` e `playlistsLoaded`. |
| `src/renderer/src/components/voice/MusicPlayer.tsx` | Cartão "Tocando agora" (capa, título, artistas, quem pediu, duração, "Ver a fila", pausar/retomar, pular/parar, volume do bot (`MusicVolumeSlider`), ocultar), a barra fina "Tocando: título" quando oculto, `TrackCover` e `MusicBotMember` (bot com selo "BOT" na lista da sala na barra lateral, com o `MusicBotContextMenu` de `MemberContextMenu.tsx` no botão direito). |
| `src/renderer/src/components/voice/MusicQueueDialog.tsx` | Painel "Fila de músicas" (shadcn `Dialog`, montado uma vez em `App.tsx`): música atual e fila paginada de 10 em 10. |
| `src/renderer/src/lib/paginate.ts` | `paginate(itens, página, porPágina)` → `{ items, page, pages, start }` (pura; página fora do intervalo vai para a mais próxima). |
| `src/renderer/src/lib/music-player.ts` | `loadPlayerHidden`/`savePlayerHidden`: player oculto ou não, guardado na máquina (`localStorage` `concord:music-player-hidden`). |
| `src/renderer/src/components/chat/CommandHighlight.tsx` | Comandos no Composer (do registro): `CommandHighlight` (camada espelho atrás do campo com o comando como código) e `CommandBlock` (bloco `/play` + `query` à esquerda do campo, quando o comando com argumento já tem o espaço). |

## Eventos (`src/shared/types/music.ts`)

| Evento | Payload | Ack | Regra |
|---|---|---|---|
| `music:play` | `{ channelId, query, textChannelId? }` | `MusicPlayResult` (`added`: quantas entraram) | estar na sala `channelId` (`voice:join`) com `view` + `connect`; `query` de 1 a 500 caracteres (link ou texto); até 15 min por faixa; `textChannelId`: ver "Comando e resposta no chat" |
| `music:skip` | `{ channelId, textChannelId? }` | `MusicResult` | mesma regra de sala; "Nenhuma música tocando" se nada toca |
| `music:stop` | `{ channelId, textChannelId? }` | `MusicResult` | mesma regra; esvazia a fila e tira o bot |
| `music:shuffle` | `{ channelId, textChannelId? }` | `MusicResult` | mesma regra; embaralha só a fila (a que toca segue); "Nenhuma música tocando" ou "Precisa de pelo menos 2 músicas na fila para embaralhar"; com `textChannelId` posta `/shuffle` + resposta |
| `music:jump` | `{ channelId, trackId }` | `MusicResult` | mesma regra; `trackId` = `id` de uma música da fila: ela passa a tocar e as anteriores saem (pular 20 de uma vez); "Essa música não está mais na fila" se o id não está na fila (inclusive a que toca); pausado continua pausado (como `skip`); não posta no chat |
| `music:pause` | `{ channelId, textChannelId? }` | `MusicResult` | mesma regra de sala; pausa para a sala toda; "Nenhuma música tocando" se nada toca; já pausado continua pausado; não posta no chat |
| `music:resume` | `{ channelId, textChannelId? }` | `MusicResult` | idem; continua do mesmo ponto |
| `music:queue` | `channelId` | `MusicResult` | só `view` (quem olha a sala sem entrar vê o cartão) |
| `music:state` (servidor → app) | `MusicState` | — | a cada mudança, para quem vê a sala (`emitToViewers`); `nowPlaying: null` = bot saiu; `paused` e `elapsedMs` (ms já tocados da faixa atual, congelado na pausa) vêm em todo estado |

**Pausa e progresso.** `music:pause` põe `paused: true` na sala: o laço de quadros espera (`waitWhilePaused`), o yt-dlp e o ffmpeg ficam parados pelo pipe e o bot continua na sala; `RoomOutput.clearQueue` (`AudioSource.clearQueue` do rtc-node) descarta o ~1 s de áudio já enfileirado no LiveKit, então o som para na hora. `music:resume` solta o laço e o `elapsedMs` volta a andar. `music:skip` com a sala pausada leva à próxima faixa **ainda pausada** (`elapsedMs: 0`); `music:stop` zera tudo (`paused: false`). O servidor manda o estado quando algo muda e no 1º quadro de cada faixa (o relógio começa depois do preparo do yt-dlp; sem esse aviso os clientes adiantariam a barra a cada faixa), com `elapsedMs` ~0; o app interpola o progresso (`lib/music-progress.ts`).

`MusicTrack.requestedBy` guarda conta e nome de quem pediu no momento do pedido. `music:skip`/`music:stop` ainda aceitam só o id em texto (app 0.1.16), sem chat.

## Comando e resposta no chat

`/play`, `/skip`, `/stop` e `/shuffle` digitados num chat (canal de texto, chat da sala de voz ou conversa privada) aparecem no chat e o bot responde logo embaixo, para todos que veem esse chat.

- O app manda `textChannelId` = o chat do Composer. O servidor confere **antes** de tocar: o canal existe e a pessoa vê (senão "Canal não encontrado") e tem `send` (senão "Você não tem permissão para enviar mensagens neste canal"); recusado, nada toca.
- Mensagens, no mesmo handler e em ordem: 1) mensagem comum da pessoa com o comando remontado pelo servidor (`/play <query sem as pontas>`, `/skip`, `/stop`; `<@todos>` sem permissão vira texto); 2) a resposta do bot, `kind: 'tool'` com `tool: { tool: 'music', result: MusicBotReply }` e `content` = `musicBotReplyText`. As duas vão por `message:new` via `emitToViewers` e ficam no histórico.
- **`/play` posta na hora** (a busca do yt-dlp leva ~4,5 s): passadas as conferências baratas (sala, `query` que o `parseMusicQuery` entende, chat com `view`+`send`, `LIMITS.music`), o servidor posta o comando e o bot em `searching` ("Procurando “query”…") **antes** do `catalog.find`. Depois da busca, a **mesma** mensagem do bot (mesmo id) vira a resposta final (`play`) ou o erro (`failed`: "Não consegui tocar: <motivo>" — não achou, longa demais, fila cheia, saiu da sala no meio): `updateToolMessage` (`server/repo/messages.ts`) grava `tool` + `content` e sai `message:edited { channelId, messageId, content, tool }` por `emitToViewers` (sem `editedAt`: não aparece "(editada)"). Só então o ack; no erro, `{ ok: false, error, posted: true }`. Ordem por pedido: comando → "procurando" → atualização. `/skip`, `/stop` e `/shuffle` não buscam nada e postam direto a resposta final, só no sucesso.
- `MusicBotReply`: `play` (`added`, `startedNow` = a sala estava sem música, `first` = título/artistas/capa da primeira que entrou), `skip` (`skipped` e `next`, ou `null`), `stop`, `shuffle` (`count`: quantas na fila; texto `musicShuffleText`: "Embaralhou a fila (N músicas)"), `searching` (`query`) e `failed` (`query`, `error`). Textos: "Tocando agora: T — A", "Adicionou à fila: T — A", "Adicionou N músicas à fila, começando por T — A", "Pulou: T — A. Tocando agora: …", "Parou a música e limpou a fila", "Procurando “q”…" (`musicSearchingText`), "Não consegui tocar: motivo" (`musicFailedText`). O cartão mostra um `Loader2` girando (`role="status"`, "Procurando") no `searching` e o texto em `text-destructive` no `failed`; troca ao vivo quando chega o `message:edited`.
- **Por que `kind: 'tool'` e não um `kind` novo:** a resposta é uma mensagem postada pelo servidor com payload tipado, igual às ferramentas; reaproveita a coluna `tool` (jsonb), a regra do banco (`tool` presente ⇔ `kind = 'tool'`), o histórico, reações, apagar e o "não edita" sem migration. O autor gravado é **quem pediu** (como nas ferramentas: quem pediu pode apagar); a tela troca nome e avatar por "Música" + BOT.
- Composer: comando de música limpa o campo **ao enviar** e devolve o texto se o comando não foi aceito nem postado. Erro antes de postar (link que não é Spotify/YouTube, fora da sala, sem permissão, limite, não configurado; `/skip` sem nada tocando): nada vai para o chat, toast e o texto volta ao campo. Erro depois de postar (`posted: true`): toast e o campo fica limpo (o erro já está no chat).
- Se o handler cair no meio (exceção fora do `catalog.find`, que já trata as suas), o bot fica em "Procurando…"; não há limpeza disso.
- `/queue` não posta nada (só abre o painel). Os botões do player (pular/parar/embaralhar/tocar agora) não mandam `textChannelId` e não postam nada.
- Dois pedidos ao mesmo tempo no mesmo chat podem intercalar os pares (comando A, comando B, resposta A...): a ordem é garantida por pedido, não entre pedidos.

## Playlists salvas da comunidade

Qualquer conta guarda o link de uma playlist ou álbum para todos tocarem depois. É dado do servidor (não por sala nem por comunidade: o Concord tem uma só): tabela `saved_playlists` (`server/db/schema/playlists.ts`, migration `0014_optimal_luminals.sql`), acesso por `server/repo/playlists.ts` (`insertSavedPlaylist`, `listSavedPlaylists`, `findSavedPlaylist`, `findSavedPlaylistByUrl`, `deleteSavedPlaylist`, `countSavedPlaylists`), eventos em `server/modules/playlists.ts` e contrato em `src/shared/types/playlists.ts` (`SavedPlaylist`, `PLAYLIST_NAME_MAX`, `SAVED_PLAYLISTS_MAX`).

| Evento | Payload | Ack | Regra |
|---|---|---|---|
| `playlist:list` | — | `PlaylistListResult` | qualquer conta autenticada; ordem de criação |
| `playlist:create` | `{ name, url }` | `PlaylistSaveResult` | valida nome e link, `LIMITS.playlist`, teto, duplicidade; manda `playlist:created` para todos |
| `playlist:delete` | `id` | `PlaylistDeleteResult` | quem salvou ou quem tem `manageMessages`; manda `playlist:deleted { id }` para todos |
| `playlist:created` (servidor → app) | `SavedPlaylist` | — | `io.emit`: a coleção não é de canal |
| `playlist:deleted` (servidor → app) | `{ id }` | — | idem |

- **Nome:** texto sem caracteres de controle, espaços juntados, 1 a 60 caracteres (`PLAYLIST_NAME_MAX`); recusa: "Dê um nome à playlist (até 60 caracteres)".
- **Link:** passa pelo `parseMusicQuery` e só vale playlist do YouTube ou playlist/álbum do Spotify (faixa, vídeo, texto e outros sites: "Envie o link de uma playlist ou álbum do Spotify ou do YouTube"). Grava-se a url **canônica** remontada (`https://www.youtube.com/playlist?list=<id>`, `https://open.spotify.com/<playlist|album>/<id>`), então links diferentes da mesma lista são o mesmo registro. `kind` = `playlist` ou `album`.
- **Unicidade (banco):** `lower(name)` e `url` únicos; o servidor confere antes ("Esse link já está salvo em "<nome>"") e o `DuplicateError` do repo cobre a corrida ("Esse link já está salvo" / "Já existe uma playlist salva com esse nome").
- **Limites:** `LIMITS.playlist` (3 seguidas, depois 1 a cada 10 s, por conta); `SAVED_PLAYLISTS_MAX` = 200 no total ("A coleção de playlists está cheia").
- **Conta apagada:** `saved_by` apaga em cascata (as playlists dela somem).
- **Tocar:** não há evento próprio: o app manda `music:play` com a `url` salva (`playMusic`), então valem todas as regras do bot (sala, permissão, `LIMITS.music`, 100 na fila).
- **Salvar a que acabou de tocar:** `music:play` devolve `collection` (título lido pelo resolvedor); o app guarda em `roomCollection` com a sala e mostra o convite "Salvar playlist “título”" (`SaveCollectionChip`, nome editável) só na minha sala de voz e enquanto ela toca; some ao parar, ao trocar de sala (o `MusicView` limpa), se a url já estiver salva ou ao dispensar.

## Fluxo

1. `/play <link ou nome>` no Composer (qualquer chat) → `runMusicCommand` usa a sala em que **eu** estou (`myVoiceChannelId`).
2. O servidor confere sala, permissão, tamanho da `query` e `LIMITS.music`; `MusicCatalog.find` passa o texto pelo
   `parseMusicQuery` e chama o `SpotifyResolver` ou o `YouTubeResolver`, que devolvem os metadados (título, artistas,
   capa, duração) antes de enfileirar.
3. `MusicPlayer.add` (todas as faixas de uma vez, um `music:state` só): sala sem bot → `AudioSource.prepare` da
   primeira faixa **e**, em paralelo, `RoomPublisher.join` (o bot entra no LiveKit); com bot → fim da fila.
4. Cada faixa: `prepare` inicia `yt-dlp -o -` (abre o vídeo ou faz a busca `"<artistas> - <título>"` da faixa do
   Spotify, resolve os desafios de JavaScript do YouTube, espera o tempo que o YouTube exige e começa a baixar para a
   saída, que fica parada no pipe); `PreparedAudio.open` inicia `ffmpeg -i pipe:0` (cortado em duração + 5 s) e liga a
   saída do yt-dlp na entrada dele → quadros de 10 ms → `RoomOutput.play` (`AudioSource.captureFrame` do rtc-node, que
   segura o ritmo em tempo real; o pipe cheio segura o yt-dlp). Para a 1ª faixa o `prepare` roda no próprio `/play`,
   em paralelo com a entrada no LiveKit.
5. `music:pause`/`music:resume` só mexem em `paused` e no relógio (`elapsedMs`); o bot e os processos ficam como estão.
6. Faixa acabou → próxima; fila acabou, `/stop` ou sala vazia → o bot sai (`leave`) e `music:state` vai com `nowPlaying: null`.
7. No app, o áudio do bot chega como o de qualquer participante e segue o volume geral de saída, o deafen e o volume/silenciar próprio do bot (chave `music-bot`, `docs/areas/voice.md`).

## Várias salas ao mesmo tempo

Cada sala de voz com música tem a **sua instância** do bot, independente das outras: salas diferentes tocam em
paralelo. Não há "o bot já está em outra sala".

| Peça | Por sala | Onde |
|---|---|---|
| Fila, tocando agora, faixas preparadas | `Room` no `Map` `rooms` do `MusicPlayer`, chave = id da sala | `server/music/player.ts` |
| Laço de reprodução (`run`) e saída automática (fila acabou, falha ao entrar) | um `run` por sala; acaba só a sua | `server/music/player.ts` |
| Conexão e faixa no LiveKit | cada `join` cria um `Room` do `@livekit/rtc-node` com identidade `music-bot:<sala>` (o LiveKit só derruba identidade repetida **dentro** da mesma sala) | `server/music/livekit-publisher.ts` |
| Processos de áudio | cada `prepare` inicia o seu `yt-dlp` e o `open` o seu `ffmpeg` | `server/music/audio-source.ts` |
| Comandos | `/play`, `/skip`, `/stop`, `/shuffle`, `/queue` vão para a sala em que **eu** estou (`myVoiceChannelId`); o servidor recusa sala que não é a do socket ("Entre na sala de voz para controlar a música") | `lib/actions/music.ts`, `roomInControl` em `server/modules/music.ts` |
| Sala que esvazia | `leaveEmptyRooms` para só as salas sem ninguém (`voiceSocketsIn`) | `server/modules/music.ts` |
| `music:state` | leva o `channelId`; vai por `emitToViewers` só para quem vê aquela sala | `server/modules/music.ts` |
| Tela | `musicRooms[channelId]`: cada `MusicPlayer`/`MusicBotMember`/painel da fila lê a sala dele; `music:state` de uma sala não mexe nas outras | `lib/actions/music.ts` (`applyMusicState`), `store/music.ts` |

Compartilhado entre as salas (de propósito): o `MusicPlayer`, a fonte (`YtDlpFfmpegSource`) e o publicador
(`LiveKitPublisher`) são fábricas sem estado de sala; `LIMITS.music` é por conta (vale somando as salas); o volume do bot
na tela é uma chave só (`music-bot`), mas cada pessoa só ouve o bot da sala em que está.

**Sem limite de instâncias.** Custo por sala tocando: 1 `ffmpeg` (decodifica para PCM, leve), até 2 `yt-dlp` (o da faixa
e o da próxima, parado no pipe a maior parte do tempo), 1 conexão do rtc-node e ~1,5 Mbit/s de PCM interno + ~64 kbit/s
de Opus para o LiveKit. Cada instância exige alguém **dentro** da sala, cada conexão está em uma sala só e criar sala
de voz exige permissão; numa comunidade de amigos isso fica em poucas salas. Um limite configurável seria flexibilidade
sem uso (P6). Se um servidor pequeno passar a sofrer, o lugar é o `MusicPlayer.add` (recusar sala nova acima de N
salas ativas, `activeRooms().length`).

## Pré-busca

Medido em 17/11/2026 (Windows, yt-dlp 2026.10.26 do winget, Node como runtime de JS, LiveKit local): quase todo o
tempo até o som é o **yt-dlp**. Na faixa que vai tocar ele abre o `.exe` (~1,5 s), lê a página e o player, resolve os
desafios de JavaScript (~1,2 s), **espera ~4 s porque o YouTube exige** ("Sleeping 4.00 seconds as required by the
site") e só então baixa. O ffmpeg dá o 1º quadro poucos ms depois do 1º byte; entrar no LiveKit leva ~0,2 s.

- O `MusicPlayer` mantém preparadas (`room.prepared`, por id da faixa) **só** a faixa tocando e a **próxima** da fila.
  A próxima só é preparada quando a atual **já começou a tocar** (1º quadro): um yt-dlp por vez, para não disputar CPU
  com a faixa que está para começar. Preparar = iniciar o `yt-dlp -o -`: ele faz a parte cara (abrir, extrair,
  desafios, espera) e para quando o pipe enche, até o `open` ligar o ffmpeg.
- Toda mudança na fila (`add`, `skip`, fim da faixa, `stop`) chama `prefetch`: fecha o que saiu (mata o yt-dlp e o
  ffmpeg) e prepara o que entrou. A troca usa o que já estava preparado. Bot que sai (fila acabou, `stop`, sala vazia,
  falha ao entrar) fecha tudo (`release`). Nenhum processo fica para trás (conferido com `Get-Process yt-dlp,ffmpeg`
  depois das medições).
- Só a próxima, nunca a fila inteira: cada preparada é um yt-dlp vivo com uma conexão aberta no YouTube. Parada no
  pipe ela aguenta a faixa atual inteira: preparada, 4 min parada e depois aberta, entregou os 213 s da faixa completos
  (1º quadro 0,45 s depois do `open`).
- Spotify: o Spotify não tem áudio, então a busca no YouTube é inevitável depois dos metadados (~0,3–0,7 s). Ela roda
  no `prepare` da 1ª faixa (playlist/álbum: só a 1ª), no mesmo instante em que o bot começa a entrar no LiveKit.

**Por que não o endereço direto do áudio.** O `url` do formato (`--get-url` ou o `-J`) dá **403** no ffmpeg quando o
yt-dlp resolve os desafios de JavaScript (Deno no PATH ou `--js-runtimes`): o formato vem com `available_at` alguns
segundos à frente e o YouTube recusa antes disso (testado: 403 na hora, áudio depois de esperar 7 s). Reproduzir essa
regra no Concord seria copiar um detalhe interno do YouTube; o yt-dlp já cuida disso. ADR 0006, revisão do pipe.

**Busca por texto em lista plana.** Sem o endereço direto, o `-J` completo da busca não serve para nada:
`-J --flat-playlist ytsearch1:` traz título, canal, capa (`hq720`) e duração iguais e leva ~3,0 s em vez de ~5,8 s.
Vídeo do YouTube continua com o `-J --no-playlist` (flat não muda nada num vídeo só, e ele dá o `live_status`).

**Custo fixo do yt-dlp**: `--extractor-args youtube:skip=hls` (não pede o manifesto HLS, que só serve para ao vivo)
entra no `-J` do vídeo e no `-o -` (no download: 1º byte ~0,5–1,2 s antes que sem ele). Ao vivo sem HLS fica sem
formatos; o `--ignore-no-formats-error` no `-J` mantém o JSON (com `is_live`), e a recusa continua "Transmissões ao vivo
não podem ser tocadas". Descartados: `player_client=` outro que o padrão (sem JS runtime, `android_vr`/`tv_simply`/
`ios`/`mweb`/`web_safari`/`tv` não dão formato só de áudio ou falham), `player_skip=webpage` ("Sign in to confirm
you're not a bot" na busca), `--ignore-config` (sem diferença) e `youtube:playback_wait=0` (a espera de ~4 s continua).
Ainda não aplicado: `--no-js-runtimes` só no `-J` do vídeo (metadados completos, ~1,5–2,5 s mais rápido); hoje toda
chamada leva `NODE_JS_RUNTIME`.

**Latência medida** (`/play` → 1º quadro no LiveKit, 2–3 rodadas, mesma máquina; troca = `/skip` → 1º quadro da próxima,
que já estava preparada):

| Pedido | Metadados | 1º áudio | Troca |
|---|---|---|---|
| Vídeo do YouTube | ~4,9–5,2 s (`-J`) | ~13,7–14,2 s (`-J` + `-o -`) | ~60 ms |
| Faixa do Spotify | ~0,3–0,7 s | ~9,5–11,5 s (Spotify + `-o - ytsearch1:`) | ~55–80 ms |
| Busca por texto | ~3,0–3,5 s (`-J` plano) | ~12,5–13,0 s (`-J` plano + `-o -`) | ~50–70 ms |

A 1ª música ficou mais lenta que com o endereço direto (que hoje não toca); o grosso é o `-o -` (~8,5–10 s: extração +
espera do YouTube). As seguintes não sentem: a troca continua em menos de 0,1 s.

## Regras e limites

**O que o `parseMusicQuery` aceita** (com ou sem `https://`; `http` também; porta ou usuário na URL → recusa):

| Entrada | Vira | Como é lido |
|---|---|---|
| `open.spotify.com/track/<id>`, `spotify:track:<id>` (com `/intl-xx/`, `?si=`) | faixa do Spotify | Web API `GET /v1/tracks/<id>` |
| `open.spotify.com/album/<id>`, `spotify:album:<id>` | álbum do Spotify | Web API `GET /v1/albums/<id>` + páginas de 50; capa do álbum em cada faixa |
| `open.spotify.com/playlist/<id>`, `spotify:playlist:<id>` | playlist do Spotify | página `open.spotify.com/embed/playlist/<id>` (JSON `__NEXT_DATA__`); até 100 faixas; capa da playlist em cada faixa; episódios ignorados |
| `youtube.com/watch?v=`, `m.`/`music.youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>` | vídeo do YouTube | `yt-dlp -J --no-playlist` no link canônico |
| `watch?v=<id>&list=<lista>` | **o vídeo** (não a playlist) | quem colou o link estava num vídeo; para a playlist inteira use o link `playlist?list=` |
| `youtube.com/playlist?list=<id>` (também `music.youtube.com`) | playlist do YouTube | `yt-dlp -J --flat-playlist --playlist-end 200` |
| qualquer texto que não é link | busca | `yt-dlp -J --flat-playlist ytsearch1:<texto>` (espaços juntados; lista plana: título, canal, capa e duração sem abrir o vídeo) |
| link de outro site, perfil/artista do Spotify, canal do YouTube | recusa | "Envie o nome da música ou um link do Spotify ou do YouTube" |

O yt-dlp sempre recebe o link **remontado** (`https://www.youtube.com/watch?v=<id>`), nunca o texto da pessoa.

**Por que a playlist do Spotify não usa a Web API:** desde 2026 a Web API não entrega o conteúdo de playlist para app
em modo de desenvolvimento com Client Credentials (testado em 17/11/2026: `GET /v1/playlists/<id>/tracks` → 403,
`/items` → 401 "Valid user authentication required" e `GET /v1/playlists/<id>` volta sem `tracks`); as playlists do
próprio Spotify (`37i9dQZF...`) dão 404 desde nov/2024. A página de incorporação pública lê as duas (de usuário e do
Spotify), sem token, mas só as **100 primeiras** faixas e sem capa por faixa. É raspagem: se o Spotify mudar a página,
a resposta é "Não foi possível ler essa playlist do Spotify" (ADR 0006).

- Item único ao vivo → "Transmissões ao vivo não podem ser tocadas"; sem duração → "Não foi possível saber a duração
  dessa música"; acima de 15 min → "Música longa demais (máximo de 15 min)". Em playlist/álbum essas faixas são
  **puladas**; nenhuma sobrou → "Nenhuma música da lista pode ser tocada (...)".
- Playlist/álbum: lê no máximo 200 itens (`PLAYLIST_READ_MAX`; Spotify playlist: 100). Fila: 100 esperando além da que
  toca (`MUSIC_QUEUE_MAX`); entra o que couber e o ack diz quantas (`added`); fila já cheia → "A fila está cheia (máximo
  de 100 músicas)".
- Sem `SPOTIFY_CLIENT_ID`/`SECRET`: links do Spotify → "Links do Spotify não estão configurados neste servidor";
  YouTube e busca continuam.
- Erros: faixa/álbum inexistente → "Música/Álbum não encontrado no Spotify"; playlist inexistente ou privada →
  "Playlist não encontrada no Spotify (ou é privada)"; vídeo indisponível → "Não foi possível ler isso no YouTube
  (vídeo indisponível ou privado?)"; busca vazia → `Nada encontrado no YouTube para "<texto>"`; playlist do YouTube
  vazia → "Playlist do YouTube vazia ou privada".
- `LIMITS.music`: 5 comandos seguidos (`play`/`skip`/`stop`/`shuffle`/`jump`), depois 1 a cada 5 s, por conta. `pause`/`resume` têm a regra própria `LIMITS.musicControl` (10 seguidos, depois 1 por segundo) e não gastam a ficha de `play`/`skip` (`rateLimited(limiter, accountId)` em `server/modules/music.ts`).
- Qualquer um na sala pula, pausa, retoma ou para (não há "dono" da fila).
- Faixa que falha (yt-dlp/ffmpeg ausente, busca sem resultado) é pulada; o motivo vai para o log `[música]`.
- Tudo em memória: reiniciar o servidor zera as filas.

## Configuração

Variáveis do servidor (`server/.env`; produção: `.env` do `docker-compose.prod.yml`):

| Variável | Padrão | Para quê |
|---|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | — | Links do Spotify. Sem as duas: só YouTube e busca. |
| `YTDLP_PATH` | `yt-dlp` (PATH) | Caminho do yt-dlp (metadados do YouTube e áudio). |
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Caminho do ffmpeg. |
| `SPOTIFY_ACCOUNTS_URL`, `SPOTIFY_API_URL`, `SPOTIFY_EMBED_URL` | endereços oficiais | Só para os testes apontarem para o Spotify falso. |

O bot só liga com o LiveKit configurado (`LIVEKIT_*`); sem ele: "Bot de música não configurado neste servidor". O bot
conecta em `LIVEKIT_API_URL` trocando `http` por `ws`.

**App no Spotify (gratuito, sem Premium):**
1. Entre em <https://developer.spotify.com/dashboard> com qualquer conta Spotify e clique em **Create app**.
2. Nome e descrição livres; em *Redirect URI* ponha `http://127.0.0.1:3001/` (obrigatório no formulário, não é usado);
   marque **Web API** e aceite os termos.
3. Em **Settings** copie *Client ID* e *Client secret* para `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`. Reinicie o servidor.

**yt-dlp e ffmpeg no Windows (desenvolvimento):**
- Com winget: `winget install yt-dlp.yt-dlp` e `winget install Gyan.FFmpeg`; abra um terminal novo e confira com
  `yt-dlp --version` e `ffmpeg -version`.
- Sem winget: baixe `yt-dlp.exe` em <https://github.com/yt-dlp/yt-dlp/releases> e um build do ffmpeg em
  <https://www.gyan.dev/ffmpeg/builds/>; ponha os dois numa pasta e aponte `YTDLP_PATH`/`FFMPEG_PATH` para os `.exe`.
- Mantenha o yt-dlp atualizado (`yt-dlp -U`): o YouTube muda e versões velhas param de baixar.

**Produção:** a imagem do servidor (`Dockerfile`, base Debian por causa do binário glibc do `@livekit/rtc-node`) já
instala o ffmpeg e baixa o yt-dlp oficial na hora do build. Para atualizar o yt-dlp, refaça a imagem.

## Na tela

### Área "Música" (B22)

Botão "Música" na barra de úteis (`UtilityRail`, `showMusic`) põe `section: 'music'` (`docs/areas/home.md`): barra lateral `ChannelSidebar`, centro `MusicView` (`components/music/`), sem lista de membros. Não é uma ferramenta do registro (`tools/registry.ts`): tem seção própria.

- Usa a sala em que **eu** estou (`myVoiceChannelId`); fora de uma sala: convite "Entre numa sala de voz para ouvir música juntos" e o campo desligado. Ao abrir (e ao trocar de sala) pede `music:queue` e `playlist:list`.
- **Tocando agora** (`NowPlaying`): capa, título (uma linha só, cortado com reticências; o nome inteiro no `title`) com "Tocando agora"/"Pausada" na mesma linha, à direita, artistas, "Pedido por", progresso e controles. Progresso: `elapsedMs` do servidor + tempo desde que o `music:state` chegou (`musicSyncedAt`, `playbackElapsedMs`), atualizado a cada 1 s e parado na pausa; barra `Progress` do ui-sdk. Controles (`PlaybackControls`): Pausar/Retomar (o botão troca com `state.paused`), Pular e "Parar e limpar a fila". Erro do servidor vira toast; falha ao carregar fila e playlists também (`reportError`).
- **Pedir música** (`MusicRequestForm`): Enter manda `music:play` com o texto inteiro (link ou nome); erro aparece junto ao campo e o texto fica; sucesso limpa o campo.
- **Fila** (`MusicQueue`): lista numerada das próximas, só com música tocando. Passar o mouse (ou focar com Tab) troca o número por "Tocar agora: título" → `music:jump`: a música escolhida toca e as anteriores saem da fila. "Embaralhar a fila" ao lado de "A seguir" → `music:shuffle` (desligado com menos de 2 na fila). Erro vira toast.
- **Salvar a playlist tocada** (`SaveCollectionChip`) e **gaveta "Playlists da comunidade"** (`PlaylistsDrawer`, botão "Playlists" com ícone de lista, à direita do campo de pedir música, dentro e fora de sala): lista nome, tipo (Playlist/Álbum) e "salva por"; tocar (desligado fora de sala) manda `music:play` com a url; apagar (confirmação) só aparece para quem salvou ou tem `manageMessages` (`useCan`). Regras e eventos: "Playlists salvas da comunidade".
- UI feita com `@ui-sdk/react` (ADR 0010, skill `ui-sdk`); testes de componente importam `src/renderer/src/test/ui-sdk-dom.ts` (preenche `popover`, `getAnimations` e `ResizeObserver` no jsdom).
- O player da sala (`MusicPlayer` na `VoiceView`) também ganhou Pausar/Retomar (botão ao lado de pular/parar) e usa o mesmo `MusicVolumeSlider`.

### Na sala e no chat (B14)

- Comandos no Composer: `/play <link ou nome>`, `/skip`, `/stop`, `/shuffle` (embaralha a fila), `/queue` (busca a fila da sala e abre o painel
  "Fila de músicas", o mesmo do botão "Ver a fila"). Nomes, argumento e descrição vêm do registro `lib/commands.ts`
  (também o menu que abre ao digitar `/`, `docs/areas/messages.md`). `/play`, `/skip`, `/stop` e `/shuffle` com sucesso viram
  mensagem + resposta do bot (seção acima); o campo só limpa quando dá certo. Fora de uma sala de voz: "Entre numa sala de voz para usar os comandos de música". `/play` sem nada:
  "Use /play <link ou nome da música>". O texto vai inteiro em `query` (o servidor decide se é link ou busca).
- Sem toast no sucesso: a resposta do bot no chat (`MusicReplyCard`, com "Música" + BOT no lugar do nome; não se junta à
  mensagem anterior da pessoa) diz o que entrou ou pulou.
- **Destaque no Composer** (`CommandHighlight`): texto começando com um comando do registro (seguido de
  espaço, quebra de linha ou fim, `commandDraft`) liga uma camada espelho `aria-hidden` atrás do `textarea`, com as
  mesmas classes de texto (`COMPOSER_TEXT`: padding, fonte, `pre-wrap`); o `textarea` fica com o texto transparente e o
  cursor visível (`text-transparent caret-foreground`). No espelho o comando é um `<code>` com `bg-secondary` (mesma
  fonte do campo e `-mx-0.5 px-0.5`, para não deslocar o cursor). Vale para `/skip`, `/stop`, `/queue` e para `/play`
  ainda sem o espaço.
- **Bloco do argumento** (`CommandBlock`, estilo Discord): comando com argumento (`/play`: `arg` do registro) seguido
  de um espaço (`commandBlock`) mostra, por cima do início da 1ª linha do `textarea` (posição absoluta), o `/play` em código e o bloco `query`
  (`bg-secondary` + `border-border`). A 1ª linha do campo recua a largura do bloco (`text-indent` medido por `useBlockIndent` no `Composer`), então em chat estreito a quebra de linha usa a largura toda em vez de uma coluna ao lado do bloco. O `textarea` guarda só o argumento, então o cursor pisca
  logo depois do bloco e o que se digita entra à direita dele, sem nada por cima do cursor (a camada espelho antiga
  desenhava a dica onde ficava o cursor). Com o argumento vazio, a dica "link do Spotify/YouTube ou nome da música" é o
  `placeholder`. O bloco **continua como rótulo** enquanto se digita (como no Discord). Backspace com o argumento vazio
  desfaz o bloco e volta ao texto `/play` (cursor no fim, menu de comandos de novo). O estado do `Composer` continua
  sendo o texto inteiro (`/play <argumento>`; o campo mostra `commandBlock(...).rest` e grava `cabeça + digitado`), por
  isso envio (`runMusicCommand`, texto fica em erro), menções, colar anexos, Enter, Shift+Enter e rascunho não mudam.
  O `aria-label` do campo é sempre "Conversar em …" (o `placeholder` muda no bloco).
- `MusicPlayer` na `VoiceView` **entre os membros da chamada (grade/palco) e as ações da sala** (indicador de sons,
  dica do pressione para falar e a fileira de botões redondos): fora da área que rola, sempre visível. Pede
  `music:queue` ao abrir. "Ver a fila" para todos; pular, parar e o volume só para quem está na sala.
- **Volume no player:** slider compacto "Volume da música" que chama o mesmo `setUserVolume(MUSIC_BOT_VOLUME_ID, …)` e lê
  o mesmo `userVolumes[MUSIC_BOT_VOLUME_ID]` do botão direito no bot; mudar num reflete no outro e fica salvo em
  `concord:audio`. Silenciado pelo menu mostra o alto-falante cortado (o slider não silencia).
- **Ocultar:** botão "Ocultar o player" troca o cartão por uma barra fina "Tocando: título" com "Mostrar o player".
  Escolha guardada na máquina (`concord:music-player-hidden`, vale para todas as salas). Só manual: compartilhar a tela
  não oculta sozinho.
- **Painel da fila** (`MusicQueueDialog`): aberto por "Ver a fila" ou `/queue` (`musicQueueChannelId`). "Tocando agora" no
  topo e a fila numerada em páginas de 10 (`paginate`), com "Anterior"/"Próxima" e "Página X de Y"; cada item com capa
  pequena, título, artistas, duração e "Pedido por". Fila vazia: "Fila vazia." (sem paginação); nada tocando:
  "Nenhuma música tocando.". Atualiza ao vivo com o `music:state`; se a fila encolher, a página vai para a última que
  existe. Reabrir volta à página 1.
- `MusicBotMember` na lista da sala (`ChannelSidebar`): "Música" com o selo "BOT" enquanto toca. Botão direito:
  `MusicBotContextMenu` com o mesmo volume e "Silenciar" do menu de uma pessoa (sem mensagem, amigo, cargos, moderação
  ou perfil); silenciado mostra o alto-falante cortado. O bot não entra na grade da sala (não está no `voice:state`).
- **Volume do bot:** chave fixa `MUSIC_BOT_VOLUME_ID` (`'music-bot'`) no mesmo `setUserVolume`/`setUserMuted` das
  pessoas; o `VoiceClient` reconhece a faixa do bot por `attributes.bot === 'music'`. Vale para o bot de todas as salas e
  fica salvo em `concord:audio` (`docs/areas/voice.md`).

## Testes

- `server/music/query.test.ts` (todos os formatos de link e texto aceitos e recusados), `catalog.test.ts` (roteamento,
  ao vivo/sem duração/longa: recusa ou pula), `queue.test.ts` (várias de uma vez, `added`, fila cheia),
  `player.test.ts` (fonte e publicador falsos em memória; pré-busca: 1ª faixa preparada antes de o bot entrar, próxima só depois que a atual toca, troca e pular usam a preparada, parar/falha/fim fecham tudo), `spotify.test.ts` (token, faixa, álbum paginado, playlist pela
  página de incorporação; `fetch` falso), `youtube.test.ts` (JSON do yt-dlp de vídeo/playlist/busca, busca em lista plana, áudio sempre o link do vídeo (nunca o endereço direto), argumentos,
  `ytDlpRunner` com `execFile` falso), `audio-source.test.ts` (linhas de comando, `PcmFramer`, processos falsos: `prepare` só inicia o `yt-dlp -o -`, `open` liga a saída dele no `ffmpeg -i pipe:0` e entrega os quadros que passam pelo pipe, o que foi baixado antes de abrir chega inteiro, fechar antes/depois de abrir mata os dois, EPIPE na entrada do ffmpeg não derruba, falha sem áudio com o motivo do yt-dlp ou do ffmpeg, programa ausente).
- `server/tests/music.test.ts` "comandos vindos do chat": as 8 mensagens na ordem (comando, resposta) para quem vê o canal e no histórico; comando e "procurando" chegam com a busca parada (o Spotify falso segura `HELD`/`HELD_2` até `spotify.release()`) e a resposta troca a mesma mensagem sem `editedAt`; busca que falha e sair da sala no meio viram "Não consegui tocar" com `posted: true`; playlist no chat da sala, erro não posta, botões/id em texto não postam, sem `send` recusa sem tocar, chat privado não vaza e quem não vê não usa.
- `src/renderer/src/components/voice/MusicBotReply.test.tsx` ("Música" + BOT sem juntar com o comando, fila, playlist, pulou, parou, "procurando" trocado ao vivo pelo `message:edited`, erro em `text-destructive`) e `src/renderer/src/lib/commands.test.ts` (registro).
- `server/tests/music.test.ts`: servidor de verdade, LiveKit falso, Spotify falso (API + página de incorporação), yt-dlp
  falso (`fake-youtube.ts`) e a fonte falsa (`fake-music-playback.ts`: toca 100x mais rápido que a duração e escreve
  `[fake-music] join/leave` no log). Cobre playlist do Spotify e do YouTube (`added`), vídeo, ao vivo, busca e playlist
  maior que a fila.
- `server/tests/music.test.ts` "várias salas ao mesmo tempo": duas salas tocando com filas e bots próprios (`[fake-music]
  join` de cada uma), pular numa e parar na outra sem mexer na vizinha, comando para a sala em que não estou recusado,
  sala que esvazia encerrando só a sua instância, e o `music:state` de uma sala privada não chegando a quem só vê a
  outra. Conferido quebrando de propósito (recusar 2ª sala, `stop` limpando todas, esvaziar uma parando todas,
  `io.emit` no lugar do `emitToViewers`): cada quebra derruba ao menos um desses testes.
- `src/renderer/src/lib/actions/music.test.ts` (socket falso: `/play`, `/skip`, `/stop` com o chat, `/queue` abrindo o painel
  sem chat, sucesso/falha devolvidos ao Composer, erro com `posted` conta como enviado, duas salas no `musicRooms` sem
  uma apagar a outra), `lib/paginate.test.ts`, `components/voice/MusicPlayer.test.tsx` (volume do
  player ↔ menu do bot, ocultar/mostrar guardado, "Ver a fila", cartão da sala certa com `music:state` de outra sala), `components/voice/MusicQueueDialog.test.tsx`
  (itens, paginação, vazio, fechar), a posição do player em `components/VoiceView.test.tsx`, os comandos e o destaque
  (dica `query` só no `/play`) no `components/chat/chat.test.tsx`, o volume do bot em `lib/voice.test.ts` ("bot de
  música") e o menu do bot em `components/voice/MemberContextMenu.test.tsx`.
- Pausa e progresso: `player.test.ts` (estado avisado no 1º quadro com `elapsedMs` 0, pausar chama `clearQueue`, relógio falso: `elapsedMs` congela na pausa e continua na retomada, pular pausado segue pausado, parar zera `paused`), `server/tests/music.test.ts` "pausa a sala toda" (estado para quem vê, só quem está na sala, "Nenhuma música tocando", `elapsedMs` estável pausado), `server/tests/music.test.ts` "limites" (pausar/retomar não gastam a ficha de tocar; servidor com `RATE_LIMIT_MULTIPLIER=1`). `catalog.test.ts`/`spotify.test.ts`/`youtube.test.ts`: `collection` e o título da playlist/álbum.
- Pular para uma da fila e embaralhar: `queue.test.ts` (`jumpTo`, `shuffleUpcoming` com acaso previsível), `player.test.ts` (fecha a atual, toca a escolhida, prepara a nova próxima), `server/tests/music.test.ts` "pular para uma da fila e embaralhar" (estado para quem vê, recusas, `/shuffle` no chat, botão sem chat), `lib/actions/music.test.ts`, `components/music/MusicView.test.tsx` ("Tocar agora", "Embaralhar a fila") e `MusicBotReply.test.tsx`. Conferido quebrando `jumpTo` e voltando o `MusicQueue` antigo: os testes caem.
- Playlists salvas: `server/tests/playlists.test.ts` (servidor de verdade: criar/listar/apagar, nome e link inválidos, url canônica, duplicidade, limite, quem apaga) e `lib/actions/playlists.test.ts` (socket falso).
- Área "Música": `components/music/MusicView.test.tsx` (botão da barra, fora de sala, progresso pelo `elapsedMs` e parado na pausa, pausar/retomar/pular/parar, pedir música, fila, convite de salvar, gaveta: tocar, apagar com confirmação, `playlist:created`/`deleted` ao vivo) e `lib/music-progress.test.ts`.
- Nenhum teste chama a rede, o yt-dlp, o ffmpeg ou um LiveKit de verdade.

Teste manual: `docker compose up -d`, preencha `SPOTIFY_*`, instale yt-dlp e ffmpeg, `npm run dev:all`, entre numa sala
com duas janelas e mande `/play` com um link (faixa/álbum/playlist do Spotify, vídeo/playlist do YouTube) ou o nome da
música. Várias salas: com 3 janelas (contas diferentes), duas em salas de voz diferentes mandam `/play` cada uma e a
terceira, fora da voz, abre uma sala e depois a outra: cada cartão mostra a sua música, `/skip`/`/stop` numa não muda a
outra e o LiveKit mostra um "Música" (`music-bot:<sala>`) em cada sala. Só os resolvedores, sem o app: um script com `process.loadEnvFile("server/.env")` que chame
`new MusicCatalog(spotifyFromEnv(process.env), new YouTubeResolver(ytDlpRunner(process.env.YTDLP_PATH ?? "yt-dlp"))).find(texto)`
(rodar com `npx tsx`). Medido em 17/11/2026: Spotify ~0,3–0,5 s; vídeo do YouTube (`-J` completo) ~4,9–5,2 s; busca e playlist planas ~3 s.

## Problemas conhecidos / depuração

| Sintoma | Causa provável |
|---|---|
| "Bot de música não configurado neste servidor" | Falta `LIVEKIT_*`. |
| "Links do Spotify não estão configurados neste servidor" | Falta `SPOTIFY_CLIENT_ID`/`SECRET` (YouTube e busca funcionam). |
| "Não foi possível ler essa playlist do Spotify" | A página de incorporação mudou de formato: ajuste `parseSpotifyEmbed` com uma página nova como fixture. |
| Playlist do Spotify entra com só 100 músicas | Limite da página de incorporação (a Web API não lê playlists com Client Credentials). |
| "Não foi possível ler isso no YouTube" | Vídeo privado/removido/com restrição de idade, ou yt-dlp desatualizado (`yt-dlp -U`). |
| "Não foi possível consultar o Spotify" | Credenciais erradas ou sem internet no servidor. |
| Cartão aparece e some na hora | A faixa falhou: veja `[música]` no log (yt-dlp/ffmpeg ausente ou desatualizado, busca sem resultado). |
| "[música] o bot não conseguiu entrar na sala" | LiveKit fora do ar, `LIVEKIT_API_URL` errado ou binário do `@livekit/rtc-node` ausente (imagem Alpine/musl não serve). |
| Música errada | Faixa do Spotify e texto livre usam o primeiro resultado do YouTube; versões ao vivo/covers podem vencer. Mande o link do vídeo. |
| Demora para começar a 1ª música (~9,5–14 s) | Esperado: é o yt-dlp (abrir o `.exe` ~1,5 s, desafios de JS ~1,2 s, espera exigida pelo YouTube ~4 s, além dos metadados). Meça com `yt-dlp --js-runtimes node:<node> --no-playlist --extractor-args youtube:skip=hls --format bestaudio/best -o - <link> > NUL` sem `--quiet` (mostra o "Sleeping ... as required by the site"). As seguintes já vêm preparadas. |
| Silêncio de segundos entre músicas | A pré-busca não rodou: a próxima só é preparada depois do 1º quadro da atual; faixa muito curta (< tempo do yt-dlp) ainda espera. Veja `[música]` no log (yt-dlp falhou na preparada). |
| Música corta no meio | O yt-dlp parou de baixar (rede, ou a conexão parada no pipe caiu): veja `[música]` no log (`Sem áudio: yt-dlp (código N): ...` quando nada tocou). |
| Bot entra e sai logo; log `Sem áudio: ... 403 Forbidden` | Alguém voltou a abrir o endereço direto do áudio no ffmpeg: com runtime de JS o YouTube recusa antes do `available_at`. O áudio tem que passar pelo `yt-dlp -o -` (seção "Pré-busca"). |
| Bot entra e sai; log `Nada encontrado no YouTube para "..."` | A busca do YouTube voltou vazia. Faixa do Spotify busca `<1º artista> - <título>` (`youtubeQuery` em `spotify.ts`): com todos os artistas juntos (ex.: 6 nomes) a busca vinha vazia. |
| Log `Sem áudio: yt-dlp (código 1): ERROR: unable to download video data: HTTP Error 403` isolado | Recusa pontual do YouTube ao próprio yt-dlp (visto 1 vez em 4 tentativas com o mesmo vídeo); pedir de novo costuma tocar. |
| `Sem áudio: yt-dlp (código 1): ... Sign in to confirm` / `n challenge` / `JS runtime` | O yt-dlp não resolveu os desafios de JavaScript: confira o `--js-runtimes node:<Node do servidor>` (`NODE_JS_RUNTIME`) e atualize o yt-dlp (`yt-dlp -U`). Deno no PATH também serve, mas não é exigido. |
| Tudo falha com "Não foi possível ler isso no YouTube" / "Áudio não encontrado" depois de atualizar o yt-dlp | O YouTube passou a entregar o áudio só por HLS: tire o `SKIP_HLS` de `youtube.ts` e meça de novo. |
| Depois de uma pausa longa a música não volta (ou corta) | O yt-dlp fica parado no pipe durante a pausa; o YouTube pode derrubar a conexão parada (não medido além de ~4 min, seção "Pré-busca"). Pular e pedir de novo resolve; o log `[música]` mostra o motivo. |
| O tempo da barra pula ou fica um pouco fora do som | O progresso é interpolado no app a partir do `elapsedMs` do último `music:state`; relógios e atraso de rede diferem alguns décimos de segundo e o próximo estado corrige. |
| Salvar playlist: "Esse link já está salvo em ..." | A url canônica já existe na coleção (links diferentes da mesma lista contam como um); apague a antiga ou toque a salva. |
| `/pause` e `/resume` não existem | Só pelos botões do player (chat não tem esses comandos). |
| Bot não aparece na barra lateral de quem acabou de abrir o app | O app só conhece o estado depois de um `music:state` ou de abrir a sala (`music:queue`). |

O bot não aparece no `voice:state`; ele é uma linha à parte na lista da sala, com volume e silenciar no botão direito.
