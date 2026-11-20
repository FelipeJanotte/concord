# Notificações (B9)

Avisar quem está com o Concord em segundo plano: **mensagem numa conversa privada**, **alguém ligando** e
**pedido de amizade**. Além disso, o ícone do app mostra quantos avisos estão pendentes (o mesmo número do selo
da Home + chamadas tocando para mim). Dá para desligar tudo no próprio app e escolher um som curto por tipo de aviso.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/notifications.ts` | Contrato da ponte (não é Socket.IO): `NativeNotification { title, body, target?, silent? }`, `NotificationTarget` (`dm` ou `channel` + `channelId`, ou `friends`), limites de tamanho e `NotificationsBridge` (`show`, `setBadge`, `onClick`). |
| `src-tauri/src/native/notifications.rs` | Regras puras: `clean_notification` (título obrigatório; título até 64 caracteres, corpo até 200, id de canal até 64), `clean_badge_count` (0 a 999), `should_flash`, `activation_url`/`parse_activation` (`concord://notification?target=<json>`), `toast_xml` e `ClickQueue` (guarda cliques até a página carregar). |
| `src-tauri/src/commands/notifications.rs` | Comandos `notify` e `badge`; `install` (AUMID, deep link, instância única); `focus_main_window`; `page_loaded`. Toast pelo WinRT (`ToastNotificationManager`), selo por `set_overlay_icon`, piscar por `request_user_attention`. |
| `src-tauri/src/native/permissions.rs` | A permissão `notifications` da página é liberada. |
| `src/renderer/src/lib/desktop/notifications.ts` | `window.api.notifications`: `show` (`notify`), `setBadge` (`badge`) e `onClick` (`notification-click`). |
| `src/renderer/src/lib/notifications.ts` | Regras puras: `messageNotification`, `callNotification`, `friendRequestNotification`, `messageSound`, `friendRequestSound`, `messagePreview`, `badgeCount`, `drawBadge` (bolinha com o número em canvas, cor do token `--destructive`). |
| `src/renderer/src/lib/actions/notifications.ts` | `bindNotificationEvents` (ouve `message:new`, `call:updated`, `friend:updated`; assina a store para o selo; registra o clique), `syncBadge`, `openNotificationTarget`, `stopNotifications` (chamado no `disconnect`: para tudo e zera o selo) e as preferências (`setChannelNotifications`, `setNotificationsEnabled`, `setNotificationSound`, `loadNotificationPreferences`). `notificationEnv` (ponte, foco e `playSound`) é substituído nos testes. |
| `src/renderer/src/store/notifications.ts` | Preferências desta máquina: `channelNotifications`, `notificationsEnabled`, `notificationSounds` (`NotificationSoundKind`: `dm`, `mention`, `friend`). |
| `src/renderer/src/lib/sounds/chime.ts` | Os três sons (`notify-dm`, `notify-mention`, `notify-friend`) no mesmo `ChimePlayer` dos sons da sala, gerados pela Web Audio (sem arquivo). |
| `src/renderer/src/components/settings/NotificationSettings.tsx` | Configurações → "Notificações": interruptor geral, "Notificar mensagens de canal" e "Tocar um som" por tipo. |

## Regras

- **Só com a janela fora de foco** (`document.hasFocus()` falso). Com o app na frente, a própria tela já mostra o
  não lido, o cartão da chamada e o selo da Home.
- **Mensagem:** de outra pessoa, em conversa privada (`dm`) sempre; em canal da comunidade conforme a preferência
  **"Notificar mensagens de canal"** (`store.channelNotifications`): `all` = toda mensagem (**padrão**), `mentions` =
  só quando me menciona ou é @todos (B19), `none` = nada. Título "Ana em #geral", clique abre o canal (alvo
  `channel`). O que não notifica fica só na bolinha.
- **Preferência:** fica em Configurações → "Notificações" (`components/settings/NotificationSettings.tsx`, `ChannelNotificationSetting`, `docs/areas/settings.md`),
  vale nesta máquina: `setChannelNotifications`/`loadNotificationPreferences` em `lib/actions/notifications.ts`
  (`localStorage` `concord:notifications` = `{ channels, enabled, sounds: { dm, mention, friend } }`; modo estranho volta a
  `all`, interruptor que não é booleano volta a ligado, salvo antigo só com `channels` continua valendo); estado em `store/notifications.ts`.
  Título = nome da pessoa; texto = a mensagem (espaços juntos, até 120) ou "📎 N anexos". Clique abre a conversa.
- **Chamada:** `call:updated` com `status: 'ringing'` e eu como `calleeId`. Notificação **sem som** do sistema (o app
  já toca o toque da B8). Clique abre a conversa (onde fica o "Atender").
- **Pedido de amizade:** `friend:updated` com `status: 'incoming'`. Cada pedido avisa uma vez por conexão (o mesmo
  evento chega quando outra coisa muda, ex. online); depois de resolvido, um pedido novo avisa de novo. Clique abre
  "Amigos".
- **Selo:** `badgeCount` = pedidos recebidos + conversas não lidas (`homeBadge`, B7) + chamadas tocando para mim.
  Recalculado a cada mudança da store, enviado só quando o número muda. **Windows:** `set_overlay_icon` com a imagem
  do `drawBadge` (só aceita `data:image/png`; vazia ou número 0 tira o ícone) e `request_user_attention` quando o número
  sobe com a janela fora de foco (para quando a janela ganha foco). Fora do Windows: `set_badge_count`.
- **Interruptor geral** ("Mostrar notificações do Concord", `notificationsEnabled`, padrão ligado): desligado, nenhuma
  notificação nativa (mensagem, chamada, pedido) **e o selo do ícone fica em 0** (sem número, sem imagem no Windows, sem
  piscar): é o "não me avise fora do app" sem ir às configurações do Windows. Uma regra só, em `show()` e `syncBadge()`
  de `lib/actions/notifications.ts`. Dentro do app nada muda (bolinhas, selo da Home, cartão e toque da chamada).
  "Notificar mensagens de canal" fica travado enquanto está desligado. Religar manda o número atual.
- **Som por tipo** ("Tocar um som", `notificationSounds`, os três ligados por padrão): conversa privada (`dm`), menção em
  canal (@eu ou @todos, `mention`) e pedido de amizade recebido (`friend`), cada um com seu liga/desliga. Regras em
  `messageSound`/`friendRequestSound`:
  - toca **também com o app em foco**, menos quando a mensagem chega na conversa/canal que está na tela (janela em foco
    e `isChatOnScreen`); pedido toca uma vez por pedido (mesma regra do aviso);
  - mudo com **ensurdecer** (`deafened`) e em **canal/conversa silenciados**; mensagem minha não toca;
  - **independente** do interruptor geral e de "Notificar mensagens de canal" (dá para ter só som, sem aviso do
    sistema; menção toca mesmo com o canal em "Nenhuma");
  - quando o som do Concord toca, a notificação nativa vai com `silent: true` (sem som duplo); com o som do tipo
    desligado, a notificação mantém o som do sistema;
  - volume = volume de saída (`outputVolume`), na saída escolhida (`audioOutputId`). Chamada: só o toque da B8.
- **Não perturbe** (B28, `doNotDisturb` nas preferências da conta, escolhido no `UserPanel`): sem notificação nativa
  e sem som para mensagem (conversa, canal, menção) e pedido de amizade, em `messageNotification`,
  `friendRequestNotification`, `messageSound` e `friendRequestSound`. **Chamada passa** (`callNotification` e o toque
  não olham). Selo e bolinhas continuam. Detalhes em `docs/areas/presence.md`.
- O Rust valida tudo (`clean_notification`): título obrigatório, cortes de 64 e 200 caracteres, alvo com id acima de
  64 caracteres recusado, selo de 0 a 999.
- **Fora do app** (tela aberta no navegador, `npm run dev:web`): `window.api` não existe e nada acontece.

## Clique, app fechado e instância única

O toast usa `activationType="protocol"` com `launch="concord://notification?target=<json>"`. O clique abre o esquema
`concord://`, registrado pelo instalador e tratado por `tauri-plugin-deep-link`; `tauri-plugin-single-instance`
(com `deep-link`) entrega o endereço ao Concord já aberto e traz a janela para frente. Com o app **fechado**, o
Windows inicia um Concord novo com o endereço: `install` lê o endereço de abertura (`get_current`) e o clique espera
na `ClickQueue` até a página terminar de carregar (`page_loaded`), então chega como `notification-click` mesmo na
partida. Endereço de outro host, alvo ilegível ou fora dos limites é ignorado com log. No `tauri dev` o esquema é
registrado na hora (`deep_links.register`), porque não há instalador.

`APP_USER_MODEL_ID` = `com.concord.app`, o mesmo `identifier` do `tauri.conf.json`; o processo se identifica com ele
(`SetCurrentProcessExplicitAppUserModelID`) e o toast sai por `CreateToastNotifierWithId`. Sem o atalho do instalador
com esse AUMID o Windows pode não mostrar o toast.

## Silenciar canal

Preferência pessoal, por canal (texto, sala de voz ou conversa privada), **ligar/desligar** sem duração.

- **Onde:** botão direito no canal da barra lateral → "Silenciar canal" / "Reativar canal"; na lista de conversas
  da Home → "Silenciar conversa" / "Reativar conversa" (`components/MuteChannelMenu.tsx`, usado no
  `ChannelSidebar` e no `DmList`; `useChannelMuted` diz se está silenciado).
- **Guardado na conta:** `Preferences.mutedChannels` (ids, até `MUTED_CHANNELS_MAX` = 500), coluna
  `muted_channels` de `account_preferences` (migration `0013_muted_channels`). Vai pelo `preferences:update`
  já existente (lista inteira) e chega nas outras janelas/máquinas da conta pelo `preferences:updated`
  (`docs/areas/themes.md`). Servidor recusa o que não é lista de uuids ou passa do limite ("Canais silenciados
  inválidos (até 500)"); repetidos viram um. Não confere se o canal existe (é só uma preferência minha).
- **App:** `setChannelMuted(channelId, muted)` em `lib/actions/preferences.ts` muda na hora (estado
  `mutedChannels` em `store/preferences.ts`), envia e, se o servidor recusar, volta como estava e avisa.
- **Efeito** (uma regra só, sem checagem espalhada na tela):
  - `messageNotification` devolve `null` para canal silenciado (nem a conversa privada avisa) → sem notificação
    e sem som do sistema.
  - `message:new` não marca `unread` em canal silenciado, e silenciar (aqui ou em outra janela) tira o não lido
    que já havia. Como o selo da Home, a bolinha da comunidade e o selo do ícone vêm do `unread`, nada conta.
  - Item esmaecido (`opacity-50`, `data-muted`) quando não é o canal aberto/a sala em que estou.
- Menção (@eu, @todos) em canal silenciado também não avisa (sem exceção, como "Nenhuma").

## Testes

| Arquivo | Cobre |
|---|---|
| `cargo test -p concord` (módulos `native::notifications` e `commands::notifications`) | Validação e cortes, endereço de ativação (ida e volta, host alheio, alvo fora dos limites), XML do toast com escape, `ClickQueue` (guarda até a página carregar) e piscar só quando sobe com a janela fora de foco. O toast de verdade só se prova num Windows. |
| `src/renderer/src/lib/actions/notifications.test.ts` | Regras (texto, conversa × canal × minha, foco, modos de canal `all`/`mentions`/`none`, preferência salva, chamada só tocando para mim, pedido, selo, som por tipo com interruptor, ensurdecer e silenciado) e a ligação (eventos → notificação, pedido sem repetir, selo acompanha a store e zera ao sair, clique abre a conversa/amigos, interruptor geral sem aviso e selo 0, som no lugar do som do sistema, som em foco menos na conversa aberta). |
| `src/renderer/src/lib/actions/notifications.test.ts` (Não perturbe) | Não perturbe cala aviso e som de mensagem e de pedido; a chamada continua aparecendo. |
| `src/renderer/src/lib/sounds/sounds.test.ts` | Os três sons de notificação são diferentes entre si. |
| `src/renderer/src/components/mute-channel.test.tsx` | Botão direito no canal de texto, na sala de voz e na conversa: silenciar/reativar, esmaecer e enviar a lista. |
| `src/renderer/src/lib/actions/preferences.test.ts` | `setChannelMuted` (na hora, tira o não lido, não reenvia, erro volta), canais silenciados ao carregar e vindos de outra janela. |
| `server/tests/preferences.test.ts` | `mutedChannels` guardado sem repetir, sincronizado, mantido ao trocar o tema; recusa id inválido e lista grande. |
| `src/renderer/src/components/settings/NotificationSettings.test.tsx` | A escolha em Configurações → "Notificações" mostra o modo atual e troca na hora; interruptor geral desliga e trava a escolha de canal; cada som liga/desliga sozinho. |

À mão: duas contas (`docs/areas/dev-workflow.md`); minimize a janela de A; B manda mensagem na conversa, liga e
envia pedido → A vê as três notificações, ouve o som de cada tipo e vê o número na barra de tarefas; clicar abre a conversa/Amigos.
Desligue "Mostrar notificações do Concord" → nada aparece e o número some (os sons continuam); desligue cada som e repita.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| Nenhuma notificação no Windows | "Notificações" do Windows desligadas para o app (Configurações → Sistema → Notificações) ou modo "Não incomodar". O AUMID (`com.concord.app`) é definido pelo shell; no app empacotado o instalador cria o atalho que o Windows exige. No `tauri dev` o Windows pode não mostrar o toast. |
| Aparece com o app aberto | Não deveria: a regra exige a janela fora de foco. Confira `notificationEnv.isFocused`. |
| Selo não some | Ele segue o não lido da Home e as chamadas tocando; abrir a conversa ou responder o pedido zera. Sair da conta também zera. |
| Canal sem notificação nem bolinha | Está silenciado (item esmaecido na lista): botão direito → "Reativar canal". |
| Nada notifica nem toca, mas chamada sim | Não perturbe ligado (bolinha vermelha no `UserPanel`): clique no avatar → Online. |
| Mensagem de canal não notifica | "Notificar mensagens de canal" em Configurações → "Notificações" está em "Só menções" ou "Nenhuma", ou a janela estava em foco. |
| Nenhuma notificação nem número no ícone com o Windows liberado | "Mostrar notificações do Concord" desligado em Configurações → "Notificações". |
| Som não toca | Tipo desligado em "Tocar um som", ensurdecido, canal/conversa silenciado ou a conversa estava aberta na tela. |
| Pendente | Silenciar por um tempo ("por 1 hora"). |
| Clique no toast não abre nada com o app fechado | O esquema `concord://` não está registrado (instalação quebrada) ou a página ainda não carregou: veja o log do Rust (`ativação ignorada` ou `registro do endereço concord:// falhou`). |
