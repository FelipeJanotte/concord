# 0017 — Jogo de pokémon com o estado no servidor

- **Data:** 2026-11-21
- **Situação:** aceita

## Contexto
O jogo de pokémon começou só no app, salvo no `localStorage`. Com dinheiro, Shop e RMT (anúncios entre jogadores
que vendem itens e pokémon), um save editável na máquina vira trapaça que afeta os outros: dinheiro e pokémon
inventados entram no mercado. PvP vai pelo mesmo caminho.

## Decisão
O estado do jogo de cada conta vive no Postgres (`pokemon_saves.state`, jsonb com o `GameState` inteiro). O app só
manda intenções (`pokemon:act` com um `PokemonAction`); o servidor valida (`parseAction`), sorteia com o próprio
`Math.random`, busca a PokeAPI (com cache em memória), aplica as regras puras de `src/shared/pokemon/` e grava.
Ações da mesma conta rodam em fila (`withAccounts` em memória); a compra no RMT trava as duas contas e fecha numa
transação (anúncio apagado + os dois saves). O item ou pokémon anunciado sai da conta na hora (fica no anúncio,
`pokemon_listings`) e volta se o anúncio for cancelado.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Continuar no `localStorage` e só o RMT no servidor | O servidor não sabe o que a pessoa tem; qualquer anúncio pode ser inventado. |
| Tabelas normalizadas (pokémon, itens, mochila) | Muito mais schema e migrations para um jogo que muda a toda semana; o jsonb carrega o `GameState` que as regras puras já usam, e só o RMT precisa de consulta entre contas. |
| Sorteio no app e o servidor só confere | Dá para repetir a ação até sair o resultado bom; sortear no servidor é mais simples e fecha isso. |
| Trava por linha no banco (`select ... for update`) em vez da fila em memória | O servidor é um processo só; a fila evita corrida entre as ações da mesma conta sem depender do PGlite suportar trava. Se o servidor virar mais de um processo, trocar pela trava no banco. |
| Importar o save antigo do `localStorage` | Seria aceitar exatamente o dado que dá para editar. O jogo recomeça no servidor. |

## Consequências
- Cada passo no mapa é uma ida ao servidor e uma gravação (limitado por `LIMITS.pokemon`).
- Regras compartilhadas em `src/shared/pokemon/` (o app usa para mostrar, o servidor para decidir).
- Mudar o formato do `GameState` exige cuidar dos saves existentes (o jsonb não tem migration automática).
- Mais de um processo de servidor quebra a fila em memória (ver acima).
