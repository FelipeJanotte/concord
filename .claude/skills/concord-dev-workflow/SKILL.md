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
| `npm run typecheck` | `tsc` em `tsconfig.node.json` (main, preload, server, shared) e `tsconfig.web.json` (renderer), testes incluídos |
| `npm test` | vitest uma vez (`vitest run`). **Obrigatório passar por completo antes de dar uma tarefa por concluída.** |
| `npm run test:watch` | vitest em modo watch; `npx vitest run server/tests/auth.test.ts` roda um arquivo só |
| `npm run build` | typecheck + bundle em `out/` |
| `npm start` | abre o build de `out/` |
| `npm run dist` | build + instalador NSIS em `dist/` (config em `electron-builder.yml`) |

Variáveis do servidor: `PORT`, `DATA_DIR` (padrão `server/data`, que está no `.gitignore`), `DATABASE_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `UPLOAD_ORPHAN_TTL_MS` (anexo solto é apagado depois disso; padrão 1 h)
e `UPLOAD_SWEEP_INTERVAL_MS` (intervalo da limpeza; padrão 10 min). O servidor lê `server/.env` sozinho ao iniciar (`server/env.ts`); o modelo está em
`server/.env.example` e o `server/.env` está no `.gitignore`.

## Banco de dados (PostgreSQL + Drizzle)

- **Com `DATABASE_URL`** (no `server/.env`): usa o Postgres do `docker compose` (ou de produção).
- **Sem `DATABASE_URL`**: usa o **PGlite** (o Postgres compilado em WebAssembly, dentro do Node) em
  `DATA_DIR/pgdata`. Nada para instalar. O PGlite aceita **um processo por vez**: não rode dois servidores, nem o
  `db:import-json`, sobre o mesmo `pgdata`.
- O log de inicialização mostra `Banco: PostgreSQL ...` ou `Banco: PGlite em ...`.
- As migrations (`server/db/migrations/`) são aplicadas sozinhas ao iniciar.
- **Banco vazio:** se existir `DATA_DIR/db.json` (versões antigas), ele é importado automaticamente (contas, sessões
  válidas, canais, mensagens; quem estava logado continua logado). Senão, cria os canais padrão. Para importar à mão:
  `npm run db:import-json [arquivo]` (idempotente).

**Mudar o schema:** edite `server/db/schema/<dominio>.ts` → `npm run db:generate` → confira o SQL gerado em
`server/db/migrations/` → commit junto. Gere a migration **só depois do rebase na `main`** (se o outro dev mergeou
uma migration antes, apague a sua e gere de novo) e nunca edite uma migration já mergeada.

**Backup:**
- PGlite: o próprio servidor grava `DATA_DIR/backups/concord-<data>.tar.gz` quando o último backup tem mais de
  `BACKUP_INTERVAL_MS` (padrão 24 h) e mantém `BACKUP_KEEP` (padrão 7). Reiniciar não gera backup extra.
  Restaurar (servidor **parado**): `npm run db:restore [arquivo]` (sem arquivo = o mais novo); o banco atual vira
  `pgdata.antes-<data>`.
- Postgres: serviço `pg-backup` do compose (`pg_dump` diário em `server/data/backups-pg`, mantém 7). Restaurar:
  `gunzip -c <arquivo>.sql.gz | psql "$DATABASE_URL"`.

**Privilégio mínimo (produção):** `DATABASE_URL` com o usuário `concord_app` (só lê/grava dados, criado por
`docker/postgres/init/02-app-role.sql`) e `DATABASE_MIGRATE_URL` com o dono (`concord`), usada só para as
migrations. Volume já existente: rode o `.sql` uma vez com `psql`.

**Limite de requisições:** regras em `LIMITS` (`server/middleware/rate-limit.ts`), em memória. Ações com ack
recebem o erro ("Tente de novo em N s."); `message:send` gera `rate:limited`; HTTP responde 429 com
`Retry-After`. Atrás de proxy, `TRUST_PROXY=1` para usar o `X-Forwarded-For`. Nos testes, o `TestServer` sobe com
`RATE_LIMIT_MULTIPLIER=1000`; `server/tests/limits.test.ts` usa `1` para testar os valores reais.

**Zerar tudo** (canais, mensagens, **contas e sessões**), com o servidor parado:
- PGlite: apague `server/data/pgdata/` (e `server/data/avatars/` e `server/data/uploads/`). Se `server/data/db.json` ainda existir, ele será
  importado de novo; apague-o também para começar vazio.
- Docker: `docker compose down -v && docker compose up -d`.

Ele recria os canais padrão (`geral`, `off-topic`, `Sala de Voz`, `Jogos`). As sessões salvas nos apps deixam de
valer e eles voltam para o login.

## Infra local (Docker)

Postgres e LiveKit rodam em containers definidos em `docker-compose.yml` (precisa do Docker Desktop no Windows).

```bash
docker compose up -d     # sobe postgres (5432) + livekit (7880, 7881/tcp, 7882/udp)
docker compose ps        # os dois devem aparecer "running" (postgres "healthy")
docker compose logs -f livekit
docker compose down      # para; o banco fica no volume concord_pgdata
docker compose down -v   # para e APAGA o banco (recria concord_test na próxima subida)
```

| Arquivo | Para quê |
|---|---|
| `docker-compose.yml` | serviços `postgres` (17-alpine, usuário/senha/banco `concord`) e `livekit` (versão fixa) |
| `docker/postgres/init/*.sql` | roda só na criação do volume; cria o banco `concord_test` dos testes |
| `livekit.yaml` | portas, chave `concord-dev` e segredo de dev, `empty_timeout` das salas |
| `server/.env.example` | `DATABASE_URL`, `DATABASE_URL_TEST`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (mesmos valores do compose) |

- Copie `server/.env.example` para `server/.env` (ou acrescente as linhas novas ao seu `.env`).
- **Voz pela rede local:** o LiveKit anuncia o IP de `LIVEKIT_NODE_IP` (padrão `127.0.0.1`, só funciona na mesma
  máquina). Crie um `.env` na raiz com `LIVEKIT_NODE_IP=192.168.x.x`, rode `docker compose up -d` de novo, troque
  `LIVEKIT_URL` no `server/.env` para `ws://192.168.x.x:7880` e libere 7880–7881/TCP e 7882/UDP no firewall.
- O servidor usa o Postgres do compose quando `DATABASE_URL` está no `server/.env`; sem ela, usa o PGlite (o
  compose pode ficar desligado para texto e contas).
- **A voz precisa do LiveKit rodando** (`docker compose up -d` + `LIVEKIT_*` em `server/.env`). Sem ele, o servidor
  mostra `Voz (LiveKit): desativada` ou o app avisa "Não foi possível conectar ao servidor de voz"; texto e contas
  funcionam normalmente.

## Testes (vitest)

- `vitest.config.ts` na raiz: testes `*.test.ts(x)` ao lado do código em `server/`, `src/shared/` e `src/renderer/src/`;
  aliases `@` e `@shared` iguais aos do renderer; ambiente `node`; carrega `server/.env` antes (via `server/env.ts`).
- Importe explicitamente: `import { describe, it, expect } from 'vitest'` (sem globals).
- Teste de banco usa `DATABASE_URL_TEST` (banco `concord_test`), nunca `DATABASE_URL`: cada arquivo de teste cria
  e apaga um banco temporário a partir dela (`server/tests/database.ts`). Sem `DATABASE_URL_TEST`, os testes usam
  PGlite (em memória nos testes do repo; dentro do DATA_DIR temporário nos de integração). Rode a suíte **nos dois
  modos** antes de mergear mudança de banco quando puder (com e sem o compose ligado).
- Testes do repo (`server/repo/repo.test.ts`) abrem o banco no próprio processo com `openTestDatabase()`.
- Teste que precisa de DOM: `// @vitest-environment jsdom` no topo do arquivo (jsdom e Testing Library já estão
  instalados). Sem globals, chame `cleanup()` no `afterEach`. Exemplo: `components/chat/chat.test.tsx`.
  `URL.createObjectURL` não existe no jsdom: troque por `vi.fn()` no teste.
- **Integração do servidor** em `server/tests/<dominio>.test.ts`: `TestServer.start()` (`server/tests/helpers.ts`)
  sobe o servidor real (`node --import tsx server/index.ts`) em porta livre e DATA_DIR temporário, sem tocar em
  `server/data`; `server.newUser()`, `waitFor(socket, 'evento', filtro)`, `expectNoEvent(...)` e `server.restart()`.
- **Ações do app**: `src/renderer/src/lib/actions/*.test.ts` com `FakeSocket` (`src/renderer/src/test/fake-socket.ts`).
- Toda tarefa traz testes; só está pronta com `npm run typecheck && npm test` 100% verdes.
- Prazos: `testTimeout` 15 s, `hookTimeout` 60 s, o boot do `TestServer` até 45 s (`server/tests/helpers.ts`) e
  `maxWorkers: '50%'` (um worker por núcleo saturava a CPU: cada arquivo sobe um servidor). Com a
  suíte inteira em paralelo, dezenas de servidores sobem juntos (tsx + migrations no PGlite) e o boot passa de 20 s;
  sozinho leva 1–2 s. "Hook timed out" ou "servidor não respondeu" só na suíte completa = carga, não bug.

## CI no GitHub (A12)

`.github/workflows/ci.yml` roda em **todo PR** e em todo push na `main`: `npm ci`, `npm run typecheck` e `npm test`
(Ubuntu, Node 22, cache do npm). Um PR novo no mesmo branch cancela a execução anterior.

- **Sem Docker:** sem `DATABASE_URL`/`DATABASE_URL_TEST` os testes usam PGlite, e a voz usa o LiveKit falso
  (`server/tests/fake-livekit.ts`). Não há `server/.env` no CI (o `server/env.ts` só carrega se existir).
- `ELECTRON_SKIP_BINARY_DOWNLOAD=1`: o binário do Electron não é baixado (o processo principal é testado com
  Electron falso, `vi.mock('electron')`).
- O badge fica no topo do `README.md`. Para o PR vermelho **não** poder ser mergeado, o dono do repositório liga a
  proteção da `main` (Settings → Branches → exigir o check "typecheck e testes").
- **Falhou só no CI:** quase sempre diferença de sistema (o CI é Linux; o time usa Windows): caminho com `\`,
  letra maiúscula em nome de arquivo (o Linux diferencia) ou fim de linha. Ver o log em Actions → CI.
- Teste que depende de tempo e passou no Windows mas falhou no CI: a máquina do CI tem 2–4 núcleos; veja
  "Prazos" abaixo antes de aumentar timeout.

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
| `Error: Electron uninstall` | O binário do Electron não foi baixado (o script de instalação dele não rodou ou ainda não terminou). `node node_modules/electron/install.js`, ou apague `node_modules` e rode `npm install` de novo. No npm 11.20+ os install scripts ficam bloqueados por padrão (aviso `install-scripts ... not yet covered by allowScripts`): rode `npm install-scripts approve electron esbuild` e depois `npm rebuild`. |
| Tela de login diz que não conectou | O servidor não está rodando, o endereço está errado ou o firewall bloqueia. Teste abrindo o endereço no navegador: ele responde `{"name":"concord-server",...}`. |
| `EADDRINUSE :3001` | Outro servidor já está rodando. Feche o processo ou use outra porta (PowerShell: `$env:PORT=3002; npm run server`). |
| Microfone negado ou não encontrado | Confira as permissões de microfone do Windows para apps desktop. O main já libera `media` para o renderer. |
| Erro de CSP no console | A CSP está em `src/renderer/index.html`. `connect-src` libera `ws:`/`http:` e `img-src` libera `http:`/`https:` (fotos de perfil vêm do servidor). Ajuste ali se adicionar outros recursos externos. |
| "Sua sessão expirou" ou o app volta para o login sozinho | O token salvo não vale mais (venceu em 30 dias, foi revogado ou o `db.json` foi apagado). Entre de novo. |
| Botão "Entrar com Google" desativado | `server/.env` sem `GOOGLE_CLIENT_ID`, ou o app aponta para outro servidor. Reinicie o servidor depois de editar o `.env`. |
| "O Google recusou o login" | Client id/secret errados ou o cliente OAuth não é do tipo "App para computador". O motivo exato aparece no log do servidor (`[google] troca de código falhou`). |
| Foto de perfil não aparece | Confira se `GET <servidor>/avatars/<accountId>` responde 200 e se a CSP libera `img-src` para o endereço do servidor. |
| `docker: command not found` | Instale o Docker Desktop (WSL 2) e abra-o uma vez antes de usar `docker compose`. |
| `port is already allocated` (5432/7880) | Outro Postgres/LiveKit já usa a porta. Pare o serviço local ou mude o lado esquerdo do mapeamento no `docker-compose.yml`. |
| Voz LiveKit conecta mas não passa áudio | ICE não fecha: confira `LIVEKIT_NODE_IP` (IP alcançável pelo cliente) e a porta 7882/UDP no firewall; `docker compose logs livekit` mostra os candidatos. |
| Banco `concord_test` não existe | O volume foi criado antes do script de init. `docker compose down -v && docker compose up -d` (apaga o banco de dev). |
| Mudou `src/shared/types.ts` e o servidor não percebeu | O `tsx watch` acompanha os imports, mas reinicie o `npm run server` se precisar. |

## Notas de configuração

- `electron.vite.config.ts`: aliases `@` e `@shared` só no renderer; plugins `react()` e `tailwindcss()` (Tailwind v4, sem `tailwind.config`).
- `components.json`: shadcn new-york, CSS em `src/renderer/src/assets/globals.css`, ícones lucide.
- `tsconfig.json` (raiz) só tem `references` + `paths` (para o editor e o CLI do shadcn). Os de verdade são `tsconfig.node.json` e `tsconfig.web.json`.
- A maioria das dependências fica em `devDependencies` de propósito: o Vite empacota o renderer e o electron-builder só leva `dependencies` (`@electron-toolkit/utils`).
