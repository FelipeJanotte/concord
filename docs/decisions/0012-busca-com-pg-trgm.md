# 0012 — Busca de mensagens com ILIKE e índice pg_trgm

- **Data:** 2026-11-18
- **Situação:** aceita

## Contexto
A busca de mensagens (B26) procura um trecho em qualquer lugar do texto (`ILIKE '%q%'`), só nos canais e conversas
que a conta vê, mais novas primeiro. Sem índice, o `ILIKE` lê todas as mensagens desses canais. Medido no PGlite
(o banco padrão, sem `DATABASE_URL`) com 100 mil mensagens em 10 canais: 225–365 ms por busca em todos os canais,
acima do limite de ~200 ms combinado no roadmap. O PGlite traz a extensão `pg_trgm` (`@electric-sql/pglite/contrib`)
e o Postgres 17 do compose também (é uma extensão confiável: o dono do banco cria sem superusuário).

## Decisão
Continuar com `ILIKE` (mesma semântica de "contém", `%` e `_` escapados) e criar a extensão `pg_trgm` com o índice
GIN `messages_content_trgm_idx` (`content gin_trgm_ops`) na migration `0015_search_pins`; o PGlite carrega a extensão
em `server/db/client.ts`.

Depois do índice, no mesmo teste: termo raro 8–19 ms, termo presente em 1/6 das mensagens ~100 ms, busca num canal só
20–25 ms. Busca com 1 ou 2 letras não usa trigramas e continua ~300 ms.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Só `ILIKE`, sem índice | Acima de 200 ms com 100 mil mensagens no PGlite, e piora linear com o histórico. |
| Busca por relevância (`tsvector` + `to_tsquery`) | Muda o comportamento: acha palavras inteiras (com radical), não trechos; ordena por relevância em vez de data; precisa escolher dicionário (português) e uma coluna gerada. Mais do que um grupo de amigos precisa agora. |
| Motor de busca separado (Meilisearch, Elasticsearch) | Mais um serviço para hospedar e manter sincronizado; não cabe no "zero instalação" do PGlite. |
| Exigir 3 letras no mínimo | Esconde o caso lento em vez de resolver, e "ok"/"gg" são buscas legítimas num chat. |

## Consequências
- Toda instalação precisa da `pg_trgm`: o PGlite já carrega; um Postgres próprio sem a contrib falha na migration.
- Gravar mensagem fica um pouco mais caro (o GIN é atualizado a cada `INSERT`/edição).
- Buscas de 1–2 letras continuam lendo os canais inteiros; se virar problema, o próximo passo é limitar por data
  ou trocar para busca por relevância (ADR novo).
