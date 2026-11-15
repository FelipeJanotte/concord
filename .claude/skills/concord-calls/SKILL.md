---
name: concord-calls
description: Chamadas privadas do Concord (v3, B8) — o "telefone" das conversas: ligar, tocar, atender, recusar, cancelar, desligar, tempo limite (CALL_RING_MS) e fim quando os dois saem da sala; o áudio é a sala de voz da própria conversa (voice:join com o canal dm). Eventos call:invite/accept/decline/cancel/end/list, call:updated e call:ended. Use ao mexer em server/modules/calls.ts, src/shared/types/calls.ts, lib/actions/calls.ts, store/calls.ts, lib/sounds/ringtone.ts, components/call/** (CallButton, CallPanel, IncomingCall), ou ao investigar chamada que não toca, toque que não para, "Essa pessoa está em outra chamada", "Não foi possível ligar" ou chamada que acaba sozinha.
---

# Chamadas privadas (v3, B8)

Ligar para a outra pessoa de uma conversa privada. O **áudio, a tela e quem está falando** são a sala de voz da
própria conversa (servidor da voz da DM, skill `concord-voice`, item 5): a sala do LiveKit tem o id do canal `dm`.
Este módulo só cuida do "telefone": tocar, atender, recusar, cancelar, desligar e os tempos limite.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/calls.ts` | `CallInfo`, `CallEnded`, `CallEndReason`, `CALL_RING_MS` (30 s), `callEndText` (avisos) e os eventos. |
| `server/modules/calls.ts` | Chamadas em memória (`Map` por conversa), regras, tempos limite, `endCall` (usado pelo bloqueio) e o fim quando a sala esvazia. |
| `server/modules/voice.ts` | `onVoiceRoomsChange(fn)`: aviso depois de toda mudança nas salas (o `calls` usa para saber quando os dois saíram). |
| `server/modules/friends.ts` | `friend:block` chama `endCall(..., 'blocked')` antes de `leaveDmVoice`. |
| `server/middleware/rate-limit.ts` | `LIMITS.call`: 5 ligações seguidas, depois 1 a cada 10 s. |
| `src/renderer/src/store/calls.ts` | `calls: Record<channelId, CallInfo>`. |
| `src/renderer/src/lib/actions/calls.ts` | `startCall`, `acceptCall`, `declineCall`, `cancelCall`, `hangUp`, `loadCalls`, `syncRinger` e os listeners. |
| `src/renderer/src/lib/sounds/ringtone.ts` | `Ringer`: toque gerado na hora (Web Audio), `incoming` e `outgoing`, repete até `stop()`. |
| `components/call/CallButton.tsx` | "Iniciar chamada" no cabeçalho da conversa. |
| `components/call/CallPanel.tsx` | Painel no topo da conversa: chamando / tocando / em andamento (grade `VoiceGrid` + controles, com "Efeitos sonoros" e o indicador de quem tocou; skill `concord-sounds`). |
| `components/call/IncomingCall.tsx` | Cartão "Chamada recebida" no canto, em qualquer tela (some se a conversa já está aberta). |

## Contrato e eventos

| Evento (app → servidor) | Payload | Ack | Quem pode |
|---|---|---|---|
| `call:invite` | `channelId` | `CallResult` | membro da conversa, sem bloqueio, sem chamada na conversa, os dois livres |
| `call:accept` | `channelId` | `CallResult` | quem recebe, enquanto toca |
| `call:decline` | `channelId` | `OkResult` | quem recebe, enquanto toca → `declined` |
| `call:cancel` | `channelId` | `OkResult` | quem ligou, enquanto toca → `cancelled` |
| `call:end` | `channelId` | `OkResult` | qualquer dos dois; atendida → `ended`, tocando → `cancelled`/`declined` |
| `call:list` | — | `CallInfo[]` | as minhas (o app pede depois do `hello`) |

Servidor → app: `call:updated` (nova ou atendida, para **todas as conexões das duas contas**) e `call:ended`
(`{ channelId, callerId, calleeId, reason }`, sempre **antes** do `voice:state` que tira as pessoas da sala).

## Fluxo

1. A clica em "Iniciar chamada": `call:invite` → `call:updated` (`ringing`) para os dois → A entra na sala da conversa
   (`joinVoice(dm)`, que **não** troca a tela: continua na conversa) e ouve o toque `outgoing`.
2. B ouve o toque `incoming` em todas as janelas e vê o cartão no canto (ou o painel, se a conversa está aberta).
3. B atende: `call:accept` → `active` para os dois → B abre a conversa e entra na sala. O toque para em todo lugar.
4. Fim: alguém desliga (`call:end`), ou os dois saem da sala, ou bloqueio. O servidor manda `call:ended` e tira todo
   mundo da sala (`leaveDmVoice`). O app sai da sala na hora e mostra o aviso (`callEndText`).

## Regras e tempos

- **Uma chamada por conversa e por pessoa:** "Já há uma chamada nesta conversa", "Você já está em outra chamada",
  "Essa pessoa está em outra chamada".
- **Bloqueio** (qualquer lado): "Não foi possível ligar" (não diz quem bloqueou); bloquear encerra (`blocked`).
- **Tocando sem resposta** por `CALL_RING_MS` (30 s; a variável de ambiente `CALL_RING_MS` encurta nos testes) → `missed`.
- **Atendida e ninguém entra na sala** no mesmo prazo → `ended`. Depois que alguém entrou, a chamada só acaba quando
  a sala esvazia (uma pessoa sozinha mantém a chamada).
- **Queda enquanto toca** (todas as conexões da conta): quem ligou → `cancelled`; quem recebe → `missed`.
- Não há aviso de "offline": ligar para quem não está conectado toca até dar `missed` (online só aparece para amigos).
- No app, o toque `outgoing` só toca na janela que ligou; `incoming` toca em todas. A conexão caiu: limpa e para.

## Avisos (`callEndText`)

| Motivo | Quem ligou | Quem recebeu |
|---|---|---|
| `declined` | "Ana recusou a chamada." | — (foi quem recusou) |
| `missed` | "Ana não atendeu." | "Chamada perdida de Ana." |
| `cancelled` | — | "Chamada perdida de Ana." |
| `ended` / `blocked` | "Chamada encerrada." | "Chamada encerrada." |

Quem encerrou (desligou, recusou, cancelou) não recebe aviso.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/calls.test.ts` | Tocar em todas as conexões, atender, quem pode cada ação, recusar/cancelar, tempo limite, recusas ao ligar (conversa alheia, repetida, ocupados), bloqueio, desligar tira da sala (também no LiveKit), fim quando a sala esvazia, atendida sem ninguém entrar, quedas. |
| `src/shared/types/calls.test.ts` | `callEndText` para cada motivo e lado. |
| `src/renderer/src/lib/actions/calls.test.ts` | Toque (prioridade, outra janela, queda, `loadCalls`), ligar/atender (entra na sala sem trocar a tela), erros, fim (sai da sala, avisos, quem desligou, outra sala). |
| `src/renderer/src/lib/sounds/ringtone.test.ts` | Repete no intervalo, troca de toque, volume zero. |
| `src/renderer/src/components/call/call.test.tsx` | Botão de ligar, painel (chamando, tocando, em andamento, entrar de novo), efeitos sonoros na chamada, cartão no canto, telefone na lista e "Chamada com Ana". |

À mão (duas contas amigas, LiveKit local, skill `concord-dev-workflow`): A abre a conversa e liga → B ouve o toque e
vê o cartão → atende → os dois se ouvem e podem compartilhar a tela → A desliga → os dois saem e B vê "Chamada
encerrada.". Repetir sem atender (30 s → "Chamada perdida") e recusando.

## Problemas conhecidos e depuração

| Sintoma | Causa e solução |
|---|---|
| Chamada some depois de reiniciar o servidor | As chamadas ficam em memória; reiniciar encerra todas (o app limpa ao reconectar). |
| Toque não para | Chegou `call:updated` `active` ou `call:ended`? `syncRinger` decide pelo estado `calls`. |
| "A voz não está configurada neste servidor" | Sem `LIVEKIT_*` no `server/.env` (skill `concord-voice`). |
| Botões da chamada "achatados" (ovais) na conversa estreita | Os `ControlButton` (de `VoiceView.tsx`) são filhos de flex e encolhiam. As linhas do `CallPanel` usam `CONTROLS_ROW` (`flex-wrap` + `[&>button]:shrink-0`): sem espaço, quebram linha. Teste em `call.test.tsx`. |
| Atendeu e a chamada acabou sozinha | Ninguém entrou na sala em `CALL_RING_MS` (microfone negado? veja o log `[livekit]`). |

Ainda não há notificação nativa do sistema para chamada recebida (B9), nem chamada em grupo.
