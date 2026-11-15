---
name: concord-themes
description: Como funcionam os temas personalizáveis do Concord (v5) — contrato ThemeConfig (base, cor de destaque, gradiente, intensidade), validateTheme e o código de compartilhamento (funções puras), preferências da conta no servidor (tema ativo + até 10 temas salvos, preferences:get/update/updated) , o motor no app (B11: deriveTokens com contraste WCAG AA garantido, temas prontos, applyTheme, sincronia com a conta) "Surpreenda-me" (surpriseTheme), o tema translúcido/vidro (translucent, src/main/translucency.ts, src/shared/translucency.ts, glassTheme, IPC window-translucency) e a seção "Aparência" das Configurações (B12: galeria, editor ao vivo, temas salvos, código). Use ao mexer em src/shared/types/theme.ts, src/renderer/src/lib/theme/**, lib/actions/preferences.ts, store/preferences.ts, components/settings/appearance/**, src/shared/types/preferences.ts, server/modules/preferences.ts, server/repo/preferences.ts, server/db/schema/preferences.ts, nos tokens de cor de assets/globals.css, ou ao investigar tema que não salva, não sincroniza entre janelas ou "Tema inválido".
---

A documentação desta área fica em **`docs/areas/themes.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
