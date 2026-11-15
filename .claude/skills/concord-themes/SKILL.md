---
name: concord-themes
description: Como funcionam os temas personalizáveis do Concord (v5) — contrato ThemeConfig (base, cor de destaque, gradiente, intensidade), validateTheme e o código de compartilhamento (funções puras), preferências da conta no servidor (tema ativo + até 10 temas salvos, preferences:get/update/updated) , o motor no app (B11: deriveTokens com contraste WCAG AA garantido, temas prontos, applyTheme, sincronia com a conta) e a janela "Aparência" (B12: galeria, editor ao vivo, temas salvos, código). Use ao mexer em src/shared/types/theme.ts, src/renderer/src/lib/theme/**, lib/actions/preferences.ts, store/preferences.ts, components/settings/appearance/**, src/shared/types/preferences.ts, server/modules/preferences.ts, server/repo/preferences.ts, server/db/schema/preferences.ts, nos tokens de cor de assets/globals.css, ou ao investigar tema que não salva, não sincroniza entre janelas ou "Tema inválido".
---

# Temas personalizáveis (v5, Dev A: A9 servidor, B11 motor, B12 editor)

Temas com fundo em gradiente e cor de destaque, prontos e editáveis, **grátis para todos**, salvos na conta e
compartilháveis por código. As cores do app já são tokens CSS (`assets/globals.css`); um tema é só a **receita**, e
os tokens de cada parte da tela são **derivados** dela no app (`deriveTokens`, B11), com contraste legível.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/theme.ts` | Contrato: `ThemeConfig`, `SavedTheme`, `DEFAULT_THEME` (o visual de hoje), limites e as funções puras `validateTheme`, `cleanThemeName`, `encodeThemeCode`/`decodeThemeCode`. |
| `src/shared/types/preferences.ts` | `Preferences { theme, savedThemes }`, `PreferencesUpdate`, eventos `preferences:*`. |
| `server/modules/preferences.ts` | `preferences:get`, `preferences:update` (valida tudo com o contrato; avisa as outras janelas da mesma conta). |
| `server/repo/preferences.ts` | `getPreferences` (sem registro → padrão) e `updatePreferences` (grava só o que veio; cria na primeira vez). |
| `server/db/schema/preferences.ts` | Tabela `account_preferences` (migration `0004_preferences`): `theme` e `saved_themes` em jsonb; apagar a conta apaga junto. |

## Contrato

```ts
ThemeConfig = {
  base: 'escuro' | 'claro',
  accent: '#rrggbb',                                  // destaque (botões, links, seleção)
  background: { stops: '#rrggbb'[] /* 1 a 4 */, angle: 0..360 },
  intensity: 0..100                                    // 0 = base lisa, 100 = gradiente cheio
}
```

- `validateTheme(raw)` → tema normalizado (cores em minúsculas, ângulo e intensidade inteiros, campos extras fora)
  ou `null`. **Servidor e app usam a mesma função**: só se grava e só se aplica tema válido.
- Código de compartilhamento: `concord-tema:<0|1>~<accent>~<stop.stop…>~<ângulo>~<intensidade>` (sem `#`). `decodeThemeCode`
  aceita espaços em volta e passa pelo `validateTheme`.
- Temas salvos: até 10, cada um com `id` (uuid gerado pelo app), `name` (1–32, `cleanThemeName`) e `theme`.

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `preferences:get` | — | `Preferences` | sem nada salvo: `DEFAULT_THEME` e `[]` |
| `preferences:update` | `{ theme?, savedThemes? }` | `PreferencesResult` | exige `hello`; tema inválido → "Tema inválido"; lista inválida (mais de 10, id repetido/não-uuid, nome vazio, tema inválido) → erro; vazio → "Nada para mudar"; limite `LIMITS.preferences` (20 seguidas, depois 1/s, por conta) |
| `preferences:updated` (servidor → app) | `Preferences` | — | para as **outras** conexões da mesma conta (a janela que mudou recebe pelo ack) |

## Motor no app (B11)

A v5 inteira é do **Dev A** (B11 e B12 transferidas do Dev B).

| Arquivo | Papel |
|---|---|
| `src/renderer/src/lib/theme/color.ts` | Puras: `mix`, `average`, `luminance`, `contrast` (WCAG), `ensureContrast` (puxa o texto para o branco/preto até 4,5:1 com todas as superfícies), `readableOn`. |
| `src/renderer/src/lib/theme/derive.ts` | `deriveTokens(theme)` → `{ tokens, gradient, gradientStops, colorScheme }`; `THEME_TOKENS` (os nomes das variáveis CSS). |
| `src/renderer/src/lib/theme/presets.ts` | `THEME_PRESETS`: 11 temas prontos (Padrão, Aurora, Pôr do sol, Oceano, Floresta, Neon, Grafite, Lavanda, Cereja, Claro, Amanhecer). |
| `src/renderer/src/lib/theme/apply.ts` | `applyTheme` (variáveis no `<html>`, `--app-gradient`, `color-scheme`, transição de 300 ms), `saveLocalTheme`/`loadLocalTheme` (`concord:theme` no `localStorage`). |
| `src/renderer/src/lib/actions/preferences.ts` | `loadPreferences` (depois do `hello`), listener `preferences:updated`, `previewTheme`, `setTheme` (envio agrupado em 400 ms), `flushPendingTheme`, `saveThemes`. |
| `src/renderer/src/store/preferences.ts` | `theme`, `savedThemes`, `preferencesLoaded`. |
| `src/renderer/src/main.tsx` | Aplica o último tema da máquina antes de desenhar (antes do login). |
| `src/renderer/src/assets/globals.css` | Valores de `:root` = paleta escura do tema padrão; `.bg-background` desenha o `--app-gradient`; `.theme-transition`. |

**Como o tema vira cores (`deriveTokens`):**
- Duas paletas de base. A escura é **exatamente** a de antes: o `DEFAULT_THEME` reproduz o `:root` de
  `globals.css`, e um teste lê o CSS e confere.
- O gradiente tinge as superfícies na proporção da `intensity`, cada uma com um peso (`TINT`); o tom é a média das cores.
- O fundo principal mostra o gradiente de verdade (`--app-gradient`, até 55% de cada cor sobre a base).
- **Contraste garantido.**
  - Toda superfície tingida mantém 7:1 com o extremo do texto (`keepHeadroom`): se o gradiente for claro demais
    num tema escuro, a superfície é escurecida.
  - Os textos passam por `ensureContrast`, com AA (4,5:1) sobre cada superfície em que aparecem, inclusive cada cor do gradiente.
  - O texto sobre a cor de destaque é branco ou preto, o que ler melhor.
  - Um teste gera 500 temas aleatórios com semente e confere todos.

**Fluxo:**
1. Ao abrir, o app aplica o tema guardado na máquina.
2. Depois do `hello`, o `loadPreferences` aplica o tema da conta e o guarda na máquina.
3. `setTheme` muda a tela na hora e envia `preferences:update` 400 ms depois, agrupando as mudanças do seletor de cor.
   Um `preferences:updated` vindo de outra janela não desfaz a troca pendente desta.
4. `previewTheme` só mostra, para a prévia do editor.

## Editor "Aparência" (B12)

Botão **Aparência** (ícone de paleta) no painel do usuário (`UserPanel`), ao lado de "Minha conta".

| Arquivo | Papel |
|---|---|
| `src/renderer/src/components/settings/appearance/AppearanceDialog.tsx` | A janela: temas prontos, meus temas (usar, duplicar, apagar; até 10), personalizar (base, destaque, 1–4 cores do gradiente, ângulo, intensidade, salvar com nome) e compartilhar (código do tema atual, copiar, colar o de um amigo). |
| `src/renderer/src/components/settings/appearance/ThemeSwatch.tsx` | Miniatura de um tema desenhada com as cores **derivadas** dele (barra, canais, chat com gradiente, botão de destaque). |
| `src/renderer/src/lib/theme/editor.ts` | Puras: `addStop`/`removeStop`/`setStop`, `sameTheme`, `matchingPreset`, `copyName`, `addSavedTheme` (nome limpo, até 10), `removeSavedTheme`. |

**Comportamento:**
- **Tudo aplica ao vivo:** clicar num tema ou mexer num controle chama `setTheme`. A tela muda na hora, e o
  servidor recebe agrupado (400 ms).
- **Fechar a janela** manda o que estiver pendente (`flushPendingTheme`).
- O card do tema ativo fica marcado (`aria-pressed`).
- **Erros** aparecem na janela (`role="alert"`): nome vazio, lista cheia, código inválido ou recusa do servidor.
- **Copiar** usa `navigator.clipboard` e mostra um aviso (`notify`, tipo `info`).
- **Botões de base** têm nome acessível "Base escura"/"Base clara", porque existe um tema pronto chamado "Claro".

## Pendente

- Nada da v5. Ideias: renomear tema salvo, importar o tema de um amigo direto pelo perfil dele.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/theme.test.ts` | `validateTheme` (normalização e cada recusa), `cleanThemeName`, código de compartilhamento (ida e volta, recusas). |
| `server/repo/preferences.test.ts` | Padrão sem registro, gravar só o que mudou, uma conta por vez. |
| `server/tests/preferences.test.ts` | Servidor real: padrão, salvar e normalizar, sincronia com a outra janela (e só com ela), persistência após reiniciar, validação dos temas salvos, tema inválido, antes do `hello`. |
| `src/renderer/src/lib/theme/color.test.ts` | Mistura, média, luminância e contraste (valores de referência do WCAG), `ensureContrast`, `readableOn`. |
| `src/renderer/src/lib/theme/derive.test.ts` | Padrão = `:root` do `globals.css` (lê o CSS), tingimento e gradiente, base clara, destaque; **todos os temas prontos e 500 aleatórios com texto AA**. |
| `src/renderer/src/lib/theme/apply.test.ts` | (jsdom) variáveis no `<html>`, transição só durante a troca, tema guardado na máquina (e inválido → padrão). |
| `src/renderer/src/lib/actions/preferences.test.ts` | (jsdom) carregar e aplicar, sincronia entre janelas, prévia, envio agrupado do `setTheme`, troca pendente vence o aviso, erro, temas salvos. |
| `src/renderer/src/lib/client-friends.test.ts` | `connect()` pede o tema da conta depois do `hello`. |
| `src/renderer/src/lib/theme/editor.test.ts` | Cores do gradiente (1–4), comparação, tema pronto correspondente, nome de cópia, temas salvos (nome, limite de 10). |
| `src/renderer/src/components/settings/appearance/appearance.test.tsx` | (jsdom) galeria aplica e marca, editor ao vivo (base, destaque, gradiente, ângulo, intensidade), um envio só ao fechar, salvar/usar/duplicar/apagar, erro do servidor, copiar e colar código, botão no `UserPanel`. |

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Tema inválido" | Algum campo fora do contrato (cor sem `#rrggbb`, mais de 4 cores, ângulo/intensidade fora). Teste com `validateTheme`. |
| Tema não muda na outra janela | `preferences:updated` vai só para conexões da **mesma conta** que já mandaram `hello`. |
| Tema some ao reiniciar | O servidor guarda na tabela `account_preferences`; sem `preferences:update` com sucesso, nada foi salvo. |
