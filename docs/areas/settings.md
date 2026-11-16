# Configurações do usuário

Uma janela só, com menu lateral, como no Discord: **Minha conta**, **Voz e vídeo**, **Aparência** e **Notificações**.
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
| `src/renderer/src/store/settings.ts` | `settingsSection: 'account' \| 'voice' \| 'appearance' \| 'notifications' \| null` (null = fechada). Não é salvo. |
| `src/renderer/src/lib/actions/settings.ts` | `openSettings(section = 'account')`, `closeSettings()` (fecha e manda o tema pendente: `flushPendingTheme`). `openDeviceSettings()` (em `lib/actions/devices.ts`) = `openSettings('voice')`. |
| `src/renderer/src/components/UserPanel.tsx` | Engrenagem "Configurações" (e clicar no próprio nome) → "Minha conta"; monta o `UserSettingsDialog` uma vez só. O botão de paleta separado saiu. |

## Como se abre

- Engrenagem do painel da conta, ou clicar no próprio nome → **Minha conta**.
- Botões "Configurações de voz" (controles da sala, painel da chamada privada e "Voz conectada") → **Voz e vídeo**.
- **Conta nova do Google** (`account.tagLocked === false`): o `UserPanel` abre sozinho em "Minha conta" e a janela
  mostra só ela ("Escolha seu id"), **sem o menu**, até salvar o id.

## Regras

- **Minha conta** salva só pelo botão Salvar (desligado sem mudança); trocar de seção ou fechar descarta o que não foi
  salvo. Depois de salvar, a janela continua aberta.
- **Voz e vídeo**, **Aparência** e **Notificações** valem na hora (como antes). A Aparência agrupa os envios do tema:
  sair da seção (desmontar) ou fechar a janela manda o tema final.
- A janela tem altura fixa (`h-[85vh]`, no máximo 720 px) e o conteúdo rola: seção nova nunca corta embaixo.
- Seção nova: componente em `components/settings/`, linha em `SECTIONS`, valor novo em `SettingsSection` e um doc
  (ou seção de doc) na área dela.

## Testes

- `components/settings/UserSettingsDialog.test.tsx`: engrenagem abre em "Minha conta" com as quatro seções, trocar de
  seção, `openDeviceSettings` abre em "Voz e vídeo", Esc fecha e zera, altura limitada e rolagem, Salvar só com
  mudança (continua aberta), conta nova do Google sem o menu.
- Cada seção tem os testes da sua área: `settings/VoiceSettings.test.tsx`, `settings/appearance/appearance.test.tsx`
  (inclui "o tema vai uma vez ao sair da seção" e chegar pela engrenagem), `settings/NotificationSettings.test.tsx`.

À mão: engrenagem → passe pelas quatro seções; na sala, o botão de configurações de voz abre direto em "Voz e vídeo";
mude o tema várias vezes e feche (vai um envio só); com a janela baixa, a seção rola.
