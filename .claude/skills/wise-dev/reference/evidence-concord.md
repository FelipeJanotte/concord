# Evidence sources no Concord

Fatos de escopo do projeto: as plataformas são as mesmas em qualquer task. O que **não** está aqui, e precisa sair
do `AGENTS.md` da raiz e de `docs/areas/<area>.md` na fase FRAME, é cada comando que alcança essas fontes. O
Concord é um app desktop Tauri com servidor próprio: não há Sentry, Grafana, gateway de LLM nem tenant.

Atribua um investigador por fonte plausivelmente relevante. Fonte que não rende nada devolve `findings` vazio, e
isso também é um fato.

| Fonte | Para que serve | A armadilha |
|---|---|---|
| `npm test` (vitest) | A reprodução mais barata e o lugar onde se escreve a prova vermelha. Integração do servidor em `server/tests/<dominio>.test.ts` sobe o servidor de verdade. | Use o comando que o `AGENTS.md` declara. Teste que passa com mock de si mesmo não prova nada (ver `docs/areas/add-feature.md`). |
| `npm run typecheck` | Contrato quebrado entre `src/shared/types/` e os dois lados aparece aqui antes de qualquer execução. | Verde não significa comportamento certo: o contrato pode estar coerente e errado. |
| Saída do servidor (`npm run server`) | O erro real do handler: `guard('evento', ...)` loga e não derruba o processo, então a falha fica só no stdout. | Leia a janela inteira em volta da falha. Erro engolido pelo `guard` não chega ao app — ausência de toast não é ausência de erro. |
| Console do renderer (DevTools do WebView2) | Falha de socket, de LiveKit (`livekit-client`) ou de mídia (microfone, tela, câmera). | A janela do overlay é uma **segunda** página: o erro dela não aparece no console da principal. |
| Banco (PGlite em `DATA_DIR/pgdata`, ou Postgres com `DATABASE_URL`) | Estado é a verdade. O que um handler *emitiu* não é o que ele *gravou*. | Consulte pelo `server/repo/`, não por SQL solto, ou você lê um estado que o cache de `server/access.ts` já contradiz. |
| Eventos Socket.IO nas duas pontas | Quem recebeu o quê: `emitToViewers` não entrega para quem não vê o canal, e isso **parece** evento perdido. | Payload chegando não prova permissão certa; confira `allowed(...)` antes de culpar a rede. |
| LiveKit (`docker compose up -d`, logs do container) | Voz, tela e câmera: token recusado, sala que não conecta, `empty_timeout`. | Sem o container, `voice:join` falha por motivo que não é o do bug. Conexão de outra máquina depende de `LIVEKIT_NODE_IP`. |
| `git log --oneline -20` e o diff da área | O que mudou pouco antes de começar. | A base não é sempre `main`; derive a branch base antes de comparar. |
| GitHub Actions (`.github/workflows/ci.yml`) | O passo exato que falhou e se já falhou igual antes. | O CI roda sem Docker e com PGlite: falha de voz lá não reproduz a daqui. Check ausente não é check passando. |
| Issues e PRs | Se a mesma falha já é item aberto com contexto que alguém juntou. | Issue carrega a visão de quem reportou. Nunca diagnostique pelo corpo do ticket. |

## Regras que valem sempre aqui

- **Nenhum comando de evidência altera dados de outra pessoa.** Migration, `db:restore`, `db:generate` e qualquer
  coisa que o `AGENTS.md` marque como escrita ficam fora da fase INVESTIGATE. Registre o comando como pulado, com
  `confidence: 0` e `evidence_pointer: "SKIPPED: would mutate data"`. Esse registro força o gate, que é o
  resultado correto.
- **Migration mergeada não se edita** (regra 4 do `AGENTS.md`), nem para investigar. Reproduza num `DATA_DIR`
  temporário: `DATA_DIR="$TMPDIR/concord-teste" DATABASE_URL= PORT=3999 npx tsx server/index.ts`.
- **Bug de permissão, voz ou DM precisa de duas contas e duas janelas.** Uma janela só nunca distingue "não
  emitiu" de "emitiu para quem não deveria" (ver `docs/areas/dev-workflow.md`).
- **Comando ao vivo pede espera, não laço de retry.** A sala de voz tem `empty_timeout`; leitura cedo demais
  parece bug.
