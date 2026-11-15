---
name: concord-sounds
description: Como funcionam os efeitos sonoros da comunidade (soundboard, A10 servidor / B17 tela) — envio por POST /sounds (até 512 KB e 5 s, tipo pelos bytes, duração com music-metadata), coleção com links assinados, sound:play só para a sala de voz, regra de não tocar por cima, apagar pelo autor ou manageMessages. Use ao mexer em server/modules/sounds.ts, server/repo/sounds.ts, server/db/schema/sounds.ts, server/storage/audio.ts, src/shared/types/sounds.ts, na tela do soundboard (B17: components/voice/Soundboard.tsx, SoundUploadForm.tsx, EmojiPicker.tsx, lib/actions/sounds.ts, store/sounds.ts, botão no VoiceView, no painel da chamada privada (CallPanel) e no "Voz conectada" (VoiceStatusPanel), janela montada uma vez no UserPanel), ou ao investigar som recusado, som que não toca para alguém ou "Espere o som anterior terminar".
---

A documentação desta área fica em **`docs/areas/sounds.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
