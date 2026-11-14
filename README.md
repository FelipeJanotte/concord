# Concord

App de chat estilo Discord, feito com **Electron + React + TypeScript + Tailwind v4 + shadcn/ui**.

- Canais de **texto** com histórico, agrupamento de mensagens, indicador de "digitando..." e marcador de não lidas
- Canais de **voz** com WebRTC: entrar/sair, silenciar, desativar áudio e anel verde em quem está falando
- Criar e excluir canais (texto ou voz) em tempo real para todos
- Lista de membros online e quem está em cada sala de voz

## Como rodar

Requer Node.js 20+.

```bash
npm install

# servidor + app juntos, num terminal só
npm run dev:all
```

Ou separado, em dois terminais: `npm run server` e `npm run dev`.

Na tela inicial, escolha um nome e use `http://localhost:3001` como servidor.

### Testar com mais de um usuário

- **Na mesma máquina:** deixe o `npm run dev:all` rodando e abra mais janelas com `npx electron .`
  em outro terminal (rode `npm run build` uma vez antes).
- **Na rede local:** o servidor mostra o IP da rede ao iniciar (ex.: `http://192.168.0.10:3001`).
  Os outros computadores usam esse endereço na tela de login. Libere a porta 3001 no firewall do Windows.
- **Pela internet:** hospede o servidor (Railway, Render, VPS...) e, para a voz funcionar entre redes
  diferentes, configure um servidor TURN em `src/renderer/src/lib/voice.ts` (ex.: coturn).

### Gerar instalador para Windows

```bash
npm run dist
```

O instalador sai na pasta `dist/`.

## Estrutura

```
server/index.ts               monta HTTP + Socket.IO e registra os módulos
server/modules/               um módulo por domínio (contas, canais, mensagens, voz, presença)
server/repo/                  acesso a dados
server/db/                    PostgreSQL + Drizzle (schema, migrations; PGlite embutido sem DATABASE_URL)
src/shared/types/             tipos e eventos compartilhados entre app e servidor, um arquivo por domínio
src/main/index.ts             processo principal do Electron (janela, permissão de microfone)
src/preload/index.ts          ponte segura main ↔ renderer
src/renderer/src/
  App.tsx                     layout principal
  store/                      estado global (zustand), um slice por domínio
  lib/client.ts               login, conexão e reexporta as ações
  lib/actions/                ações por domínio (enviar mensagem, criar canal, entrar na voz...)
  lib/voice.ts                voz via LiveKit (livekit-client) + quem está falando
  components/ui/              componentes shadcn/ui (button, dialog, input, tooltip...)
  components/                 telas e partes do app
```

Para adicionar mais componentes shadcn: `npx shadcn@latest add dropdown-menu` (o `components.json` já está configurado).

## Como funciona a voz

O áudio passa pelo [LiveKit](https://livekit.io), um SFU open source que roda localmente com `docker compose up -d`.
Ao entrar numa sala, o servidor do Concord confere o canal e devolve um token de acesso só para aquela sala; o app
conecta no LiveKit com esse token. Cada pessoa tem uma conexão só, então salas grandes funcionam. Detalhes na skill
`concord-voice`.

## Próximos passos sugeridos

- Contas com senha (hoje o usuário é só um nome por conexão)
- Vários servidores/comunidades na barra da esquerda
- Mensagens diretas, edição/remoção de mensagens, anexos e emojis
- Compartilhamento de tela (WebRTC `getDisplayMedia`)
