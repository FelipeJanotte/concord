---
name: concord-voice
description: Como funcionam os canais de voz do Concord — WebRTC em malha (mesh), sinalização via Socket.IO, mute/deafen, detecção de fala, limites e depuração. Use ao mexer em src/renderer/src/lib/voice.ts, nos eventos voice:* ou ao investigar áudio que não chega, eco ou falha de conexão.
---

# Voz (WebRTC em malha)

Cada participante tem uma `RTCPeerConnection` com **cada** outro participante da sala. O servidor só repassa a
sinalização; o áudio vai direto de um usuário para o outro. O código fica em `src/renderer/src/lib/voice.ts`
(classe `VoiceClient`, exportada como `voice`) e é chamado por `joinVoice`, `leaveVoice`, `toggleMute` e
`toggleDeafen` em `lib/actions/voice.ts` (reexportados por `lib/client.ts`). No servidor, tudo fica em
`server/modules/voice.ts` (o mapa `voice` é privado do módulo; outros módulos usam `voiceStates()`,
`emitVoice()` e `clearVoiceChannel()`).

## Fluxo de entrada

```
A clica na sala ─► getUserMedia(áudio com echoCancellation/noiseSuppression/autoGainControl)
                ─► emitWithAck('voice:join', {channelId, muted, deafened}) ─► servidor devolve peers = [B, C]
                ─► A cria um peer para B e outro para C, gera uma offer e envia 'voice:signal' {to, data: offer}
B recebe a offer ─► createPeer(A) ─► setRemoteDescription ─► answer ─► 'voice:signal' para A
ICE candidates vão nos dois sentidos pelo mesmo evento.
```

- **Só quem entra faz as offers.** Quem já estava na sala só responde. Isso evita que os dois lados mandem offer ao mesmo tempo (glare), sem precisar de "perfect negotiation".
- Candidates que chegam antes da `remoteDescription` ficam em `pendingCandidates` e são aplicados em `flushCandidates`.
- O servidor só repassa `voice:signal` se remetente e destinatário estiverem na mesma sala.
- Saída: `voice:leave` → o servidor emite `voice:peer-left` para a sala → cada cliente chama `removePeer`.
- Queda de conexão ou troca de sala: `teardown()` fecha tudo localmente, sem avisar o servidor (ele já sabe pelo `disconnect` ou pelo `voice:join`).

## Mute e deafen

- `setMuted` desliga `track.enabled` do microfone local (a conexão continua; envia silêncio).
- `setDeafened` deixa mudos os `<audio>` dos peers. Na UI, deafen também silencia o microfone (`applyAudio` em `client.ts`).
- O estado vai para o servidor em `voice:join` (inicial) e `voice:update`, e todos recebem pelo `voice:state`, que mostra os ícones vermelhos.

## Quem está falando

O `watch(id, stream)` liga cada stream (o local e os remotos) a um `AnalyserNode` num `AudioContext` único. A cada
120 ms, `tick()` calcula o RMS; acima de `SPEAKING_THRESHOLD` (0.015), o usuário entra em `store.speaking[id]`.
A store só é atualizada quando o conjunto muda, para evitar re-render à toa. Só funciona para quem está na mesma sala.

## Limites e evolução

- **Malha** = N·(N−1)/2 conexões. Bom até umas 8 pessoas por sala. Acima disso, troque por um **SFU** (LiveKit ou mediasoup) e mantenha a mesma UI (`VoiceState`, `speaking`).
- **NAT**: só tem STUN do Google em `ICE_SERVERS`. Entre redes restritivas (4G, empresas), sem **TURN** a conexão falha. Configure um coturn e adicione `{ urls: 'turn:host:3478', username, credential }`.
- Não tem escolha de dispositivo de entrada ou saída. Para adicionar: `navigator.mediaDevices.enumerateDevices()` + `deviceId` no `getUserMedia` e `audio.setSinkId()`.
- Não tem tratamento de `connectionState === 'failed'` além de um log. Uma melhoria seria `pc.restartIce()` + nova offer feita por quem iniciou a conexão.

## Depuração

1. No DevTools do Electron (Ctrl+Shift+I), filtre o console por `[voz]`.
2. Abra `chrome://webrtc-internals` numa janela do Electron (ou num Chrome na mesma máquina) para ver ICE, bytes recebidos e codecs.
3. Microfone negado: `main/index.ts` libera `media` em `setPermissionRequestHandler`. O toast traduz `NotAllowedError`, `NotFoundError` e `NotReadableError`.
4. Testar sozinho numa máquina: duas janelas no mesmo PC funcionam, mas dá microfonia sem fone.
5. Áudio não toca: confira se `ontrack` recebeu `e.streams[0]` e se o `<audio>` não ficou mudo por um deafen.
