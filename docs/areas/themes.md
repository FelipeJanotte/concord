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
  intensity: 0..100,                                   // 0 = base lisa, 100 = gradiente cheio
  translucent?: true                                   // vidro; ausente = opaco
}
```

- `validateTheme(raw)` → tema normalizado (cores em minúsculas, ângulo e intensidade inteiros, `translucent` só
  quando é `true` — `false` ou lixo somem, para temas e códigos antigos continuarem iguais —, campos extras fora)
  ou `null`. **Servidor e app usam a mesma função**: só se grava e só se aplica tema válido.
- Código de compartilhamento: `concord-tema:<0|1>~<accent>~<stop.stop…>~<ângulo>~<intensidade>[~1]` (sem `#`; o `~1`
  no fim só no tema translúcido, então códigos antigos continuam valendo; outro valor no 6º campo = inválido). `decodeThemeCode`
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
| `src/renderer/src/lib/theme/presets.ts` | `THEME_PRESETS`: 13 temas prontos (Padrão, Aurora, Pôr do sol, Oceano, Floresta, Neon, Grafite, Lavanda, Cereja, Claro, Amanhecer e os translúcidos Vidro e Vidro claro). |
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

## Tema translúcido (vidro)

Com `translucent: true`, a janela usa o **material do sistema** por trás da página: a área de trabalho aparece desfocada
pelas superfícies. Temas prontos **Vidro** (escuro) e **Vidro claro**; qualquer tema pode ligar o "Translúcido (vidro)"
em Personalizar.

| Arquivo | Papel |
|---|---|
| `src/shared/translucency.ts` | `supportsTranslucency(platform, release)`: Windows 11 22H2+ (build ≥ `WINDOWS_ACRYLIC_BUILD` = 22621) e macOS; Windows 10, Linux e o resto não. `TranslucencyBridge`. |
| `src/main/translucency.ts` | IPC `window-translucency` (só da janela principal: o overlay não pede) → `applyTranslucency`: Windows `setBackgroundMaterial('acrylic' \| 'none')`, macOS `setVibrancy('under-window' \| null)`, e a cor da janela transparente (`#00000000`) ou de volta a `OPAQUE_WINDOW_COLOR`. Sistema sem o efeito: não mexe. |
| `src/preload/index.ts` | `window.api.translucency`: `supported` (decidido uma vez com `os.release()`) e `set(on)`. |
| `src/renderer/src/lib/theme/derive.ts` | `GLASS_OPACITY` (quanto de cada superfície continua pintado: barra 55%, lista de canais 62%, painel 70%, fundo 72%, cartões/muted 80%, campo de mensagem 82%, secundário 85%), `withAlpha` e `glassTheme` (tokens com `#rrggbbaa`, gradiente também). **Ficam opacos:** menus (`popover`), campos (`input`), bordas, destaque e textos. |
| `src/renderer/src/lib/theme/apply.ts` | `translucencyEnv.bridge()`, `glassActive(theme)` (tema translúcido **e** sistema com o efeito). `applyTheme` pede o vidro à janela (`set`), usa `glassTheme` e marca `<html data-translucent>`; tema opaco ou sistema sem o efeito: `set(false)` e tokens opacos. `windowEffects: false` (página do overlay) não mexe na janela. |
| `src/renderer/src/assets/globals.css` | `html[data-translucent] body { background-color: transparent }` (senão o fundo do `body` cobriria o vidro). |

- **Onde não há o efeito** (Windows 10, Linux, navegador) o tema aparece **opaco**: uma página transparente sem o
  material mostraria preto atrás. O interruptor continua ligável (o tema acompanha a conta e vale nos outros
  computadores) e a tela avisa "O vidro precisa do Windows 11 (22H2 ou mais novo) ou do macOS".
- **Legibilidade:** o contraste é calculado para a superfície opaca; as opacidades altas e o próprio vidro do sistema
  (que escurece/clareia o fundo) mantêm o texto perto disso. Menus e campos não dependem do que está atrás.

## "Surpreenda-me"

`src/renderer/src/lib/theme/surprise.ts`: `surpriseTheme(random, atual)` sorteia um tema que combina — matiz principal +
esquema (análogo, complementar, tríade), 2–3 cores de fundo com saturação e luz da base (escuras no escuro, claras no
claro), destaque vivo do mesmo matiz, ângulo de 15 em 15°, intensidade 45–85. Base escura em ~75% das vezes. Nunca
devolve o tema atual e **mantém o vidro** dele (não sorteia `translucent`). O contraste fica por conta do `deriveTokens`.
Botão "Surpreenda-me" ao lado de "Temas prontos": aplica na hora (como escolher um tema pronto; salvar é à parte).

## Editor "Aparência" (B12)

Seção **Aparência** das Configurações (engrenagem no painel do usuário, `UserPanel` → "Aparência"; `docs/areas/settings.md`).

| Arquivo | Papel |
|---|---|
| `src/renderer/src/components/settings/appearance/AppearanceSettings.tsx` | Configurações → "Aparência" (era a janela `AppearanceDialog`, `docs/areas/settings.md`); o tema pendente vai ao sair da seção ou fechar: temas prontos, meus temas (usar, duplicar, apagar; até 10), personalizar (base, destaque, 1–4 cores do gradiente, ângulo, intensidade, salvar com nome) e compartilhar (código do tema atual, copiar, colar o de um amigo). |
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

- Nada da v5. Ideias: renomear tema salvo, importar o tema de um amigo direto pelo perfil dele, vidro no Linux
  (precisaria de janela `transparent` e compositor).

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/theme.test.ts` | `validateTheme` (normalização e cada recusa), `cleanThemeName`, código de compartilhamento (ida e volta, recusas), vidro (`translucent` só quando `true`, `~1` no código, código antigo continua valendo). |
| `src/main/translucency.test.ts` | `supportsTranslucency` (Windows 11 22H2+, 21H2, 10, macOS, Linux) e `applyTranslucency` (acrílico/vibrancy e a cor da janela; sem suporte não mexe). |
| `src/renderer/src/lib/theme/surprise.test.ts` | `hslToHex`; 300 sorteios válidos, legíveis e com fundo da base; as duas bases; nunca o atual e mantém o vidro; `withAlpha`, `glassTheme` (o que fica opaco) e os temas prontos de vidro. |
| `server/repo/preferences.test.ts` | Padrão sem registro, gravar só o que mudou, uma conta por vez. |
| `server/tests/preferences.test.ts` | Servidor real: vidro guardado e devolvido (`false` vira opaco); padrão, salvar e normalizar, sincronia com a outra janela (e só com ela), persistência após reiniciar, validação dos temas salvos, tema inválido, antes do `hello`. |
| `src/renderer/src/lib/theme/color.test.ts` | Mistura, média, luminância e contraste (valores de referência do WCAG), `ensureContrast`, `readableOn`. |
| `src/renderer/src/lib/theme/derive.test.ts` | Padrão = `:root` do `globals.css` (lê o CSS), tingimento e gradiente, base clara, destaque; **todos os temas prontos e 500 aleatórios com texto AA**. |
| `src/renderer/src/lib/theme/apply.test.ts` | (jsdom) vidro (com suporte: pede à janela, tokens com transparência, `data-translucent`; sem suporte: opaco; overlay não mexe na janela); variáveis no `<html>`, transição só durante a troca, tema guardado na máquina (e inválido → padrão). |
| `src/renderer/src/lib/actions/preferences.test.ts` | (jsdom) carregar e aplicar, sincronia entre janelas, prévia, envio agrupado do `setTheme`, troca pendente vence o aviso, erro, temas salvos. |
| `src/renderer/src/lib/client-friends.test.ts` | `connect()` pede o tema da conta depois do `hello`. |
| `src/renderer/src/lib/theme/editor.test.ts` | Cores do gradiente (1–4), comparação, tema pronto correspondente, nome de cópia, temas salvos (nome, limite de 10). |
| `src/renderer/src/components/settings/appearance/appearance.test.tsx` | (jsdom) "Surpreenda-me" aplica um tema novo, "Translúcido (vidro)" liga/desliga e avisa sem suporte, temas prontos "Vidro"; galeria aplica e marca, editor ao vivo (base, destaque, gradiente, ângulo, intensidade), um envio só ao fechar, salvar/usar/duplicar/apagar, erro do servidor, copiar e colar código, botão no `UserPanel`. |

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Tema inválido" | Algum campo fora do contrato (cor sem `#rrggbb`, mais de 4 cores, ângulo/intensidade fora). Teste com `validateTheme`. |
| Tema não muda na outra janela | `preferences:updated` vai só para conexões da **mesma conta** que já mandaram `hello`. |
| Tema translúcido aparece opaco | O sistema não tem o efeito (Windows 10/11 21H2, Linux, navegador): `window.api.translucency.supported` é false. No Windows 11 22H2+, confira se a transparência está ligada em Personalização → Cores do Windows. |
| Vidro ficou preto | A janela recebeu a cor transparente sem o material (sistema sem suporte forçado). `applyTranslucency` só mexe quando `supportsTranslucency` é true. |
| Tema some ao reiniciar | O servidor guarda na tabela `account_preferences`; sem `preferences:update` com sucesso, nada foi salvo. |
