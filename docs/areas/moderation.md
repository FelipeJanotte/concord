# Moderação (v2, B6)

Três ações para manter a comunidade em ordem, todas decididas no **servidor** (a tela só esconde o que daria erro):

1. **Expulsar da voz:** tira uma conexão da sala de voz (e da sala do LiveKit). Ela pode voltar, se tiver `connect`.
2. **Silenciar pelo servidor ("Silenciar para todos"):** a conta não fala nem toca efeitos sonoros
   (`sound:play` recusa, `docs/areas/sounds.md`) em nenhuma sala até alguém tirar. Diferente
   do "Silenciar" da B4, que é só para mim e local.
3. **Apagar mensagem:** a própria, ou de outra pessoa com `manageMessages`. Os anexos vão junto (banco e disco).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/moderation.ts` | Contrato: `canModerate(access, actor, target)`, `canDeleteMessage(access, actor, authorAccountId)`, `ModerationClientEvents`/`ModerationServerEvents`. |
| `src/shared/types/voice.ts` | `VoiceState.serverMuted?` (ausente = false). |
| `server/modules/moderation.ts` | Handlers `moderation:voice-kick`, `moderation:voice-mute`, `message:delete`; limite `LIMITS.moderation`. |
| `server/modules/voice.ts` | `serverMuted` (Set de contas: cache do banco, carregado no `init` do módulo), `isServerMuted`, `kickFromVoice`, `setServerMuted` (async: grava no banco e depois aplica). O silêncio entra no `voicePermissions` (`canSpeak = speak && !serverMuted`). |
| `server/db/schema/moderation.ts` | Tabela `server_mutes`: `account_id` (chave; apagar a conta apaga o silêncio), `muted_by` (quem silenciou; vira null se essa conta for apagada), `created_at`. Migration `0012_server_mutes`. |
| `server/repo/moderation.ts` | `listServerMutes()` (boot) e `setServerMute(accountId, muted, mutedBy)` (repetir não duplica; id inválido ou conta inexistente não faz nada). |
| `server/repo/messages.ts` | `findMessageMeta` (canal e autor) e `deleteMessage` (apaga e devolve os ids dos anexos). |
| `src/renderer/src/lib/actions/moderation.ts` | `kickFromVoice`, `setServerMuted`, `deleteMessage` (erro do servidor vira exceção) e os listeners `message:deleted` / `moderation:kicked`. |
| `src/renderer/src/lib/actions/voice.ts` | `mutedByModerator` (do meu `VoiceState.serverMuted`): troca os avisos genéricos por "Um moderador silenciou você nas salas de voz." |
| `src/renderer/src/components/voice/ModerationMenu.tsx` | `ModerationItems` (itens do botão direito) e `ServerMutedIcon` (escudo vermelho na grade e na barra lateral). |
| `src/renderer/src/components/chat/MessageActions.tsx` | (Junto com Responder e Editar, `docs/areas/messages.md`.) Lixeira ao passar o mouse na mensagem. |

## Regras

**Quem pode expulsar/silenciar (`canModerate`)**: ninguém modera a si mesmo nem a dona. A dona modera todo mundo.
Os demais precisam de `manageMembers` **e** de um cargo mais alto que o mais alto do alvo (`highestPosition`), a
mesma hierarquia de "dar cargos" (`docs/areas/permissions.md`).

**Quem pode apagar (`canDeleteMessage`)**: o autor (`author_id` = minha conta) ou quem tem `manageMessages`. Nos dois
casos precisa **ver** o canal. Em **conversa privada (`dm`)** não há moderação: só o autor apaga (nem a dona, porque
ela nem vê a conversa; `docs/areas/dms.md`).

**Não revelar o que a pessoa não vê:** expulsar/silenciar alguém numa sala que eu não vejo responde "Essa pessoa não
está numa sala de voz"; apagar mensagem de canal que eu não vejo responde "Mensagem não encontrada".

## Contrato e eventos

| Evento (app → servidor) | Payload | Ack | Efeito |
|---|---|---|---|
| `moderation:voice-kick` | `{ userId }` (socket.id, igual a `VoiceState.userId`) | `OkResult` | `moderation:kicked { channelId, by }` só para a conexão expulsa → tira da sala (`RemoveParticipant` no LiveKit) → `voice:state` |
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
   de voz no app" da `docs/areas/voice.md`).

## Na tela

- **Botão direito numa pessoa** (grade da sala, barra lateral, lista de membros), depois de volume e "Silenciar" (só
  para mim): "Silenciar para todos" (checkbox, marcado se ela está silenciada pelo servidor) e "Expulsar da voz"
  (vermelho, pede confirmação; expulsa todas as conexões da conta que estão em sala). Só aparecem se `canModerate` e
  se a pessoa está numa sala que eu vejo.
- **Indicador:** escudo vermelho "Silenciado por um moderador" no lugar do microfone cortado comum.
- **Expulso:** o app sai da sala na hora (antes do `voice:state`) e avisa "<nome> tirou você da sala de voz."; o
  `voice:state` seguinte não repete o aviso.
- **Mensagens:** lixeira no canto ao passar o mouse (autor; ou `manageMessages` fora de DM), com confirmação. Para
  todos que veem o canal, a mensagem some da lista na hora (`message:deleted`).

## Limites e problemas conhecidos

- `LIMITS.moderation`: 20 ações seguidas por conta, depois 1 por segundo (vale para as três ações).
- O silêncio pelo servidor fica no banco (`server_mutes`) e vale até alguém tirar, mesmo depois de reiniciar o servidor.
  O `muted_by` é guardado para um futuro log de moderação; ainda não aparece na tela.
- Não há "expulsar da comunidade" nem banimento: só da sala de voz.
- Apagar não tem "desfazer" nem registro de quem apagou (log de moderação fica para depois).

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/moderation.test.ts` | Servidor real + LiveKit falso: expulsar (aviso com o nome, sai da lista, `RemoveParticipant`), hierarquia (sem permissão, dona, cargo igual, si mesmo), quem não está em sala; silenciar (lista e `UpdateParticipant` sem microfone, não se dessilencia, vale ao voltar, tirar devolve a fala, **continua depois de reiniciar o servidor e tirar também fica guardado**), validação; apagar (autor, `manageMessages`, canal que não vê sem vazar evento, arquivo do anexo apagado, id inválido). |
| `server/repo/moderation.test.ts` | Repo no banco de verdade: gravar/repetir/tirar, id inválido e conta inexistente, apagar a conta silenciada (some) e a de quem silenciou (fica). |
| `src/renderer/src/lib/actions/moderation.test.ts` | `message:deleted` na store, `moderation:kicked` (sai e avisa uma vez; de outra sala ignora), avisos de "silenciado por moderador" e o payload das ações. |
| `src/renderer/src/components/voice/moderation.test.tsx` | Itens do botão direito (aparecem/somem pela hierarquia, mandam os eventos, confirmação), escudo na grade, lixeira (autor, `manageMessages`, DM sem moderação). |

À mão (duas contas, `docs/areas/dev-workflow.md`): a dona entra numa sala com B; botão direito em B → "Silenciar
para todos" → B vê o escudo, o aviso e não consegue ligar o microfone; tirar → B volta a falar. "Expulsar da voz" →
B sai e vê "<dona> tirou você da sala de voz.". B manda uma mensagem e apaga pela lixeira → some na tela da dona.

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Você não pode expulsar/silenciar essa pessoa" | Sem `manageMembers`, ou o cargo mais alto do alvo é igual ou maior que o seu, ou é a dona. |
| "Essa pessoa não está numa sala de voz" | Ela não está em sala, ou está numa sala que você não vê. |
| Pessoa silenciada continua falando | O LiveKit não recebeu o `UpdateParticipant`: veja o log `[livekit]` do servidor (`LIVEKIT_API_URL`, chave). |
| Silêncio sumiu sozinho | Alguém tirou, ou a conta foi apagada. Confira a tabela `server_mutes` (o servidor só lê no boot: editar o banco à mão exige reiniciar). |
| Mensagem apagada continua na tela de alguém | Essa conexão não vê o canal agora ou estava sem histórico carregado (ao carregar, ela já não vem). |
