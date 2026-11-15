---
name: concord-deploy
description: Como hospedar o servidor do Concord pela internet (A14) — imagem Docker do servidor (Dockerfile), docker-compose.prod.yml com servidor + PostgreSQL (usuário de privilégio mínimo e backup diário) + LiveKit com TURN + Caddy (HTTPS automático), variáveis do .env de produção e o guia deploy/README.md. Use ao mexer em Dockerfile, .dockerignore, docker-compose.prod.yml, deploy/** (Caddyfile, livekit.yaml, .env.example, postgres/02-app-role.sh), ao adicionar uma variável de ambiente nova ao servidor, ou ao investigar certificado que não sai, voz que não conecta fora da rede local ou "defina ... no .env".
---

# Hospedagem pela internet (A14)

Até a v5 a voz só funcionava na rede local (o LiveKit anunciava o IP da máquina e não havia TURN). Com isto,
uma VPS com Docker e um domínio bastam para o grupo usar de qualquer lugar.

## Peças

| Arquivo | Papel |
|---|---|
| `Dockerfile` | Imagem só do servidor: `node:22-alpine`, `npm ci` (com dev: o servidor roda com `tsx`), copia `server/` e `src/shared/`, usuário `node`, volume `/data`, healthcheck em `/`, `CMD npx tsx server/index.ts`. |
| `.dockerignore` | Fora: `node_modules`, `server/.env`, `server/data`, testes, `src/renderer`/`main`/`preload`, `.git`... |
| `docker-compose.prod.yml` | `server` (atrás do Caddy, `TRUST_PROXY=1`, `DATABASE_URL` = `concord_app`, `DATABASE_MIGRATE_URL` = dono, `LIVEKIT_URL=wss://LIVEKIT_DOMAIN`, `LIVEKIT_API_URL=http://livekit:7880`), `postgres` (não exposto), `pg-backup` (diário, 7 no volume `pg-backups`), `livekit` (`LIVEKIT_KEYS` do `.env`, portas 7881/tcp, 7882/udp, 3478/udp) e `caddy` (80/443). Variáveis obrigatórias com `${X:?defina X no .env}`. |
| `deploy/livekit.yaml` | LiveKit de produção: `use_external_ip: true` (IP público), TCP 7881 + UDP 7882, **TURN** em 3478/udp; sem chave no arquivo (vem do `LIVEKIT_KEYS`). Mesma versão do LiveKit do `docker-compose.yml` de dev. |
| `deploy/Caddyfile` | HTTPS automático: `CONCORD_DOMAIN` → `server:3001` (HTTP + WebSocket), `LIVEKIT_DOMAIN` → `livekit:7880`. |
| `deploy/postgres/02-app-role.sh` | Cria `concord_app` com a senha de `APP_DB_PASSWORD` (privilégio mínimo; o `docker/postgres/init/02-app-role.sql` de dev tem senha fixa). |
| `deploy/.env.example` | Domínios, senhas, `FILES_SIGNING_SECRET`, chave/segredo do LiveKit (≥ 32 caracteres), Google opcional. Vai em `.env` na raiz (ignorado pelo git). |
| `deploy/README.md` | Guia passo a passo para quem vai hospedar, dia a dia (logs, atualizar, backup/restaurar) e problemas comuns. |

## Regras

- **Variável nova no servidor:** se for usada em produção, acrescente no `server` do compose (e no
  `deploy/.env.example` se vier do `.env`). O teste `server/deploy.test.ts` falha se o compose ler uma variável
  que o exemplo não tem.
- Nada de porta do Postgres exposta; publicadas só 80, 443, 7881, 7882/udp e 3478/udp (o teste confere).
- Ao subir a versão do LiveKit, troque nos dois compose (o teste confere que são iguais).
- O app aponta para `https://CONCORD_DOMAIN`; o servidor entrega ao app o `wss://LIVEKIT_DOMAIN` no `voice:join`.

## Testes

`server/deploy.test.ts`: serviços do compose, toda variável do compose no `.env` de exemplo, obrigatórias com
mensagem, portas publicadas, `TRUST_PROXY` e usuários do banco, versão do LiveKit igual à de dev, o servidor aceita
os endereços do LiveKit do compose (`readLiveKitConfig`), portas e TURN do `livekit.yaml`, rotas do Caddy, o que a
imagem copia e ignora, script do `concord_app`. Não sobe Docker: subir de verdade é o passo a passo do
`deploy/README.md` numa VPS.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Certificado não sai | DNS não aponta para a máquina ou 80/443 fechadas (`logs caddy`). |
| Voz conecta mas sem áudio | Portas de mídia fechadas (7881/tcp, 7882/udp, 3478/udp) ou o provedor bloqueia UDP (o TCP 7881 é o plano B). `logs livekit`. |
| Servidor reinicia em loop | Falta variável (`logs server`) ou o Postgres ainda não ficou `healthy`. |
| Pendente | TURN com TLS na 443 (redes que só deixam HTTPS passar), imagem publicada no registry pelo CI e backup para fora da máquina (S3/R2). |
