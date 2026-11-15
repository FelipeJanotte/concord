# 0001 — Documentação em `docs/`, skills como ponteiro

- **Data:** 2026-11-15
- **Situação:** aceita

## Contexto

As 20 skills `concord-*` guardavam ~2.700 linhas de **referência** (arquivos, eventos, payloads, limites, como
testar), não de procedimento. Isso tinha três problemas: o conteúdo não aparecia navegável no repositório para
humanos, "skill" dava a entender rascunho/ideia, e não havia lugar para registrar **por que** uma decisão foi
tomada — o ROADMAP tem o "o quê", nunca o "porquê".

## Decisão

A referência de cada área vive em `docs/areas/<area>.md`. Cada `.claude/skills/concord-<area>/SKILL.md` fica
reduzido ao frontmatter (`name` + `description`) e a um ponteiro para o doc. Decisões de arquitetura passam a
ter `docs/decisions/`.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Manter tudo dentro das skills | Conteúdo escondido em `.claude/`, rótulo errado, sem espaço para o "porquê". |
| Apagar as skills e deixar só `docs/` com índice no AGENTS.md | Perde o carregamento sob demanda: o índice inteiro entra no contexto em toda tarefa e o assistente abre o arquivo errado mais vezes. A `description` da skill é exatamente o gatilho que faz abrir só a área certa. |
| Duplicar (resumo na skill + detalhe no doc) | Duas versões da mesma regra divergem no primeiro PR. |

## Consequências

- Fonte única: a regra existe num lugar só; a skill nunca descreve comportamento.
- Um salto extra de leitura por área (skill → doc). Aceito.
- A "definição de pronto" passa a exigir `docs/areas/` atualizado, não skill.
