# Atualização automática (A13)

Quem instalou o Concord recebe as versões novas sem reinstalar: o app procura nos **GitHub Releases** do
repositório, baixa em segundo plano e mostra no topo **"A versão X do Concord está pronta. Reiniciar para
atualizar"**. Na barra de úteis (esquerda), **acima do "Início"**, aparece o botão de atualizar: girando com o
percentual enquanto baixa e verde ("Atualizar o Concord") quando está pronta. Clicar no botão ou na faixa fecha o app,
**instala em silêncio** e abre de novo. Se a pessoa clicar em "Depois", a faixa some (o botão fica) e a versão entra
sozinha da próxima vez que o app fechar.

O app procura **ao abrir e a cada 30 min**. O GitHub não avisa o app instalado quando sai uma release, então alguém
precisa perguntar; 30 min deixa o aviso rápido sem custo (o electron-updater lê o `releases.atom` e o `latest.yml`,
fora do limite da API). Para não esperar, o botão pequeno **"Procurar atualizações"** (ícone de recarregar, no **fim**
da barra de úteis) procura na hora e avisa o resultado: "O Concord já está na versão mais nova.", o erro, ou começa a
baixar (aí o botão some e aparece o de progresso no topo).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/updater.ts` | `UpdateStatus` (`idle`, `checking`, `downloading` com `percent`, `ready` com `version`, `error`), `UPDATE_CHECK_INTERVAL_MS` (30 min), `UpdaterBridge`. |
| `src/main/updater.ts` | `createUpdaterController` (lógica, testável): `autoDownload` e `autoInstallOnAppQuit` ligados, eventos do electron-updater → situação, "pronta" não volta atrás, erro com texto amigável (motivo no log `[atualização]`), `checkNow` (botão: procura na hora; no dev manda o erro "A atualização só funciona no app instalado."), `install` só com a versão baixada, com `quitAndInstall(true, true)`: silencioso e abrindo o app depois (o instalador é assistido, `oneClick: false`; sem `isSilent` ele abria o assistente inteiro, com escolha de pasta). `setupUpdater`: importa o `electron-updater` sob demanda, IPC `update-get`/`update-check`/`update-install` e o aviso `update-status`. **Em modo dev (não empacotado) não procura.** |
| `src/main/index.ts` | Chama `setupUpdater(() => mainWindow)`. |
| `src/preload/index.ts` / `index.d.ts` | `window.api.updater` (`getStatus`, `onStatus`, `check`, `install`). |
| `src/renderer/src/lib/actions/updates.ts` | `startUpdates` (no `main.tsx`), `checkForUpdates` (só depois do clique avisa o resultado com `notify`, uma vez; a verificação automática não avisa), `canCheckForUpdates` (há ponte: fora do Electron não há botão), `installUpdate`, `dismissUpdate`. `updatesEnv.bridge` é substituído nos testes. |
| `src/renderer/src/store/updates.ts` | `update` (a situação) e `updateDismissed` (versão escondida pelo "Depois"). |
| `src/renderer/src/components/UpdateBanner.tsx` | A faixa no topo do app (só com `ready`). |
| `src/renderer/src/components/rail/UpdateButton.tsx` | `UpdateRailSlot` (no topo do `UtilityRail`, acima do Início, com separador): `downloading` = girando + percentual, sem clique; `ready` = verde, "Atualizar o Concord", chama `installUpdate`. Não some com o "Depois" da faixa. `UpdateCheckButton` (no fim do `UtilityRail`, pequeno): "Procurar atualizações" chama `checkForUpdates`; `checking` = girando, sem clique; some com `downloading`/`ready` e fora do Electron. |
| `electron-builder.yml` | `publish: github` (FelipeJanotte/concord): o instalador e o `latest.yml` vão para a release. |
| `.github/workflows/pr-version.yml` | Em cada PR para a `main` (aberto, push, label): calcula a versão e faz o commit `chore: versão X.Y.Z` no PR com o `RELEASE_TOKEN` (ou o `GITHUB_TOKEN`). Só PR do próprio repositório. |
| `.github/workflows/auto-release.yml` | A cada push na `main` (PR mergeado): acha o PR do commit e os labels, calcula a versão, cria e envia a tag e chama o `release.yml` com a tag e o título do PR. |
| `.github/scripts/next-version.mjs` | `prVersion({ tags, mainVersion, labels })` (a versão do PR) e `nextVersion({ tags, packageVersion, labels })` (a do merge), puras e testadas; tipos em `next-version.d.mts`. Linha de comando: `node next-version.mjs pr "<labels>"` (PR, lê a `main` em `origin/main`) ou `node next-version.mjs "<labels>"` (merge). |
| `.github/workflows/release.yml` | Chamado pelo auto-release (`workflow_call`, entradas `tag` e `notes`) ou por tag `vX.Y.Z` criada à mão → Windows: `npm ci`, aplica a versão da tag no `package.json`, typecheck, cria a release (se não existir) e `npm run release` (com o `GITHUB_TOKEN`). O servidor padrão da tela de login vem da **variável do repositório** `VITE_DEFAULT_SERVER` (Settings → Secrets and variables → Actions → Variables); vazia = `localhost:3001`. |
| `package.json` | `dist` (só gera, `--publish never`) e `release` (gera e publica, `--publish always`). `electron-updater` fica em `dependencies` (vai no app). |

## Publicar uma versão

0. (Uma vez) Defina a variável do repositório `VITE_DEFAULT_SERVER` com o endereço do servidor dos amigos (ex.:
   `http://26.x.x.x:3001` no Radmin, ou `https://concord.seudominio`). Quem já entrou não depende dela: o servidor
   fica salvo no login e sobrevive à atualização.
1. **No PR:** ao abrir o PR para a `main` (e a cada push, label adicionado ou tirado), o workflow **Versão do PR**
   (`.github/workflows/pr-version.yml`) calcula a versão (`next-version.mjs pr`) e, se o `package.json` do PR
   estiver diferente, faz o commit `chore: versão X.Y.Z` no próprio PR (`package.json` e `package-lock.json`).
   Puxe esse commit (`git pull`) antes do próximo push.
   - **Versão:** sobe o patch da **maior entre a última tag `vX.Y.Z` e a versão da `main`**. Labels no PR:
     `release: minor`, `release: major` ou `sem release` (volta para a versão da `main` e o merge não publica;
     bom para PR só de documentação). Não edite a versão à mão: o workflow sobrescreve; use os labels.
   - **Token:** o commit é feito com o secret `RELEASE_TOKEN` (token fine-grained com **Contents: write** no
     repositório), para o CI rodar também nesse commit. Sem o secret, usa o `GITHUB_TOKEN` e o commit da versão fica
     sem check (commit do `GITHUB_TOKEN` não dispara workflows).
   - Só PR de branch do próprio repositório (de fork o Actions não consegue fazer push). O commit do bot dispara o
     workflow de novo, que vê a versão certa e para.
2. **No merge:** o workflow **Release automática** (`.github/workflows/auto-release.yml`) cria a tag com a versão
   do `package.json` (já certa pelo PR) e chama o **Release** (`release.yml`, como workflow reutilizável). O
   `release.yml` cria a release (título = versão, notas = título do PR) e depois o `electron-builder` gera e envia
   `concord-X.Y.Z-setup.exe` + `latest.yml` + `.blockmap`. Quem tem uma versão anterior instalada recebe o aviso e
   o botão em até 30 min (na hora, ao abrir o app ou clicando em "Procurar atualizações").
   - **Dois PRs com a mesma versão** (o segundo foi aberto antes do primeiro entrar): no merge do segundo a tag já
     existe, então o auto-release sobe o patch da última tag (a release sai certa; o `package.json` da `main` fica
     uma versão atrás até o próximo PR).
   - **Por que o auto-release chama o release.yml:** a tag é criada com o `GITHUB_TOKEN` (não dispara outros
     workflows; com o `RELEASE_TOKEN` o `release.yml` rodaria duas vezes). `concurrency: release` faz dois merges
     seguidos virarem duas versões, na ordem.
   - **Release criada antes do `electron-builder`:** ele envia os arquivos em paralelo e, sem release, cada envio
     criava uma (aconteceu na `v0.1.1` e na `v0.1.2`: o `.blockmap` ficou numa release duplicada).
   - O `release.yml` ainda aplica a versão da tag no `package.json` durante o build (garante o nome certo mesmo no
     caso dos dois PRs).
2. **À mão (se precisar):** `git tag v1.2.3 && git push origin v1.2.3` também dispara o `release.yml`.

A primeira versão com a A13 precisa ser instalada à mão (as anteriores não sabem se atualizar). Um instalador gerado
à mão (`npm run dist`) também se atualiza pelas releases, desde que a versão dele seja menor que a publicada.

## Pré-ponte para o Tauri (M0)

Última versão Electron antes da troca pelo Tauri (ADR 0013, "Troca do Electron"). Prepara quem já tem o app instalado.

| Item | Como é |
|---|---|
| Arquivo | `<userData>/migrate.json`, escrito em `migrate.json.tmp` e renomeado (nunca fica pela metade). |
| Quando | A cada partida, no `did-finish-load` da janela principal (`setupMigration` em `src/main/migration.ts`). |
| Formato | `{ "version": 1, "exportedAt": "<ISO>", "entries": { "<chave>": "<valor cru do localStorage>" } }`; só chaves `concord:*`. |
| Para quê | O app Tauri tem outra origem e não enxerga o localStorage do Electron: ele lê este arquivo na primeira execução. |
| Pasta de instalação | `autoUpdater.installDirectory` = pasta de `app.getPath('exe')` (só empacotado), para o instalador do Tauri cair na mesma pasta. |
| Falha | Só `console.error`; o app segue normalmente. |

Testes: `src/main/migration.test.ts` (filtro `concord:`, formato, temporário + rename, falha logada) e `src/main/updater.test.ts` (pasta de instalação fixada só no app instalado).

## Testes

| Arquivo | Cobre |
|---|---|
| `src/main/updater.test.ts` | Atualizador falso: opções ligadas, procura ao abrir e a cada 30 min, "procurar agora" (instalado procura; dev avisa), dev não procura, etapas e percentual, "pronta" não volta, sem versão nova, erro (texto + log), promessa que falha, instalar só pronta (silencioso e reabrindo). |
| `server/release.test.ts` | Próxima versão (sem tag, maior tag por ordem de versão, labels minor/major/sem release, `package.json` acima da tag, tags fora do padrão, versão inválida) e coerência dos dois workflows. |
| `src/renderer/src/components/rail/UpdateButton.test.tsx` | Botão na barra: some sem atualização, acima do Início baixando (percentual, sem instalar) e pronta (instala), continua depois do "Depois"; "Procurar atualizações" no fim da barra (clique procura, girando sem clique, some baixando/pronta e fora do Electron). |
| `src/renderer/src/components/updates.test.tsx` | Situação da ponte, parar de ouvir, "procurar agora" (aviso de já na mais nova, erro, nada sem clique e uma vez por clique), faixa só pronta, "Reiniciar para atualizar", "Depois" e versão mais nova, fora do Electron. |

O caminho de verdade (baixar e instalar) só dá para conferir com duas releases publicadas.

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| App não atualiza | Clique em "Procurar atualizações" (fim da barra de úteis): diz se já está na mais nova ou mostra o erro. Nenhuma release publicada ainda (`gh release list` vazio: crie a tag), rodando em dev (`npm run dev` nunca atualiza); versão instalada anterior à A13; ou a release não tem o `latest.yml` (publicada à mão). Log `[atualização]` no terminal/arquivo do main. |
| Ao atualizar abre o assistente de instalação (escolher pasta) | `quitAndInstall` sem `isSilent`. O controlador usa `quitAndInstall(true, true)`. |
| Instalador da release abre em `localhost:3001` | A variável do repositório `VITE_DEFAULT_SERVER` não está definida (só afeta quem nunca entrou). |
| Merge na `main` não gerou release | O PR tinha o label `sem release`, ou o job "criar a tag" falhou (aba Actions → Release automática). A tag criada fica mesmo se a publicação falhar: rode o `release.yml` de novo pela tag ou apague-a (`git push --delete origin vX.Y.Z`). |
| PR não recebeu o commit da versão | PR de fork, ou o workflow "Versão do PR" falhou (aba Actions). Com o label `sem release`, a versão volta para a da `main` (pode não haver commit). |
| Commit "chore: versão" sem check de CI | Falta o secret `RELEASE_TOKEN`: o commit foi feito com o `GITHUB_TOKEN`, que não dispara o CI. |
| `git push` recusado no PR (non-fast-forward) | O bot fez o commit da versão: `git pull` (ou `git pull --rebase`) e envie de novo. |
| Releases duplicadas da mesma tag | Versões antigas do `release.yml` (antes de criar a release primeiro). Apague a que só tem o `.blockmap`. |
| Workflow falhou em "Usar a versão da tag" | A tag não é `vX.Y.Z` (ex.: `v1.2`). |
| Windows avisa "editor desconhecido" | O instalador não é assinado (certificado de assinatura é pago). O SmartScreen avisa na primeira instalação; as atualizações seguem normais. |
| `[atualização] não iniciou: ... setting 'autoDownload'` | O electron-updater é CommonJS: no `import()` do main o `autoUpdater` só vem em `default`. `pickAutoUpdater` (`src/main/updater.ts`) acha nos dois lugares; não troque por `const { autoUpdater } = await import(...)`. |
| "A atualização só funciona no app instalado." | Clicou em "Procurar atualizações" no `npm run dev`: o dev nunca atualiza. |
| Pendente | Assinatura do código, canal "beta", notas da versão na faixa e aviso instantâneo pelo servidor (Socket.IO) quando sair release. |
