---
name: ui-sdk
description: Use ao criar ou mudar qualquer componente ou tela em src/renderer (botão, campo, slider, diálogo, gaveta, menu, lista, progresso, avatar). Diz qual biblioteca usar, como estilizar e como testar no jsdom.
---

# UI com ui-sdk

- Monte toda UI nova com `@ui-sdk/react`, importando pela entrada do componente: `@ui-sdk/react/slider`,
  `@ui-sdk/react/drawer`, `@ui-sdk/react/alert-dialog`. Nunca da raiz do pacote nem de `@ui-sdk/core/internal/*`.
- Não adicione componente shadcn/Radix novo, nem widget feito à mão que o ui-sdk já tem (`role="slider"`,
  `"dialog"`, `"listbox"`, `"menu"`...), nem outra biblioteca de UI.
- Antes de usar um componente, leia `node_modules/@ui-sdk/react/docs/components/<nome>.md` (composição, dados de
  estado, API). Índice: `node_modules/@ui-sdk/react/docs/llms.txt`.
- Os componentes vêm sem estilo. Estilize com Tailwind usando só os tokens do tema de `assets/globals.css` (R10)
  e os atributos de estado do ui-sdk: `data-open`, `data-pressed`, `data-disabled`, `data-pending`,
  `data-starting-style`/`data-ending-style` (animação de entrada e saída), `data-dragging`.
- Não mexa no que o componente posiciona por estilo inline (thumb e indicador do slider, `translate` da gaveta).
- Todo controle tem nome acessível: a parte de rótulo (`FieldLabel`, `DrawerTitle`, `AlertDialogTitle`) ou
  `aria-label` quando só há ícone. Os testes acham os controles por papel e nome.
- Mexeu numa tela que ainda usa shadcn (`components/ui/**`)? Troque pelo ui-sdk as peças do trecho que você mudou;
  o resto fica para quando for tocado.
- Teste de componente no jsdom que usa sobreposição do ui-sdk (gaveta, diálogo, popover) ou slider importa
  `import '@/test/ui-sdk-dom'` logo depois do pragma `// @vitest-environment jsdom`.
- Por que ui-sdk e o que foi descartado: `docs/decisions/0010-ui-sdk-componentes.md`.
