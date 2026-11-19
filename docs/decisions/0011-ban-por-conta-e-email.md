# 0011 — Banimento por conta e e-mail, sem IP

- **Data:** 2026-11-18
- **Situação:** aceita

## Contexto
A19 pediu banir alguém da comunidade. O banimento precisa impedir a volta pela mesma conta e por um cadastro novo
óbvio, sem bloquear quem não tem culpa. O Concord é um grupo de amigos, muitas vezes na mesma casa ou atrás do mesmo
roteador/CGNAT, e o login com Google vincula pelo e-mail verificado.

## Decisão
A tabela `community_bans` guarda a conta (chave) e o e-mail dela no momento do ban; login, Google, cadastro e
`accountFromToken` recusam se a conta **ou** o e-mail estiverem lá. Nada de IP.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Ban por IP | Pega quem divide a rede (mesma casa, CGNAT da operadora, VPN) e não segura quem troca de rede; exigiria guardar IP, que hoje o servidor não guarda. |
| Só pela conta | Um cadastro novo com o mesmo e-mail (ou o mesmo Google) entraria na hora. |
| Flag `banned` na tabela `accounts` | Mistura moderação com conta, perde o motivo/quem baniu e não bloqueia o e-mail num cadastro novo. |

## Consequências
- Outra conta com outro e-mail entra: o ban não é à prova de quem quer muito voltar.
- Trocar o e-mail da conta não tira o ban dela; o e-mail novo fica livre para um cadastro novo.
- Apagar a conta apaga o ban (cascade). Hoje não existe excluir conta; quando existir, decidir se o ban por e-mail deve
  sobreviver (ADR novo).
- Mudar para outro critério (IP, dispositivo) é aditivo: nova coluna e nova checagem em `server/auth.ts`.
