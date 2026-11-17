# 0006 — Bot de música: metadados do Spotify, áudio do YouTube, publicado pelo servidor

- **Data:** 2026-11-17
- **Situação:** aceita

## Contexto

O grupo quer ouvir música junto na sala de voz (A11 + B14), pedindo pelo link do Spotify, que é o que todo mundo usa.
O Spotify não entrega o áudio pela Web API (só metadados), e retransmitir áudio fora dos apps dele não é permitido.
O Concord é self-hosted e gratuito: nada que exija conta paga de cada pessoa nem biblioteca GPL no servidor.

## Decisão

O link do Spotify vira metadados pela Web API (Client Credentials, sem Premium); o áudio vem do primeiro resultado do
YouTube para "artistas - título" (`yt-dlp` + `ffmpeg`, chamados como programas externos) e o servidor o publica na
sala do LiveKit como um participante "Música" com `@livekit/rtc-node` (Apache-2.0).

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| **librespot** (cliente Spotify não oficial) com uma conta Premium no servidor | Viola os termos do Spotify e arrisca o banimento da conta usada; exige pagar o Premium; quebra quando o Spotify muda o protocolo. |
| **Web Playback SDK** do Spotify em cada app | Exige Premium **de cada ouvinte** e DRM Widevine, que o Electron padrão não traz (precisaria de build com Widevine/castLabs); a sincronia entre ouvintes ficaria por nossa conta. |
| Tocar **localmente em cada app** (cada um baixa e toca a mesma faixa) | Cada PC precisaria do yt-dlp/ffmpeg; dessincroniza entre as pessoas; pular/parar vira sincronizar N players; quem entra no meio começa do zero. |
| `play-dl` ou libs de YouTube em JavaScript | GPL-3.0 (contaminaria o servidor) ou abandonadas; o yt-dlp é o que acompanha as mudanças do YouTube. |
| Ler título/artista pelo oEmbed/página do Spotify (sem credenciais) | Mais frágil (HTML muda) e sem duração confiável para o limite de 15 min; a Web API é gratuita. |

## Consequências

- Precisa de `SPOTIFY_CLIENT_ID`/`SECRET` e de yt-dlp + ffmpeg no servidor (na imagem Docker já vêm). A imagem saiu do
  Alpine para Debian slim porque o `@livekit/rtc-node` só tem binário glibc.
- Baixar do YouTube também fere os termos do YouTube: risco aceito para um grupo de amigos num servidor próprio
  (pode haver bloqueio de IP; o yt-dlp precisa ser atualizado quando o YouTube muda).
- A busca pode achar a versão errada (ao vivo, cover). Aceitar links diretos do YouTube é o próximo passo natural:
  basta outro `TrackResolver`; a fonte de áudio e o publicador não mudam.
- O áudio passa pelo servidor (CPU do ffmpeg e banda de upload de uma faixa por sala com música).

## Revisão (2026-11-17): playlists, álbuns, YouTube direto e busca por texto

O `music:play` passou a receber `query` (link ou texto). Faixa e álbum do Spotify continuam pela Web API; vídeo,
playlist do YouTube e texto livre são lidos pelo próprio `yt-dlp -J` (sem chave de API) e tocados pelo link do vídeo.

**Playlist do Spotify pela página de incorporação** (`open.spotify.com/embed/playlist/<id>`, JSON `__NEXT_DATA__`), não
pela Web API. Testado com as credenciais do servidor: `GET /v1/playlists/<id>/tracks` → 403, `/items` → 401 (exige
login de usuário) e `GET /v1/playlists/<id>` volta sem as faixas; playlists do próprio Spotify dão 404 desde nov/2024.

| Opção para ler playlist do Spotify | Por que não |
|---|---|
| Web API com Client Credentials | Não entrega mais o conteúdo de playlist para app em modo de desenvolvimento (acima). |
| Login do dono do servidor no Spotify (Authorization Code + PKCE) | Fluxo de login e token guardado no servidor só para isso; em modo de desenvolvimento a API só lista playlists do próprio usuário ou colaborativas, então playlists de outras pessoas continuariam fora. |
| Pedir cota estendida ao Spotify | Exige empresa e base grande de usuários; inviável para um servidor de amigos. |
| Recusar playlists do Spotify | Era a alternativa segura, mas a playlist é o principal pedido do grupo. |

Consequências: é raspagem de uma página pública (frágil; pode quebrar quando o Spotify mudar o HTML e então responde
"Não foi possível ler essa playlist do Spotify"); lê só as 100 primeiras faixas e sem capa por faixa (usa a capa da
playlist); em troca lê também as playlists do próprio Spotify. O parser fica isolado em `parseSpotifyEmbed`, com teste
por fixture, e nada mais depende do formato da página.
