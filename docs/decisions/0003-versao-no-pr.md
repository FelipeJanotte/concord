# 0003 — Versão do app commitada no PR

- **Data:** 2026-11-15
- **Situação:** aceita

## Contexto

A release automática publica um instalador a cada PR que entra na `main`. Na primeira versão (PR #74), a versão
saía só da tag criada no merge e era aplicada no `package.json` apenas durante o build: o `package.json` da `main`
ficou em `0.1.0` enquanto as releases já estavam em `v0.1.2`. Quem lia o repositório, o PR ou um instalador gerado à
mão via um número que não correspondia à versão publicada.

## Decisão

Um workflow no PR (`pr-version.yml`) calcula a próxima versão (maior entre a última tag e a `main`, mais os labels)
e faz o commit `chore: versão X.Y.Z` no próprio PR, com um token próprio (`RELEASE_TOKEN`) para o CI rodar também
nesse commit; o merge só cria a tag com a versão do `package.json`.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Versão só na tag, aplicada no build (como no #74) | O `package.json` do repositório nunca mostra a versão real. |
| Subir a versão no merge, com commit direto na `main` | Commit do bot na `main` depois de cada merge; a versão não aparece no PR antes de entrar, e um commit na `main` precisa contornar proteção de branch se ela for ligada. |
| Cada pessoa sobe a versão à mão no PR | Esquecimento vira release com número repetido; dois devs abrindo PR ao mesmo tempo escolhem o mesmo número. |
| Commit da versão com o `GITHUB_TOKEN` | Não dispara workflows: o último commit do PR ficaria sem o check do CI. Fica só como alternativa automática se o `RELEASE_TOKEN` faltar. |

## Consequências

- O PR mostra a versão que vai sair, e o `package.json` da `main` acompanha as releases.
- Depois de abrir o PR (ou mudar um label) a pessoa precisa puxar o commit do bot antes do próximo push.
- Dois PRs abertos ao mesmo tempo calculam a mesma versão; no merge do segundo, o auto-release sobe o patch da
  última tag e o `package.json` da `main` fica uma versão atrás até o PR seguinte.
- Depende de um secret (`RELEASE_TOKEN`) com prazo de validade: quando vencer, o commit da versão volta a sair sem
  check até alguém renovar o token.
- PR de fork não recebe o commit (o Actions não faz push em fork).
