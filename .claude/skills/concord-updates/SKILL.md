---
name: concord-updates
description: Como funciona a atualização automática do Concord (A13) — electron-updater lendo os GitHub Releases, verificação ao abrir e a cada 4 h, download em segundo plano, faixa "Reiniciar para atualizar" e botão "Atualizar o Concord" acima do Início na barra de úteis (instala em silêncio e reabre), e como as versões são publicadas (cada PR mergeado na main vira tag e release automaticamente: auto-release.yml + next-version.mjs → release.yml gera o instalador e o latest.yml; labels release: minor/major e sem release). Use ao mexer em src/main/updater.ts, src/shared/updater.ts, window.api.updater (preload), lib/actions/updates.ts, store/updates.ts, components/UpdateBanner.tsx, components/rail/UpdateButton.tsx, electron-builder.yml (publish), .github/workflows/release.yml, .github/workflows/auto-release.yml, .github/scripts/next-version.mjs ou nos scripts dist/release, ou ao investigar app que não atualiza, release que falhou ou merge na main que não gerou release.
---

A documentação desta área fica em **`docs/areas/updates.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
