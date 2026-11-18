# 0009 — Práticas de trabalho em `docs/practices/`, sem skills de competência

- **Data:** 2026-11-18
- **Situação:** aceita (complementa o 0001)

## Contexto

O 0001 (PR #71) tirou o conteúdo das skills `concord-*` e o levou para `docs/areas/`. As cinco skills de
**competência** (`wise-dev`, `test-strategy`, `code-quality`, `token-efficiency`, `semantic-docs`) ficaram de
fora, como exceção, e continuaram carregando o próprio conteúdo em `.claude/skills/<nome>/reference/`. O resultado
contradiz a regra do 0001: conteúdo escondido em `.claude/`, invisível para quem navega `docs/`, e rótulo de
"skill" para o que é prática de trabalho.

## Decisão

As cinco viram documentação em `docs/practices/<nome>/README.md` (mais `reference/` e o que mais tiverem) e as
pastas saem de `.claude/skills/`, que passa a guardar só os ponteiros `concord-*`.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Manter como skills com conteúdo | Mantém a exceção ao 0001: conteúdo em `.claude/`, fora do mapa de `docs/`. |
| Virar skill-ponteiro como as `concord-*` | Só ponteiro para um doc de uma prática que o assistente consulta por tarefa vira um salto extra sem ganho: os `README.md` já têm no início o quando-ler. |

## Consequências

- Uma regra, um lugar: `.claude/skills/` só tem ponteiros; todo conteúdo está em `docs/`.
- `docs/practices/` entra no índice de `docs/AGENTS.md` (gênero novo: como trabalhamos).
- As práticas deixam de ser carregadas como skill por gatilho; são lidas pelo caminho, a partir do `AGENTS.md`.
