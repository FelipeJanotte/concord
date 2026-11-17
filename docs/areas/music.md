# Bot de música (A11 servidor / B14 tela)

Quem está numa sala de voz manda `/tocar <link do Spotify>` no chat e um participante **"Música"** entra na sala
tocando a faixa para todos. O link do Spotify dá só os **metadados** (título, artistas, capa, duração); o **áudio**
vem do YouTube por busca (`yt-dlp` + `ffmpeg`) e é publicado no LiveKit pelo próprio servidor com
`@livekit/rtc-node`. Por que assim e o que foi descartado: `docs/decisions/0006-bot-musica-spotify-youtube.md`.

Nesta entrega só **links de faixa do Spotify** são aceitos. Links diretos do YouTube, playlists e álbuns ficam para depois.

## Arquivos

| Caminho | O que é |
|---|---|
| `src/shared/types/music.ts` | Contrato: `MusicTrack`, `MusicState`, `MusicResult`, eventos `music:*`, limites `MUSIC_MAX_TRACK_MS` (15 min), `MUSIC_QUEUE_MAX` (20), `MUSIC_URL_MAX` (500), `MUSIC_BOT_NAME`. |
| `server/modules/music.ts` | Handlers `music:play/skip/stop/queue`, conferência de sala e permissão, limite `LIMITS.music`, `music:state` por `emitToViewers` e saída do bot quando a sala esvazia (`onVoiceRoomsChange` de `voice.ts`). |
| `server/music/ports.ts` | Interfaces trocáveis: `TrackResolver` (metadados), `AudioSource`/`AudioStream` (PCM 48 kHz estéreo em quadros de 10 ms), `RoomPublisher`/`RoomOutput` (bot na sala) e `MusicError` (mensagem pt-BR para a pessoa). |
| `server/music/queue.ts` | Fila pura por sala: `enqueue` (primeira vai direto para "tocando agora"; recusa fila cheia) e `advance`. |
| `server/music/player.ts` | `MusicPlayer`: uma fila e um bot por sala; entra na primeira música, toca em sequência, pula, para e sai quando a fila acaba. Avisa cada mudança (`onChange`). |
| `server/music/spotify.ts` | `spotifyTrackId` (validação do link) e `SpotifyResolver` (Web API com Client Credentials, token guardado até 1 min antes de expirar). |
| `server/music/youtube.ts` | `YtDlpFfmpegSource`: `yt-dlp ytsearch1:"<artistas> - <título>"` → `ffmpeg` → PCM s16le; `PcmFramer` corta em quadros; `audioToolsFromEnv`. |
| `server/music/livekit-publisher.ts` | `LiveKitPublisher`: token do bot (identidade `music-bot:<canal>`, nome "Música", atributo `bot: music`, só publica microfone, não assina ninguém) e a faixa `AudioSource` do `@livekit/rtc-node`. |
| `server/music/drivers.ts` | Monta as peças a partir do ambiente (`musicDrivers`); `replaceMusicPlayback` troca fonte e publicador (testes). |
| `server/tests/music.test.ts`, `server/tests/fake-music-playback.ts` | Integração com servidor de verdade, Spotify falso (HTTP local) e fonte/publicador falsos carregados com `--import` (`TestServer.start({ imports })`). |
| `src/renderer/src/lib/actions/music.ts` | `playMusic`, `skipMusic`, `stopMusic`, `loadMusicQueue`, `parseMusicCommand`/`runMusicCommand` (comandos do Composer), `describeQueue`. |
| `src/renderer/src/store/music.ts` | `musicRooms`: estado de cada sala com música tocando. |
| `src/renderer/src/components/voice/MusicPlayer.tsx` | Cartão "Tocando agora" (capa, título, artistas, quem pediu, duração, fila, pular/parar) e `MusicBotMember` (bot com selo "BOT" na lista da sala na barra lateral). |

## Eventos (`src/shared/types/music.ts`)

| Evento | Payload | Ack | Regra |
|---|---|---|---|
| `music:play` | `{ channelId, url }` | `MusicResult` | estar na sala `channelId` (`voice:join`) com `view` + `connect`; link de faixa do Spotify; até 15 min |
| `music:skip` | `channelId` | `MusicResult` | mesma regra de sala; "Nenhuma música tocando" se nada toca |
| `music:stop` | `channelId` | `MusicResult` | mesma regra; esvazia a fila e tira o bot |
| `music:queue` | `channelId` | `MusicResult` | só `view` (quem olha a sala sem entrar vê o cartão) |
| `music:state` (servidor → app) | `MusicState` | — | a cada mudança, para quem vê a sala (`emitToViewers`); `nowPlaying: null` = bot saiu |

`MusicTrack.requestedBy` guarda conta e nome de quem pediu no momento do pedido.

## Fluxo

1. `/tocar <link>` no Composer (qualquer chat) → `runMusicCommand` usa a sala em que **eu** estou (`myVoiceChannelId`).
2. O servidor confere sala, permissão, tamanho do link e `LIMITS.music`; o `SpotifyResolver` valida o link e busca os metadados.
3. `MusicPlayer.add`: sala sem bot → `RoomPublisher.join` (o bot entra no LiveKit) e começa a tocar; com bot → fim da fila.
4. Cada faixa: `AudioSource.open` (yt-dlp + ffmpeg, cortado em duração + 5 s) → quadros de 10 ms → `RoomOutput.play`
   (`AudioSource.captureFrame` do rtc-node, que segura o ritmo em tempo real).
5. Faixa acabou → próxima; fila acabou, `/parar` ou sala vazia → o bot sai (`leave`) e `music:state` vai com `nowPlaying: null`.
6. No app, o áudio do bot chega como o de qualquer participante (sem `accountId`: segue o volume geral de saída e o deafen).

## Regras e limites

- Só links `https://open.spotify.com/track/<id>` (com ou sem `/intl-xx/`, com `?si=`) e `spotify:track:<id>`; id de 22
  caracteres. Outro domínio, álbum, playlist, porta ou usuário na URL → "Envie um link de música do Spotify (open.spotify.com/track/...)".
- Faixa acima de 15 min → "Música longa demais (máximo de 15 min)". Fila: 20 esperando além da que toca.
- `LIMITS.music`: 5 comandos seguidos (`play`/`skip`/`stop`), depois 1 a cada 5 s, por conta.
- Qualquer um na sala pula ou para (não há "dono" da fila).
- Faixa que falha (yt-dlp/ffmpeg ausente, busca sem resultado) é pulada; o motivo vai para o log `[música]`.
- Tudo em memória: reiniciar o servidor zera as filas.

## Configuração

Variáveis do servidor (`server/.env`; produção: `.env` do `docker-compose.prod.yml`):

| Variável | Padrão | Para quê |
|---|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | — | Metadados. Sem as duas: "Bot de música não configurado neste servidor". |
| `YTDLP_PATH` | `yt-dlp` (PATH) | Caminho do yt-dlp. |
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Caminho do ffmpeg. |
| `SPOTIFY_ACCOUNTS_URL`, `SPOTIFY_API_URL` | APIs oficiais | Só para os testes apontarem para o Spotify falso. |

Precisa também do LiveKit configurado (`LIVEKIT_*`); o bot conecta em `LIVEKIT_API_URL` trocando `http` por `ws`.

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

- Comandos no Composer: `/tocar <link>`, `/pular`, `/parar`, `/fila` (mostra o que toca e a fila num aviso). Não viram
  mensagem no chat. Fora de uma sala de voz: "Entre numa sala de voz para usar os comandos de música".
- `MusicPlayer` no topo da sala (`VoiceView`): pede `music:queue` ao abrir; botões de pular/parar só para quem está na sala.
- `MusicBotMember` na lista da sala (`ChannelSidebar`): "Música" com o selo "BOT" enquanto toca.

## Testes

- `server/music/queue.test.ts`, `player.test.ts` (fonte e publicador falsos em memória), `spotify.test.ts` (links
  válidos e inválidos, token, erros; `fetch` falso), `youtube.test.ts` (linhas de comando, `PcmFramer`, processos falsos).
- `server/tests/music.test.ts`: servidor de verdade, LiveKit falso, Spotify falso e a fonte falsa
  (`fake-music-playback.ts`: toca 100x mais rápido que a duração e escreve `[fake-music] join/leave` no log).
- `src/renderer/src/lib/actions/music.test.ts` (socket falso), `components/voice/MusicPlayer.test.tsx` e o comando
  no `components/chat/chat.test.tsx`.
- Nenhum teste chama a rede, o yt-dlp, o ffmpeg ou um LiveKit de verdade.

Teste manual: `docker compose up -d`, preencha `SPOTIFY_*`, instale yt-dlp e ffmpeg, `npm run dev:all`, entre numa sala
com duas janelas e mande `/tocar https://open.spotify.com/track/...`.

## Problemas conhecidos / depuração

| Sintoma | Causa provável |
|---|---|
| "Bot de música não configurado neste servidor" | Falta `SPOTIFY_CLIENT_ID`/`SECRET` ou `LIVEKIT_*`. |
| "Não foi possível consultar o Spotify" | Credenciais erradas ou sem internet no servidor. |
| Cartão aparece e some na hora | A faixa falhou: veja `[música]` no log (yt-dlp/ffmpeg ausente ou desatualizado, busca sem resultado). |
| "[música] o bot não conseguiu entrar na sala" | LiveKit fora do ar, `LIVEKIT_API_URL` errado ou binário do `@livekit/rtc-node` ausente (imagem Alpine/musl não serve). |
| Música errada | A busca usa o primeiro resultado do YouTube para "artistas - título"; versões ao vivo/covers podem vencer. |
| Bot não aparece na barra lateral de quem acabou de abrir o app | O app só conhece o estado depois de um `music:state` ou de abrir a sala (`music:queue`). |

O bot não tem o volume do botão direito (B4) nem aparece no `voice:state`; ele é uma linha à parte na lista da sala.
