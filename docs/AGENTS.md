# docs/ — como a documentação do Concord funciona

**Toda mudança vem com documentação.** Não existe tarefa pronta sem o doc em dia: `npm test` e
`npm run typecheck` verdes com doc desatualizado = tarefa incompleta (R14 e "Definição de pronto" no
`AGENTS.md` da raiz). Código responde *o que o programa faz*; esta pasta responde *como o sistema é* e
*por que ficou assim* — e isso ninguém reconstrói lendo o diff seis meses depois.

A documentação é **organizada por pastas**, uma por **gênero de documento** (não por domínio: domínio é o nome
do arquivo dentro da pasta).

## Este arquivo é o índice

A `semantic-docs` chama isto de **tier 1**: o pouco que carrega sempre e serve só para rotear até **um** arquivo
que responde a pergunta inteira. Aqui esse papel é do `docs/AGENTS.md`, não de um `docs/README.md`, porque é este
o arquivo que as ferramentas de IA carregam sozinhas ao trabalhar dentro de `docs/`. **Não crie `docs/README.md`:**
duas tabelas de rota divergem, e a regra é um fato, uma casa só.

O índice **aponta, nunca repete** o conteúdo. Nomes locais, no vocabulário da `semantic-docs`:

| `semantic-docs` | Aqui | Por quê |
|---|---|---|
| `docs/README.md` (índice) | `docs/AGENTS.md` | É o arquivo carregado automaticamente; um segundo índice seria cópia que apodrece. |
| `adr/` | `decisions/` | Mesma coisa, nome que os dois devs já usam. A própria skill diz "adapt, do not cargo-cult". |
| `ai/` (guias para agente) | `areas/` | Aqui o guia por área serve humano e agente; não há dois públicos para separar. |

## Índice das pastas

| Pasta | Para que serve | O que **não** vai aqui |
|---|---|---|
| `areas/` | **Referência do estado atual**, um arquivo por área (`dms.md`, `voice.md`, `permissions.md`…): o que faz e por quê, tabela de arquivos, contrato (`shared/types`), fluxo principal, regras e limites, como testar, depuração. É o que se lê **antes** de mexer no código. | Histórico, justificativa de decisão, plano futuro. |
| `decisions/` | **ADRs**: uma decisão que custa caro desfazer por arquivo (`NNNN-titulo.md`), com contexto, decisão, **alternativas descartadas** e consequências. Imutável depois de aceita. Modelo em `decisions/README.md`. | Descrição de como o código é hoje (isso é `areas/`). |

Arquivo solto na raiz de `docs/`:

| Arquivo | Para que serve |
|---|---|
| `ROADMAP.md` | O plano: tasks (A*/B*) por versão e a divisão de trabalho entre os dois devs. O "o quê" e "quando". |
| `AGENTS.md` | Este arquivo: as regras da própria documentação. |

## Como a documentação se encontra

O índice é a lista "Documentação por área" do `AGENTS.md` da raiz: cada linha aponta para `areas/<area>.md` e diz
*quando* abrir (arquivos, eventos e sintomas). Não há skills por área: a regra vive só em `docs/areas/`.

Área nova → cria o doc em `areas/` e acrescenta a linha em "Documentação por área" no `AGENTS.md` da raiz.

## Pastas novas: só por necessidade

Não crie estrutura antecipada. Uma pasta nova nasce quando existe um **gênero** de documento que não cabe em
`areas/` nem em `decisions/` **e** já há pelo menos **três** documentos desse gênero (dois são dois arquivos
soltos na raiz de `docs/`; o terceiro prova que é uma categoria).

Quem cria a pasta, no mesmo PR: acrescenta a linha dela nesta tabela, dizendo para que serve **e o que não vai
nela**. Pasta sem linha no índice não existe.

Exemplos plausíveis quando a necessidade aparecer: `runbooks/` (o que fazer quando cai em produção),
`api/` (contrato para um cliente de fora), `postmortems/`.

## Regras de escrita

- **Português do Brasil**, frase curta, voz ativa.
- Cite **caminho de arquivo e nome de evento** de verdade (`server/modules/dms.ts`, `dm:open`) — doc sem âncora no
  código apodrece sem ninguém notar.
- Tabela em vez de parágrafo para arquivos, eventos e limites.
- Nada de "será implementado": `areas/` descreve só o que já existe. Futuro é `ROADMAP.md`.
- Doc que descreve comportamento antigo é pior que doc nenhum: ao remover um evento ou renomear um arquivo,
  a limpeza do doc entra **no mesmo PR**.
