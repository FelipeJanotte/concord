---
name: concord-deploy
description: Como hospedar o servidor do Concord pela internet (A14) e, opcionalmente, publicar a tela do app como site na Vercel (vercel.json, VITE_DEFAULT_SERVER) — imagem Docker do servidor (Dockerfile), docker-compose.prod.yml com servidor + PostgreSQL (usuário de privilégio mínimo e backup diário) + LiveKit com TURN + Caddy (HTTPS automático), variáveis do .env de produção e o guia deploy/README.md. Use ao mexer em Dockerfile, .dockerignore, docker-compose.prod.yml, deploy/** (Caddyfile, livekit.yaml, .env.example, postgres/02-app-role.sh), ao adicionar uma variável de ambiente nova ao servidor, ou ao investigar certificado que não sai, voz que não conecta fora da rede local ou "defina ... no .env".
---

A documentação desta área fica em **`docs/areas/deploy.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
