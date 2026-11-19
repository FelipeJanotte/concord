# Temas personalizáveis (v5, Dev A: A9 servidor, B11 motor, B12 editor)

Temas com fundo em gradiente e cor de destaque, prontos e editáveis, **grátis para todos**, salvos na conta e
compartilháveis por código. As cores do app já são tokens CSS (`assets/globals.css`); um tema é só a **receita**, e
os tokens de cada parte da tela são **derivados** dela no app (`deriveTokens`, B11), com contraste legível.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/theme.ts` | Contrato: `ThemeConfig`, `SavedTheme`, `DEFAULT_THEME` (o visual de hoje), limites e as funções puras `validateTheme`, `cleanThemeName`, `encodeThemeCode`/`decodeThemeCode`. |
| `src/shared/types/preferences.ts` | `Preferences { theme, savedThemes, mutedChannels }` (canais silenciados: `docs/areas/notifications.md`), `PreferencesUpdate`, eventos `preferences:*`. |
| `server/modules/preferences.ts` | `preferences:get`, `preferences:update` (valida tudo com o contrato; avisa as outras janelas da mesma conta). |
| `server/repo/preferences.ts` | `getPreferences` (sem registro → padrão) e `updatePreferences` (grava só o que veio; cria na primeira vez). |
| `server/db/schema/preferences.ts` | Tabela `account_preferences` (migration `0004_preferences`): `theme` e `saved_themes` em jsonb (`muted_channels` na `0013_muted_channels`, `do_not_disturb` na `0015_do_not_disturb`, `docs/areas/presence.md`); apagar a conta apaga junto. |

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
| `preferences:get` | — | `Preferences` | sem nada salvo: `DEFAULT_THEME`, `[]` e `[]` |
| `preferences:update` | `{ theme?, savedThemes?, mutedChannels? }` | `PreferencesResult` | exige `hello`; tema inválido → "Tema inválido"; lista inválida (mais de 10, id repetido/não-uuid, nome vazio, tema inválido) → erro; `mutedChannels` (lista inteira) que não é lista de uuids ou passa de 500 → "Canais silenciados inválidos (até 500)"; vazio → "Nada para mudar"; limite `LIMITS.preferences` (20 seguidas, depois 1/s, por conta) |
| `preferences:updated` (servidor → app) | `Preferences` | — | para as **outras** conexões da mesma conta (a janela que mudou recebe pelo ack) |

## Motor no app (B11)

A v5 inteira é do **Dev A** (B11 e B12 transferidas do Dev B).

| Arquivo | Papel |
|---|---|
| `src/renderer/src/lib/theme/color.ts` | Puras: `mix`, `average`, `luminance`, `contrast` (WCAG), `ensureContrast` (puxa o texto para o branco/preto até 4,5:1 com todas as superfícies), `readableOn`. |
| `src/renderer/src/lib/theme/derive.ts` | `deriveTokens(theme)` → `{ tokens, gradient, gradientStops, colorScheme }`; `THEME_TOKENS` (os nomes das variáveis CSS; `idle` é a bolinha amarela de ausente, B28). |
| `src/renderer/src/lib/theme/presets.ts` | `THEME_PRESETS`: 14 temas prontos (Padrão, Aurora, Pôr do sol, Oceano, Floresta, Neon, Grafite, Lavanda, Cereja, Claro, Amanhecer e os translúcidos Vidro, Vidro aurora e Vidro claro). |
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

## Tema translúcido (liquid glass)

Com `translucent: true`, a janela usa o **material do sistema** por trás da página (área de trabalho desfocada) e o
app segue a ideia do *liquid glass* (referência: liquidglassdesign.com) em **camadas**:

1. **Fundo da janela:** luz ambiente — o gradiente do tema (`--app-gradient`) e dois brilhos da cor de destaque no `body`,
   por cima do material. O gradiente sai do chat (`.bg-background` sem imagem) e vale para a janela toda.
2. **Painéis** (barra de úteis, canais/Home, chat, membros): cartões de vidro separados por 8 px, cantos arredondados,
   borda clara, reflexo em cima, desfoque e sombra suave (`data-glass="panel"`; o contêiner é `data-glass="stage"`).
   A barra de título fica transparente (`data-glass="titlebar"`), contínua com o fundo.
3. **O que flutua** (modais, menus, popovers, cartões de perfil, dicas e o cartão de login): vidro mais opaco, com
   desfoque do que está atrás (`backdrop-filter`), reflexo na borda de cima, borda clara e sombra. Atrás de um modal
   o app só escurece um pouco e desfoca, em vez do preto 70%.

Temas prontos **Vidro** (escuro), **Vidro aurora** (escuro, roxo e verde) e **Vidro claro**; qualquer tema pode ligar o "Translúcido (vidro)" em Personalizar.

| Arquivo | Papel |
|---|---|
| `src/shared/translucency.ts` | `supportsTranslucency(platform, release)`: Windows 11 22H2+ (build ≥ `WINDOWS_ACRYLIC_BUILD` = 22621) e macOS; Windows 10, Linux e o resto não. `TranslucencyRequest { glass, scheme }`, `parseTranslucencyRequest` (o processo principal não confia na página) e `TranslucencyBridge`. |
| `src/main/translucency.ts` | IPC `window-translucency` (só da janela principal) → `applyTranslucency`: `nativeTheme.themeSource` = esquema do tema (a tinta do acrílico fica escura no tema escuro e clara no claro, mesmo com o Windows no modo oposto); Windows `setBackgroundMaterial('acrylic' \| 'none')`, macOS `setVibrancy('under-window' \| null)`, e a cor da janela transparente ou `OPAQUE_WINDOW_COLOR`. Sistema sem o efeito: só o esquema. Pedido inválido: nada. |
| `src/preload/index.ts` | `window.api.translucency`: `supported` (decidido uma vez com `os.release()`) e `set({ glass, scheme })`. |
| `src/renderer/src/lib/theme/derive.ts` | `GLASS_OPACITY` (quanto de cada token continua pintado): barra de úteis 32%, canais 42%, painel 50%, fundo 56%, cartões/muted 60%, campos 62%, campo de mensagem 66%, hover (`accent`) 70%, secundário 72% e **menus/modais (`popover`) 82%**. `withAlpha` e `glassTheme` (gradiente também). **Ficam opacos:** bordas, destaque e textos. |
| `src/renderer/src/lib/theme/apply.ts` | `translucencyEnv.bridge()` e `translucencyEnv.reducedTransparency()` (`prefers-reduced-transparency`). `glassActive(theme)`: tema translúcido **e** sistema com o efeito **e** sem "reduzir transparência". `applyTheme` manda `set({ glass, scheme })`, usa `glassTheme` e marca `<html data-translucent>`. `windowEffects: false` (overlay) não mexe na janela. |
| `src/renderer/src/assets/globals.css` | Com `html[data-translucent]`: `body` transparente; `[data-glass='surface']` = material da camada flutuante (`--popover`, `backdrop-filter: blur(28px) saturate(180%)`, brilho em gradiente, `--glass-specular` na borda de cima, `--glass-edge`, `--glass-shadow`; valores próprios na base clara); cantos maiores nos modais e menus; `dialog-overlay` com `--glass-dim` + desfoque; barra de rolagem translúcida. |
| `src/renderer/src/components/ui/{dialog,popover,context-menu,hover-card,tooltip}.tsx` | O conteúdo leva `data-glass="surface"` (no tema opaco não muda nada). Quem não quer o vidro passa `data-glass="none"` (ex.: `ImageLightbox`). |
| `App.tsx`, `rail/UtilityRail.tsx`, `ChannelSidebar.tsx`, `home/HomeSidebar.tsx`, `MemberList.tsx`, `TitleBar.tsx` | Marcas do layout: `data-glass="stage"` (linha dos painéis: espaço e margem), `data-glass="panel"` (cada painel vira cartão) e `data-glass="titlebar"`. Painel novo no layout precisa de `data-glass="panel"`. |

- **Onde não há o efeito** (Windows 10, Linux, navegador) o tema aparece **opaco**: uma página transparente sem o
  material mostraria preto atrás. O interruptor continua ligável (o tema acompanha a conta e vale nos outros
  computadores) e a tela avisa "O vidro precisa do Windows 11 (22H2 ou mais novo) ou do macOS".
- **Legibilidade:** o contraste é calculado para a superfície opaca. O esquema forçado no `nativeTheme` deixa o
  material do mesmo lado (escuro/claro) em que o texto foi calculado; o que flutua é mais opaco que as superfícies
  (um teste garante) e tem desfoque próprio. "Reduzir transparência" do sistema desliga o vidro.
- Mudar "reduzir transparência" com o app aberto só vale na próxima troca de tema (ou ao reabrir).

## Barra de título

A janela principal não tem a barra do sistema (`titleBarStyle: 'hidden'`, ADR `docs/decisions/0005-barra-de-titulo-propria.md`):
o app desenha a sua com as cores do tema (`bg-rail`; no vidro, transparente sobre o material).

| Arquivo | Papel |
|---|---|
| `src/shared/window-controls.ts` | `WindowControlAction` (`minimize` \| `maximize` \| `close`), `isWindowControlAction`, `hasOwnWindowButtons(platform)` (todos menos macOS) e `WindowControlsBridge`. |
| `src/main/window-controls.ts` | `titleBarOptions(platform)` (no macOS, semáforo em `{ x: 12, y: 10 }`), `runWindowControl` (maximizar alterna com restaurar; ação desconhecida é ignorada), `watchMaximized` (avisa `window-maximized`) e `setupWindowControls`: IPC `window-control` e `window-maximized-get`, só da janela principal. |
| `src/preload/index.ts` | `window.api.windowControls`: `buttons`, `run`, `isMaximized`, `onMaximizedChange`. |
| `src/renderer/src/lib/actions/window.ts` | `windowEnv`, `startWindowControls` (em `main.tsx`; guarda `windowMaximized` em `store/window.ts`) e `runWindowControl`. |
| `src/renderer/src/components/TitleBar.tsx` | Faixa de 32 px com "Concord", arrastável (`-webkit-app-region: drag`); no Windows/Linux, Minimizar, Maximizar/Restaurar e Fechar no estilo dos botões do app (hover `accent`; fechar em `destructive`). Fica acima dos modais (`z-[60]`). Fora do Electron (web) não aparece. Montada em `App.tsx`, em cima do login e do app. |

- Perde o menu de layouts do Windows 11 no maximizar (Win + Z continua). Duplo clique na barra maximiza.
- Clicável novo na barra precisa de `[-webkit-app-region:no-drag]`, senão o clique vira arrasto.

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
| `src/main/translucency.test.ts` | `supportsTranslucency` (Windows 11 22H2+, 21H2, 10, macOS, Linux) e `applyTranslucency` (acrílico/vibrancy, cor da janela, esquema do `nativeTheme`; sem suporte só o esquema; pedido inválido não mexe). |
| `src/main/window-controls.test.ts` | `runWindowControl` (minimizar, fechar, maximizar alterna, ação desconhecida ignorada) e `titleBarOptions` por sistema. |
| `src/renderer/src/components/glass-panels.test.tsx` | (jsdom) barra de úteis, canais, Home e membros marcados como `data-glass="panel"`. |
| `src/renderer/src/components/TitleBar.test.tsx` | (jsdom) some na web; botões pedem a ação; maximizada vira "Restaurar" (no início e depois); macOS sem botões. |
| `src/renderer/src/lib/theme/surprise.test.ts` | `hslToHex`; 300 sorteios válidos, legíveis e com fundo da base; as duas bases; nunca o atual e mantém o vidro; `withAlpha`, `glassTheme` (o que fica opaco), camadas (o que flutua é mais opaco que as superfícies) e os temas prontos de vidro. |
| `server/repo/preferences.test.ts` | Padrão sem registro, gravar só o que mudou, uma conta por vez. |
| `server/tests/preferences.test.ts` | Servidor real: vidro guardado e devolvido (`false` vira opaco); padrão, salvar e normalizar, sincronia com a outra janela (e só com ela), persistência após reiniciar, validação dos temas salvos, tema inválido, antes do `hello`. |
| `src/renderer/src/lib/theme/color.test.ts` | Mistura, média, luminância e contraste (valores de referência do WCAG), `ensureContrast`, `readableOn`. |
| `src/renderer/src/lib/theme/derive.test.ts` | Padrão = `:root` do `globals.css` (lê o CSS), tingimento e gradiente, base clara, destaque; **todos os temas prontos e 500 aleatórios com texto AA**. |
| `src/renderer/src/lib/theme/apply.test.ts` | (jsdom) vidro (com suporte: pede à janela com o esquema, tokens com transparência, `data-translucent`; sem suporte ou "reduzir transparência": opaco; overlay não mexe na janela); variáveis no `<html>`, transição só durante a troca, tema guardado na máquina (e inválido → padrão). |
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
| Modal/menu sem desfoque no vidro | Falta `data-glass="surface"` no conteúdo (os de `components/ui/` já têm). |
| Clique na barra de título arrasta a janela | O elemento não tem `[-webkit-app-region:no-drag]`. |
| Vidro ficou preto | A janela recebeu a cor transparente sem o material (sistema sem suporte forçado). `applyTranslucency` só mexe quando `supportsTranslucency` é true. |
| Tema some ao reiniciar | O servidor guarda na tabela `account_preferences`; sem `preferences:update` com sucesso, nada foi salvo. |
