# 0014 — Servidor em Rust (sai o Node)

- **Data:** 2026-11-19
- **Situação:** aceita (direção); as escolhas abertas abaixo viram ADRs próprios antes do código da fase 2

## Contexto

Depois do app (ADR 0013), o produto quer o servidor também sem Node: Rust roda mais leve em qualquer máquina que
hospede a comunidade. O servidor hoje tem cerca de 18,5 mil linhas de TypeScript e 56 arquivos de teste de
integração (`server/tests/`), Socket.IO, Drizzle sobre Postgres ou PGlite, LiveKit (token e bot de música com
`@livekit/rtc-node`) e `yt-dlp`/`ffmpeg` como programas externos.

## Decisão

O servidor do Concord é reescrito em Rust na **fase 2**, depois da fase 1 (app) estar na `main`. O LiveKit
(binário em Go), o Postgres e o `yt-dlp`/`ffmpeg` continuam como estão: não são código nosso.

Restrições que a fase 2 já herda:

| Restrição | Por quê |
|---|---|
| O protocolo com a tela não muda | A tela continua a mesma; troca de servidor não pode exigir troca de cliente. |
| Os testes de integração viram a especificação | Cada `server/tests/<dominio>.test.ts` é portado antes do domínio, e a versão Rust só entra quando passa nos mesmos cenários. |
| Migração por domínio, não big-bang | Cada domínio troca com testes verdes; nada de meses num ramo paralelo. |

**Em aberto (cada um vira ADR antes do código):** Socket.IO em Rust (`socketioxide`) ou protocolo novo; banco
(Postgres sempre, ou SQLite no lugar do PGlite para quem hospeda sem Docker); de onde nasce o contrato
`src/shared/types` quando o servidor não for mais TS; o bot de música no SDK Rust do LiveKit.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Manter o servidor em Node | O produto quer Node fora de tudo. |
| Migrar app e servidor juntos | Dobra o risco num PR só; o app entrega o ganho que a pessoa sente primeiro. |

## Consequências

- Na fase 1 o servidor continua Node e recebe só o que a tela nativa precisa (token de `<accountId>:screen`).
- Até a fase 2, o Node segue nas dependências do repositório (servidor e ferramentas de build da tela).
