# 0018 — Áudio recebido pela Web Audio (`webAudioMix`)

- **Data:** 2026-11-27
- **Situação:** aceita

## Contexto
O volume de cada pessoa e do bot de música precisava ir de 0 a 200%, de 1 em 1%. O LiveKit tocava cada faixa num
`<audio>`, e `HTMLMediaElement.volume` não passa de 1 (acima disso o navegador lança erro). O deafen e o equalizador
automático silenciavam com `muted` nesses elementos.

## Decisão
A `Room` é criada com `webAudioMix: true`: o LiveKit toca cada faixa por um `GainNode` num `AudioContext` próprio, e
`RemoteAudioTrack.setVolume` passa a aceitar valores acima de 1. Todo silêncio (deafen, faixa que vai para o
equalizador) vira `setVolume(0)`, porque `muted` no `<audio>` não afeta mais o som.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Manter o `<audio>` e limitar a 100% | Não atende o pedido (até 200%). |
| Passar toda voz pelo `VoiceLeveler` (já tem `GainNode`) | Mistura volume manual com o equalizador opcional; dois caminhos de áudio para manter. |
| `AudioContext` próprio do app em `webAudioMix: { audioContext }` | O app teria de criar, trocar a saída e fechar o contexto; o LiveKit já faz isso (troca a saída com `AudioContext.setSinkId` no `connect` e no `switchActiveDevice`). |

## Consequências
- Volume por pessoa e do bot até 200%; o volume de saída e o áudio da tela poderiam passar de 100% sem mudar o caminho.
- Acima de 100% o som pode saturar em quem já fala alto (não há limitador).
- A saída escolhida depende de `AudioContext.setSinkId` (Chromium 110+; o Electron tem).
- Quem mexer no silêncio das faixas usa `setVolume`, nunca `el.muted`.
