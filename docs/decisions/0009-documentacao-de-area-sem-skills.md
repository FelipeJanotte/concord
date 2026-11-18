# 0009 — Documentação de área sem skills `concord-*`

- **Data:** 2026-11-18
- **Situação:** aceita (substitui a parte "skills como ponteiro" do ADR 0001)

## Contexto

O ADR 0001 deixou 22 skills `concord-<area>` como ponteiros (frontmatter + link) para `docs/areas/<area>.md`.
Elas só repetiam o gatilho "quando abrir", poluíam a lista de skills e exigiam manter dois lugares em sincronia a
cada área nova. O PR #110 tentou tirar as skills de **competência** (`wise-dev`, `test-strategy`,
`code-quality`, `token-efficiency`, `semantic-docs`) para `docs/practices/`; era o lado errado e foi revertido.

## Decisão

A documentação de área vive só em `docs/areas/`, indexada pela lista "Documentação por área" do `AGENTS.md`
(cada linha diz quando abrir: arquivos, eventos e sintomas). As skills `concord-*` foram removidas. Em
`.claude/skills/` ficam só as cinco skills de competência, com o conteúdo em `reference/`.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Manter os ponteiros | Dois lugares para manter em sincronia e ruído na lista de skills; o gatilho cabe numa linha do índice. |
| Mover as skills de competência para `docs/` (#110) | São instruções de *como trabalhar*, carregadas como skill; virar doc tira o carregamento sob demanda. Revertido. |

## Consequências

- Fonte única do "quando abrir": a lista do `AGENTS.md`, sempre carregada no contexto (um pouco maior).
- Área nova = um doc em `areas/` e uma linha no índice; sem skill para criar.
- Comentários de código e docs antigos que citam "skill `concord-x`" ficam desatualizados e se corrigem ao tocar neles.
