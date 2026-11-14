---
name: concord-dev-workflow
description: Como rodar, testar, gerar o build e empacotar o Concord, e como resolver os problemas já conhecidos (Electron não instalado, porta, firewall, microfone). Use ao configurar o ambiente, rodar o app, testar com vários usuários ou diagnosticar erros de inicialização.
---

# Fluxo de desenvolvimento

## Ambiente

- Windows (o repositório fica em `D:\Repos\concord`), Node.js 20+, **npm**.
- **Não use pnpm.** Ele foi testado e removido de propósito. Se aparecerem `pnpm-lock.yaml` ou `pnpm-workspace.yaml`, apague os dois e rode `npm install`.

## Scripts (`package.json`)

| Script | O que faz |
|---|---|
| `npm run dev:all` | servidor + app juntos (`concurrently`, prefixos `server`/`app`; `-k` encerra os dois juntos) |
| `npm run server` | servidor com recarregamento (`tsx watch server/index.ts`), porta `PORT` (padrão 3001) |
| `npm run server:start` | servidor sem watch (para produção) |
| `npm run dev` | electron-vite em modo dev (HMR no renderer, reinicia o Electron quando main/preload mudam) |
| `npm run typecheck` | `tsc` em `tsconfig.node.json` (main, preload, server, shared) e `tsconfig.web.json` (renderer) |
| `npm run build` | typecheck + bundle em `out/` |
| `npm start` | abre o build de `out/` |
| `npm run dist` | build + instalador NSIS em `dist/` (config em `electron-builder.yml`) |

Variáveis do servidor: `PORT`, `DATA_DIR` (padrão `server/data`, que está no `.gitignore`), `GOOGLE_CLIENT_ID` e
`GOOGLE_CLIENT_SECRET`. O servidor lê `server/.env` sozinho ao iniciar (`server/env.ts`); o modelo está em
`server/.env.example` e o `server/.env` está no `.gitignore`.

Para zerar tudo (canais, mensagens, **contas e sessões**): apague `server/data/db.json` e `server/data/avatars/` com
o servidor parado. Ele recria os canais padrão (`geral`, `off-topic`, `Sala de Voz`, `Jogos`). As sessões salvas nos
apps deixam de valer e eles voltam para o login.

## Contas no desenvolvimento

- Toda janela precisa de uma conta. Crie contas de teste pela aba "Criar conta" (e-mails como `alguem@exemplo.test`).
- A sessão fica no `localStorage` (`concord:token`). Para voltar ao login sem apagar a conta: "Minha conta" → "Sair da conta".
- **Login com Google:** precisa de um cliente OAuth do tipo "App para computador" no Google Cloud Console (gratuito),
  com as chaves em `server/.env`. Sem isso o botão aparece desativado. Ao iniciar, o servidor mostra
  `Login com Google: ativado/desativado`. Detalhes em `concord-accounts`.
- Para testar regras de conta sem sujar `server/data`, suba um servidor isolado:
  `DATA_DIR="$TMPDIR/concord-teste" PORT=3999 npx tsx server/index.ts` (Git Bash).
- O renderer também abre em `http://localhost:5173` num navegador comum durante o `npm run dev`; só o login com
  Google precisa do Electron (`window.api`).

## Testar com vários usuários

- **Mesma máquina:** `npm run dev:all` e, em outro terminal, `npx electron .` (rode `npm run build` uma vez antes) para cada janela extra. Use **contas diferentes** em cada janela (a mesma conta em duas janelas aparece uma vez só na lista de membros).
- **Rede local:** o servidor mostra `Rede: http://192.168.x.x:3001` ao iniciar. Os outros PCs usam esse endereço no login. Libere a porta no Windows Defender Firewall.
- **Internet:** hospede o servidor (precisa de WebSocket) e configure TURN para a voz (ver `concord-voice`).

## Problemas conhecidos

| Sintoma | Causa e solução |
|---|---|
| `Error: Electron uninstall` | O binário do Electron não foi baixado (o script de instalação dele não rodou ou ainda não terminou). `node node_modules/electron/install.js`, ou apague `node_modules` e rode `npm install` de novo. |
| Tela de login diz que não conectou | O servidor não está rodando, o endereço está errado ou o firewall bloqueia. Teste abrindo o endereço no navegador: ele responde `{"name":"concord-server",...}`. |
| `EADDRINUSE :3001` | Outro servidor já está rodando. Feche o processo ou use outra porta (PowerShell: `$env:PORT=3002; npm run server`). |
| Microfone negado ou não encontrado | Confira as permissões de microfone do Windows para apps desktop. O main já libera `media` para o renderer. |
| Erro de CSP no console | A CSP está em `src/renderer/index.html`. `connect-src` libera `ws:`/`http:` e `img-src` libera `http:`/`https:` (fotos de perfil vêm do servidor). Ajuste ali se adicionar outros recursos externos. |
| "Sua sessão expirou" ou o app volta para o login sozinho | O token salvo não vale mais (venceu em 30 dias, foi revogado ou o `db.json` foi apagado). Entre de novo. |
| Botão "Entrar com Google" desativado | `server/.env` sem `GOOGLE_CLIENT_ID`, ou o app aponta para outro servidor. Reinicie o servidor depois de editar o `.env`. |
| "O Google recusou o login" | Client id/secret errados ou o cliente OAuth não é do tipo "App para computador". O motivo exato aparece no log do servidor (`[google] troca de código falhou`). |
| Foto de perfil não aparece | Confira se `GET <servidor>/avatars/<accountId>` responde 200 e se a CSP libera `img-src` para o endereço do servidor. |
| Mudou `src/shared/types.ts` e o servidor não percebeu | O `tsx watch` acompanha os imports, mas reinicie o `npm run server` se precisar. |

## Notas de configuração

- `electron.vite.config.ts`: aliases `@` e `@shared` só no renderer; plugins `react()` e `tailwindcss()` (Tailwind v4, sem `tailwind.config`).
- `components.json`: shadcn new-york, CSS em `src/renderer/src/assets/globals.css`, ícones lucide.
- `tsconfig.json` (raiz) só tem `references` + `paths` (para o editor e o CLI do shadcn). Os de verdade são `tsconfig.node.json` e `tsconfig.web.json`.
- A maioria das dependências fica em `devDependencies` de propósito: o Vite empacota o renderer e o electron-builder só leva `dependencies` (`@electron-toolkit/utils`).
