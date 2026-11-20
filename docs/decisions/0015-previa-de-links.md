# 0015 — Prévia de links buscada e servida pelo servidor

- **Data:** 2026-11-19
- **Situação:** aceita

## Contexto

Mensagem com link deve mostrar a prévia do site (título, descrição, imagem), como no Discord. Alguém tem de buscar
uma página escolhida por qualquer pessoa do grupo. Dois riscos mandam no desenho:

- **SSRF:** o servidor buscando `http://169.254.169.254/`, `http://localhost:5432` ou um IP da rede interna, direto,
  por redirecionamento ou por um nome que resolve para IP privado (inclusive trocando a resposta do DNS entre a
  checagem e a conexão — DNS rebinding).
- **Privacidade:** se o app carregasse a imagem direto do site, cada pessoa que lê a mensagem entregaria o próprio IP
  a quem escreveu o link.

## Decisão

O servidor busca a página e a imagem com um buscador próprio (`server/embeds/safe-fetch.ts`) que só conecta em IP
público já validado, grava a prévia na mensagem (coluna `embed jsonb`) e serve a imagem por uma rota própria com o
link assinado dos anexos (`GET /embeds/<messageId>`), conferindo `view` no canal a cada pedido.

Regras do buscador: só http/https; IP literal conferido por `isPublicAddress`; nome resolvido por um `lookup`
próprio passado ao `http.request`, que só devolve IPs aceitos — o socket conecta no IP que foi conferido, sem segunda
resolução; até 3 redirecionamentos, cada destino conferido de novo; 3 s no total; HTML até 512 KB (corta) e só
`text/html`; imagem até 2 MB (recusa), tipo confirmado pelos bytes (`sniffImage`). Cache em memória de 5 min por URL
e `LIMITS.embed` por conta. A porta `WebFetcher` é injetável: os testes de integração usam o **mesmo** buscador com a
política de IP liberada (`server/tests/fake-web.ts`) contra um site falso local; a política de produção é testada em
unidade. Nenhum teste acessa a internet.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| App busca a prévia (renderer) | Vaza o IP de cada leitor, esbarra em CORS e cada cliente buscaria a mesma página. |
| App carrega só a imagem direto do site | Mesmo vazamento de IP, e o site pode trocar a imagem depois (rastreio por quem lê). |
| Checar o IP com `dns.lookup` e depois chamar `fetch(url)` | Duas resoluções: o DNS pode responder IP público na checagem e `127.0.0.1` na conexão (TOCTOU/rebinding). |
| `fetch` nativo (undici) com `redirect: 'follow'` | Não deixa conferir cada salto nem fixar o IP da conexão sem trocar o dispatcher inteiro. |
| Biblioteca de SSRF/Open Graph (`ssrf-req-filter`, `open-graph-scraper`...) | Dependência a mais para ~150 linhas; o parser dessas libs traz HTML DOM inteiro (cheerio) para ler 4 metas. |
| Parser HTML completo (cheerio/parse5) | Peso e tempo para ler `<meta>` e `<title>`; regex sobre no máximo 512 KB basta e é testada com HTML gigante. |
| Desligar a proteção de IP nos testes por variável de ambiente | Um interruptor de segurança em produção que alguém pode ligar sem querer; a porta injetável evita isso. |
| Proxy da imagem a cada leitura (sem guardar) | Busca o site a cada pessoa que abre o chat (o site vê a frequência) e a imagem pode mudar depois. |

## Consequências

- A prévia fica congelada no momento do envio (ou da edição que trocou o link); o site mudar depois não muda nada.
- Imagens ocupam disco em `DATA_DIR/embeds` (até 2 MB por mensagem com prévia), limpas quando a prévia sai ou a
  mensagem some (varredura periódica).
- Sites que montam os metadados só com JavaScript, que bloqueiam robôs ou que não usam UTF-8 ficam sem prévia ou com
  acentos errados.
- Trocar o buscador (ex.: um serviço externo de prévias) é trocar a implementação da porta `WebFetcher`.
