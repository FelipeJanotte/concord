---
name: concord-voice
description: Como funcionam os canais de voz do Concord — LiveKit (SFU) com token emitido pelo servidor, livekit-client no app, estado das salas via Socket.IO, mute/deafen, quem está falando, câmera (B21, CameraTile, permissão video), compartilhar a tela, escolha de microfone/saída, volume do microfone (0–200%) e de saída (0–100%) (lib/mic-gain.ts, setMicGain/setOutputVolume), volume por pessoa, pressione para falar (push-to-talk, B20: src/main/push-to-talk.ts, uiohook-napi, lib/actions/push-to-talk.ts, IPC ptt-*), limites e depuração. Use ao mexer em server/livekit.ts, server/modules/voice.ts, src/renderer/src/lib/voice.ts, nos eventos voice:* ou ao investigar áudio que não chega, token recusado, eco ou falha de conexão.
---

A documentação desta área fica em **`docs/areas/voice.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
