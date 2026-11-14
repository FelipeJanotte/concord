---
name: concord-sounds
description: Como funcionam os efeitos sonoros da comunidade (soundboard, A10 servidor / B17 tela) — envio por POST /sounds (até 512 KB e 5 s, tipo pelos bytes, duração com music-metadata), coleção com links assinados, sound:play só para a sala de voz, regra de não tocar por cima, apagar pelo autor ou manageMessages. Use ao mexer em server/modules/sounds.ts, server/repo/sounds.ts, server/db/schema/sounds.ts, server/storage/audio.ts, src/shared/types/sounds.ts, na tela do soundboard (B17), ou ao investigar som recusado, som que não toca para alguém ou "Espere o som anterior terminar".
---

# Efeitos sonoros (soundboard)

Cada pessoa envia **áudios de até 5 s** para a coleção da comunidade; quem está numa sala de voz toca um deles e
**todos na sala ouvem do começo ao fim**. Cada app toca o som **localmente** ao receber `sound:played` (pela saída
escolhida na B4, respeitando deafen e o volume de quem tocou) — nada é misturado no microfone de ninguém.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/sounds.ts` | Contrato: `Sound`, limites (`SOUND_MAX_BYTES`, `SOUND_MAX_DURATION_MS`, `SOUND_NAME_MAX`, `SOUND_EMOJI_MAX`, `SOUND_TYPES`), `SoundUploadResult`, eventos `sound:*`. |
| `server/modules/sounds.ts` | `POST /sounds`, `GET /sounds/<id>`, `sound:list`, `sound:play`, `sound:delete`. Storage próprio (`soundStorage`, `DATA_DIR/sounds`). |
| `server/storage/audio.ts` | `sniffAudio` (MP3/OGG/WAV/WebM pelos bytes) e `audioDurationMs` (`music-metadata`, import dinâmico porque o pacote é só ESM). |
| `server/repo/sounds.ts` | `insertSound` (nome repetido → `DuplicateError`), `listSounds`, `findSound`, `deleteSound`, `countSounds`. |
| `server/db/schema/sounds.ts` | Tabela `sounds` (migration `0003_sounds`): `check` de nome, emoji, tamanho, duração e tipo; nome único sem diferenciar maiúsculas. |
| `server/modules/voice.ts` | `voiceChannelOf(socketId)` e `voiceSocketsIn(channelId)`, usados para validar e entregar o `sound:played`. |

## Fluxo

```
app ──POST /sounds (bytes, Bearer, X-Sound-Name, X-Sound-Emoji)──► servidor
       tipo pelos bytes → duração ≤ 5 s → limites → DATA_DIR/sounds/<id> + tabela sounds
       ◄── { ok, sound }   e   sound:created para todos (cada um com o link assinado para si)

app (na sala) ──sound:play {channelId, soundId}──► servidor
       está na sala? pode falar (speak)? som existe? som anterior dele já acabou? limite 1/3 s?
       ──sound:played {channelId, soundId, by, accountId}──► só as conexões daquela sala
cada app baixa GET /sounds/<id>?a&e&s (link assinado) e toca localmente
```

## Regras e limites

- **Envio:** 512 KB contados nos bytes (413; o resto do corpo é descartado para o app conseguir ler a resposta),
  tipo **pelos bytes** (`Envie um áudio MP3, OGG, WAV ou WebM`), duração lida do arquivo (`O som pode ter no máximo
  5 segundos`; sem duração legível → `Não foi possível ler a duração do áudio`). Nome 1–32 (único), emoji opcional
  até 8 code points (`cleanSoundEmoji` no contrato, a mesma conta do `char_length` do banco: 👨‍👩‍👧‍👦 cabe). `SOUNDS_PER_ACCOUNT` (20) e `SOUNDS_TOTAL` (200), configuráveis por ambiente. Envios usam o limite
  `upload` (o mesmo dos anexos).
- **Links:** `Sound.url` sai assinado por conta (o mesmo esquema dos anexos, `signResourceUrl` em
  `server/files-signing.ts`); `GET /sounds/<id>` sem assinatura válida dá 404. A coleção é da comunidade inteira (não
  depende de canal).
- **Tocar:** exige estar **naquela sala** (`Entre na sala de voz para tocar sons`) e poder **falar** nela
  (`speak`, v2). **Sobreposição:** a mesma conta não toca outro som antes do anterior terminar (o servidor guarda
  até quando o som dela toca → `Espere o som anterior terminar`); pessoas diferentes podem tocar ao mesmo tempo. É **por conta, de propósito**: a mesma conta em duas janelas (até em salas diferentes) espera nas duas.
  **Na tela (B17):** o volume e o "Silenciar" que eu dei para uma pessoa (B4) valem também para os sons que ela toca.
  Além disso, `LIMITS.sound` = 1 a cada 3 s por conta.
- **Apagar:** o autor ou quem tem `manageMessages`; apaga registro e arquivo e emite `sound:deleted` para todos.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/storage/audio.test.ts` | Tipos pelos bytes (e o que não é áudio), duração de WAV e arquivo corrompido → null. |
| `server/repo/sounds.test.ts` | Gravar/listar/apagar/contar, nome repetido e os `check` do banco. |
| `server/tests/sounds.test.ts` | Servidor real com LiveKit falso: envio e recusas (5 s, 512 KB, não-áudio, nome, emoji, limite por conta, CORS), lista e download assinados, tocar só para a sala, fora da sala, sobreposição, sem `speak`, apagar (autor, outra pessoa, `manageMessages`). |

Áudios de teste são gerados na hora (`server/tests/audio-fixtures.ts`, `wav(segundos)`), sem binários no repositório.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| "Não foi possível ler a duração do áudio" | Arquivo sem cabeçalho de duração (alguns WebM gravados pelo navegador) ou corrompido. Converta para OGG/MP3. |
| Som não toca para alguém | Só quem está **na mesma sala** recebe `sound:played`; confira o `voice:state`. O app baixa pelo link assinado (404 = link vencido: peça `sound:list` de novo). |
| "Espere o som anterior terminar" | Regra de sobreposição por conta (dura o tempo do som). |
| Pendente (B17) | A tela: grade de sons, envio com prévia/corte e tocar localmente ao receber `sound:played`. |
