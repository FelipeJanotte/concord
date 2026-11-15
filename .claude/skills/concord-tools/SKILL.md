---
name: concord-tools
description: Como funcionam as ferramentas do grupo do Concord (v4) — sorteio no servidor com crypto.randomInt, resultado postado como mensagem kind 'tool' (Message.tool tipado + content por extenso), o sorteador de times (A8: validação, Fisher–Yates, times equilibrados, lanes sem repetir com preferências), dado, moeda e sortear 1 nome, e os eventos tools:teams/dice/coin/pick. Use ao mexer em server/modules/tools.ts, server/tools/**, src/shared/types/tools.ts, no kind/tool de src/shared/types/message.ts e server/db/schema/messages.ts, na barra de úteis/painel/cartão do resultado (B7/B10), ao criar uma ferramenta nova, ou ao investigar sorteio recusado, "Muitos sorteios seguidos" ou resultado diferente entre telas.
---

# Ferramentas do grupo (v4: A8 servidor do sorteador; B10 painel e cartão; a barra de úteis é da B7)

## Ideia

O sorteio roda **no servidor** (`crypto.randomInt`) e o resultado vira uma **mensagem do canal** com
`kind: 'tool'` e `tool` tipado. Todos que veem o canal recebem o mesmo resultado pelo `message:new` de sempre, e
ninguém consegue "rolar de novo escondido". A mensagem também traz `content` com o resultado por extenso
(`toolResultText`), então uma tela que ainda não desenha o cartão mostra texto legível.

O app **não consegue** criar mensagem de ferramenta pelo `message:send`: o servidor monta a mensagem e ignora
`kind`/`tool` que venham do app.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/tools.ts` | Contrato: times (`LANES`, `LANE_LABELS`, `TeamsRequest`...), dado (`DiceRequest`/`DiceResult`), moeda (`CoinRequest`/`CoinResult`), sortear 1 (`PickRequest`/`PickResult`), limites, `ToolPayload` (união por ferramenta), `ToolResult`, textos por extenso (`teamsResultText`, `diceResultText`, `coinResultText`, `pickResultText`, `toolResultText`), eventos `tools:*`. |
| `src/shared/types/message.ts` | `MessageKind`, `Message.kind?` (ausente = `text`) e `Message.tool?`. |
| `server/tools/teams.ts` | Funções puras: `validateTeams`, `shuffle` (Fisher–Yates), `drawTeams` (acaso injetado: `Rand`). |
| `server/tools/random.ts` | Funções puras: `validateDice`/`rollDice`, `validateCoin`/`flipCoins`, `validatePick`/`pickOne`. |
| `server/modules/tools.ts` | Registro `TOOLS` (evento → validar + sortear) e `runTool`, o fluxo único de todas: canal, `send`, valida (antes do limite), limita, sorteia com `crypto.randomInt`, grava e emite. |
| `src/renderer/src/lib/actions/tools.ts` | Ações do app: `drawTeams`, `rollDice(channelId, sides, count?)`, `flipCoin(channelId, count?)`, `pickOne(channelId, opções ou texto com uma por linha)`. |
| `server/db/schema/messages.ts` | Colunas `kind` e `tool` (jsonb), com checks: `kind` conhecido e `tool` preenchido **só e sempre** em `kind = 'tool'` (migration `0007_tools`). |
| `server/repo/messages.ts` | Grava `kind`/`tool`; na leitura, só põe os campos em mensagens de ferramenta (mensagem de texto continua igual). |

## Eventos

| Evento | Pedido | Regras e resultado |
|---|---|---|
| `tools:teams` | `{ channelId, players: [{ name, lanes? }], teamCount, lanes? }` | ver abaixo |
| `tools:dice` | `{ channelId, sides, count }` | 2–100 lados, 1–10 dados → `{ sides, rolls, total }` |
| `tools:coin` | `{ channelId, count }` | 1–10 moedas → `{ flips: ('cara' \| 'coroa')[] }` |
| `tools:pick` | `{ channelId, options }` | 2–50 opções de até 100 caracteres, sem repetir (sem diferenciar maiúsculas); linhas vazias ignoradas → `{ options, picked }` |

Todas respondem `ToolResult` (`{ ok, message }` ou `{ ok: false, error }`), seguem as mesmas regras de canal abaixo e
dividem o mesmo limite (`LIMITS.tool`). Pedido inválido devolve o erro de validação **sem gastar** o limite.

## Regras comuns e `tools:teams`

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

1. Tipo na união `ToolPayload` + request/result em `tools.ts` + evento `tools:<nome>` + o texto em `toolResultText`.
2. Funções puras (validar e sortear) em `server/tools/` com `Rand` injetado e testes com semente.
3. Uma entrada em `TOOLS` (`server/modules/tools.ts`): `run(req, rand)` devolve o erro (texto) ou o `ToolPayload`.
   O `runTool` cuida do resto (canal, `send`, limite, `insertMessage` com `kind: 'tool'`, `emitToViewers`).
4. Ação em `lib/actions/tools.ts`. Na tela: entrada no registro da barra de úteis (B7) + painel + cartão (B10).

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tools/teams.test.ts` | Validação (todas as mensagens), Fisher–Yates sem viés, equilíbrio com número ímpar, time maior sorteado, lanes sem repetir e em ordem, preferências (1ª vence 2ª, dois "só meio" em times diferentes), `crypto.randomInt`. |
| `server/tools/random.test.ts` | Validação e sorteio do dado, moeda e sortear 1 (valores sempre na faixa com o acaso de verdade). |
| `src/shared/types/tools.test.ts` | Texto por extenso de cada ferramenta e o corte em `MESSAGE_MAX_LENGTH`. |
| `server/tests/tools.test.ts` | Servidor real: mesma mensagem para todos + histórico (times e dado), moeda e sortear 1, erros sem postar, canal de voz/privado/sem `send`, conversa privada, `message:send` não forja ferramenta. |
| `server/tests/limits.test.ts` | `LIMITS.tool` com os limites reais, compartilhado entre ferramentas; pedido inválido não conta. |
| `src/renderer/src/lib/actions/tools.test.ts` | Ações do app (`drawTeams`, `rollDice`, `flipCoin`, `pickOne`): parâmetros, padrões e erro. |

## Pendente

- Barra de úteis e registro de ferramentas (B7), painéis e cartões do resultado (B10). As ações do app já existem
  (`lib/actions/tools.ts`, lançam `Error` com a mensagem do servidor). O cartão lê `message.tool` quando
  `message.kind === 'tool'` e escolhe pelo `message.tool.tool`.
- Próximas ferramentas: enquete (votos guardados no banco) e mover times para salas de voz.
