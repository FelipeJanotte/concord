# Moderação (v2, B6)

Quatro ações para manter a comunidade em ordem, todas decididas no **servidor** (a tela só esconde o que daria erro):

1. **Expulsar da voz:** tira uma conexão da sala de voz (e da sala do LiveKit). Ela pode voltar, se tiver `connect`.
1. **Mover para outra sala:** leva uma conexão para outra sala de voz (botão direito "Mover para", ou arrastar a pessoa
   para outra sala na barra lateral), como no Discord.
2. **Silenciar pelo servidor ("Silenciar para todos"):** a conta não fala nem toca efeitos sonoros
   (`sound:play` recusa, `docs/areas/sounds.md`) em nenhuma sala até alguém tirar. Diferente
   do "Silenciar" da B4, que é só para mim e local.
3. **Apagar mensagem:** a própria, ou de outra pessoa com `manageMessages`. Os anexos vão junto (banco e disco).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/moderation.ts` | Contrato: `canModerate(access, actor, target)`, `canMoveMember(access, actor, target)`, `canDeleteMessage(access, actor, authorAccountId)`, `ModerationClientEvents`/`ModerationServerEvents`. |
| `src/shared/types/voice.ts` | `VoiceState.serverMuted?` (ausente = false). |
| `server/modules/moderation.ts` | Handlers `moderation:voice-kick`, `moderation:voice-move`, `moderation:voice-mute`, `message:delete`; limite `LIMITS.moderation`. |
| `server/modules/voice.ts` | `serverMuted` (Set de contas: cache do banco, carregado no `init` do módulo), `isServerMuted`, `kickFromVoice`, `setServerMuted` (async: grava no banco e depois aplica). O silêncio entra no `voicePermissions` (`canSpeak = speak && !serverMuted`). |
| `server/db/schema/moderation.ts` | Tabela `server_mutes`: `account_id` (chave; apagar a conta apaga o silêncio), `muted_by` (quem silenciou; vira null se essa conta for apagada), `created_at`. Migration `0012_server_mutes`. |
| `server/repo/moderation.ts` | `listServerMutes()` (boot) e `setServerMute(accountId, muted, mutedBy)` (repetir não duplica; id inválido ou conta inexistente não faz nada). |
| `server/repo/messages.ts` | `findMessageMeta` (canal e autor) e `deleteMessage` (apaga e devolve os ids dos anexos). |
| `src/renderer/src/lib/actions/moderation.ts` | `kickFromVoice`, `moveToVoice`, `setServerMuted`, `deleteMessage` (erro do servidor vira exceção) e os listeners `message:deleted` / `moderation:kicked` / `moderation:moved`. |
| `src/renderer/src/lib/actions/voice.ts` (`joinVoice`) | `joinVoice(id, { show })`: `show: false` entra na sala sem mudar a tela (usado ao ser movido estando em outra tela). |
| `src/renderer/src/lib/actions/voice.ts` | `mutedByModerator` (do meu `VoiceState.serverMuted`): troca os avisos genéricos por "Um moderador silenciou você nas salas de voz." |
| `src/renderer/src/components/voice/ModerationMenu.tsx` | `ModerationItems` (itens do botão direito: o submenu "Mover para" de `MoveToItems` com `canMoveMember`; "Silenciar para todos" e "Expulsar da voz" de `MuteAndKickItems` com `canModerate`) e `ServerMutedIcon` (escudo vermelho na grade e na barra lateral). |
| `src/renderer/src/components/ChannelSidebar.tsx` | Arrastar para mover: a pessoa na lista embaixo da sala é `draggable` para quem pode movê-la (`canMoveMember`; `application/x-concord-voice-user` com o `userId`); o bloco de cada sala de voz (`data-voice-room`) aceita soltar (anel de destaque) e chama `moveToVoice`. Soltar na própria sala não faz nada. |
| `src/renderer/src/components/chat/MessageActions.tsx` | (Junto com Responder e Editar, `docs/areas/messages.md`.) Lixeira ao passar o mouse na mensagem. |

## Regras

**Quem pode expulsar/silenciar (`canModerate`)**: ninguém modera a si mesmo nem a dona. A dona modera todo mundo.
Os demais precisam de `manageMembers` **e** de um cargo mais alto que o mais alto do alvo (`highestPosition`), a
mesma hierarquia de "dar cargos" (`docs/areas/permissions.md`).

**Quem pode mover (`canMoveMember`)**: a mesma hierarquia (nem a si mesmo, nem a dona, só alvo abaixo do meu cargo mais
alto), mas basta `moveMembers` ("Mover membros") **ou** `manageMembers`. Assim dá para deixar um cargo arrastar gente
entre salas sem poder silenciar, expulsar ou dar cargos; quem já tinha `manageMembers` continua movendo. Vale também
para o "Mover para as salas" do sorteador (`tools:move-teams`, `docs/areas/tools.md`).

**Quem pode apagar (`canDeleteMessage`)**: o autor (`author_id` = minha conta) ou quem tem `manageMessages`. Nos dois
casos precisa **ver** o canal. Em **conversa privada (`dm`)** não há moderação: só o autor apaga (nem a dona, porque
ela nem vê a conversa; `docs/areas/dms.md`).

**Mover:** além do `canMoveMember`, a sala de destino tem de ser de **voz** e visível para quem move ("Sala de voz não
encontrada"), diferente da atual ("Essa pessoa já está nessa sala"), e a pessoa movida tem de poder **ver e entrar**
nela ("Essa pessoa não tem acesso a essa sala"). Quem está numa **chamada privada** não é movido. O servidor **não tira
ninguém à força no LiveKit**: avisa a conexão (`moderation:moved`) e o app troca de sala pelo `voice:join` de sempre,
que confere a permissão de novo e emite o token (o mesmo jeito do "Mover para as salas" do sorteador, `tools:moved`).

**Não revelar o que a pessoa não vê:** expulsar/mover/silenciar alguém numa sala que eu não vejo responde "Essa pessoa não
está numa sala de voz"; apagar mensagem de canal que eu não vejo responde "Mensagem não encontrada".

## Contrato e eventos

| Evento (app → servidor) | Payload | Ack | Efeito |
|---|---|---|---|
| `moderation:voice-kick` | `{ userId }` (socket.id, igual a `VoiceState.userId`) | `OkResult` | `moderation:kicked { channelId, by }` só para a conexão expulsa → tira da sala (`RemoveParticipant` no LiveKit) → `voice:state` |
| `moderation:voice-move` | `{ userId, channelId }` | `OkResult` | `moderation:moved { channelId, by }` só para a conexão movida → o app dela faz `voice:join` na sala nova (a antiga sai pelo fluxo normal de troca) → `voice:state` |
| `moderation:voice-mute` | `{ accountId, muted }` | `OkResult` | liga/desliga o silêncio da conta → `applyVoiceAccess` (LiveKit sem o microfone, `muted: true`, `serverMuted: true`) → `voice:state` |
| `message:delete` | `{ messageId }` | `OkResult` | apaga (anexos por cascade + arquivos do disco) → `message:deleted { channelId, messageId }` por `emitToViewers` |

Silenciar exige que a pessoa esteja numa sala que eu vejo; **tirar** o silêncio vale sempre (ela pode ter saído).

## Fluxo do silêncio pelo servidor

1. `setServerMuted(io, accountId, true, quemSilenciou)` grava em `server_mutes`, põe a conta no Set e chama `applyVoiceAccess`.
   Se a gravação falhar, nada muda (o erro vai para o `guard`). Ao subir, o servidor carrega a tabela no Set: o
   silêncio **sobrevive a reiniciar o servidor**.
2. Para cada conexão dela em sala: `voicePermissions` agora dá `canSpeak: false` → `UpdateParticipant` no LiveKit
   sem a fonte `MICROPHONE` (o microfone é despublicado e não volta: **mais forte** que `mutePublishedTrack`, que a
   pessoa desfaria), `muted: true` e `serverMuted: true` no `VoiceState`.
3. No app dela: chega o `voice:state` (marca `mutedByModerator`) e depois o `ParticipantPermissionsChanged` do LiveKit
   (`voice.onPermissionsChange`), que avisa "Um moderador silenciou você nas salas de voz." e corta o botão de microfone.
4. `voice:update { muted: false }` não adianta (o servidor mantém `muted` enquanto `canSpeak` for false). Sair e voltar
   também não: o token novo já sai sem microfone e o `join` responde `canSpeak: false`.
5. Tirar o silêncio refaz o cálculo pelo cargo: se ela tem `speak`, recupera o microfone ao vivo (fluxo "Permissões
   de voz no app" da `docs/areas/voice.md`) **e volta desmutada sozinha**, sem precisar clicar:
   - **Servidor:** `selfMuted` (em `server/modules/voice.ts`, por conexão) guarda a escolha da própria pessoa, vinda do
     `voice:join` e dos `voice:update` **enquanto ela pode falar**. O que o app manda durante o silêncio (sempre
     "mutado", por causa do `!voiceCanSpeak`, por exemplo ao ligar/desligar o áudio) não conta. Quando o `speak`
     volta, o `applyVoiceAccess` põe `muted = selfMuted` na hora e emite. Quem tinha se mutado antes continua mutado.
     Antes o servidor só voltava o `muted` quando o app dela mandava `voice:update`; se isso atrasasse ou falhasse,
     ela continuava "mutada" para todos até clicar no microfone.
   - **App:** no `voice:state` em que o meu `serverMuted` passa de true para false e eu ainda não posso falar, chama
     `voice.syncPermissions()` (relê `localParticipant.permissions` e reabre/publica o microfone) já e de novo após
     `UNMUTE_RESYNC_MS` (1,5 s), caso o `ParticipantPermissionsChanged` do LiveKit atrase ou se perca.

## Na tela

- **Botão direito numa pessoa** (grade da sala, barra lateral, lista de membros), depois de volume e "Silenciar" (só
  para mim): "Silenciar para todos" (checkbox, marcado se ela está silenciada pelo servidor) e "Expulsar da voz"
  (vermelho, pede confirmação; expulsa todas as conexões da conta que estão em sala). Só aparecem se `canModerate` e
  se a pessoa está numa sala que eu vejo.
- **Indicador:** escudo vermelho "Silenciado por um moderador" no lugar do microfone cortado comum.
- **Mover para ▸** (submenu do botão direito): as salas de voz que eu vejo, menos a atual e as que a pessoa não pode
  ver/entrar. Ou **arrastar** a pessoa da lista embaixo de uma sala, na barra lateral, e soltar em outra sala. Os dois
  aparecem com `canMoveMember`: um cargo só com "Mover membros" vê "Mover para" e arrasta, mas não vê "Silenciar para
  todos" nem "Expulsar da voz". A permissão aparece para marcar em Configurações da comunidade → Cargos
  ("Administração" lista `GLOBAL_PERMISSIONS` sozinha).
- **Movido:** o app avisa "<nome> levou você para <sala>." e entra na sala nova. A tela só acompanha se eu estava
  olhando a sala antiga; no chat de texto (ou na Home), a voz troca e a tela fica onde estava.
- **Expulso:** o app sai da sala na hora (antes do `voice:state`) e avisa "<nome> tirou você da sala de voz."; o
  `voice:state` seguinte não repete o aviso.
- **Mensagens:** lixeira no canto ao passar o mouse (autor; ou `manageMessages` fora de DM), com confirmação. Para
  todos que veem o canal, a mensagem some da lista na hora (`message:deleted`).

## Limites e problemas conhecidos

- `LIMITS.moderation`: 20 ações seguidas por conta, depois 1 por segundo (vale para todas as ações de moderação).
- Mover depende do app da pessoa obedecer ao `moderation:moved` (como no sorteador). Um app modificado poderia
  ignorar; para tirar à força, use "Expulsar da voz". Um app **antigo**, sem o listener `moderation:moved`
  (anterior à v0.1.1), também ignora: o servidor responde `ok` para quem moveu e nada acontece, sem erro em nenhuma
  das telas.
- O silêncio pelo servidor fica no banco (`server_mutes`) e vale até alguém tirar, mesmo depois de reiniciar o servidor.
  O `muted_by` é guardado para um futuro log de moderação; ainda não aparece na tela.
- Não há "expulsar da comunidade" nem banimento: só da sala de voz.
- Apagar não tem "desfazer" nem registro de quem apagou (log de moderação fica para depois).

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/moderation.test.ts` | Servidor real + LiveKit falso: expulsar (aviso com o nome, sai da lista, `RemoveParticipant`), hierarquia (sem permissão, dona, cargo igual, si mesmo), quem não está em sala; mover (só a pessoa recebe `moderation:moved` com a sala e quem moveu, entra de novo pelo `voice:join`; recusas: mesma sala, fora da voz, sala de texto/inexistente, sem permissão, sobre a dona, sala em que ela não pode entrar); `moveMembers` (move quem está abaixo, mas não expulsa nem silencia; sem ela recusa; não move a dona nem cargo igual); silenciar (lista e `UpdateParticipant` sem microfone, não se dessilencia, vale ao voltar, tirar devolve a fala, **tirar desmuta na hora sem a pessoa mandar nada** (mesmo com `voice:update` "mutado" durante o silêncio), quem já estava mutado continua mutado, entrou silenciada volta como entrou, **continua depois de reiniciar o servidor e tirar também fica guardado**), validação; apagar (autor, `manageMessages`, canal que não vê sem vazar evento, arquivo do anexo apagado, id inválido). |
| `server/repo/moderation.test.ts` | Repo no banco de verdade: gravar/repetir/tirar, id inválido e conta inexistente, apagar a conta silenciada (some) e a de quem silenciou (fica). |
| `src/shared/types/moderation.test.ts` | `canMoveMember` puro: `moveMembers` move quem está abaixo sem ganhar `canModerate`; `manageMembers` continua movendo; nem a si, nem a dona, nem cargo igual/acima; sem as duas permissões ninguém; a dona move todos. |
| `src/renderer/src/lib/actions/voice-permissions.test.ts` + `lib/voice.test.ts` | Fim do silêncio no app: relê as permissões (já e depois, se faltar), não relê se o LiveKit já avisou, manda `voice:update` desmutado; `syncPermissions` reabre e publica o microfone. |
| `src/renderer/src/lib/actions/moderation.test.ts` | `message:deleted` na store, `moderation:kicked` (sai e avisa uma vez; de outra sala ignora), `moderation:moved` (troca de sala com aviso; a tela acompanha só se eu olhava a sala antiga; fora da voz ou já na sala, ignora), `moveToVoice`, avisos de "silenciado por moderador" e o payload das ações. |
| `src/renderer/src/components/voice/moderation.test.tsx` | Itens do botão direito (aparecem/somem pela hierarquia, mandam os eventos, confirmação), "Mover para" (só salas em que a pessoa pode entrar, menos a atual), arrastar na barra lateral (soltar em outra sala move; na mesma, nada; sem poder mover, não arrasta), só "Mover membros" (vê "Mover para" e arrasta, sem silenciar/expulsar), escudo na grade, lixeira (autor, `manageMessages`, DM sem moderação). |

À mão (duas contas, `docs/areas/dev-workflow.md`): a dona entra numa sala com B; botão direito em B → "Silenciar
para todos" → B vê o escudo, o aviso e não consegue ligar o microfone; tirar → B volta a falar **sem clicar em nada**
(na tela da dona o microfone de B aparece ligado na hora). "Expulsar da voz" → B sai e vê "<dona> tirou você da sala
de voz.". Com B numa sala, arrastar B para outra sala na barra lateral (ou "Mover para") → B troca de sala e vê
"<dona> levou você para <sala>.". B manda uma mensagem e apaga pela lixeira → some na tela da dona.

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Você não pode expulsar/silenciar essa pessoa" | Sem `manageMembers`, ou o cargo mais alto do alvo é igual ou maior que o seu, ou é a dona. |
| "Você não pode mover essa pessoa" | Sem `moveMembers` nem `manageMembers`, ou o cargo mais alto do alvo é igual ou maior que o seu, ou é a dona. |
| "Essa pessoa não está numa sala de voz" | Ela não está em sala, ou está numa sala que você não vê. |
| Arrastei (ou "Mover para"), não deu erro e a pessoa ficou na sala | O servidor aceitou e mandou `moderation:moved` só para a conexão dela; quem troca de sala é o app dela. Confira a versão do app da pessoa (antes da v0.1.1 não há o listener) e o console `[voz]` dela (o `voice:join` pode ter falhado: aviso na tela dela). |
| Pessoa silenciada continua falando | O LiveKit não recebeu o `UpdateParticipant`: veja o log `[livekit]` do servidor (`LIVEKIT_API_URL`, chave). |
| Continua mutado depois de tirar o silêncio | O servidor volta para a escolha da pessoa (`selfMuted`): se ela tinha se mutado antes, continua (é o esperado). Se a lista mostra desmutada mas ninguém a ouve, o microfone não foi republicado: veja o console `[voz]` dela ("não foi possível ligar o microfone depois de ganhar permissão"). |
| Silêncio sumiu sozinho | Alguém tirou, ou a conta foi apagada. Confira a tabela `server_mutes` (o servidor só lê no boot: editar o banco à mão exige reiniciar). |
| Mensagem apagada continua na tela de alguém | Essa conexão não vê o canal agora ou estava sem histórico carregado (ao carregar, ela já não vem). |
