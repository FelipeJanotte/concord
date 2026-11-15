# Notificações (B9)

Avisar quem está com o Concord em segundo plano: **mensagem numa conversa privada**, **alguém ligando** e
**pedido de amizade**. Além disso, o ícone do app mostra quantos avisos estão pendentes (o mesmo número do selo
da Home + chamadas tocando para mim).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/notifications.ts` | Contrato da ponte (não é Socket.IO): `NativeNotification { title, body, target?, silent? }`, `NotificationTarget` (`dm` ou `channel` + `channelId`, ou `friends`), limites de tamanho e `NotificationsBridge` (`show`, `setBadge`, `onClick`). |
| `src/main/notifications.ts` | Processo principal: `setupNotifications(getWindow)` registra os IPC `notify` e `badge`; `cleanNotification`/`cleanBadgeCount` validam o que vem do renderer. Mostra o `Notification` do Electron (guardado num `Set` até fechar, senão o clique se perde) e, no clique, restaura/foca a janela e manda `notification-click` com o alvo. |
| `src/main/index.ts` | Guarda a janela principal (`mainWindow`) e chama `setupNotifications`. A permissão `notifications` já era liberada. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.notifications` (IPC `notify`, `badge` e o ouvinte de `notification-click`). |
| `src/renderer/src/lib/notifications.ts` | Regras puras: `messageNotification`, `callNotification`, `friendRequestNotification`, `messagePreview`, `badgeCount`, `drawBadge` (bolinha com o número em canvas, cor do token `--destructive`). |
| `src/renderer/src/lib/actions/notifications.ts` | `bindNotificationEvents` (ouve `message:new`, `call:updated`, `friend:updated`; assina a store para o selo; registra o clique), `syncBadge`, `openNotificationTarget`, `stopNotifications` (chamado no `disconnect`: para tudo e zera o selo). `notificationEnv` (ponte e foco) é substituído nos testes. |

## Regras

- **Só com a janela fora de foco** (`document.hasFocus()` falso). Com o app na frente, a própria tela já mostra o
  não lido, o cartão da chamada e o selo da Home.
- **Mensagem:** de outra pessoa, em conversa privada (`dm`) sempre; em canal da comunidade conforme a preferência
  **"Notificar mensagens de canal"** (`store.channelNotifications`): `all` = toda mensagem (**padrão**), `mentions` =
  só quando me menciona ou é @todos (B19), `none` = nada. Título "Ana em #geral", clique abre o canal (alvo
  `channel`). O que não notifica fica só na bolinha.
- **Preferência:** fica em "Minha conta" (`components/settings/NotificationSettings.tsx`, `ChannelNotificationSetting`),
  vale nesta máquina: `setChannelNotifications`/`loadNotificationPreferences` em `lib/actions/notifications.ts`
  (`localStorage` `concord:notifications` = `{ channels }`; valor estranho volta a `all`); estado em `store/notifications.ts`.
  Título = nome da pessoa; texto = a mensagem (espaços juntos, até 120) ou "📎 N anexos". Clique abre a conversa.
- **Chamada:** `call:updated` com `status: 'ringing'` e eu como `calleeId`. Notificação **sem som** do sistema (o app
  já toca o toque da B8). Clique abre a conversa (onde fica o "Atender").
- **Pedido de amizade:** `friend:updated` com `status: 'incoming'`. Cada pedido avisa uma vez por conexão (o mesmo
  evento chega quando outra coisa muda, ex. online); depois de resolvido, um pedido novo avisa de novo. Clique abre
  "Amigos".
- **Selo:** `badgeCount` = pedidos recebidos + conversas não lidas (`homeBadge`, B7) + chamadas tocando para mim.
  Recalculado a cada mudança da store, enviado só quando o número muda. **Windows:** `setOverlayIcon` com a imagem
  do `drawBadge` (só aceita `data:image/png`) e `flashFrame(true)` quando o número sobe com a janela em segundo
  plano (para quando a janela ganha foco). **macOS/Linux:** `app.setBadgeCount`.
- O main valida tudo: título obrigatório, cortes em `NOTIFICATION_TITLE_MAX`/`NOTIFICATION_BODY_MAX`, alvo
  desconhecido vira "sem alvo", selo inteiro de 0 a 999.
- **Fora do Electron** (renderer aberto no navegador durante o `npm run dev`): `window.api` não existe e nada acontece.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/main/notifications.test.ts` | Electron falso: validação, notificação mostrada e clique (restaura, foca, manda o alvo), selo no Windows (imagem, piscar e parar ao focar, imagem que não é PNG ignorada, descer não pisca) e no macOS. |
| `src/renderer/src/lib/actions/notifications.test.ts` | Regras (texto, conversa × canal × minha, foco, modos de canal `all`/`mentions`/`none`, preferência salva, chamada só tocando para mim, pedido, selo) e a ligação (eventos → notificação, pedido sem repetir, selo acompanha a store e zera ao sair, clique abre a conversa/amigos). |
| `src/renderer/src/components/settings/NotificationSettings.test.tsx` | A escolha em "Minha conta" mostra o modo atual e troca na hora. |

À mão: duas contas (`docs/areas/dev-workflow.md`); minimize a janela de A; B manda mensagem na conversa, liga e
envia pedido → A vê as três notificações e o número na barra de tarefas; clicar abre a conversa/Amigos.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Nenhuma notificação no Windows | "Notificações" do Windows desligadas para o app (Configurações → Sistema → Notificações) ou modo "Não incomodar". O `AppUserModelId` (`com.concord.app`) é definido no `main`; no app empacotado o instalador cria o atalho que o Windows exige. |
| Aparece com o app aberto | Não deveria: a regra exige a janela fora de foco. Confira `notificationEnv.isFocused`. |
| Selo não some | Ele segue o não lido da Home e as chamadas tocando; abrir a conversa ou responder o pedido zera. Sair da conta também zera. |
| Mensagem de canal não notifica | "Notificar mensagens de canal" em "Minha conta" está em "Só menções" ou "Nenhuma", ou a janela estava em foco. |
| Pendente | Escolha por canal (silenciar um canal só), desligar tudo no app (hoje só pelo Windows) e som próprio por tipo. |
