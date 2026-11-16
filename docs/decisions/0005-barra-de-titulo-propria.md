# 0005 — Barra de título própria (sem a moldura do sistema)

- **Data:** 2026-11-16
- **Situação:** aceita

## Contexto
A barra do Windows (fechar, minimizar, maximizar) ficava com a cor do sistema, fora do tema escolhido, e quebrava o
tema translúcido (faixa opaca em cima do vidro). Os botões nativos não seguem o visual do Concord.

## Decisão
A janela principal usa `titleBarStyle: 'hidden'` e o app desenha a própria barra (`components/TitleBar.tsx`) com as
cores do tema; os botões mandam `window-control` ao processo principal. No macOS ficam os botões de semáforo do
sistema, alinhados com a barra.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Barra nativa (como era) | Não segue o tema nem o vidro. |
| `titleBarOverlay` (botões nativos com cor escolhida) | Só muda a cor; os botões continuam os do Windows, não "o nosso design", e a cor fixa não acompanha o vidro (fundo transparente + acrílico). |
| `frame: false` | Perde a borda de redimensionar, os cantos arredondados e as sombras do Windows 11, e o acrílico (`setBackgroundMaterial`) depende da moldura. |

## Consequências
- A barra e os botões mudam junto com o tema, inclusive no vidro.
- Perde o menu de layouts do Windows 11 ao passar o mouse no maximizar (Win + Z e arrastar para a borda continuam).
- Arrastar e o duplo clique para maximizar vêm de `-webkit-app-region: drag`; tudo que for clicável na barra precisa de `no-drag`.
