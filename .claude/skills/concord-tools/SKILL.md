---
name: concord-tools
description: Como funcionam as ferramentas do grupo do Concord (v4) — sorteio no servidor com crypto.randomInt, resultado postado como mensagem kind 'tool' (Message.tool tipado + content por extenso), o sorteador de times (A8: validação, Fisher–Yates, times equilibrados, lanes sem repetir com preferências) e o evento tools:teams. Use ao mexer em server/modules/tools.ts, server/tools/**, src/shared/types/tools.ts, no kind/tool de src/shared/types/message.ts e server/db/schema/messages.ts, na barra de úteis/painel/cartão do resultado (B7/B10), ao criar uma ferramenta nova, ou ao investigar sorteio recusado, "Muitos sorteios seguidos" ou resultado diferente entre telas.
---

# Ferramentas do grupo (v4: A8 servidor do sorteador; B10 painel e cartão; a barra de úteis é da B7)

## Ideia

O sorteio roda **no servidor** (`crypto.randomInt`) e o resultado vira uma **mensagem do canal** com
`kind: 'tool'` e `tool` tipado. Todos que veem o canal recebem o mesmo resultado pelo `message:new` de sempre, e
ninguém consegue "rolar de novo escondido". A mensagem também traz `content` com o resultado por extenso
(`teamsResultText`), então uma tela que ainda não desenha o cartão mostra texto legível.

O app **não consegue** criar mensagem de ferramenta pelo `message:send`: o servidor monta a mensagem e ignora
`kind`/`tool` que venham do app.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/tools.ts` | Contrato: `LANES`, `LANE_LABELS`, limites, `TeamPlayer`, `TeamsRequest`, `TeamsResult`, `ToolPayload` (união por ferramenta), `ToolResult`, `teamsResultText` (pura), evento `tools:teams`. |
| `src/shared/types/message.ts` | `MessageKind`, `Message.kind?` (ausente = `text`) e `Message.tool?`. |
| `server/tools/teams.ts` | Funções puras: `validateTeams`, `shuffle` (Fisher–Yates), `drawTeams` (acaso injetado: `Rand`). |
| `server/modules/tools.ts` | Evento `tools:teams`: confere canal e permissão, valida, limita, sorteia, grava e emite. |
| `server/db/schema/messages.ts` | Colunas `kind` e `tool` (jsonb), com checks: `kind` conhecido e `tool` preenchido **só e sempre** em `kind = 'tool'` (migration `0007_tools`). |
| `server/repo/messages.ts` | Grava `kind`/`tool`; na leitura, só põe os campos em mensagens de ferramenta (mensagem de texto continua igual). |

## `tools:teams`

`{ channelId, players: [{ name, lanes? }], teamCount, lanes? }` → `ToolResult` (`{ ok, message }` ou `{ ok: false, error }`).

- **Canal:** texto ou conversa privada (`dm`). Voz, inexistente ou sem `view` → "Canal não encontrado"; sem `send` →
  "Você não pode enviar mensagens neste canal".
- **Validação** (`validateTeams`): 2–50 pessoas; nome 1–32 (espaços normalizados), sem repetir (sem diferenciar
  maiúsculas); 2–10 times e não mais times que pessoas; lanes da lista `LANES`, sem repetir; com `lanes`, times de no
  máximo 5 (`players ≤ teamCount × 5`). Preferências só valem com `lanes`.
- **Limite:** `LIMITS.tool` (5 seguidos, depois 1 a cada 3 s) → "Muitos sorteios seguidos. Tente de novo em N s."

## Sorteio (`drawTeams`)

1. Embaralha (Fisher–Yates) e distribui em rodízio: tamanhos diferem em no máximo 1. A ordem dos times também é
   sorteada (senão o time 1 seria sempre o maior).
2. Com lanes: em cada time testa todas as formas de dar lanes diferentes (até 120) e fica com a de mais pontos
   (1ª preferência = 5, 2ª = 4...; empate = sorteio). Membros vêm na ordem de `LANES`.
3. Se alguém tem preferência, repete o sorteio `LANE_ATTEMPTS` (40) vezes e fica o que atende melhor (ex.: dois que
   só jogam de meio caem em times diferentes).

## Ferramenta nova

1. Tipo na união `ToolPayload` + request/result em `tools.ts` + evento `tools:<nome>`.
2. Função pura em `server/tools/<nome>.ts` com `Rand` injetado e testes com semente.
3. Handler em `server/modules/tools.ts` (mesmo molde: canal, `send`, validar, limite, `insertMessage` com
   `kind: 'tool'`, `emitToViewers`). Na tela: entrada no registro da barra de úteis (B7) + painel + cartão (B10).

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tools/teams.test.ts` | Validação (todas as mensagens), Fisher–Yates sem viés, equilíbrio com número ímpar, time maior sorteado, lanes sem repetir e em ordem, preferências (1ª vence 2ª, dois "só meio" em times diferentes), `crypto.randomInt`. |
| `src/shared/types/tools.test.ts` | `teamsResultText` e o corte em `MESSAGE_MAX_LENGTH`. |
| `server/tests/tools.test.ts` | Servidor real: mesma mensagem para todos + histórico, erros sem postar, canal de voz/privado/sem `send`, conversa privada, `message:send` não forja ferramenta. |
| `server/tests/limits.test.ts` | `LIMITS.tool` com os limites reais. |

## Pendente

- Barra de úteis e registro de ferramentas (B7), painel do sorteador e cartão do resultado (B10).
- Próximas ferramentas (enquete, dado/moeda, sorteio de 1 nome, mover times para salas de voz).
