@../AGENTS.md

## Documentação (leia antes de escrever)

As regras completas da documentação — índice das pastas e quando criar uma nova — ficam em `docs/AGENTS.md`.

- **Referência por área:** `docs/areas/<area>.md`. É a fonte única de "como funciona hoje" — arquivos, eventos,
  regras, limites, como testar. Leia o doc da área **antes** de mexer nela; atualize-o **no mesmo PR** da mudança.
- **Sem skills por área:** o índice "quando abrir cada doc" fica em `AGENTS.md` ("Documentação por área"). As skills em `.claude/skills/` são só as de competência.
- **Decisões:** o que custa caro desfazer vira ADR em `docs/decisions/NNNN-*.md`, com as alternativas descartadas.
  `docs/areas/` diz como é; `docs/decisions/` diz por que. Modelo em `docs/decisions/README.md`.
- Tarefa sem doc atualizado **não está pronta**, mesmo com `npm test` e `npm run typecheck` verdes.
