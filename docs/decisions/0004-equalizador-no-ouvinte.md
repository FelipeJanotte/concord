# 0004 — Equalizador automático de vozes no ouvinte, com Web Audio própria

- **Data:** 2026-11-15
- **Situação:** aceita

## Contexto
As vozes chegam à sala em volumes muito diferentes (microfone baixo, microfone estourado). O pedido era um
equalizador opcional e configurável que deixe todos no mesmo volume. O volume por pessoa de hoje usa
`RemoteAudioTrack.setVolume`, que não passa de 100%: dá para abaixar quem fala alto, mas não para aumentar quem está
baixo. A opção `webAudioMix` do `livekit-client` permitiria passar de 100%, mas quebra o deafen (o elemento mudo
deixa de silenciar o áudio).

## Decisão
O equalizador age em **quem ouve**: com ele ligado, cada microfone remoto sai do elemento `<audio>` (que fica mudo)
e passa por uma cadeia de Web Audio própria (`Analyser → Gain`, `lib/leveler/`), que mede o nível e aplica um ganho
de 0,25 a 3. Deafen, volume por pessoa, volume de saída e saída escolhida são refeitos nessa cadeia. Desligado, nada
muda no caminho antigo.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Ouvinte com `setVolume` e o `audioLevel` do LiveKit | Só abaixa: quem está baixo continua baixo, e todos acabam no nível do mais baixo. |
| `webAudioMix` do `livekit-client` com `setWebAudioPlugins` | Quebra o deafen pelo elemento mudo e muda o caminho de todo áudio da sala, ligado ou não. |
| Normalizar no emissor (cada um no próprio microfone) | Só funciona se a pessoa que fala baixo ligar; quem ouve não consegue configurar. O `autoGainControl` do WebRTC já faz isso em parte e não resolveu. |

## Consequências
- Cada ouvinte escolhe o próprio alvo; nada vai para o servidor e nenhum evento novo existe.
- Com ele ligado, o áudio dos microfones toca pelo `AudioContext` do equalizador, não pelo elemento: mudança no
  deafen, no volume ou na saída precisa valer nos dois caminhos (`applyVolume`/`muteElements` em `lib/voice.ts`).
- Áudio da tela fica de fora (música e vídeo não devem ser "igualados" à voz).
