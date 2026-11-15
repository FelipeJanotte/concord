# Atualização automática (A13)

Quem instalou o Concord recebe as versões novas sem reinstalar: o app procura nos **GitHub Releases** do
repositório, baixa em segundo plano e mostra no topo **"A versão X do Concord está pronta. Reiniciar para
atualizar"**. Na barra de úteis (esquerda), **acima do "Início"**, aparece o botão de atualizar: girando com o
percentual enquanto baixa e verde ("Atualizar o Concord") quando está pronta. Clicar no botão ou na faixa fecha o app,
**instala em silêncio** e abre de novo. Se a pessoa clicar em "Depois", a faixa some (o botão fica) e a versão entra
sozinha da próxima vez que o app fechar.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/updater.ts` | `UpdateStatus` (`idle`, `checking`, `downloading` com `percent`, `ready` com `version`, `error`), `UPDATE_CHECK_INTERVAL_MS` (4 h), `UpdaterBridge`. |
| `src/main/updater.ts` | `createUpdaterController` (lógica, testável): `autoDownload` e `autoInstallOnAppQuit` ligados, eventos do electron-updater → situação, "pronta" não volta atrás, erro com texto amigável (motivo no log `[atualização]`), `install` só com a versão baixada, com `quitAndInstall(true, true)`: silencioso e abrindo o app depois (o instalador é assistido, `oneClick: false`; sem `isSilent` ele abria o assistente inteiro, com escolha de pasta). `setupUpdater`: importa o `electron-updater` sob demanda, IPC `update-get`/`update-install` e o aviso `update-status`. **Em modo dev (não empacotado) não procura.** |
| `src/main/index.ts` | Chama `setupUpdater(() => mainWindow)`. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.updater` (`getStatus`, `onStatus`, `install`). |
| `src/renderer/src/lib/actions/updates.ts` | `startUpdates` (no `main.tsx`), `installUpdate`, `dismissUpdate`. `updatesEnv.bridge` é substituído nos testes. |
| `src/renderer/src/store/updates.ts` | `update` (a situação) e `updateDismissed` (versão escondida pelo "Depois"). |
| `src/renderer/src/components/UpdateBanner.tsx` | A faixa no topo do app (só com `ready`). |
| `src/renderer/src/components/rail/UpdateButton.tsx` | `UpdateRailSlot` (no topo do `UtilityRail`, acima do Início, com separador): `downloading` = girando + percentual, sem clique; `ready` = verde, "Atualizar o Concord", chama `installUpdate`. Não some com o "Depois" da faixa. |
| `electron-builder.yml` | `publish: github` (FelipeJanotte/concord): o instalador e o `latest.yml` vão para a release. |
| `.github/workflows/release.yml` | Tag `vX.Y.Z` → Windows: confere se a tag bate com o `package.json`, `npm ci`, typecheck e `npm run release` (com o `GITHUB_TOKEN`). O servidor padrão da tela de login vem da **variável do repositório** `VITE_DEFAULT_SERVER` (Settings → Secrets and variables → Actions → Variables); vazia = `localhost:3001`. |
| `package.json` | `dist` (só gera, `--publish never`) e `release` (gera e publica, `--publish always`). `electron-updater` fica em `dependencies` (vai no app). |

## Publicar uma versão

0. (Uma vez) Defina a variável do repositório `VITE_DEFAULT_SERVER` com o endereço do servidor dos amigos (ex.:
   `http://26.x.x.x:3001` no Radmin, ou `https://concord.seudominio`). Quem já entrou não depende dela: o servidor
   fica salvo no login e sobrevive à atualização.
1. Suba a versão no `package.json` (ex.: `0.2.0`) num PR e mergeie na `main`.
2. Na `main` atualizada: `git tag v0.2.0 && git push origin v0.2.0`.
3. O workflow **Release** gera `concord-0.2.0-setup.exe` + `latest.yml` e publica a release. Quem tem uma
   versão anterior instalada recebe a faixa em até 4 h (ou ao abrir o app).

A primeira versão com a A13 precisa ser instalada à mão (as anteriores não sabem se atualizar). Um instalador gerado
à mão (`npm run dist`) também se atualiza pelas releases, desde que a versão dele seja menor que a publicada.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/main/updater.test.ts` | Atualizador falso: opções ligadas, procura ao abrir e a cada 4 h, dev não procura, etapas e percentual, "pronta" não volta, sem versão nova, erro (texto + log), promessa que falha, instalar só pronta (silencioso e reabrindo). |
| `src/renderer/src/components/rail/UpdateButton.test.tsx` | Botão na barra: some sem atualização, acima do Início baixando (percentual, sem instalar) e pronta (instala), continua depois do "Depois". |
| `src/renderer/src/components/updates.test.tsx` | Situação da ponte, parar de ouvir, faixa só pronta, "Reiniciar para atualizar", "Depois" e versão mais nova, fora do Electron. |

O caminho de verdade (baixar e instalar) só dá para conferir com duas releases publicadas.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| App não atualiza | Nenhuma release publicada ainda (`gh release list` vazio: crie a tag), rodando em dev (`npm run dev` nunca atualiza); versão instalada anterior à A13; ou a release não tem o `latest.yml` (publicada à mão). Log `[atualização]` no terminal/arquivo do main. |
| Ao atualizar abre o assistente de instalação (escolher pasta) | `quitAndInstall` sem `isSilent`. O controlador usa `quitAndInstall(true, true)`. |
| Instalador da release abre em `localhost:3001` | A variável do repositório `VITE_DEFAULT_SERVER` não está definida (só afeta quem nunca entrou). |
| Workflow falhou em "Conferir a versão" | A tag não bate com o `package.json`: suba a versão primeiro, apague a tag (`git push --delete origin vX.Y.Z`) e crie de novo. |
| Windows avisa "editor desconhecido" | O instalador não é assinado (certificado de assinatura é pago). O SmartScreen avisa na primeira instalação; as atualizações seguem normais. |
| `[atualização] não iniciou: ... setting 'autoDownload'` | O electron-updater é CommonJS: no `import()` do main o `autoUpdater` só vem em `default`. `pickAutoUpdater` (`src/main/updater.ts`) acha nos dois lugares; não troque por `const { autoUpdater } = await import(...)`. |
| Pendente | Assinatura do código, canal "beta" e notas da versão na faixa. |
