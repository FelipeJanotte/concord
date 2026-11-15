# 0002 — O índice de `docs/` é o `AGENTS.md`, não um `README.md`

- **Data:** 2026-11-15
- **Situação:** aceita

## Contexto

A skill `semantic-docs` (importada do outro projeto) manda toda pasta de documentação ter um `docs/README.md`
como índice e sugere a taxonomia `adr/`, `ai/`, `infrastructure/`. O `docs/AGENTS.md` criado no ADR 0001 já faz
o papel de índice, com outros nomes de pasta. Duas regras de roteamento no mesmo repositório é exatamente o que
a própria skill proíbe.

## Decisão

O índice de `docs/` é o `docs/AGENTS.md`. `docs/README.md` **não existe**. Os nomes locais (`areas/`,
`decisions/`) ficam, e o mapeamento para o vocabulário da `semantic-docs` está no próprio `docs/AGENTS.md`.
A skill recebeu uma linha apontando para lá, em vez de ter a regra reescrita.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Criar `docs/README.md` como índice e deixar o `AGENTS.md` só com as regras | Dois índices: o `AGENTS.md` é carregado automaticamente pelas ferramentas de IA e o `README.md` é o que o humano abre no GitHub. As duas listas divergiriam no primeiro PR. |
| Renomear `decisions/` para `adr/` e seguir a taxonomia da skill à risca | Cargo cult que a própria skill desaconselha; `adr/` é jargão, `decisions/` é o que os dois devs leem sem traduzir. |
| Reescrever a `semantic-docs` com os nomes daqui | Forka uma skill compartilhada com o outro projeto; a próxima atualização dela viraria conflito. Um ponteiro de duas linhas resolve. |

## Consequências

- Quem lê a skill é mandado para `docs/AGENTS.md` antes de aplicar os nomes dela.
- O fork da skill é de duas linhas, fácil de reaplicar quando a versão de cima mudar.
- Pasta nova continua nascendo pela regra de necessidade do `docs/AGENTS.md`, não pela taxonomia sugerida.
