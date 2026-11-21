# Moderação (v2, B6; v8, A19 e A20)

As ações para manter a comunidade em ordem, todas decididas no **servidor** (a tela só esconde o que daria erro):

1. **Expulsar da voz:** tira uma conexão da sala de voz (e da sala do LiveKit). Ela pode voltar, se tiver `connect`.
1. **Mover para outra sala:** leva uma conexão para outra sala de voz (botão direito "Mover para", ou arrastar a pessoa
   para outra sala na barra lateral), como no Discord.
2. **Silenciar pelo servidor ("Silenciar para todos"):** a conta não fala nem toca efeitos sonoros
   (`sound:play` recusa, `docs/areas/sounds.md`) em nenhuma sala até alguém tirar. Diferente
   do "Silenciar" da B4, que é só para mim e local.
3. **Apagar mensagem:** a própria, ou de outra pessoa com `manageMessages`. Os anexos vão junto (banco e disco).
4. **Expulsar da comunidade (A19):** derruba todas as conexões da conta e apaga as sessões. Ela volta entrando de novo.
5. **Banir da comunidade (A19):** o mesmo, e a conta (e o e-mail dela) não entra mais até alguém tirar o banimento.
6. **Castigo (A20):** por um prazo (1 min a 7 dias) a conta não manda mensagem, não reage e fica silenciada na voz.

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
| `src/shared/types/moderation.ts` (A19/A20) | `canKickMember`, `canBanMember`, `canTimeoutMember` (mesma `outranks` do `canModerate`, cada uma com a sua permissão), `BANNED_MESSAGE`, `BAN_REASON_MAX_LENGTH` (200), `TIMEOUT_MAX_MINUTES` (10080), `timeoutMessage(until, now, timeZone?)`, `CommunityBan`, `MemberTimeout`, `CommunityRemoval`, `BansResult`. |
| `server/modules/moderation.ts` (A19/A20) | `moderation:kick`, `moderation:ban`, `moderation:unban`, `moderation:bans`, `moderation:timeout`; `removeFromCommunity` (apaga as sessões e derruba as conexões com `moderation:removed`). |
| `server/modules/timeouts.ts` | Castigos em memória (cache de `server_timeouts`, carregado no `init`, vencidos apagados), um `setTimeout` por conta que tira o castigo no prazo, `setTimedOut`, `isTimedOut`, `timeoutRefusal` (texto da recusa), `onTimeoutsChange` (a voz reaplica as permissões) e o evento `moderation:timeouts`. |
| `server/db/schema/moderation.ts` (A19/A20) | `community_bans` (`account_id` chave, `email` com índice, `reason`, `banned_by`, `created_at`) e `server_timeouts` (`account_id` chave, `until`, `timed_out_by`, `created_at`). Apagar a conta apaga as duas linhas. Migration `0015_v8`. |
| `server/repo/moderation.ts` (A19/A20) | `insertCommunityBan`, `deleteCommunityBan`, `findCommunityBan({ accountId?, email? })`, `listCommunityBans` (com nome e id), `listServerTimeouts`, `setServerTimeout(accountId, until ou null, by)`. `server/repo/sessions.ts`: `deleteAccountSessions`. |
| `server/auth.ts` | `isBanned` e as recusas de login, Google, cadastro e `accountFromToken` (`docs/areas/accounts.md`, regra 7). |
| `server/modules/{messages,reactions}.ts` | Uma linha cada: `timeoutRefusal` antes de enviar/reagir. |
| `server/modules/voice.ts` | `isServerMuted` = silêncio do moderador **ou** castigo: o castigo usa o mesmo caminho (`voicePermissions`, `VoiceState.serverMuted`, LiveKit sem microfone). |
| `src/renderer/src/lib/actions/moderation.ts` (A19/A20) | `kickFromCommunity`, `banFromCommunity`, `unbanFromCommunity`, `loadBans`, `timeoutMember`, `loadTimeouts` (chamada depois do `hello`), listeners `moderation:removed` (apaga o token, chama o `disconnect` recebido de `client.ts` e avisa) e `moderation:timeout-changed`. Estado em `store/moderation.ts` (`timeouts`: conta → prazo). |
| `src/renderer/src/components/voice/ModerationMenu.tsx`, `BanDialog.tsx` | Itens "Castigo ▸", "Expulsar da comunidade" e "Banir da comunidade" (abre o `BanDialog`, montado pelo `MemberContextMenu`, com o motivo opcional). |
| `src/renderer/src/components/settings/BansTab.tsx` | Aba "Banidos" das Configurações da comunidade (só com `banMembers`): lista com o motivo e "Tirar banimento". |
| `src/renderer/src/components/chat/Composer.tsx` | Com castigo, o campo some e aparece "Você está de castigo até HH:MM." |

## Regras

**Quem pode expulsar/silenciar (`canModerate`)**: ninguém modera a si mesmo nem a dona. A dona modera todo mundo.
Quem tem um cargo com **Administrador** também modera qualquer pessoa, inclusive acima dele e outros admins (menos a
dona e a si mesmo; ADR `docs/decisions/0008-permissao-administrador.md`). Os demais precisam de `manageMembers` **e**
de um cargo mais alto que o mais alto do alvo (`highestPosition`).

**Quem pode mover (`canMoveMember`)**: a mesma hierarquia (nem a si mesmo, nem a dona, só alvo abaixo do meu cargo mais
alto; Administrador sem hierarquia), mas basta `moveMembers` ("Mover membros") **ou** `manageMembers`. Assim dá para deixar um cargo arrastar gente
entre salas sem poder silenciar, expulsar ou dar cargos; quem já tinha `manageMembers` continua movendo. Vale também
para o "Mover para as salas" do sorteador (`tools:move-teams`, `docs/areas/tools.md`).

**Quem pode apagar (`canDeleteMessage`)**: o autor (`author_id` = minha conta) ou quem tem `manageMessages`. Nos dois
casos precisa **ver** o canal. Em **conversa privada (`dm`)** não há moderação: só o autor apaga (nem a dona, porque
ela nem vê a conversa; `docs/areas/dms.md`).

**Expulsar, banir e castigar (A19/A20):** `canKickMember` (`kickMembers`), `canBanMember` (`banMembers`) e
`canTimeoutMember` (`timeoutMembers`) usam a mesma hierarquia do `canModerate`: nem a si mesmo, nem a dona, só alvo
abaixo do meu cargo mais alto; Administrador sem hierarquia. Cada permissão vale só para a sua ação (`manageMembers`
não dá nenhuma delas). Tirar banimento e ver a lista: só `banMembers` (sem alvo, sem hierarquia). Valem para qualquer
conta, online ou não, dentro ou fora da voz.

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

| Evento (app → servidor, A19/A20) | Payload | Ack | Efeito |
|---|---|---|---|
| `moderation:kick` | `{ accountId }` | `OkResult` | apaga as sessões; cada conexão da conta recebe `moderation:removed { kind: 'kick', by }` e cai (`disconnect(true)`) |
| `moderation:ban` | `{ accountId, reason? }` | `OkResult` | motivo aparado, vazio vira null, mais de 200 recusa; grava `community_bans` com o e-mail atual e faz o mesmo do kick com `{ kind: 'ban', reason }`. Banir de novo mantém o primeiro registro |
| `moderation:unban` | `{ accountId }` | `OkResult` | apaga a linha; sem linha → "Essa pessoa não está banida" |
| `moderation:bans` | — | `BansResult` | lista do mais novo para o mais antigo |
| `moderation:timeout` | `{ accountId, minutes }` | `OkResult` | inteiro de 0 a 10080 ("Escolha de 1 minuto a 7 dias"); 0 tira. Grava `server_timeouts` e emite `moderation:timeout-changed { accountId, until }` (`until` null = sem castigo) para **todos** |
| `moderation:timeouts` | — | `MemberTimeout[]` | castigos valendo agora |

## Expulsar e banir da comunidade (A19)

1. O servidor confere a regra e se a conta existe ("Pessoa não encontrada"). No ban, grava antes de derrubar.
2. `deleteAccountSessions` apaga todas as sessões: o token salvo no app não reconecta (`unauthorized`).
3. Cada conexão da conta recebe `moderation:removed` e é desconectada. Sair da voz e da presença acontece pelo
   `disconnect` de sempre.
4. No app: o listener apaga o token, chama o `disconnect()` de `lib/client.ts` (volta à tela de login) e avisa
   "<nome> expulsou você da comunidade. Você pode entrar de novo." ou "Você foi banido desta comunidade. Motivo: …".
5. Banida: login, Google e cadastro com o mesmo e-mail respondem "Você foi banido desta comunidade" (a tela de login
   mostra o erro). Ban é por **conta e e-mail**, não por IP (ADR `docs/decisions/0011-ban-por-conta-e-email.md`).

## Castigo (A20)

1. `setTimedOut(io, conta, prazo, quem)` grava em `server_timeouts`, agenda o fim (`setTimeout` até o prazo), emite
   `moderation:timeout-changed` e chama os ouvintes de `onTimeoutsChange`. Trocar o prazo cancela o agendamento antigo.
2. Voz: `isServerMuted` passa a ser verdade, `applyVoiceAccess` tira o microfone no LiveKit e marca
   `serverMuted`/`muted` (mesmo fluxo do silêncio pelo servidor, acima, inclusive voltar desmutada no fim).
3. Mensagem (`message:send`) e reação (`message:react`, pôr ou tirar) respondem `timeoutMessage`: "Você está de castigo
   até HH:MM", ou "até DD/MM HH:MM" se o prazo é em outro dia. A hora é a do **fuso do servidor** (`TZ`).
4. No prazo, o próprio servidor tira (banco, memória, evento e voz). Ao reiniciar, carrega os que ainda valem e apaga
   os vencidos. Em conversa privada também vale (o castigo é da conta).
5. App: `timeouts` na store; o `Composer` troca o campo pelo aviso com a hora local, e volta sozinho com o
   `moderation:timeout-changed` do fim.

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
- **Comunidade (A19/A20)**, em qualquer pessoa da lista (não precisa estar na voz): "Castigo ▸" (1 minuto, 10
  minutos, 1 hora, 1 dia, 1 semana; com castigo valendo, só "Tirar castigo"), "Expulsar da comunidade" (confirma) e
  "Banir da comunidade" (janela com motivo opcional). Cada item só aparece com a regra do contrato.
- **Banidos:** Configurações da comunidade → aba "Banidos" (só com `banMembers`; quem tem só ela também vê a engrenagem).
- **Mensagens:** lixeira no canto ao passar o mouse (autor; ou `manageMessages` fora de DM), com confirmação. Para
  todos que veem o canal, a mensagem some da lista na hora (`message:deleted`).

## Limites e problemas conhecidos

- `LIMITS.moderation`: 20 ações seguidas por conta, depois 1 por segundo (vale para todas as ações de moderação).
- Mover depende do app da pessoa obedecer ao `moderation:moved` (como no sorteador). Um app modificado poderia
  ignorar; para tirar à força, use "Expulsar da voz". Um app **antigo**, sem o listener `moderation:moved`
  (anterior à v0.1.1), também ignora: o servidor responde `ok` para quem moveu e nada acontece, sem erro em nenhuma
  das telas.
- O silêncio pelo servidor fica no banco (`server_mutes`) e vale até alguém tirar, mesmo depois de reiniciar o servidor.
  Quem silenciou aparece no registro de auditoria (abaixo).
- Ban por conta e e-mail: outra conta com outro e-mail entra (não há ban por IP, ADR 0011). Trocar o e-mail da conta
  não escapa (a conta continua banida), mas o e-mail novo pode ser usado num cadastro novo.
- Castigo: o fim depende de um `setTimeout` no processo; se o servidor estiver fora no prazo, o castigo sai no boot.
  A hora do aviso do servidor segue o `TZ` do processo (em Docker, defina `TZ=America/Sao_Paulo`); o composer usa a
  hora local do app.
- Quem baniu, castigou ou apagou a mensagem de outra pessoa aparece no registro de auditoria (abaixo).
- Apagar não tem "desfazer".

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/moderation.test.ts` | Servidor real + LiveKit falso: expulsar (aviso com o nome, sai da lista, `RemoveParticipant`), hierarquia (sem permissão, dona, cargo igual, si mesmo), quem não está em sala; mover (só a pessoa recebe `moderation:moved` com a sala e quem moveu, entra de novo pelo `voice:join`; recusas: mesma sala, fora da voz, sala de texto/inexistente, sem permissão, sobre a dona, sala em que ela não pode entrar); `moveMembers` (move quem está abaixo, mas não expulsa nem silencia; sem ela recusa; não move a dona nem cargo igual); silenciar (lista e `UpdateParticipant` sem microfone, não se dessilencia, vale ao voltar, tirar devolve a fala, **tirar desmuta na hora sem a pessoa mandar nada** (mesmo com `voice:update` "mutado" durante o silêncio), quem já estava mutado continua mutado, entrou silenciada volta como entrou, **continua depois de reiniciar o servidor e tirar também fica guardado**), validação; apagar (autor, `manageMessages`, canal que não vê sem vazar evento, arquivo do anexo apagado, id inválido). |
| `server/repo/moderation.test.ts` | Repo no banco de verdade: gravar/repetir/tirar, id inválido e conta inexistente, apagar a conta silenciada (some) e a de quem silenciou (fica). |
| `server/tests/community-moderation.test.ts` | Servidor real (A19/A20): expulsar (todas as conexões recebem o aviso e caem, token velho não conecta, login volta), hierarquia de `kickMembers`, conta inexistente; banir (motivo, login/cadastro recusados com `BANNED_MESSAGE`, lista, tirar, motivo longo, sem motivo), `banMembers` x `kickMembers`; castigo (evento com prazo para todos, mensagem e reação recusadas, lista, 0 tira, voz silenciada no LiveKit e de volta, hierarquia, minutos inválidos, 7 dias e reiniciar o servidor). |
| `server/modules/timeouts.test.ts` | Fim sozinho no prazo (memória, banco, evento, ouvintes), trocar o prazo cancela o fim antigo, boot carrega os válidos e apaga os vencidos. |
| `server/auth.test.ts` ("banimento da comunidade") | Login (senha certa recusa; errada não revela), Google por conta e por e-mail, cadastro com e-mail banido, sessão que sobrou. |
| `src/shared/types/moderation.test.ts` | `canKickMember`/`canBanMember`/`canTimeoutMember` (cada permissão só na sua ação, hierarquia) e `timeoutMessage` (mesmo dia, outro dia, fuso). `canMoveMember` puro: `moveMembers` move quem está abaixo sem ganhar `canModerate`; `manageMembers` continua movendo; nem a si, nem a dona, nem cargo igual/acima; sem as duas permissões ninguém; a dona move todos. |
| `src/renderer/src/lib/actions/voice-permissions.test.ts` + `lib/voice.test.ts` | Fim do silêncio no app: relê as permissões (já e depois, se faltar), não relê se o LiveKit já avisou, manda `voice:update` desmutado; `syncPermissions` reabre e publica o microfone. |
| `src/renderer/src/lib/actions/moderation.test.ts` | `message:deleted` na store, `moderation:kicked` (sai e avisa uma vez; de outra sala ignora), `moderation:moved` (troca de sala com aviso; a tela acompanha só se eu olhava a sala antiga; fora da voz ou já na sala, ignora), `moveToVoice`, avisos de "silenciado por moderador" e o payload das ações. |
| `src/renderer/src/components/voice/community-moderation.test.tsx` | Itens Castigo/Expulsar/Banir pela permissão e hierarquia, confirmação, janela do ban com motivo, prazos do castigo e "Tirar castigo", composer de castigo, aba Banidos (lista, tirar, vazia, sem permissão). |
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
| "Você foi banido desta comunidade" no login | Há linha em `community_bans` com a conta ou o e-mail. Tire pela aba Banidos (ou apague a linha). |
| Castigo não acabou na hora | O fim é um `setTimeout` do servidor; confira `server_timeouts.until`. Hora estranha no aviso: `TZ` do servidor. |
| Mensagem apagada continua na tela de alguém | Essa conexão não vê o canal agora ou estava sem histórico carregado (ao carregar, ela já não vem). |

## Registro de auditoria

Quem administra vê quem fez o quê na comunidade: moderação, cargos, regras de canal e canais. Serve para
responder "quem baniu fulano?" ou "quem apagou o canal?" sem depender de alguém lembrar.

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/audit.ts` | Contrato: `AuditDetailsByAction` (ação → formato do `details`), `AuditAction` (union das chaves), `AUDIT_ACTIONS`, `isAuditAction`, `auditTargetType` (ação → `account`/`role`/`channel`), `AuditRecord`, `AuditEntry`, `AuditPerson`, `AuditFilter`, `AuditListResult`, `AUDIT_PAGE_SIZE` (50) e `AuditClientEvents`. |
| `server/db/schema/audit.ts` | Tabela `audit_log`: `id` (uuid), `actor_account_id`, `action`, `target_type`, `target_id` (pode ser null), `details` (jsonb), `created_at` (índice). Sem chave estrangeira para `accounts`: o histórico fica mesmo se a conta for apagada. |
| `server/repo/audit.ts` | `recordAudit({ actorId, action, targetId, details })` (o `target_type` sai da ação) e `listAudit({ before?, actorId?, action?, limit })`: mais novas primeiro (`created_at`, `id`), `limit + 1` para saber o `hasMore`, junta o nome e o id atuais de quem fez e do alvo (quando o alvo é conta). Id inválido = lista vazia. |
| `server/modules/audit.ts` | Handler `audit:list`: confere `hasFullAccess` e valida o filtro. |
| `server/modules/{moderation,permissions,channels}.ts` | Uma chamada `recordAudit` em cada handler auditado, **depois** da ação dar certo e antes do ack. |
| `src/renderer/src/lib/audit.ts` | Puras: `auditSentence(entry)` (frase em pt-BR), `AUDIT_ACTION_LABELS` (rótulos do filtro) e `durationText(minutos)`. |
| `src/renderer/src/lib/actions/audit.ts` | `loadAudit(filtro)`: devolve `{ entries, hasMore }` ou lança o erro do servidor. Sem estado na store (a aba guarda a página). |
| `src/renderer/src/components/settings/AuditTab.tsx` | Aba "Auditoria" das Configurações da comunidade: filtros Pessoa e Ação (`Select` do ui-sdk, com limpar), lista com a frase e a hora, "Carregar mais". |

### O que é gravado

| Ação (`AuditAction`) | Handler | Alvo | `details` |
|---|---|---|---|
| `voice-kick` | `moderation:voice-kick` | conta | `{ channelName }` (sala de onde saiu) |
| `voice-move` | `moderation:voice-move` | conta | `{ channelName }` (sala de destino) |
| `voice-mute` / `voice-unmute` | `moderation:voice-mute` (`muted` true/false) | conta | `{}` |
| `kick` | `moderation:kick` | conta | `{}` |
| `ban` / `unban` | `moderation:ban` / `moderation:unban` | conta | `{ reason }` / `{}` |
| `timeout` / `timeout-clear` | `moderation:timeout` (`minutes` > 0 / 0) | conta | `{ minutes }` / `{}` |
| `message-delete` | `message:delete` **só** quando quem apaga não é o autor | conta do autor | `{ messageId, channel: { name, type } }` |
| `role-create` / `role-update` / `role-delete` | `role:*` | cargo | `{ name }` (nome depois da mudança) |
| `member-roles` | `member:set-roles` | conta | `{ added, removed }` (nomes dos cargos) |
| `channel-overrides` | `channel:set-overrides` | canal | `{ name, type }` |
| `channel-create` / `channel-delete` | `channel:create` / `channel:delete` | canal | `{ name, type }` |
| `channel-layout` | `channel:layout` (arrastar na barra lateral) | — | `{}` |
| `category-create` / `category-delete` | `category:create` / `category:delete` (`server/modules/categories.ts`) | categoria | `{ name }` |
| `category-rename` | `category:rename` | categoria | `{ name, previousName }` |

Não entram: `role:reorder`, o fim automático do castigo no prazo (não tem quem fez), apagar a própria mensagem.
Nome de cargo e de canal vai no `details` (podem ser apagados depois); nome de pessoa vem da conta na hora de listar
(mostra o nome atual).

### Contrato

| Evento | Payload | Ack |
|---|---|---|
| `audit:list` | `{ before?, actorId?, action? }` | `{ ok: true, entries, hasMore }` ou `{ ok: false, error }` |

- `before` = id da última entrada da página anterior. Página de 50.
- Não é tempo real: não há evento de push. A aba pede ao abrir, ao trocar um filtro e no "Carregar mais".

### Regras

- Só a dona ou quem tem um cargo com **Administrador** (`hasFullAccess`, mesma regra no servidor e na tela). Os
  outros recebem "Você não pode ver o registro de auditoria" e não veem a aba.
- O servidor valida o filtro: `before`/`actorId` têm de ser texto e `action` uma `AuditAction`; senão "Filtro inválido".
- Grava só quando a ação deu certo (toda recusa volta antes do `recordAudit`).
- Sem regra em `LIMITS`: é só leitura e só para administradores.

### Na tela

Configurações da comunidade → "Auditoria": cada linha é a frase ("Dona baniu Ana (motivo: spam)", "Dona criou o canal
#geral", "Mod pôs Ana de castigo por 10 minutos", "Dona deu Mod e tirou VIP de Ana") e a data/hora. "Pessoa" lista
quem está online mais quem já apareceu na lista; "Ação" lista todas as ações. Conta apagada aparece como "Conta apagada".

### Como testar

| Arquivo | Cobre |
|---|---|
| `server/tests/audit.test.ts` | Servidor real + LiveKit falso: cada ação auditada grava quem, alvo e `details`; ação recusada não grava; autor apagando a própria não grava; só dona/Administrador listam; filtro por ação, filtro inválido; páginas de 50 sem repetir. |
| `src/renderer/src/lib/audit.test.ts` | Frase de cada ação (inclusive variações: sala x canal, com/sem motivo, cargos dados/tirados), conta apagada, todo `AuditAction` com rótulo, `durationText`. |
| `src/renderer/src/lib/actions/audit.test.ts` | `loadAudit` manda o filtro e devolve a página; erro vira exceção. |
| `src/renderer/src/components/settings/AuditTab.test.tsx` | Aba só para dona/Administrador, lista com hora, "Carregar mais" com `before`, filtros Ação e Pessoa recomeçam a lista, erro do servidor. |

À mão: como a dona, bana alguém e crie um canal; abra Configurações da comunidade → Auditoria e veja as duas linhas.

### Depuração

| Sintoma | Causa e solução |
|---|---|
| Aba "Auditoria" não aparece | A conta não é a dona nem tem cargo com Administrador. |
| Ação feita e não aparece | Ela não está na tabela "O que é gravado", ou foi recusada. Confira `select * from audit_log order by created_at desc`. |
| Nome antigo de cargo/canal | Esperado: o nome é o da hora da ação (`details`). O nome de pessoa é o atual. |
