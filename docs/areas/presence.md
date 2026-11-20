# Presença e status (B28: ausente automático e Não perturbe)

Quem está conectado e **como** está: `online`, `idle` (ausente) ou `dnd` (Não perturbe). Offline continua sendo
"sem conexão" (sai da lista de membros; amigos recebem `friend:presence` com `online: false`).

- **Ausente** sozinho depois de **10 minutos** sem mexer no computador (teclado e mouse em qualquer programa, não só
  no Concord: `GetLastInputInfo` numa thread do Rust). Volta para online ao mexer.
- **Não perturbe** é escolhido no `UserPanel` (clique no avatar/nome → menu "Status e conta"), fica salvo nas
  preferências da conta (vale em todas as janelas e computadores) e **silencia notificações e sons de mensagem e de
  pedido de amizade**. Chamada continua tocando e notificando.
- Bolinha no avatar: verde (`bg-success`) online, amarela (`bg-idle`, token novo `--idle`) ausente, vermelha
  (`bg-destructive`) Não perturbe, cinza (`bg-muted-foreground`) offline.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/presence.ts` | Contrato: `PresenceStatus` (`online \| idle \| dnd`), `ActivityStatus` (`online \| idle`, o que a conexão informa), `isActivityStatus`, a regra pura `presenceStatus(doNotDisturb, idleConnections)`, `ServerState.statuses` e os eventos. |
| `src/shared/idle.ts` | `IDLE_AFTER_SECONDS` (600), `IDLE_CHECK_MS` (5 s), a regra pura `isIdle(segundos)` e o contrato da ponte `IdleBridge`. |
| `src-tauri/src/native/idle.rs` | `IdleWatcher` (thread que confere o tempo parado a cada 5 s com o trait `IdleClock` e avisa só quando muda), `IdleTracker`, `is_idle` (600 s) e `SystemIdleClock` (`GetLastInputInfo`, só Windows). |
| `src-tauri/src/commands/idle.rs` | `install` (inicia o vigia e registra o "parar" no `Shutdown`), comando `idle-get` e evento `idle-change` para a janela principal. Fora do Windows o estado fica sempre "não ocioso". |
| `src/renderer/src/lib/desktop/idle.ts` | `window.api.idle` (`isIdle()`, `onChange(listener)`). |
| `server/modules/presence.ts` | `hello` (devolve `statuses`), `presence:set-status`, saída; guarda em memória as conexões paradas e as contas em Não perturbe; `setDoNotDisturb(io, accountId, on)` (chamado pelas preferências). |
| `server/modules/preferences.ts`, `server/repo/preferences.ts`, `server/db/schema/preferences.ts` | `Preferences.doNotDisturb` (coluna `do_not_disturb`, migration `0015_v8`). |
| `src/renderer/src/lib/actions/presence.ts` | `bindPresenceEvents` (`user:*`, `presence:status`, escuta a ponte `idle` uma vez), `syncActivityStatus` (depois do `hello`), `setDoNotDisturb`. `idleEnv.bridge` é trocado nos testes. |
| `src/renderer/src/lib/presence.ts` | `DotStatus`, `STATUS_LABEL` e o hook `usePresence(accountId, online?)`. |
| `src/renderer/src/components/UserAvatar.tsx` | `StatusDot` (bolinha com `role="img"` e nome: "Online", "Ausente", "Não perturbe", "Offline"). Usado em `MemberList`, `UserPanel`, `DmList`, `FriendsView` e `UserProfileDialog`. |
| `src/renderer/src/components/UserPanel.tsx` | Menu "Status e conta" (`@ui-sdk/react/menu`): Online / Não perturbe (rádio) e "Minha conta". |
| `src/renderer/src/lib/notifications.ts` | `doNotDisturb` na regra de `messageNotification`, `friendRequestNotification`, `messageSound` e `friendRequestSound`; `callNotification` não olha. |
| `src/renderer/src/store/session.ts`, `store/preferences.ts` | `statuses[accountId]` e `doNotDisturb`. |

## Contrato e eventos

| Evento | Direção | Payload | Regras |
|---|---|---|---|
| `hello` | app → servidor | — | o ack traz `state.statuses` (status de cada conta online) |
| `presence:set-status` | app → servidor | `'online' \| 'idle'` | atividade **desta conexão**; outro valor é ignorado; `LIMITS.presence` (5 seguidos, depois 1 a cada 10 s, por conexão; excesso ignorado) |
| `presence:status` | servidor → todos | `{ accountId, status }` | quando o status da conta muda e na primeira janela da conta |
| `preferences:update` | app → servidor | `{ doNotDisturb: boolean }` | outro tipo: "Não perturbe inválido"; salva, avisa as outras janelas (`preferences:updated`) e anuncia o status |

O status vai para **todos**, como o `user:joined` (a lista de membros já mostra quem está online para todo mundo).
A regra "online só para amigos" continua: a tela Amigos/Conversas só mostra o status quando o `FriendEntry.online`
é true; amigo offline fica cinza.

## Regras

- **Status da conta** (`presenceStatus`): Não perturbe vale por cima de tudo; senão `idle` só quando **todas** as
  conexões da conta estão paradas; senão `online`.
- **Conexão nova** começa ativa. Ao conectar, o app pergunta à ponte (`idle-get`) e só manda `idle` se o computador
  já estiver parado. Fechar a única janela ativa deixa a conta ausente se as outras estiverem paradas.
- Não perturbe fica no banco; o servidor carrega no `hello` e esquece da memória quando a última janela fecha.
- **Silenciar** (`lib/notifications.ts`): com `doNotDisturb`, nada de notificação nativa nem som para mensagem
  (conversa, canal, menção) e pedido de amizade. Chamada: notificação e toque normais. Selo do ícone e bolinhas de
  não lido continuam.
- Fora do app (`window.api` não existe, como no `dev:web`) não há ausente automático; Não perturbe funciona igual.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/idle.test.ts` | Limite de 10 min (599 s não, 600 s sim). |
| `src/shared/types/presence.test.ts` | `presenceStatus` (Não perturbe por cima, ausente só com todas paradas) e `isActivityStatus`. |
| `cargo test -p concord` (módulo `native::idle`) | Watcher com relógio injetado (avisa só quando muda, limite de 600 s, para ao parar). |
| `server/tests/presence.test.ts` | Status no `hello`, ausente e volta, duas janelas, fechar a janela ativa, valor inválido, Não perturbe salvo e anunciado, por cima do ausente, volta ao reconectar. |
| `server/tests/preferences.test.ts` | `doNotDisturb` no formato das preferências. |
| `src/renderer/src/lib/actions/presence.test.ts` | `presence:status` na store, ponte do sistema → `presence:set-status`, `syncActivityStatus`, `setDoNotDisturb` (na hora, erro volta) e vindo de outra janela. |
| `src/renderer/src/lib/actions/notifications.test.ts` | Não perturbe cala mensagem e pedido (aviso e som), chamada passa. |
| `src/renderer/src/components/presence.test.tsx` | Bolinhas por status em membros, conversas e amigos; menu do `UserPanel` (Não perturbe, Online, Minha conta). |

À mão (Windows; o relógio do sistema não roda no vitest): duas contas (`docs/areas/dev-workflow.md`); em A, não mexa no
computador por 10 min → em B a bolinha de A fica amarela; mexa → verde em até 5 s. Em A escolha Não perturbe →
vermelha em B; minimize A e mande mensagem de B → sem notificação nem som; ligue de B → A toca e notifica.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Nunca fica ausente | Algo mexe no "tempo parado" do sistema (mouse com tremor, programa que simula tecla, vídeo em tela cheia que bloqueia o descanso). O Rust lê `GetLastInputInfo`; veja o log do app. No navegador não existe. |
| Fica ausente com outra janela aberta em uso | Não deveria: é por conta e exige todas as conexões paradas. Confira se a outra janela é da mesma conta. |
| Bolinha vermelha some ao reabrir | Não deveria: Não perturbe está em `account_preferences.do_not_disturb`; confira o `preferences:get`. |
| Status atrasado depois de muitas trocas | `LIMITS.presence` ignorou o excesso; o próximo envio (próxima mudança) corrige. |
| Tela em branco logo depois de entrar (app atualizado) | Servidor de versão anterior à B28 não manda `statuses` no `hello`. O app trata como `{}` (`lib/client.ts`, teste em `lib/client-session.test.ts`), e todo mundo aparece online. Atualize o servidor para ver ausente e Não perturbe. |
