# Concord

[![CI](https://github.com/FelipeJanotte/concord/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeJanotte/concord/actions/workflows/ci.yml)

App de chat estilo Discord para um grupo de amigos, com servidor próprio. Desktop em **Electron + React 19 +
TypeScript + Tailwind CSS v4 + shadcn/ui**, tempo real com **Socket.IO**, voz e vídeo com **LiveKit** (SFU
self-hosted) e dados em **PostgreSQL** (ou PGlite embutido).

## O que tem

| Área | Recursos |
|---|---|
| Contas | Cadastro com e-mail e senha ou Google, perfil `nome#id` com foto, sessão que se renova com o uso |
| Chat | Canais de texto, histórico, editar, responder citando, reações, menções `@nome`, links clicáveis, anexos até 25 MB (clipe, colar ou arrastar) |
| Voz e vídeo | Salas de voz, câmera, compartilhar tela (várias em destaque), volume por pessoa, pressione para falar, supressão de ruído automática, equalizador de vozes |
| Pessoas | Amigos por `nome#id`, bloqueio, conversas privadas e chamadas privadas |
| Comunidade | Cargos e permissões por canal, moderação (expulsar da voz, mover, silenciar para todos, apagar mensagem) |
| Diversão | Efeitos sonoros (soundboard), ferramentas do grupo (sorteador de times, dado, moeda, sortear nome, enquete) e bot de música |
| App | Temas personalizáveis (inclusive translúcido), notificações nativas, sobreposição em jogos, atualização automática |

### Bot de música

Na sala de voz, digite `/` no chat para ver os comandos:

| Comando | O que faz |
|---|---|
| `/play <query>` | Toca link de faixa, álbum ou playlist do Spotify, vídeo ou playlist do YouTube, ou busca pelo nome |
| `/skip` | Pula a música atual |
| `/stop` | Para a música e limpa a fila |
| `/queue` | Mostra a fila de músicas |

O comando aparece no chat e o bot responde no mesmo chat. Na sala fica o player com volume, fila paginada e o
botão de ocultar. O áudio vem do YouTube (yt-dlp + ffmpeg); link do Spotify só fornece os metadados. Detalhes e
limites em [`docs/areas/music.md`](docs/areas/music.md).

## Como rodar

Requer **Node.js 20+** (o CI usa 22) e **Docker** (para o Postgres e o LiveKit).

```bash
npm install
```

```bash
docker compose up -d
```

Copie `server/.env.example` para `server/.env` (os valores já batem com o `docker compose`) e suba servidor e app:

```bash
npm run dev:all
```

Na tela de login, use `http://localhost:3001` como servidor e crie uma conta. A primeira conta criada é a dona da
comunidade.

- **Sem Docker:** apague `DATABASE_URL` do `server/.env` e o servidor usa o PGlite embutido. A voz precisa do LiveKit.
- **Separado:** `npm run server` (porta 3001) e `npm run dev` em dois terminais.

### Opcionais

| Recurso | O que precisa |
|---|---|
| Entrar com Google | `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `server/.env` (cliente OAuth "App para computador") |
| Bot de música | `yt-dlp` e `ffmpeg` instalados no servidor (ou `YTDLP_PATH`/`FFMPEG_PATH`); links do Spotify também pedem `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` (app grátis no Spotify Developer, sem Premium) |
| Voz de outra máquina | `LIVEKIT_NODE_IP` no `.env` da raiz (modelo `.env.example`), usado pelo `docker compose` |

### Testar com mais de um usuário

- **Na mesma máquina:** com o `npm run dev:all` rodando, abra outra janela com `npx electron .` (rode
  `npm run build` uma vez antes) e entre com outra conta.
- **Na rede local:** o servidor mostra o IP da rede ao iniciar (ex.: `http://192.168.0.10:3001`). Libere a porta
  3001 no firewall e configure o `LIVEKIT_NODE_IP` para a voz.
- **Pela internet:** veja [Hospedar](#hospedar).

Mais detalhes e problemas conhecidos em [`docs/areas/dev-workflow.md`](docs/areas/dev-workflow.md).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev:all` | Servidor (porta 3001) e app juntos |
| `npm run typecheck` | Checagem de tipos de tudo |
| `npm test` | Todos os testes (vitest) |
| `npm run db:generate` | Gera a migration depois de mudar `server/db/schema` |
| `npm run db:restore [arquivo]` | Restaura um backup do PGlite (servidor parado) |
| `npm run build` | Typecheck e build em `out/` |
| `npm run dist` | Instalador Windows em `dist/`, sem publicar |

## Hospedar

O servidor roda em Docker com Postgres (backup diário), LiveKit com TURN e Caddy com HTTPS automático:
`docker-compose.prod.yml`. Passo a passo em [`deploy/README.md`](deploy/README.md) e
[`docs/areas/deploy.md`](docs/areas/deploy.md).

## Releases

Cada PR mergeado na `main` vira uma versão nova: o workflow sobe a versão no PR, cria a tag `vX.Y.Z` e publica o
instalador no GitHub Releases. O app instalado se atualiza sozinho. Detalhes em
[`docs/areas/updates.md`](docs/areas/updates.md).

## Estrutura

```
server/                 servidor Node: HTTP + Socket.IO, um módulo por domínio (server/modules), dados em server/repo
src/shared/types/       contrato entre app e servidor (tipos e eventos), um arquivo por domínio
src/main/               processo principal do Electron (janela, permissões, notificações, overlay, atualização)
src/preload/            ponte segura entre o processo principal e a página
src/renderer/src/       app React: telas em components/, estado (zustand) em store/, ações em lib/actions/
docs/                   documentação por área, decisões (ADRs) e roadmap
```

O mapa completo dos arquivos e as regras do projeto estão em [`AGENTS.md`](AGENTS.md). A documentação de cada área
fica em [`docs/areas/`](docs/areas/), as decisões em [`docs/decisions/`](docs/decisions/) e o plano em
[`docs/ROADMAP.md`](docs/ROADMAP.md).
