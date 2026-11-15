# Decisões de arquitetura (ADR)

Um arquivo por decisão que **custa caro desfazer**: `NNNN-titulo-curto.md`, numeração crescente, nunca editado
depois de aceito (decisão nova que muda a antiga é um ADR novo que cita o anterior).

`docs/areas/` descreve **como o sistema é hoje**. Aqui fica **por que ele é assim** — inclusive as opções
descartadas, que é a parte que ninguém consegue reconstruir depois.

Modelo:

```md
# NNNN — Título

- **Data:** AAAA-MM-DD
- **Situação:** aceita | substituída por NNNN

## Contexto
O que forçou a decisão (restrição, bug, custo, prazo).

## Decisão
O que foi decidido, em uma frase.

## Alternativas descartadas
| Opção | Por que não |

## Consequências
O que isso facilita e o que passa a ser mais difícil.
```
