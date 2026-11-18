---
name: concord-settings
description: Como funciona a janela de Configurações do usuário do Concord — janela única com menu lateral (Minha conta, Voz e vídeo, Aparência, Notificações, Windows), settingsSection na store, openSettings/closeSettings/openDeviceSettings, a conta nova do Google escolhendo o id e o "Iniciar o Concord com o Windows" (IPC startup-get/startup-set). Use ao mexer em components/settings/UserSettingsDialog.tsx, SettingsHeading.tsx, AccountSettings.tsx, VoiceSettings.tsx, appearance/AppearanceSettings.tsx, NotificationSettings.tsx, WindowsSettings.tsx, store/settings.ts, store/startup.ts, lib/actions/settings.ts, lib/actions/startup.ts, src/main/startup.ts, src/shared/startup.ts, na engrenagem do UserPanel, ao criar uma seção nova nas configurações, ou ao investigar configuração que não abre na seção certa, que corta embaixo, tema que não salva ao fechar ou Concord que não abre (ou abre sem querer) ao entrar no Windows.
---

A documentação desta área fica em **`docs/areas/settings.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
