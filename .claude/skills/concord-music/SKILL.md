---
name: concord-music
description: Como funciona o bot de música do Concord (A11 servidor / B14 tela) — /tocar com link de faixa do Spotify (metadados pela Web API com Client Credentials), áudio do YouTube por busca (yt-dlp + ffmpeg) publicado na sala pelo servidor com @livekit/rtc-node como o participante "Música", fila por sala, pular/parar, saída automática quando a sala esvazia ou a fila acaba, eventos music:play/skip/stop/queue/state. Use ao mexer em server/modules/music.ts, server/music/**, src/shared/types/music.ts, lib/actions/music.ts, store/music.ts, components/voice/MusicPlayer.tsx, nos comandos do Composer, nas variáveis SPOTIFY_*/YTDLP_PATH/FFMPEG_PATH, no yt-dlp/ffmpeg do Dockerfile, ou ao investigar "Bot de música não configurado", música que não toca, toca a versão errada ou bot que não sai da sala.
---

A documentação desta área fica em **`docs/areas/music.md`**. Leia esse arquivo antes de mexer no código.
