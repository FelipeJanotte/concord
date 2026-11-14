---
name: concord-themes
description: Como funcionam os temas personalizáveis do Concord (v5) — contrato ThemeConfig (base, cor de destaque, gradiente, intensidade), validateTheme e o código de compartilhamento (funções puras), preferências da conta no servidor (tema ativo + até 10 temas salvos, preferences:get/update/updated) e o que falta na tela (B11 motor, B12 editor). Use ao mexer em src/shared/types/theme.ts, src/shared/types/preferences.ts, server/modules/preferences.ts, server/repo/preferences.ts, server/db/schema/preferences.ts, nos tokens de cor de assets/globals.css, ou ao investigar tema que não salva, não sincroniza entre janelas ou "Tema inválido".
---

# Temas personalizáveis (v5: A9 servidor, B11 motor, B12 editor)

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

## Pendente (Dev B)

- **B11 Motor:** `deriveTokens(theme)` (pura, com testes de contraste WCAG AA) aplicando as variáveis no `:root`; ~10
  temas prontos; funciona antes do login com o último tema salvo localmente.
- **B12 Editor:** "Configurações → Aparência" com galeria, editor com prévia ao vivo, salvar/duplicar/apagar e
  compartilhar por código. Ao entrar, o app pede `preferences:get`; ao mudar, `preferences:update` (o seletor de
  cor pode mandar várias seguidas — o limite aguenta rajada de 20).

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/theme.test.ts` | `validateTheme` (normalização e cada recusa), `cleanThemeName`, código de compartilhamento (ida e volta, recusas). |
| `server/repo/preferences.test.ts` | Padrão sem registro, gravar só o que mudou, uma conta por vez. |
| `server/tests/preferences.test.ts` | Servidor real: padrão, salvar e normalizar, sincronia com a outra janela (e só com ela), persistência após reiniciar, validação dos temas salvos, tema inválido, antes do `hello`. |

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Tema inválido" | Algum campo fora do contrato (cor sem `#rrggbb`, mais de 4 cores, ângulo/intensidade fora). Teste com `validateTheme`. |
| Tema não muda na outra janela | `preferences:updated` vai só para conexões da **mesma conta** que já mandaram `hello`. |
| Tema some ao reiniciar | O servidor guarda na tabela `account_preferences`; sem `preferences:update` com sucesso, nada foi salvo. |
