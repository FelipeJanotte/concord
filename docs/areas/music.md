# Bot de música (A11 servidor / B14 tela)

Quem está numa sala de voz manda `/play <link ou nome da música>` no chat e um participante **"Música"** entra na sala
tocando a faixa para todos. Aceita faixa, álbum e playlist do Spotify, vídeo e playlist do YouTube e texto livre
(busca no YouTube). Do Spotify vêm só os **metadados**; o **áudio** sempre vem do YouTube (`yt-dlp` + `ffmpeg`) e é
publicado no LiveKit pelo próprio servidor com `@livekit/rtc-node`. Por que assim e o que foi descartado:
`docs/decisions/0006-bot-musica-spotify-youtube.md`.

## Arquivos

| Caminho | O que é |
|---|---|
| `src/shared/types/music.ts` | Contrato: `MusicTrack`, `MusicState`, `MusicResult`, `MusicPlayResult` (`added`; erro com `posted: true` = o comando já foi postado), `MusicControl`/`MusicPlayRequest` (com `textChannelId?`), `MusicBotReply` (com `searching`/`failed`) + `musicBotReplyText`/`musicSearchingText`/`musicFailedText`/`musicTrackLabel` (resposta do bot no chat; vai em `ToolPayload` como `{ tool: 'music' }` em `tools.ts`), eventos `music:*`, limites `MUSIC_MAX_TRACK_MS` (15 min), `MUSIC_QUEUE_MAX` (100), `MUSIC_QUERY_MAX` (500), `MUSIC_BOT_NAME`. |
| `server/modules/music.ts` | Handlers `music:play/skip/stop/queue`, conferência de sala e permissão, limite `LIMITS.music`, `music:state` por `emitToViewers`, saída do bot quando a sala esvazia (`onVoiceRoomsChange` de `voice.ts`) e as mensagens no chat (`commandChat` confere o canal; `postToChat` grava o comando e a resposta pelo `insertMessage` e manda `message:new` por `emitToViewers`; no `/play`, `findAndEnqueue` busca e enfileira depois do "procurando" e `replaceBotReply` troca a resposta no lugar com `updateToolMessage` + `message:edited`; `<@todos>` no comando passa pelo `mentionSafeContent` de `messages.ts`). |
| `server/music/ports.ts` | Tipos do domínio: `MusicQuery` (o que o pedido é), `TrackMetadata` com `AudioLocator` (`youtube-search` = faixa a buscar no YouTube na hora de tocar; `audio-url` = link do vídeo, com `direct?: DirectAudio` = endereço direto do áudio que veio no `-J` + hora da leitura), `withoutDirectAudio`, `QueuedTrack` (`MusicTrack` + `audio`, só no servidor), `TrackResolver`, `AudioSource.prepare` → `PreparedAudio` (`open()` dá o `AudioStream`, PCM 48 kHz estéreo em quadros de 10 ms; `close()` encerra tudo, aberto ou não), `RoomPublisher`/`RoomOutput`, `MusicError` (mensagem pt-BR) e `PLAYLIST_READ_MAX` (200). |
| `server/music/query.ts` | `parseMusicQuery` (pura): texto → `MusicQuery` ou `null` (link de outro site). |
| `server/music/catalog.ts` | `MusicCatalog.find`: roteia a consulta para o resolvedor certo e aplica as regras (ao vivo, sem duração, acima de 15 min: recusa item único, pula em playlist). |
| `server/music/spotify.ts` | `SpotifyResolver`: faixa e álbum pela Web API (Client Credentials, token até 1 min antes de expirar, álbum paginado de 50 em 50); playlist pela página de incorporação (`parseSpotifyEmbed`). |
| `server/music/youtube.ts` | `YouTubeResolver`: vídeo e busca lidos inteiros (`yt-dlp -J --no-playlist --ignore-no-formats-error --extractor-args youtube:skip=hls`, já com os formatos), playlist plana (`-J --flat-playlist`); `parseYtDlpVideo`/`parseYtDlpEntries` (JSON do yt-dlp → faixa; com a hora da leitura, guardam em `audio.direct` o melhor formato só de áudio, senão o último com áudio, a mesma regra do `bestaudio/best`), `SKIP_HLS` e `ytDlpRunner` (roda o programa). |
| `server/music/audio-source.ts` | `YtDlpFfmpegSource.prepare`: com `audio.direct` de menos de `DIRECT_AUDIO_MAX_AGE_MS` (5 min) usa esse endereço sem chamar o yt-dlp; senão já roda `yt-dlp --format bestaudio/best --get-url` (`ytsearch1:<busca>` ou o link, com `SKIP_HLS`); `open()` espera o endereço e liga o `ffmpeg` nele (`-reconnect`) → PCM s16le; `PcmFramer` corta em quadros; `audioToolsFromEnv`. |
| `server/music/queue.ts` | Fila pura por sala: `enqueue` (várias de uma vez; a primeira vai para "tocando agora"; entra só o que cabe e devolve `added`; recusa fila cheia) e `advance`. |
| `server/music/player.ts` | `MusicPlayer`: uma fila e um bot por sala; entra na primeira música, toca em sequência, pula, para e sai quando a fila acaba; pré-busca (`prefetch`, seção "Pré-busca"). Avisa cada mudança (`onChange`) sem o `audio` (estado público). |
| `server/music/livekit-publisher.ts` | `LiveKitPublisher`: token do bot (identidade `music-bot:<canal>`, nome "Música", atributo `bot: music`, só publica microfone, não assina ninguém) e a faixa `AudioSource` do `@livekit/rtc-node`. |
| `server/music/drivers.ts` | Monta as peças a partir do ambiente (`musicDrivers`); `overrideMusicDrivers({ playback, ytDlp })` troca fonte/publicador e o yt-dlp (testes). |
| `server/tests/music.test.ts`, `server/tests/fake-music-playback.ts`, `server/tests/fake-youtube.ts` | Integração com servidor de verdade, Spotify falso (HTTP local), yt-dlp falso (JSON fixo por link) e fonte/publicador falsos carregados com `--import` (`TestServer.start({ imports })`). |
| `src/renderer/src/lib/actions/music.ts` | `playMusic`, `skipMusic`, `stopMusic` (com o `textChannelId` opcional), `loadMusicQueue`, `parseMusicCommand` (lê o registro por `parseCommand`)/`runMusicCommand(texto, chat)` (comandos do Composer; `null` = não é comando, senão `Promise<boolean>` = aceito ou já postado; `false` = o Composer devolve o texto), `openMusicQueue`/`closeMusicQueue` (painel da fila), `trackDuration`. |
| `src/renderer/src/lib/commands.ts` | **Registro dos comandos de chat** (`CHAT_COMMANDS`: nome, argumento opcional com dica e descrição curta) e as puras que leem dele: `commandSuggestions` (menu do `/`), `parseCommand`, `commandDraft` (destaque). Comando novo = uma entrada aqui (+ quem o executa). Menu: `docs/areas/messages.md`. |
| `src/renderer/src/components/voice/MusicBotReply.tsx` | Resposta do bot no chat: `MusicReplyCard` (capa pequena, "Tocando agora"/"Adicionou à fila"/"Adicionou N músicas à fila, começando por"/"Pulou" + "Tocando agora: …"/"Parou a música e limpou a fila", "Procurando “q”…" com indicador girando, "Não consegui tocar: …" em vermelho, "Pedido por"), `MusicBotAvatar`, `MusicBotName` ("Música" + selo BOT) e `isMusicBotMessage`. |
| `src/renderer/src/store/music.ts` | `musicRooms` (estado de cada sala com música tocando) e `musicQueueChannelId` (sala cujo painel da fila está aberto; `null` = fechado). |
| `src/renderer/src/components/voice/MusicPlayer.tsx` | Cartão "Tocando agora" (capa, título, artistas, quem pediu, duração, "Ver a fila", pular/parar, volume do bot, ocultar), a barra fina "Tocando: título" quando oculto, `TrackCover` e `MusicBotMember` (bot com selo "BOT" na lista da sala na barra lateral, com o `MusicBotContextMenu` de `MemberContextMenu.tsx` no botão direito). |
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
| `music:queue` | `channelId` | `MusicResult` | só `view` (quem olha a sala sem entrar vê o cartão) |
| `music:state` (servidor → app) | `MusicState` | — | a cada mudança, para quem vê a sala (`emitToViewers`); `nowPlaying: null` = bot saiu |

`MusicTrack.requestedBy` guarda conta e nome de quem pediu no momento do pedido. `music:skip`/`music:stop` ainda aceitam só o id em texto (app 0.1.16), sem chat.

## Comando e resposta no chat

`/play`, `/skip` e `/stop` digitados num chat (canal de texto, chat da sala de voz ou conversa privada) aparecem no chat e o bot responde logo embaixo, para todos que veem esse chat.

- O app manda `textChannelId` = o chat do Composer. O servidor confere **antes** de tocar: o canal existe e a pessoa vê (senão "Canal não encontrado") e tem `send` (senão "Você não tem permissão para enviar mensagens neste canal"); recusado, nada toca.
- Mensagens, no mesmo handler e em ordem: 1) mensagem comum da pessoa com o comando remontado pelo servidor (`/play <query sem as pontas>`, `/skip`, `/stop`; `<@todos>` sem permissão vira texto); 2) a resposta do bot, `kind: 'tool'` com `tool: { tool: 'music', result: MusicBotReply }` e `content` = `musicBotReplyText`. As duas vão por `message:new` via `emitToViewers` e ficam no histórico.
- **`/play` posta na hora** (a busca do yt-dlp leva ~4,5 s): passadas as conferências baratas (sala, `query` que o `parseMusicQuery` entende, chat com `view`+`send`, `LIMITS.music`), o servidor posta o comando e o bot em `searching` ("Procurando “query”…") **antes** do `catalog.find`. Depois da busca, a **mesma** mensagem do bot (mesmo id) vira a resposta final (`play`) ou o erro (`failed`: "Não consegui tocar: <motivo>" — não achou, longa demais, fila cheia, saiu da sala no meio): `updateToolMessage` (`server/repo/messages.ts`) grava `tool` + `content` e sai `message:edited { channelId, messageId, content, tool }` por `emitToViewers` (sem `editedAt`: não aparece "(editada)"). Só então o ack; no erro, `{ ok: false, error, posted: true }`. Ordem por pedido: comando → "procurando" → atualização. `/skip` e `/stop` não buscam nada e postam direto a resposta final, só no sucesso.
- `MusicBotReply`: `play` (`added`, `startedNow` = a sala estava sem música, `first` = título/artistas/capa da primeira que entrou), `skip` (`skipped` e `next`, ou `null`), `stop`, `searching` (`query`) e `failed` (`query`, `error`). Textos: "Tocando agora: T — A", "Adicionou à fila: T — A", "Adicionou N músicas à fila, começando por T — A", "Pulou: T — A. Tocando agora: …", "Parou a música e limpou a fila", "Procurando “q”…" (`musicSearchingText`), "Não consegui tocar: motivo" (`musicFailedText`). O cartão mostra um `Loader2` girando (`role="status"`, "Procurando") no `searching` e o texto em `text-destructive` no `failed`; troca ao vivo quando chega o `message:edited`.
- **Por que `kind: 'tool'` e não um `kind` novo:** a resposta é uma mensagem postada pelo servidor com payload tipado, igual às ferramentas; reaproveita a coluna `tool` (jsonb), a regra do banco (`tool` presente ⇔ `kind = 'tool'`), o histórico, reações, apagar e o "não edita" sem migration. O autor gravado é **quem pediu** (como nas ferramentas: quem pediu pode apagar); a tela troca nome e avatar por "Música" + BOT.
- Composer: comando de música limpa o campo **ao enviar** e devolve o texto se o comando não foi aceito nem postado. Erro antes de postar (link que não é Spotify/YouTube, fora da sala, sem permissão, limite, não configurado; `/skip` sem nada tocando): nada vai para o chat, toast e o texto volta ao campo. Erro depois de postar (`posted: true`): toast e o campo fica limpo (o erro já está no chat).
- Se o handler cair no meio (exceção fora do `catalog.find`, que já trata as suas), o bot fica em "Procurando…"; não há limpeza disso.
- `/queue` não posta nada (só abre o painel). Os botões do player (pular/parar) não mandam `textChannelId` e não postam nada.
- Dois pedidos ao mesmo tempo no mesmo chat podem intercalar os pares (comando A, comando B, resposta A...): a ordem é garantida por pedido, não entre pedidos.

## Fluxo

1. `/play <link ou nome>` no Composer (qualquer chat) → `runMusicCommand` usa a sala em que **eu** estou (`myVoiceChannelId`).
2. O servidor confere sala, permissão, tamanho da `query` e `LIMITS.music`; `MusicCatalog.find` passa o texto pelo
   `parseMusicQuery` e chama o `SpotifyResolver` ou o `YouTubeResolver`, que devolvem os metadados (título, artistas,
   capa, duração) antes de enfileirar.
3. `MusicPlayer.add` (todas as faixas de uma vez, um `music:state` só): sala sem bot → `AudioSource.prepare` da
   primeira faixa **e**, em paralelo, `RoomPublisher.join` (o bot entra no LiveKit); com bot → fim da fila.
4. Cada faixa: `PreparedAudio.open` (espera o endereço direto, liga o ffmpeg nele, cortado em duração + 5 s)
   → quadros de 10 ms → `RoomOutput.play` (`AudioSource.captureFrame` do rtc-node, que segura o ritmo em tempo real).
   Vídeo e busca que tocam já: o endereço é o que veio no `-J` do passo 2 (seção "Pré-busca"). Faixa do Spotify: a
   busca `"<artistas> - <título>"` no YouTube acontece no `prepare` (busca e endereço numa chamada só do yt-dlp), que
   para a 1ª faixa roda no próprio `/play`, em paralelo com a entrada no LiveKit.
5. Faixa acabou → próxima; fila acabou, `/stop` ou sala vazia → o bot sai (`leave`) e `music:state` vai com `nowPlaying: null`.
6. No app, o áudio do bot chega como o de qualquer participante e segue o volume geral de saída, o deafen e o volume/silenciar próprio do bot (chave `music-bot`, `docs/areas/voice.md`).

## Pré-busca

Medido em 17/11/2026 (Windows, yt-dlp 2026.10.26 do winget, LiveKit local): quase todo o tempo até o som é o **yt-dlp**
(só abrir o `.exe` leva ~1,7 s; achar o endereço do áudio, ~3,5 s num link e ~4,4 s numa busca); entrar no LiveKit
leva ~0,2 s e o ffmpeg num endereço direto dá o 1º quadro em ~0,3 s. Antes cada troca de faixa esperava o yt-dlp
inteiro (~4 s de silêncio). Agora:

- O `MusicPlayer` mantém preparadas (`room.prepared`, por id da faixa) **só** a faixa tocando e a **próxima** da fila.
  A próxima só é preparada quando a atual **já começou a tocar** (1º quadro): um yt-dlp por vez, para não disputar CPU
  com a faixa que está para começar.
- Toda mudança na fila (`add`, `skip`, fim da faixa, `stop`) chama `prefetch`: fecha o que saiu (mata o yt-dlp ou o
  ffmpeg) e prepara o que entrou. A troca usa o que já estava preparado (sem nova chamada ao yt-dlp). Bot que sai (fila
  acabou, `stop`, sala vazia, falha ao entrar) fecha tudo (`release`). Nenhum processo fica para trás.
- Só a próxima, nunca a fila inteira: o endereço direto do YouTube **expira (~6 h)** e cada preparada é um processo.
- Troca entre faixas: de ~4 s para ~0,1–0,3 s.

**1ª música: reaproveitar o endereço do `-J`.** Vídeo do YouTube e busca por texto são lidos inteiros no enfileiramento
(sem `--flat-playlist`), e esse JSON já traz os formatos com o endereço direto. `parseYtDlpVideo`/`parseYtDlpEntries`
escolhem o melhor (último formato só de áudio da lista, que o yt-dlp ordena do pior ao melhor; sem nenhum, o último com
áudio: a regra do `bestaudio/best`) e guardam em `audio.direct` com a hora da leitura.

- Só a faixa que **toca já** usa: `MusicPlayer.add` numa sala sem bot mantém o `direct` só na 1ª faixa e tira
  (`withoutDirectAudio`) de todas as outras e de tudo que entra numa sala já tocando. Essas seguem a pré-busca acima.
- Prazo: `prepare` só usa o `direct` com menos de **5 min** (`DIRECT_AUDIO_MAX_AGE_MS`); mais velho é descartado e o
  yt-dlp acha um novo. O endereço do YouTube vale ~6 h; 5 min cobre com folga o caminho `/play` → `prepare` (milissegundos).
- Playlist do YouTube continua plana (lista rápida, sem formatos): a 1ª faixa dela ainda espera o yt-dlp no `prepare`.
- Spotify: o Spotify não tem áudio, então a busca no YouTube é inevitável depois dos metadados (~0,3–0,5 s). Ela já roda
  no `/play`: `add` chama `prepare` da 1ª faixa (playlist/álbum: só a 1ª) no mesmo instante em que o bot começa a entrar
  no LiveKit. As outras faixas seguem a pré-busca.

**Custo fixo do yt-dlp** (medido em 17/11/2026, 4–8 rodadas intercaladas): `--extractor-args youtube:skip=hls` (não pede
o manifesto HLS, que só serve para ao vivo) ganha ~0,3 s no vídeo e ~0,6 s na busca e entra em todas as chamadas que leem
o player (`-J` de vídeo/busca e o `--get-url`). Ao vivo sem HLS fica sem formatos; o `--ignore-no-formats-error` no `-J`
mantém o JSON (com `is_live`), e a recusa continua "Transmissões ao vivo não podem ser tocadas". Descartados:
`player_client=` outro que o padrão (sem JS runtime, `android_vr`/`tv_simply`/`ios`/`mweb`/`web_safari`/`tv` não dão
formato só de áudio ou falham), `player_skip=webpage` ("Sign in to confirm you're not a bot" na busca) e `--ignore-config`
(sem diferença). Abrir o `.exe` (~1,7 s, PyInstaller "onefile" do winget) não muda sem trocar a instalação.

**Latência medida** (`/play` → 1º quadro no LiveKit, 3 rodadas, mesma máquina):

| Pedido | Antes | Agora |
|---|---|---|
| Vídeo do YouTube | ~7,6 s (`-J` + `--get-url`) | ~3,4–4,1 s (só o `-J`) |
| Busca por texto | ~7,2 s (`-J` plano + `--get-url ytsearch1`) | ~4,0–5,0 s (só o `-J` da busca) |
| Faixa do Spotify | ~5,2 s | ~4,6–5,3 s (Spotify + `--get-url ytsearch1`) |

O resto é o próprio yt-dlp (~3–4,5 s por chamada); LiveKit (~0,2 s) e ffmpeg (~0,2–0,3 s) correm em paralelo ou depois.

## Regras e limites

**O que o `parseMusicQuery` aceita** (com ou sem `https://`; `http` também; porta ou usuário na URL → recusa):

| Entrada | Vira | Como é lido |
|---|---|---|
| `open.spotify.com/track/<id>`, `spotify:track:<id>` (com `/intl-xx/`, `?si=`) | faixa do Spotify | Web API `GET /v1/tracks/<id>` |
| `open.spotify.com/album/<id>`, `spotify:album:<id>` | álbum do Spotify | Web API `GET /v1/albums/<id>` + páginas de 50; capa do álbum em cada faixa |
| `open.spotify.com/playlist/<id>`, `spotify:playlist:<id>` | playlist do Spotify | página `open.spotify.com/embed/playlist/<id>` (JSON `__NEXT_DATA__`); até 100 faixas; capa da playlist em cada faixa; episódios ignorados |
| `youtube.com/watch?v=`, `m.`/`music.youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>` | vídeo do YouTube | `yt-dlp -J --no-playlist` no link canônico (com os formatos: endereço direto do áudio) |
| `watch?v=<id>&list=<lista>` | **o vídeo** (não a playlist) | quem colou o link estava num vídeo; para a playlist inteira use o link `playlist?list=` |
| `youtube.com/playlist?list=<id>` (também `music.youtube.com`) | playlist do YouTube | `yt-dlp -J --flat-playlist --playlist-end 200` |
| qualquer texto que não é link | busca | `yt-dlp -J --no-playlist ytsearch1:<texto>` (espaços juntados; resultado lido inteiro, com o endereço direto do áudio) |
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
- `LIMITS.music`: 5 comandos seguidos (`play`/`skip`/`stop`), depois 1 a cada 5 s, por conta.
- Qualquer um na sala pula ou para (não há "dono" da fila).
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

## Na tela (B14)

- Comandos no Composer: `/play <link ou nome>`, `/skip`, `/stop`, `/queue` (busca a fila da sala e abre o painel
  "Fila de músicas", o mesmo do botão "Ver a fila"). Nomes, argumento e descrição vêm do registro `lib/commands.ts`
  (também o menu que abre ao digitar `/`, `docs/areas/messages.md`). `/play`, `/skip` e `/stop` com sucesso viram
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
  `player.test.ts` (fonte e publicador falsos em memória; pré-busca: 1ª faixa preparada antes de o bot entrar, próxima só depois que a atual toca, troca e pular usam a preparada, parar/falha/fim fecham tudo; só a faixa que toca já leva o `audio.direct`, a que espera na fila ou entra numa sala tocando vai sem ele), `spotify.test.ts` (token, faixa, álbum paginado, playlist pela
  página de incorporação; `fetch` falso), `youtube.test.ts` (JSON do yt-dlp de vídeo/playlist/busca, melhor formato de áudio como o `bestaudio/best`, `direct` com a hora da leitura em vídeo e busca e nunca em playlist, argumentos,
  `ytDlpRunner` com `execFile` falso), `audio-source.test.ts` (linhas de comando, `PcmFramer`, processos falsos: `prepare` só roda o yt-dlp, `open` liga o ffmpeg no endereço, fechar antes/depois do endereço não abre o ffmpeg e mata o yt-dlp; `direct` recente liga o ffmpeg sem yt-dlp, com 5 min ou mais é descartado).
- `server/tests/music.test.ts` "comandos vindos do chat": as 8 mensagens na ordem (comando, resposta) para quem vê o canal e no histórico; comando e "procurando" chegam com a busca parada (o Spotify falso segura `HELD`/`HELD_2` até `spotify.release()`) e a resposta troca a mesma mensagem sem `editedAt`; busca que falha e sair da sala no meio viram "Não consegui tocar" com `posted: true`; playlist no chat da sala, erro não posta, botões/id em texto não postam, sem `send` recusa sem tocar, chat privado não vaza e quem não vê não usa.
- `src/renderer/src/components/voice/MusicBotReply.test.tsx` ("Música" + BOT sem juntar com o comando, fila, playlist, pulou, parou, "procurando" trocado ao vivo pelo `message:edited`, erro em `text-destructive`) e `src/renderer/src/lib/commands.test.ts` (registro).
- `server/tests/music.test.ts`: servidor de verdade, LiveKit falso, Spotify falso (API + página de incorporação), yt-dlp
  falso (`fake-youtube.ts`) e a fonte falsa (`fake-music-playback.ts`: toca 100x mais rápido que a duração e escreve
  `[fake-music] join/leave` no log). Cobre playlist do Spotify e do YouTube (`added`), vídeo, ao vivo, busca e playlist
  maior que a fila.
- `src/renderer/src/lib/actions/music.test.ts` (socket falso: `/play`, `/skip`, `/stop` com o chat, `/queue` abrindo o painel
  sem chat, sucesso/falha devolvidos ao Composer, erro com `posted` conta como enviado), `lib/paginate.test.ts`, `components/voice/MusicPlayer.test.tsx` (volume do
  player ↔ menu do bot, ocultar/mostrar guardado, "Ver a fila"), `components/voice/MusicQueueDialog.test.tsx`
  (itens, paginação, vazio, fechar), a posição do player em `components/VoiceView.test.tsx`, os comandos e o destaque
  (dica `query` só no `/play`) no `components/chat/chat.test.tsx`, o volume do bot em `lib/voice.test.ts` ("bot de
  música") e o menu do bot em `components/voice/MemberContextMenu.test.tsx`.
- Nenhum teste chama a rede, o yt-dlp, o ffmpeg ou um LiveKit de verdade.

Teste manual: `docker compose up -d`, preencha `SPOTIFY_*`, instale yt-dlp e ffmpeg, `npm run dev:all`, entre numa sala
com duas janelas e mande `/play` com um link (faixa/álbum/playlist do Spotify, vídeo/playlist do YouTube) ou o nome da
música. Só os resolvedores, sem o app: um script com `process.loadEnvFile("server/.env")` que chame
`new MusicCatalog(spotifyFromEnv(process.env), new YouTubeResolver(ytDlpRunner(process.env.YTDLP_PATH ?? "yt-dlp"))).find(texto)`
(rodar com `npx tsx`). Medido em 17/11/2026: Spotify ~0,3–0,5 s; YouTube (vídeo ou busca, com formatos) ~3,3–4,5 s; playlist plana ~3 s.

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
| Demora para começar a 1ª música (~3,5–5 s) | Esperado: é o yt-dlp (no Windows, só abrir o `.exe` do winget leva ~1,7 s). Vídeo/busca: o `-J` do pedido já é tudo (meça com `yt-dlp -J --no-playlist --extractor-args youtube:skip=hls <link>`); Spotify e 1ª faixa de playlist do YouTube: `--get-url`. Se o vídeo/busca demorar o dobro, o `audio.direct` não veio (JSON sem formatos) ou passou de 5 min. |
| Silêncio de segundos entre músicas | A pré-busca não rodou: a próxima só é preparada depois do 1º quadro da atual; faixa muito curta (< tempo do yt-dlp) ainda espera. Veja `[música]` no log (yt-dlp falhou na preparada). |
| Música corta no meio | O ffmpeg perdeu a conexão com o endereço direto e não reconectou (`-reconnect`), ou o endereço expirou. |
| Tudo falha com "Não foi possível ler isso no YouTube" / "Áudio não encontrado" depois de atualizar o yt-dlp | O YouTube passou a entregar o áudio só por HLS: tire o `SKIP_HLS` de `youtube.ts` e meça de novo. |
| Bot não aparece na barra lateral de quem acabou de abrir o app | O app só conhece o estado depois de um `music:state` ou de abrir a sala (`music:queue`). |

O bot não aparece no `voice:state`; ele é uma linha à parte na lista da sala, com volume e silenciar no botão direito.
