# Bot de música (A11 servidor / B14 tela)

Quem está numa sala de voz manda `/play <link ou nome da música>` no chat e um participante **"Música"** entra na sala
tocando a faixa para todos. Aceita faixa, álbum e playlist do Spotify, vídeo e playlist do YouTube e texto livre
(busca no YouTube). Do Spotify vêm só os **metadados**; o **áudio** sempre vem do YouTube (`yt-dlp` + `ffmpeg`) e é
publicado no LiveKit pelo próprio servidor com `@livekit/rtc-node`. Por que assim e o que foi descartado:
`docs/decisions/0006-bot-musica-spotify-youtube.md`.

## Arquivos

| Caminho | O que é |
|---|---|
| `src/shared/types/music.ts` | Contrato: `MusicTrack`, `MusicState`, `MusicResult`, `MusicPlayResult` (`added`), `MusicControl`/`MusicPlayRequest` (com `textChannelId?`), `MusicBotReply` + `musicBotReplyText`/`musicTrackLabel` (resposta do bot no chat; vai em `ToolPayload` como `{ tool: 'music' }` em `tools.ts`), eventos `music:*`, limites `MUSIC_MAX_TRACK_MS` (15 min), `MUSIC_QUEUE_MAX` (100), `MUSIC_QUERY_MAX` (500), `MUSIC_BOT_NAME`. |
| `server/modules/music.ts` | Handlers `music:play/skip/stop/queue`, conferência de sala e permissão, limite `LIMITS.music`, `music:state` por `emitToViewers`, saída do bot quando a sala esvazia (`onVoiceRoomsChange` de `voice.ts`) e as mensagens no chat (`commandChat` confere o canal; `postToChat` grava o comando e a resposta pelo `insertMessage` e manda `message:new` por `emitToViewers`; `<@todos>` no comando passa pelo `mentionSafeContent` de `messages.ts`). |
| `server/music/ports.ts` | Tipos do domínio: `MusicQuery` (o que o pedido é), `TrackMetadata` com `AudioLocator` (`youtube-search` = faixa a buscar no YouTube na hora de tocar; `audio-url` = link do próprio áudio), `QueuedTrack` (`MusicTrack` + `audio`, só no servidor), `TrackResolver`, `AudioSource`/`AudioStream` (PCM 48 kHz estéreo em quadros de 10 ms), `RoomPublisher`/`RoomOutput`, `MusicError` (mensagem pt-BR) e `PLAYLIST_READ_MAX` (200). |
| `server/music/query.ts` | `parseMusicQuery` (pura): texto → `MusicQuery` ou `null` (link de outro site). |
| `server/music/catalog.ts` | `MusicCatalog.find`: roteia a consulta para o resolvedor certo e aplica as regras (ao vivo, sem duração, acima de 15 min: recusa item único, pula em playlist). |
| `server/music/spotify.ts` | `SpotifyResolver`: faixa e álbum pela Web API (Client Credentials, token até 1 min antes de expirar, álbum paginado de 50 em 50); playlist pela página de incorporação (`parseSpotifyEmbed`). |
| `server/music/youtube.ts` | `YouTubeResolver`: vídeo (`yt-dlp -J --no-playlist`), playlist e busca (`-J --flat-playlist`); `parseYtDlpVideo`/`parseYtDlpEntries` (JSON do yt-dlp → faixa) e `ytDlpRunner` (roda o programa). |
| `server/music/audio-source.ts` | `YtDlpFfmpegSource`: `yt-dlp` (`ytsearch1:<busca>` ou o link) → `ffmpeg` → PCM s16le; `PcmFramer` corta em quadros; `audioToolsFromEnv`. |
| `server/music/queue.ts` | Fila pura por sala: `enqueue` (várias de uma vez; a primeira vai para "tocando agora"; entra só o que cabe e devolve `added`; recusa fila cheia) e `advance`. |
| `server/music/player.ts` | `MusicPlayer`: uma fila e um bot por sala; entra na primeira música, toca em sequência, pula, para e sai quando a fila acaba. Avisa cada mudança (`onChange`) sem o `audio` (estado público). |
| `server/music/livekit-publisher.ts` | `LiveKitPublisher`: token do bot (identidade `music-bot:<canal>`, nome "Música", atributo `bot: music`, só publica microfone, não assina ninguém) e a faixa `AudioSource` do `@livekit/rtc-node`. |
| `server/music/drivers.ts` | Monta as peças a partir do ambiente (`musicDrivers`); `overrideMusicDrivers({ playback, ytDlp })` troca fonte/publicador e o yt-dlp (testes). |
| `server/tests/music.test.ts`, `server/tests/fake-music-playback.ts`, `server/tests/fake-youtube.ts` | Integração com servidor de verdade, Spotify falso (HTTP local), yt-dlp falso (JSON fixo por link) e fonte/publicador falsos carregados com `--import` (`TestServer.start({ imports })`). |
| `src/renderer/src/lib/actions/music.ts` | `playMusic`, `skipMusic`, `stopMusic` (com o `textChannelId` opcional), `loadMusicQueue`, `parseMusicCommand` (lê o registro por `parseCommand`)/`runMusicCommand(texto, chat)` (comandos do Composer; `null` = não é comando, senão `Promise<boolean>` = deu certo), `openMusicQueue`/`closeMusicQueue` (painel da fila), `trackDuration`. |
| `src/renderer/src/lib/commands.ts` | **Registro dos comandos de chat** (`CHAT_COMMANDS`: nome, argumento opcional com dica e descrição curta) e as puras que leem dele: `commandSuggestions` (menu do `/`), `parseCommand`, `commandDraft` (destaque). Comando novo = uma entrada aqui (+ quem o executa). Menu: `docs/areas/messages.md`. |
| `src/renderer/src/components/voice/MusicBotReply.tsx` | Resposta do bot no chat: `MusicReplyCard` (capa pequena, "Tocando agora"/"Adicionou à fila"/"Adicionou N músicas à fila, começando por"/"Pulou" + "Tocando agora: …"/"Parou a música e limpou a fila", "Pedido por"), `MusicBotAvatar`, `MusicBotName` ("Música" + selo BOT) e `isMusicBotMessage`. |
| `src/renderer/src/store/music.ts` | `musicRooms` (estado de cada sala com música tocando) e `musicQueueChannelId` (sala cujo painel da fila está aberto; `null` = fechado). |
| `src/renderer/src/components/voice/MusicPlayer.tsx` | Cartão "Tocando agora" (capa, título, artistas, quem pediu, duração, "Ver a fila", pular/parar, volume do bot, ocultar), a barra fina "Tocando: título" quando oculto, `TrackCover` e `MusicBotMember` (bot com selo "BOT" na lista da sala na barra lateral, com o `MusicBotContextMenu` de `MemberContextMenu.tsx` no botão direito). |
| `src/renderer/src/components/voice/MusicQueueDialog.tsx` | Painel "Fila de músicas" (shadcn `Dialog`, montado uma vez em `App.tsx`): música atual e fila paginada de 10 em 10. |
| `src/renderer/src/lib/paginate.ts` | `paginate(itens, página, porPágina)` → `{ items, page, pages, start }` (pura; página fora do intervalo vai para a mais próxima). |
| `src/renderer/src/lib/music-player.ts` | `loadPlayerHidden`/`savePlayerHidden`: player oculto ou não, guardado na máquina (`localStorage` `concord:music-player-hidden`). |
| `src/renderer/src/components/chat/CommandHighlight.tsx` | Destaque dos comandos no Composer (do registro): camada espelho atrás do campo com o comando como código e, em comando com argumento (`/play`), a dica `query`. |

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
- **Só no sucesso**, no mesmo handler e em ordem (antes do ack): 1) mensagem comum da pessoa com o comando remontado pelo servidor (`/play <query sem as pontas>`, `/skip`, `/stop`; `<@todos>` sem permissão vira texto); 2) a resposta do bot, `kind: 'tool'` com `tool: { tool: 'music', result: MusicBotReply }` e `content` = `musicBotReplyText`. As duas vão por `message:new` via `emitToViewers` e ficam no histórico.
- `MusicBotReply`: `play` (`added`, `startedNow` = a sala estava sem música, `first` = título/artistas/capa da primeira que entrou), `skip` (`skipped` e `next`, ou `null`), `stop`. Textos: "Tocando agora: T — A", "Adicionou à fila: T — A", "Adicionou N músicas à fila, começando por T — A", "Pulou: T — A. Tocando agora: …", "Parou a música e limpou a fila".
- **Por que `kind: 'tool'` e não um `kind` novo:** a resposta é uma mensagem postada pelo servidor com payload tipado, igual às ferramentas; reaproveita a coluna `tool` (jsonb), a regra do banco (`tool` presente ⇔ `kind = 'tool'`), o histórico, reações, apagar e o "não edita" sem migration. O autor gravado é **quem pediu** (como nas ferramentas: quem pediu pode apagar); a tela troca nome e avatar por "Música" + BOT.
- Erro (link inválido, fora da sala, fila cheia, não configurado, sem permissão): nada vai para o chat; toast e o texto fica no Composer.
- `/queue` não posta nada (só abre o painel). Os botões do player (pular/parar) não mandam `textChannelId` e não postam nada.
- Dois pedidos ao mesmo tempo no mesmo chat podem intercalar os pares (comando A, comando B, resposta A...): a ordem é garantida por pedido, não entre pedidos.

## Fluxo

1. `/play <link ou nome>` no Composer (qualquer chat) → `runMusicCommand` usa a sala em que **eu** estou (`myVoiceChannelId`).
2. O servidor confere sala, permissão, tamanho da `query` e `LIMITS.music`; `MusicCatalog.find` passa o texto pelo
   `parseMusicQuery` e chama o `SpotifyResolver` ou o `YouTubeResolver`, que devolvem os metadados (título, artistas,
   capa, duração) antes de enfileirar.
3. `MusicPlayer.add` (todas as faixas de uma vez, um `music:state` só): sala sem bot → `RoomPublisher.join` (o bot entra
   no LiveKit) e começa a tocar; com bot → fim da fila.
4. Cada faixa: `AudioSource.open` (yt-dlp + ffmpeg, cortado em duração + 5 s) → quadros de 10 ms → `RoomOutput.play`
   (faixa do Spotify: a busca `"<artistas> - <título>"` no YouTube só acontece aqui, na hora de tocar; YouTube e
   texto livre: o próprio link do vídeo)
   (`AudioSource.captureFrame` do rtc-node, que segura o ritmo em tempo real).
5. Faixa acabou → próxima; fila acabou, `/stop` ou sala vazia → o bot sai (`leave`) e `music:state` vai com `nowPlaying: null`.
6. No app, o áudio do bot chega como o de qualquer participante e segue o volume geral de saída, o deafen e o volume/silenciar próprio do bot (chave `music-bot`, `docs/areas/voice.md`).

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
| qualquer texto que não é link | busca | `yt-dlp -J --flat-playlist ytsearch1:<texto>` (espaços juntados) |
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
  fonte do campo e `-mx-0.5 px-0.5`, para não deslocar o cursor). Em comando com argumento (`/play`: `arg` do registro), enquanto não há
  argumento, aparece a dica `query` e "link do Spotify/YouTube ou nome da música" em texto apagado. O campo continua o
  mesmo `textarea`: menções, colar anexos, Enter, Shift+Enter e rascunho não mudam.
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
  `player.test.ts` (fonte e publicador falsos em memória), `spotify.test.ts` (token, faixa, álbum paginado, playlist pela
  página de incorporação; `fetch` falso), `youtube.test.ts` (JSON do yt-dlp de vídeo/playlist/busca, argumentos,
  `ytDlpRunner` com `execFile` falso), `audio-source.test.ts` (linhas de comando, `PcmFramer`, processos falsos).
- `server/tests/music.test.ts` "comandos vindos do chat": as 8 mensagens na ordem (comando, resposta) para quem vê o canal e no histórico, playlist no chat da sala, erro não posta, botões/id em texto não postam, sem `send` recusa sem tocar, chat privado não vaza e quem não vê não usa.
- `src/renderer/src/components/voice/MusicBotReply.test.tsx` ("Música" + BOT sem juntar com o comando, fila, playlist, pulou, parou) e `src/renderer/src/lib/commands.test.ts` (registro).
- `server/tests/music.test.ts`: servidor de verdade, LiveKit falso, Spotify falso (API + página de incorporação), yt-dlp
  falso (`fake-youtube.ts`) e a fonte falsa (`fake-music-playback.ts`: toca 100x mais rápido que a duração e escreve
  `[fake-music] join/leave` no log). Cobre playlist do Spotify e do YouTube (`added`), vídeo, ao vivo, busca e playlist
  maior que a fila.
- `src/renderer/src/lib/actions/music.test.ts` (socket falso: `/play`, `/skip`, `/stop` com o chat, `/queue` abrindo o painel
  sem chat, sucesso/falha devolvidos ao Composer), `lib/paginate.test.ts`, `components/voice/MusicPlayer.test.tsx` (volume do
  player ↔ menu do bot, ocultar/mostrar guardado, "Ver a fila"), `components/voice/MusicQueueDialog.test.tsx`
  (itens, paginação, vazio, fechar), a posição do player em `components/VoiceView.test.tsx`, os comandos e o destaque
  (dica `query` só no `/play`) no `components/chat/chat.test.tsx`, o volume do bot em `lib/voice.test.ts` ("bot de
  música") e o menu do bot em `components/voice/MemberContextMenu.test.tsx`.
- Nenhum teste chama a rede, o yt-dlp, o ffmpeg ou um LiveKit de verdade.

Teste manual: `docker compose up -d`, preencha `SPOTIFY_*`, instale yt-dlp e ffmpeg, `npm run dev:all`, entre numa sala
com duas janelas e mande `/play` com um link (faixa/álbum/playlist do Spotify, vídeo/playlist do YouTube) ou o nome da
música. Só os resolvedores, sem o app: um script com `process.loadEnvFile("server/.env")` que chame
`new MusicCatalog(spotifyFromEnv(process.env), new YouTubeResolver(ytDlpRunner(process.env.YTDLP_PATH ?? "yt-dlp"))).find(texto)`
(rodar com `npx tsx`). Medido em 17/11/2026: Spotify ~0,3–0,5 s; YouTube (vídeo, playlist ou busca) ~3–4 s por pedido.

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
| Bot não aparece na barra lateral de quem acabou de abrir o app | O app só conhece o estado depois de um `music:state` ou de abrir a sala (`music:queue`). |

O bot não aparece no `voice:state`; ele é uma linha à parte na lista da sala, com volume e silenciar no botão direito.
