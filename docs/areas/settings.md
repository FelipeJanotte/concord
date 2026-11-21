# Configurações do usuário

Uma janela só, com menu lateral, como no Discord: **Minha conta**, **Voz e vídeo**, **Aparência**, **Notificações** e
**Windows** (só no app instalado no Windows; ver [Iniciar com o Windows](#iniciar-com-o-windows)).
Antes eram três janelas soltas ("Minha conta", "Configurações de voz" e "Aparência", cada uma com seu botão).
O conteúdo de cada seção continua documentado na área dela (links abaixo); aqui fica a janela em si.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/renderer/src/components/settings/UserSettingsDialog.tsx` | A janela: título invisível "Configurações", menu (`nav` "Seções das configurações", item atual com `aria-current="page"`) e a área do conteúdo (`data-testid="settings-body"`, rola). Registro `SECTIONS` (id, rótulo, ícone, componente). Cada seção é montada com `key` = id: trocar de seção desmonta a anterior. |
| `src/renderer/src/components/settings/SettingsHeading.tsx` | Título e descrição de cada seção. |
| `src/renderer/src/components/settings/AccountSettings.tsx` | "Minha conta" (era `ProfileDialog`): foto, nome, id, como entra, Salvar e "Sair da conta" — `docs/areas/accounts.md`. |
| `src/renderer/src/components/settings/VoiceSettings.tsx` | "Voz e vídeo" (era `voice/DeviceSettings.tsx`): dispositivos, volumes, equalizador automático, ruído, pressione para falar, sons da sala, sobreposição — `docs/areas/voice.md` e `docs/areas/overlay.md`. |
| `src/renderer/src/components/settings/appearance/AppearanceSettings.tsx` | "Aparência" (era `AppearanceDialog`) — `docs/areas/themes.md`. |
| `src/renderer/src/components/settings/NotificationSettings.tsx` | "Notificações" (`NotificationSettings`: interruptor "Mostrar notificações do Concord", a `ChannelNotificationSetting`, que antes ficava dentro de "Minha conta", e "Tocar um som" por tipo) — `docs/areas/notifications.md`. |
| `src/renderer/src/components/settings/WindowsSettings.tsx` | "Windows": interruptor "Iniciar o Concord com o Windows" — [abaixo](#iniciar-com-o-windows). |
| `src/renderer/src/store/settings.ts` | `settingsSection: 'account' \| 'voice' \| 'appearance' \| 'notifications' \| 'windows' \| null` (null = fechada). Não é salvo. |
| `src/renderer/src/lib/actions/settings.ts` | `openSettings(section = 'account')`, `closeSettings()` (fecha e manda o tema pendente: `flushPendingTheme`). `openDeviceSettings()` (em `lib/actions/devices.ts`) = `openSettings('voice')`. |
| `src/renderer/src/components/UserPanel.tsx` | Engrenagem "Configurações" → "Minha conta"; clicar no próprio nome abre o menu "Status e conta" (Online / Não perturbe e "Minha conta", `docs/areas/presence.md`); monta o `UserSettingsDialog` uma vez só. O botão de paleta separado saiu. |

## Como se abre

- Engrenagem do painel da conta, ou clicar no próprio nome → menu "Status e conta" → **Minha conta**.
- Botões "Configurações de voz" (controles da sala, painel da chamada privada e "Voz conectada") → **Voz e vídeo**.
- **Conta nova do Google** (`account.tagLocked === false`): o `UserPanel` abre sozinho em "Minha conta" e a janela
  mostra só ela ("Escolha seu id"), **sem o menu**, até salvar o id.

## Regras

- **Minha conta** salva só pelo botão Salvar (desligado sem mudança); trocar de seção ou fechar descarta o que não foi
  salvo. Depois de salvar, a janela continua aberta.
- **Voz e vídeo**, **Aparência**, **Notificações** e **Windows** valem na hora. A Aparência agrupa os envios do tema:
  sair da seção (desmontar) ou fechar a janela manda o tema final.
- A janela tem altura fixa (`h-[85vh]`, no máximo 720 px) e o conteúdo rola: seção nova nunca corta embaixo.
- Seção nova: componente em `components/settings/`, linha em `SECTIONS`, valor novo em `SettingsSection` e um doc
  (ou seção de doc) na área dela.
- A seção **Windows** só entra no menu quando o processo principal diz que o iniciar com o Windows é suportado
  (`openAtLogin !== null`); sem isso, `openSettings('windows')` cai na primeira seção.
- **Versão do app** no fim do menu (canto inferior esquerdo): "Versão X.Y.Z", vinda de `import.meta.env.VITE_APP_VERSION`,
  que o `electron.vite.config.ts` preenche com a `version` do `package.json` no build (vale no instalador e na versão web).
  Nos testes, `vi.stubEnv('VITE_APP_VERSION', ...)`.

## Testes

- `components/settings/UserSettingsDialog.test.tsx`: engrenagem abre em "Minha conta" com as quatro seções (sem a ponte, a seção Windows não aparece), trocar de
  seção, `openDeviceSettings` abre em "Voz e vídeo", Esc fecha e zera, altura limitada e rolagem, versão no fim do menu, Salvar só com
  mudança (continua aberta), conta nova do Google sem o menu.
- Cada seção tem os testes da sua área: `settings/VoiceSettings.test.tsx`, `settings/appearance/appearance.test.tsx`
  (inclui "o tema vai uma vez ao sair da seção" e chegar pela engrenagem), `settings/NotificationSettings.test.tsx`,
  `settings/WindowsSettings.test.tsx` e `src/main/startup.test.ts` (ver [Iniciar com o Windows](#iniciar-com-o-windows)).

À mão: engrenagem → passe pelas seções (cinco no app instalado no Windows); na sala, o botão de configurações de voz abre direto em "Voz e vídeo";
mude o tema várias vezes e feche (vai um envio só); com a janela baixa, a seção rola.

## Iniciar com o Windows

Interruptor **"Iniciar o Concord com o Windows"** na seção **Windows**. **Ligado por padrão**: na primeira execução do
app instalado, o Concord se registra para abrir ao entrar no Windows. Depois disso vale a escolha da pessoa: se ela
desligar, nem reabrir nem atualizar religam. Nenhuma das outras seções servia (não é conta, voz, aparência nem aviso),
daí a seção nova curta, como a "Configurações do Windows" do Discord.

| Arquivo | Papel |
|---|---|
| `src/main/startup.ts` | `createStartupController({ supported, loginItems, marker })`: `applyDefault()` (liga uma vez só e marca), `get()`, `set(valor)` (ignora o que não é booleano). `supportsOpenAtLogin(platform, isPackaged)`: só `win32` **e** app instalado. `fileMarker(path)`: a marca "padrão já aplicado". `setupStartup()` liga ao Electron: `app.setLoginItemSettings({ openAtLogin })` e `app.getLoginItemSettings().executableWillLaunchAtLogin`. |
| `src/shared/startup.ts` | `OpenAtLogin = boolean \| null` (null = não suportado) e `StartupBridge` (`get`, `set`). |
| `src/preload/index.ts` | `window.api.startup`: IPC `startup-get` e `startup-set` (`invoke`, devolvem o estado real do sistema). |
| `src/renderer/src/lib/actions/startup.ts` | `loadStartup()` (na abertura, em `main.tsx`) e `setOpenAtLogin(bool)`; `startupEnv.bridge()` é a costura dos testes. Falha ao mudar: aviso "Não foi possível mudar o início com o Windows." e o interruptor fica como estava. |
| `src/renderer/src/store/startup.ts` | `openAtLogin: boolean \| null`. Não é salvo no renderer: a fonte é o sistema. |
| `src/renderer/src/components/settings/WindowsSettings.tsx` | A seção "Windows" com o interruptor. |

**Onde fica guardado.** A escolha é o próprio registro do Windows (chave `Run` do usuário, escrita pelo Electron). A
marca "já apliquei o padrão" é o arquivo vazio `startup-default-applied` em `app.getPath('userData')`
(`%APPDATA%\Concord`); não usa `localStorage`. O main lê `executableWillLaunchAtLogin`, que também respeita quem
desligou o Concord pelo Gerenciador de Tarefas → Aplicativos de inicialização.

**Onde vale.** Só no Windows com o app empacotado (`app.isPackaged`). Em dev (`npm run dev`) o main não registra o
`electron.exe` e responde `null`; a seção some. No macOS a mesma API existiria, mas ficou de fora por simplicidade (o
texto fala em Windows e o macOS 13+ pede outra forma de registro). Na versão web não há `window.api`: nada é chamado e
a seção não aparece.

**Fluxo.**

| Situação | O que acontece |
|---|---|
| Primeira execução instalada | `applyDefault()`: registra para iniciar e cria a marca. Interruptor ligado. |
| Pessoa desliga | `startup-set false` → `setLoginItemSettings({ openAtLogin: false })`; a tela mostra o que o sistema devolveu. |
| Reabrir / atualizar | A marca existe: nada muda; vale o que está no registro. |
| Dev / macOS / Linux / web | Nada é registrado; a seção não aparece. |

**Testes.** `src/main/startup.test.ts` (controlador com registro e marca falsos; `fileMarker` com pasta temporária).
`components/settings/WindowsSettings.test.tsx` (seção visível com o estado do sistema, ligar/desligar, falha ao mudar,
sem suporte / navegador / falha ao ler: seção some).

**À mão** (precisa do instalador: `npm run dist` e instalar): na primeira abertura, Gerenciador de Tarefas →
Aplicativos de inicialização mostra o Concord habilitado (ou `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run`);
desligue o interruptor, feche e reabra: continua desligado e a entrada some; reinicie o Windows para conferir.
Para refazer a "primeira execução", apague `%APPDATA%\Concord\startup-default-applied`.
