# Ferramentas do grupo (v4: A8 servidor do sorteador; B10 painéis e cartões; a barra de úteis é da B7)

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
| `server/tools/move.ts` | Mover times (puras): `validateMoveRequest` (formato, salas diferentes) e `planMoves` (quem do sorteio é quem na voz: pela conta ou pelo nome/`nome#tag`). |
| `server/tools/random.ts` | Funções puras: `validateDice`/`rollDice`, `validateCoin`/`flipCoins`, `validatePick`/`pickOne`. |
| `server/modules/tools.ts` | Registro `TOOLS` (evento → validar + sortear) e `runTool`, o fluxo único de todas: canal, `send`, valida (antes do limite), limita, sorteia com `crypto.randomInt`, grava e emite. Também `moveTeams` (`tools:move-teams`). |
| `server/repo/messages.ts` (`findToolMessage`) | Canal e `tool` de uma mensagem de ferramenta (para achar o sorteio a mover). |
| `src/renderer/src/lib/actions/tools.ts` | Ações do app: `drawTeams` (leva o `accountId` de quem veio da voz/online), `moveTeams(messageId, channelIds)` e o listener `tools:moved`, `rollDice(channelId, sides, count?)`, `flipCoin(channelId, count?)`, `pickOne(channelId, opções ou texto com uma por linha)`. |
| `server/db/schema/messages.ts` | Colunas `kind` e `tool` (jsonb), com checks: `kind` conhecido e `tool` preenchido **só e sempre** em `kind = 'tool'` (migration `0007_tools`). |
| `server/repo/messages.ts` | Grava `kind`/`tool`; na leitura, só põe os campos em mensagens de ferramenta (mensagem de texto continua igual). |
| `server/tools/poll.ts` | Enquete (puras): `validatePoll`, `newPoll` (sem votos), `validateChoices` (voto). |
| `server/modules/polls.ts` | `poll:vote`, `poll:close`, `poll:mine` e o aviso `poll:updated` (criar é `tools:poll`, no `TOOLS`). |
| `server/repo/polls.ts` | `findPoll`, `setVote` (troca os votos da conta e recalcula, com a mensagem travada `for update`), `closePoll`, `votesOf`, `channelsOfMessages`. Grava contagens e texto em `messages.tool`/`content`. |
| `server/db/schema/polls.ts` | Tabela `poll_votes` (mensagem, conta, opção 0–9; cascade ao apagar mensagem, canal ou conta) — migration `0008_polls`. |
| `src/renderer/src/store/tools.ts` | `myPollVotes` (id da enquete → opções que eu marquei). |

## Eventos

| Evento | Pedido | Regras e resultado |
|---|---|---|
| `tools:teams` | `{ channelId, players: [{ name, lanes?, accountId? }], teamCount, lanes?, laneSet? }` | ver abaixo |
| `tools:dice` | `{ channelId, sides, count }` | 2–100 lados, 1–10 dados → `{ sides, rolls, total }` |
| `tools:coin` | `{ channelId, count }` | 1–10 moedas → `{ flips: ('cara' \| 'coroa')[] }` |
| `tools:pick` | `{ channelId, options }` | 2–50 opções de até 100 caracteres, sem repetir (sem diferenciar maiúsculas); linhas vazias ignoradas → `{ options, picked }` |

| `tools:poll` | `{ channelId, question, options, multiple? }` | pergunta 1–200, 2–10 opções de até 80, sem repetir → `PollResult { question, options, multiple, counts, voters, closed }` (começa sem votos) |

Todas respondem `ToolResult` (`{ ok, message }` ou `{ ok: false, error }`), seguem as mesmas regras de canal abaixo e
dividem o mesmo limite (`LIMITS.tool`). Pedido inválido devolve o erro de validação **sem gastar** o limite.

## Mover os times para salas de voz (`tools:move-teams`)

Depois do sorteio, leva cada time para uma sala de voz: `{ messageId, channelIds }`, com `channelIds[i]` = sala do
time `i` (na ordem de `result.teams`) ou `null` (o time fica onde está). Resposta `MoveTeamsResult`:
`{ ok: true, moved, skipped: [{ name, reason }] }` (textos dos motivos em `MOVE_TEAMS_SKIP_LABELS`) ou o erro.

**Como acha cada pessoa** (`planMoves`): entre as conexões que estão em salas de voz **da comunidade que quem pede
vê** (chamada privada não entra). Com `accountId` no resultado do sorteio (o painel manda quando importa da sala de
voz ou da lista de online: `TeamPlayer.accountId` → `TeamMember.accountId`), pela conta; sem, pelo nome ou por
`nome#tag`, sem diferenciar maiúsculas. Nome que bate com duas contas = `ambiguous` (não move ninguém errado); a
mesma conta duas vezes no sorteio = vale a primeira. Todas as conexões da conta que estão na voz vão juntas.

**Quem pode mover quem:** a si mesmo, sempre; os outros, pela regra de mover (`canMoveMember`: `moveMembers` ou `manageMembers`
e cargo acima; a dona move todos e não é movida) → senão `not-allowed`. A pessoa precisa de `view` + `connect` na
sala do time → senão `no-access`. Fora da voz → `not-in-voice`. Quem já está na sala do time não conta em `moved`
nem é pulado. Um pulado não cancela os outros.

**Erros do pedido** (nada é movido nem gasta limite): "Pedido inválido", "Escolha a sala de pelo menos um time",
"Escolha uma sala diferente para cada time", "Sorteio de times não encontrado" (não existe, não é de times ou é de
um canal que eu não vejo), "Escolha uma sala para cada time" (quantidade ≠ times), "Sala de voz não encontrada"
(não é voz ou eu não vejo). Pedido válido gasta `LIMITS.moderation` (o mesmo da moderação).

**Como move:** o servidor **não** troca ninguém de sala no LiveKit. Ele manda `tools:moved { channelId, by }` só
para cada conexão a mover; o app (`lib/actions/tools.ts`) avisa "<by> levou você para a sala do seu time." e chama
`joinVoice(channelId)`, que passa pelo `voice:join` de sempre (confere a permissão de novo, emite o token novo e
sai da sala antiga). Se a pessoa já saiu da voz ou já está na sala, o app ignora. Como o `joinVoice` abre a tela da
sala, quem é movido passa a ver a sala nova.

## Enquete: votar e encerrar (`modules/polls.ts`)

| Evento | Pedido | Resposta | Regras |
|---|---|---|---|
| `poll:vote` | `{ messageId, choices }` | `PollVoteResult` (`result`, `mine`) | ver o canal e `send`; aberta; índices válidos, sem repetir; voto único = no máximo 1; `[]` tira o voto; **substitui** o voto anterior; `LIMITS.vote` (20 seguidos, depois 2/s) |
| `poll:close` | `messageId` | `PollCloseResult` | quem criou ou `manageMessages`; não reabre |
| `poll:mine` | `messageIds[]` (até 100) | `Record<messageId, number[]>` | só enquetes de canais que a conta vê |
| `poll:updated` (servidor → app) | `{ messageId, channelId, result }` | — | depois de cada voto/encerramento, para quem vê o canal (`emitToViewers`) |

Votos são **anônimos**: todo mundo recebe só as contagens; cada pessoa sabe os próprios votos pelo `mine` (no voto)
ou pelo `poll:mine` (depois de abrir o histórico). Quem não vê o canal recebe "Enquete não encontrada" em tudo.
O histórico já traz as contagens atuais: cada voto grava o resultado em `messages.tool` e o texto em `content`.

No app (`lib/actions/tools.ts`): `createPoll(channelId, pergunta, opções, multiple?)`, `votePoll(channelId, messageId, choices)`,
`closePoll(channelId, messageId)` e `loadMyPollVotes(mensagens)` (guarda em `myPollVotes`, `[]` = não votei). O listener
`poll:updated` troca `tool` e `content` da mensagem já carregada.

## Regras comuns e `tools:teams`

- **Canal:** texto ou conversa privada (`dm`). Voz, inexistente ou sem `view` → "Canal não encontrado"; sem `send` →
  "Você não pode enviar mensagens neste canal".
- **Validação** (`validateTeams`): 2–50 pessoas; nome 1–32 (espaços normalizados), sem repetir (sem diferenciar
  maiúsculas); 2–10 times e não mais times que pessoas; lanes da lista `LANES`, sem repetir. **Lanes disponíveis** (`laneSet`, só com `lanes`; ausente = todas): não vazia
  ("Escolha pelo menos uma lane"), lanes conhecidas e sem repetir ("Lanes disponíveis inválidas"), guardada na ordem
  de `LANES`. Com `lanes`, cada time tem no máximo `laneSet.length` pessoas (`players ≤ teamCount × laneSet.length`,
  senão "Com N lanes, cada time pode ter no máximo N pessoas: aumente o número de times ou as lanes"). Preferências só
  valem com `lanes`, e a preferência por uma lane fora de `laneSet` é descartada. O resultado traz `laneSet` só quando
  foi um subconjunto (ex.: 3v3 com Topo, Meio e Atirador).
- **Limite:** `LIMITS.tool` (5 seguidos, depois 1 a cada 3 s) → "Muitos sorteios seguidos. Tente de novo em N s."

## Sorteio (`drawTeams`)

1. Embaralha (Fisher–Yates) e distribui em rodízio: tamanhos diferem em no máximo 1. A ordem dos times também é
   sorteada (senão o time 1 seria sempre o maior).
2. Com lanes: em cada time testa todas as formas de dar lanes diferentes **entre as de `laneSet`** (até 120) e fica com a de mais pontos
   (1ª preferência = 5, 2ª = 4...; empate = sorteio). Membros vêm na ordem de `LANES`.
3. Se alguém tem preferência, repete o sorteio `LANE_ATTEMPTS` (40) vezes e fica o que atende melhor (ex.: dois que
   só jogam de meio caem em times diferentes).

## Na tela (B10)

Cada ferramenta é uma linha em `TOOLS` (`components/tools/registry.ts`): ícone na barra de úteis e o painel que
abre na área central (`ToolView`, `docs/areas/home.md`). O resultado aparece no chat como **cartão**: o
`MessageBody` do `ChatView` troca o texto por `<ToolResultCard>` quando `message.kind === 'tool'`.

| Arquivo | Papel |
|---|---|
| `components/tools/registry.ts` | `TOOLS`: Sorteador de times (`teams`), Dado (`dice`), Cara ou coroa (`coin`), Sortear 1 (`pick`), Enquete (`poll`). |
| `components/tools/shared.tsx` | Peças dos painéis: `usePostTarget` (canais de texto com `send` + conversas privadas; sugere o canal de texto aberto na comunidade, senão a conversa aberta na Home, senão o primeiro), `ChannelSelect` ("Postar em"), `usePost` (enviando/erro/último resultado), `SubmitButton`, `ToolError`, `PostedNotice` ("Postado em #canal" + "Ver no chat"). |
| `components/tools/people.tsx` | `ImportPeopleButtons` ("Da minha sala de voz" / "Online"), `peopleInRoom`, `onlinePeople`: uma pessoa por conta, **com `accountId`**. |
| `components/tools/{TeamRandomizerPanel,DicePanel,CoinPanel,PickPanel,PollPanel}.tsx` | Os painéis. O botão vira "… de novo" depois do primeiro resultado (repete o mesmo pedido). |
| `components/tools/PostedResult.tsx` | Abaixo do painel: o aviso e o mesmo cartão do chat (lê a mensagem da store, então a enquete atualiza ao vivo). |
| `components/tools/ToolResultCard.tsx` | Escolhe o cartão por `message.tool.tool`; dado, moeda e sortear 1 ficam aqui. Ferramenta desconhecida mostra o `content`. |
| `components/tools/TeamResultCard.tsx` | Times com cor (`teamColor`: tokens `primary`, `success`, `destructive`, `accent-foreground`) e lanes; "Mover para as salas" (uma sala de voz por time ou "Não mover", salas repetidas bloqueiam) e o resumo com `MOVE_TEAMS_SKIP_LABELS`. |
| `components/tools/PollCard.tsx` | Opções com barra de porcentagem, marcadas por `myPollVotes`; voto único troca, vários soma/tira; "Encerrar" para quem criou ou `manageMessages` (fora de DM); encerrada não vota. |
| `components/tools/CardFrame.tsx` | Moldura dos cartões (`section` com `aria-label`). |

**Sorteador:** digitar (vários separados por vírgula), importar da sala/online, tirar, nº de times e "Sortear lanes". Com lanes ligadas, os botões "Lanes disponíveis" escolhem quais valem (todas ligadas
no começo; vai como `laneSet` só quando não são todas). Cada pessoa tem seus botões de lane (grupo "Lanes preferidas
de <nome>", só as disponíveis): cada clique acrescenta a lane no fim da lista de preferência e o botão ganha o selo
"1ª", "2ª"...; clicar numa marcada tira ela e as seguintes sobem. Sem nenhuma marcada, vale qualquer lane. Vai como
`lanes: [1ª, 2ª, ...]` na ordem dos cliques; lane desligada em "Lanes disponíveis" sai da lista (as outras sobem) e
não é enviada. Sem nenhuma lane ou com gente demais (`> times × lanes`),
avisa e não deixa sortear; com times menores que as lanes, avisa que nem todas serão usadas em cada time. Nome repetido (ou mesma conta) não entra duas vezes (`mergePlayers`).

## Atalho no `+` do composer

O botão `+` (rótulo "Ferramentas") à esquerda do clipe no `Composer` abre um menu (`components/chat/ToolsMenu.tsx`,
`Popover` do shadcn) com as ferramentas de `TOOLS`, na ordem do registro. Escolher uma chama
`openTool(id, channelId)`: a área central vira o `ToolView` com o **mesmo painel** da barra de úteis, e o "Postar em"
já vem no canal ou conversa do chat de onde se clicou.

- **Destino:** `openTool` grava `toolChannelId` (`store/navigation.ts`); `useDefaultTarget` (`shared.tsx`) usa ele
  antes do canal de texto aberto e da conversa da Home. Pela barra de úteis, `openTool(id)` zera `toolChannelId` e
  volta a sugestão de antes. Sem isso, um `+` numa conversa privada sugeriria o canal da comunidade que estivesse
  aberto em `view`. Se o canal não puder receber (sumiu, perdeu `send`), cai na sugestão normal.
- **Onde aparece:** chat de texto e conversa privada com `send`. No chat da sala de voz não aparece (o servidor
  recusa ferramenta em canal de voz); sem `send`, o composer inteiro já vira o aviso.
- **Por que navegar e não abrir o painel por cima do chat:** os painéis já mostram o resultado (`PostedResult`) e o
  "Ver no chat" volta ao canal; um popover/diálogo exigiria reacomodar painéis feitos para a área central (o
  sorteador é longo). Navegar reusa `ToolView` sem código novo além do menu e do `toolChannelId`.
- **Testes:** `components/chat/tools-shortcut.test.tsx` (menu com o registro, painel aberto mirando o canal, conversa
  privada mesmo com canal aberto na comunidade, sala de voz sem o botão) e `lib/actions/navigation.test.ts`
  (`toolChannelId` gravado e zerado).

**Meus votos:** `loadHistory` e `loadOlderMessages` (`lib/actions/messages.ts`) chamam `loadMyPollVotes` com a
página que chegou, então as enquetes do histórico já aparecem marcadas.

## Ferramenta nova

1. Tipo na união `ToolPayload` + request/result em `tools.ts` + evento `tools:<nome>` + o texto em `toolResultText`.
2. Funções puras (validar e sortear) em `server/tools/` com `Rand` injetado e testes com semente.
3. Uma entrada em `TOOLS` (`server/modules/tools.ts`): `run(req, rand)` devolve o erro (texto) ou o `ToolPayload`.
   O `runTool` cuida do resto (canal, `send`, limite, `insertMessage` com `kind: 'tool'`, `emitToViewers`).
4. Ação em `lib/actions/tools.ts`. Na tela: painel em `components/tools/<Nome>Panel.tsx` (use `ToolPanel`, `usePostTarget`,
   `ChannelSelect`, `usePost` e `PostedResult` de `shared.tsx`), um `case` no `ToolResultCard` e uma linha em `TOOLS`.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tools/teams.test.ts` | Validação (todas as mensagens), Fisher–Yates sem viés, equilíbrio com número ímpar, time maior sorteado, lanes sem repetir e em ordem, lanes disponíveis (só as escolhidas, limite do time, validação, preferência fora descartada), preferências (ordem guardada na validação, 1ª vence 2ª, 2ª quando a 1ª já é de outro no time, dois "só meio" em times diferentes), `crypto.randomInt`. |
| `server/tools/random.test.ts` | Validação e sorteio do dado, moeda e sortear 1 (valores sempre na faixa com o acaso de verdade). |
| `src/shared/types/tools.test.ts` | Texto por extenso de cada ferramenta e o corte em `MESSAGE_MAX_LENGTH`. |
| `server/tests/tools.test.ts` | Servidor real: mesma mensagem para todos + histórico (times e dado), 3v3 com `laneSet`, moeda e sortear 1, erros sem postar, canal de voz/privado/sem `send`, conversa privada, `message:send` não forja ferramenta. |
| `server/tests/limits.test.ts` | `LIMITS.tool` com os limites reais, compartilhado entre ferramentas; pedido inválido não conta. |
| `src/renderer/src/lib/actions/tools.test.ts` | Ações do app (`drawTeams` com `accountId`, `rollDice`, `flipCoin`, `pickOne`, `moveTeams`): parâmetros, padrões e erro; `tools:moved` troca de sala e avisa (fora da voz ou já na sala: ignora). |
| `server/tools/poll.test.ts` | Validação da enquete e da escolha do voto. |
| `server/repo/polls.test.ts` | Votos, troca e retirada, múltipla, votos simultâneos, encerrar, `votesOf`, check do banco e cascade. |
| `server/tests/polls.test.ts` | Servidor real: criar e votar (anônimo, `mine`), único × múltiplo, histórico + `poll:mine`, encerrar (autor, dona, recusas), canal privado e sem `send`. |
| `server/tools/move.test.ts` | `validateMoveRequest` (formatos, salas repetidas, `null`) e `planMoves` (nome, `nome#tag`, conta, ambíguo, conta repetida, time sem sala). |
| `server/tests/move-teams.test.ts` | Servidor real + LiveKit falso: a dona move pela conta e pelo nome, quem já está na sala, sem `manageMembers`/`moveMembers` só a si, moderador (com `manageMembers` ou `moveMembers`) × dona, sem `connect` na sala do time, nome ambíguo, erros do pedido, sorteio de canal que não vejo. |
| `src/renderer/src/components/tools/tools.test.tsx` | Telas (jsdom): registro, importar pessoas (uma por conta), cada painel (payload, canal sugerido, canal sem `send` some, erro, resultado), sorteador (vírgulas, online com conta, lanes, lanes disponíveis e preferência apagada, várias preferidas em ordem com o selo 1ª/2ª e renumeração, nenhuma lane, limite, aviso de times menores), cartões no chat (moeda no `ChatView`, desconhecida, mover para as salas e erro, enquete: votar, vários, encerrar, encerrada). |
| `src/renderer/src/lib/actions/polls.test.ts` | App: `poll:updated` na mensagem, criar, votar, encerrar, `loadMyPollVotes`. |

## Depuração (mover times)

| Sintoma | Causa e solução |
|---|---|
| Pessoa em `skipped` com `not-in-voice` | Ela não está em sala, está numa chamada privada ou numa sala que você não vê; ou o nome no sorteio não bate (use `nome#tag` ou importe da sala). |
| `ambiguous` | Duas contas na voz com o mesmo nome: sorteie com `accountId` (importar da sala) ou digite `nome#tag`. |
| `not-allowed` | Sem `moveMembers` nem `manageMembers`, ou a pessoa tem cargo igual/acima do seu, ou é a dona. |
| Recebeu `tools:moved` mas não trocou de sala | O `voice:join` foi recusado (perdeu `connect` no meio) ou o LiveKit falhou: o aviso do `joinVoice` aparece na tela. |
