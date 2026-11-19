# 0010 — ui-sdk como biblioteca de componentes da UI nova

- **Data:** 2026-11-18
- **Situação:** aceita

## Contexto

A área de Música pedia peças que o shadcn do projeto não tinha ou tinha à mão (gaveta lateral, slider acessível,
barra de progresso, avatar com fallback, confirmação). Cada tela nova somava mais um componente shadcn copiado
para `components/ui/` e mais widgets feitos à mão (`input type="range"`, cartões com `role`).

## Decisão

Toda UI nova usa `@ui-sdk/react` + `@ui-sdk/core` (0.1.0-beta.10, Apache-2.0): componentes sem estilo, com teclado,
foco e ARIA prontos, estilizados com Tailwind e os tokens do tema. Os componentes shadcn de `components/ui/` ficam
até a tela que os usa ser mexida. Regras de uso: skill `ui-sdk` (`.claude/skills/ui-sdk/SKILL.md`).

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Continuar no shadcn (Radix) | Cada peça vira código copiado para manter no projeto; não tem gaveta com arraste, progresso nem slider com o comportamento pronto, e as telas novas seguiam fazendo widgets à mão. |
| shadcn AI Elements | Feito para padrões de chat e agente (mensagens, prompt, raciocínio); não tem player, progresso de mídia nem gaveta. Resolveria pouco do que a música precisa. |

## Consequências

- Funciona no Electron (Chromium): as sobreposições usam o `popover` nativo e a camada CSS `ui-sdk`, declarada no
  topo de `assets/globals.css` (`@layer ui-sdk;`) para os estilos do app ganharem dela.
- O jsdom não tem `popover`, `getAnimations` nem `ResizeObserver`: testes de componente importam
  `src/renderer/src/test/ui-sdk-dom.ts`, que preenche só isso.
- Versão beta: atualizar exige ler as notas da versão e rodar os testes de componente; a API pode mudar.
- Por um tempo convivem duas bibliotecas (shadcn nas telas antigas, ui-sdk nas novas). A troca acontece aos poucos,
  no trecho que cada PR mexe.
