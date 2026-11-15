---
name: concord-updates
description: Como funciona a atualização automática do Concord (A13) — electron-updater lendo os GitHub Releases, verificação ao abrir e a cada 4 h, download em segundo plano, faixa "Reiniciar para atualizar", e como publicar uma versão (subir a versão do package.json + tag vX.Y.Z → workflow release.yml gera o instalador e o latest.yml). Use ao mexer em src/main/updater.ts, src/shared/updater.ts, window.api.updater (preload), lib/actions/updates.ts, store/updates.ts, components/UpdateBanner.tsx, electron-builder.yml (publish), .github/workflows/release.yml ou nos scripts dist/release, ou ao investigar app que não atualiza, release que falhou ou "A tag não bate com a versão".
---

A documentação desta área fica em **`docs/areas/updates.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
