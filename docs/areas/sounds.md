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
       está na sala? pode falar (speak)? não está silenciado por moderador? som existe? som anterior dele já acabou? limite 1/3 s?
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
  (`speak`, v2). Quem foi **silenciado por um moderador** (B6, `isServerMuted`) também não toca sons, em nenhuma
  sala (`Um moderador silenciou você nas salas de voz`). **Sobreposição:** a mesma conta não toca outro som antes do anterior terminar (o servidor guarda
  até quando o som dela toca → `Espere o som anterior terminar`); pessoas diferentes podem tocar ao mesmo tempo. É **por conta, de propósito**: a mesma conta em duas janelas (até em salas diferentes) espera nas duas.
  **Na tela (B17):** o volume e o "Silenciar" que eu dei para uma pessoa (B4) valem também para os sons que ela toca.
  Além disso, `LIMITS.sound` = 1 a cada 3 s por conta.
- **Apagar:** o autor ou quem tem `manageMessages`; apaga registro e arquivo e emite `sound:deleted` para todos.

## Na tela (B17)

Botão **"Efeitos sonoros"** (ícone de nota) nos controles da sala de voz, só para quem está conectado, e na linha de
baixo do "Voz conectada" (`VoiceStatusPanel` do `UserPanel`). Abre um **popup ancorado no botão** (`Popover` do
shadcn/Radix com `modal={false}`) com a grade da coleção; clicar num som toca para todos na sala.

**Popup, não janela:** não escurece a tela nem bloqueia o resto do app (dá para continuar no chat, mexer no microfone,
clicar em outra pessoa). Fecha ao clicar fora, com Esc ou clicando no botão de novo. Na sala e na chamada abre para
cima (`side="top"`); no "Voz conectada", que fica no canto de baixo da barra lateral, abre para a direita
(`side="right"`). Altura limitada ao espaço da tela (`--radix-popover-content-available-height`), com rolagem.

**Cada botão tem o seu popup** (`SoundboardPopover` envolve o botão; estado aberto/fechado local, não na store): com
a sala e o "Voz conectada" na tela ao mesmo tempo, abrir um não abre o outro. Abrir busca a coleção de novo
(`refreshSounds`: a coleção pode ter falhado no login ou os links ter vencido em 24 h).

**Enviar um som fica dentro do popup:** "Enviar um som" troca a grade pelo formulário no mesmo lugar (o envio é rápido
e curto, não pede janela própria). O conteúdo só existe com o popup aberto: fechar no meio do envio descarta o
formulário e o erro, e reabrir volta para a grade.

**Volume dos efeitos sonoros:** controle deslizante no topo do popup (0–100%, de 5 em 5, padrão 100%). É uma
preferência **desta máquina**, só para o que eu ouço (não muda o volume para os outros): `store.soundboardVolume`,
`setSoundboardVolume` em `lib/actions/devices.ts`, salvo em `concord:audio` como `soundboardVolume` (valor ruim ou
fora de 0–1 é corrigido ao ler). Vale para o próximo som tocado (o que já está tocando não muda). Não afeta os sons de
entrar/sair da sala (B16), que têm volume próprio em Configurações → Voz e vídeo.

**Nas chamadas privadas** (B8) o mesmo botão fica nos controles do painel da chamada (`components/call/CallPanel.tsx`),
com o indicador "fulano tocou X" acima deles. A coleção é a mesma da comunidade e o som vai para a sala de voz da
conversa (o `sound:play` usa `myVoiceChannelId`): só a outra pessoa ouve. O servidor não precisou mudar: numa conversa
o `speak` vale para os dois membros sem bloqueio (`allowed` → `allowedInDm`). O popup diz "para a outra pessoa da
chamada" em vez de "para todos na sala".

| Arquivo | Papel |
|---|---|
| `src/renderer/src/store/devices.ts` + `lib/actions/devices.ts` | `soundboardVolume` (0–1, padrão 1) e `setSoundboardVolume`, salvos em `concord:audio`. |
| `src/renderer/src/store/sounds.ts` | `sounds` (ordem de nome), `soundsLoaded`, `soundsPlaying` (conta → `{ soundId, by, until }`, o indicador). Aberto/fechado do popup não fica aqui (é local de cada botão). |
| `src/renderer/src/lib/actions/sounds.ts` | `bindSoundsEvents` (`sound:created/deleted/played`), `loadSounds` (depois do `hello`), `refreshSounds` (o mesmo, sem lançar; ao abrir o popup), `playSound`, `deleteSound`, `uploadSound`, `checkSoundFile`, `soundNameFromFile`. O HTTP (`soundTransport.send`: `fetch` no `POST /sounds`; `soundTransport.duration`: duração lida por um `Audio`) e o áudio (`soundOutput.play`) são substituídos nos testes. |
| `src/renderer/src/components/voice/Soundboard.tsx` | `SoundboardPopover` (envolve o botão: popup sem modal com grade, bloqueios, erro, lixeira com confirmação e o envio) e `SoundsPlayingBar` ("📯 Ana tocou Buzina" acima dos controles). |
| `src/renderer/src/components/ui/popover.tsx` | `Popover`/`PopoverTrigger`/`PopoverContent` do shadcn (`npx shadcn@latest add popover`). |
| `src/renderer/src/components/voice/SoundUploadForm.tsx` | Enviar: arquivo (confere 512 KB e 5 s na hora), prévia (`<audio controls>`), nome sugerido pelo arquivo e o emoji escolhido no `EmojiPicker` (aparece ao lado do nome). |
| `src/renderer/src/components/voice/EmojiPicker.tsx` | Grade de emojis por categoria (`EMOJI_GROUPS`: Sons, Rostos, Gestos, Bichos, Coisas). Clicar escolhe, clicar no escolhido tira (sem emoji). Lista fixa, sem biblioteca; todos passam no `cleanSoundEmoji` (teste garante). Para acrescentar emojis, edite `EMOJI_GROUPS`. Reusado pelas reações das mensagens (A16, `components/chat/Reactions.tsx`). |
| `src/renderer/src/components/VoiceView.tsx`, `UserPanel.tsx`, `call/CallPanel.tsx` | O botão dentro do `SoundboardPopover` (e o indicador na sala e na chamada). `ControlButton` e `PanelButton` repassam as props do `<button>` para o gatilho do popup funcionar (`aria-expanded`, clique, ref). |

**Tocar localmente** (`sound:played`): só se ainda estou naquela sala e o som está na coleção. Marca o indicador
até o som acabar (`durationMs`). O `by` do evento é a **conexão** de quem tocou (`User.id`, o socket.id), não o nome:
o indicador procura o nome em `users` (pela conexão; se ela já saiu, pela conta; sem nada, "Alguém"). Toca com `soundOutput.play(link completo, { volume, outputId })`: a saída escolhida
na B4 (`setSinkId`), o volume que dei para quem tocou (`userVolumes[conta]`, 100% se não mexi); com deafen ou com a
pessoa silenciada só para mim (`userMuted`), não toca (o indicador aparece igual).

**CSP:** o `<audio>` toca o link do servidor (`http(s)://<servidor>/sounds/...`), então o `media-src` da CSP
(`src/renderer/index.html`) precisa de `http:` e `https:` (além de `blob:`, usado na prévia do envio). Sem isso o
navegador bloqueia e **ninguém ouve**, nem quem tocou; `src/renderer/src/csp.test.ts` protege isso. Falha ao tocar
aparece no console como `[sons] não foi possível tocar:`.

**Bloqueios no popup:** fora da sala → "Entre numa sala de voz para tocar sons."; sem `speak` (ou silenciado por um
moderador, que chega como `canSpeak: false`) → "Você não pode falar nesta sala, então não toca sons." (botões desligados). Lixeira só para quem enviou ou tem `manageMessages`.

**Enviar:** `checkSoundFile` antes de enviar (tamanho e duração; o tipo quem confere é o servidor, pelos bytes) e
`uploadSound` limpa o nome (1–32) e o emoji (`cleanSoundEmoji`). O som enviado já entra na coleção (o
`sound:created` que chega depois não duplica). Sem corte para 5 s: arquivo maior é recusado com a mensagem.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/storage/audio.test.ts` | Tipos pelos bytes (e o que não é áudio), duração de WAV e arquivo corrompido → null. |
| `src/renderer/src/lib/actions/devices.test.ts` | `soundboardVolume`: padrão 100%, salvar, limite e dado ruim ao ler. |
| `server/repo/sounds.test.ts` | Gravar/listar/apagar/contar, nome repetido e os `check` do banco. |
| `src/renderer/src/lib/actions/sounds.test.ts` | App: coleção (ordem, criado/apagado, recarregar ao abrir), `sound:played` (link, saída, volume por pessoa × saída × efeitos sonoros, deafen, silenciado, outra sala, indicador até acabar com o nome de quem tocou, conexão que já saiu), tocar/apagar e enviar (nome sugerido, tamanho, duração, token, recusas, erro do servidor). |
| `src/renderer/src/components/voice/soundboard.test.tsx` | Tela: popup sem modal (o resto do app continua clicável e sem `aria-hidden`; clicar fora, Esc e o botão de novo fecham; abrir recarrega a coleção; reabrir depois de fechar no envio volta para a grade), controle de volume dos efeitos sonoros (mostra, muda e salva), grade (tocar, erro, bloqueios, vazia), apagar (só o meu; `manageMessages`), enviar (prévia, nome, emoji pela grade, sem emoji, recusa local, erro), seletor de emoji (escolher/tirar, categorias, lista válida e sem repetir) e indicador. `VoiceView.test.tsx`: botão e indicador na sala. `voice-panel.test.tsx`: abre do "Voz conectada". `call/call.test.tsx`: botão no painel da chamada, texto do popup e o som indo para a sala da conversa. |
| `server/tests/sounds.test.ts` | Servidor real com LiveKit falso: envio e recusas (5 s, 512 KB, não-áudio, nome, emoji, limite por conta, CORS), lista e download assinados, tocar só para a sala, na chamada de uma conversa privada (só a outra pessoa; bloqueio recusa), fora da sala, sobreposição, sem `speak`, silenciado por um moderador (e liberado ao tirar), apagar (autor, outra pessoa, `manageMessages`). |

Áudios de teste são gerados na hora (`server/tests/audio-fixtures.ts`, `wav(segundos)`), sem binários no repositório.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| "Não foi possível ler a duração do áudio" | Arquivo sem cabeçalho de duração (alguns WebM gravados pelo navegador) ou corrompido. Converta para OGG/MP3. |
| Som não toca para alguém | Só quem está **na mesma sala** recebe `sound:played`; confira o `voice:state`. O app baixa pelo link assinado (404 = link vencido: peça `sound:list` de novo). |
| Ninguém ouve o som (nem quem tocou), mas o indicador aparece | CSP sem `http:`/`https:` em `media-src`: o console mostra "Refused to load media" ou `[sons] não foi possível tocar`. |
| Indicador mostra um código estranho em vez do nome ("XvSA... tocou") | O app mostrou o `by` (id da conexão) direto; o nome vem de `users` (corrigido; veja "Tocar localmente"). |
| "Espere o som anterior terminar" | Regra de sobreposição por conta (dura o tempo do som). |
| Som tocou para os outros mas não para mim | Deafen ligado, a pessoa está silenciada só para mim (botão direito), o volume dela está em 0 ou o volume dos efeitos sonoros (topo do popup) está em 0%. |
| Botões do popup desligados | Fora da sala ou sem `speak` nela (o popup diz qual). |
| Popup fecha sozinho ao clicar em outra coisa | De propósito: sem modal, clicar fora fecha (como o Discord). Para tocar vários sons seguidos, clique só dentro dele. |
| Pendente | Cortar o áudio para 5 s antes de enviar (hoje o arquivo longo é recusado). |
