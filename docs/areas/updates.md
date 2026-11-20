# Atualização automática (A13)

Quem instalou o Concord recebe as versões novas sem reinstalar: o app procura nos **GitHub Releases** do
repositório, baixa em segundo plano e mostra no topo **"A versão X do Concord está pronta. Reiniciar para
atualizar"**. Na barra de úteis (esquerda), **acima do "Início"**, aparece o botão de atualizar: girando com o
percentual enquanto baixa e verde ("Atualizar o Concord") quando está pronta. Clicar no botão ou na faixa fecha o app,
**instala em silêncio** e abre de novo. Se a pessoa clicar em "Depois", a faixa some (o botão fica) e a versão entra
sozinha da próxima vez que o app fechar.

O app procura **ao abrir e a cada 30 min**. O GitHub não avisa o app instalado quando sai uma release, então alguém
precisa perguntar; 30 min deixa o aviso rápido sem custo (o `tauri-plugin-updater` baixa só o `latest.json` da última
release, fora do limite da API). Para não esperar, o botão pequeno **"Procurar atualizações"** (ícone de recarregar, no **fim**
da barra de úteis) procura na hora e avisa o resultado: "O Concord já está na versão mais nova.", o erro, ou começa a
baixar (aí o botão some e aparece o de progresso no topo).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/updater.ts` | `UpdateStatus` (`idle`, `checking`, `downloading` com `percent`, `ready` com `version`, `error`), `UPDATE_CHECK_INTERVAL_MS` (30 min), `UpdaterBridge`. |
| `src-tauri/src/native/updater/state.rs` | `UpdateMachine` (pura): `UpdateEvent` (`Checking`, `Available`, `NotAvailable`, `Progress`, `Downloaded`, `Failed`, `Unsupported`) para `UpdateStatus`; "pronta" não volta atrás, repetir a mesma situação não emite, erro com texto amigável. `CHECK_INTERVAL` = 30 min. |
| `src-tauri/src/commands/updater.rs` | `start` (thread que procura ao abrir e a cada 30 min; **em dev não procura**), `update-get`, `update-check` (botão: procura na hora; no dev responde o erro "A atualização só funciona no app instalado."), `update-install` (só com a versão baixada: `Update::install` e `app.restart()`) e o evento `update-status`. Baixa sozinho depois de achar; guarda os bytes na memória até instalar. |
| `src-tauri/tauri.conf.json` | `plugins.updater`: `pubkey` minisign, `endpoints` (`https://github.com/FelipeJanotte/concord/releases/latest/download/latest.json`) e `windows.installMode: passive` (o instalador roda sem assistente). `bundle.createUpdaterArtifacts: true` gera o `.sig` ao empacotar. |
| `src/renderer/src/lib/desktop/updater.ts` | `window.api.updater` (`getStatus`, `onStatus`, `check`, `install`). |
| `src/renderer/src/lib/actions/updates.ts` | `startUpdates` (no `main.tsx`), `checkForUpdates` (só depois do clique avisa o resultado com `notify`, uma vez; a verificação automática não avisa), `canCheckForUpdates` (há ponte: fora do app não há botão), `installUpdate`, `dismissUpdate`. `updatesEnv.bridge` é substituído nos testes. |
| `src/renderer/src/store/updates.ts` | `update` (a situação) e `updateDismissed` (versão escondida pelo "Depois"). |
| `src/renderer/src/components/UpdateBanner.tsx` | A faixa no topo do app (só com `ready`). |
| `src/renderer/src/components/rail/UpdateButton.tsx` | `UpdateRailSlot` (no topo do `UtilityRail`, acima do Início, com separador): `downloading` = girando + percentual, sem clique; `ready` = verde, "Atualizar o Concord", chama `installUpdate`. Não some com o "Depois" da faixa. `UpdateCheckButton` (no fim do `UtilityRail`, pequeno): "Procurar atualizações" chama `checkForUpdates`; `checking` = girando, sem clique; some com `downloading`/`ready` e fora do app. |
| `.github/workflows/pr-version.yml` | Em cada PR para a `main` (aberto, push, label): calcula a versão e faz o commit `chore: versão X.Y.Z` no PR com o `RELEASE_TOKEN` (ou o `GITHUB_TOKEN`). Só PR do próprio repositório. |
| `.github/workflows/auto-release.yml` | A cada push na `main` (PR mergeado): acha o PR do commit e os labels, calcula a versão, cria e envia a tag e chama o `release.yml` com a tag e o título do PR. |
| `.github/scripts/next-version.mjs` | `prVersion({ tags, mainVersion, labels })` (a versão do PR) e `nextVersion({ tags, packageVersion, labels })` (a do merge), puras e testadas; tipos em `next-version.d.mts`. Linha de comando: `node next-version.mjs pr "<labels>"` (PR, lê a `main` em `origin/main`) ou `node next-version.mjs "<labels>"` (merge). |
| `.github/workflows/release.yml` | Chamado pelo auto-release (`workflow_call`, entradas `tag` e `notes`) ou por tag `vX.Y.Z` criada à mão → Windows: `npm ci`, aplica a versão da tag no `package.json`, typecheck, `npm test`, `cargo test --workspace`, `npx tauri build` (assinado com os secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), monta `concord-X.Y.Z-setup.exe`, o `.sig`, o `latest.json` e o `latest.yml`, cria a release (se não existir) e envia os arquivos com `gh release upload --clobber`. O servidor padrão da tela de login vem da **variável do repositório** `VITE_DEFAULT_SERVER` (Settings → Secrets and variables → Actions → Variables); vazia = `localhost:3001`. |
| `.github/scripts/latest-json.mjs`, `latest-yml.mjs` | Geram o `latest.json` (formato do `tauri-plugin-updater`: versão, notas, data e, em `platforms.windows-x86_64`, a assinatura e a URL do instalador) e o `latest.yml` (formato do `electron-updater`: versão, arquivo, `sha512` e tamanho do **instalador Tauri**). Testados em `*.test.mjs` ao lado. |
| `.github/scripts/electron-guid.mjs`, `cutover-test.ps1` | O GUID do desinstalador do Electron (UUID v5 do `appId` no espaço de nomes do electron-builder) e o teste de troca do CI. |

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
   `release.yml` gera o instalador assinado e cria a release (título = versão, notas = título do PR) com
   `concord-X.Y.Z-setup.exe`, `concord-X.Y.Z-setup.exe.sig`, `latest.json` e `latest.yml`. Quem tem uma versão anterior instalada recebe o aviso e
   o botão em até 30 min (na hora, ao abrir o app ou clicando em "Procurar atualizações").
   - **Dois PRs com a mesma versão** (o segundo foi aberto antes do primeiro entrar): no merge do segundo a tag já
     existe, então o auto-release sobe o patch da última tag (a release sai certa; o `package.json` da `main` fica
     uma versão atrás até o próximo PR).
   - **Por que o auto-release chama o release.yml:** a tag é criada com o `GITHUB_TOKEN` (não dispara outros
     workflows; com o `RELEASE_TOKEN` o `release.yml` rodaria duas vezes). `concurrency: release` faz dois merges
     seguidos virarem duas versões, na ordem.
   - **Release criada antes dos envios:** o `gh release upload` só roda depois da release existir (o `electron-builder`
     enviava em paralelo e, sem release, cada envio criava uma; aconteceu na `v0.1.1` e na `v0.1.2`).
   - O `release.yml` ainda aplica a versão da tag no `package.json` durante o build (garante o nome certo mesmo no
     caso dos dois PRs).
2. **À mão (se precisar):** `git tag v1.2.3 && git push origin v1.2.3` também dispara o `release.yml`.

A primeira versão com a A13 precisa ser instalada à mão (as anteriores não sabem se atualizar). Um instalador gerado
à mão (`npm run dist`) também se atualiza pelas releases, desde que a versão dele seja menor que a publicada **e** a
chave minisign do build seja a da `pubkey` do `tauri.conf.json`.

## Chave de assinatura (minisign)

O atualizador só instala um pacote cuja assinatura bate com a `pubkey` do `tauri.conf.json`. A chave privada vive nos
secrets do GitHub `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, usados pelo `release.yml` e pelo job
`desktop-windows` do CI (sem eles o CI gera o instalador com `createUpdaterArtifacts: false`). **Perder a chave = nenhum
app instalado atualiza mais**: guarde uma cópia fora do GitHub (ADR 0013). Trocar a chave exige um instalador novo
instalado à mão.

## Troca do Electron pelo Tauri

Quem está numa versão Electron recebe a atualização pelo `electron-updater`, que lê o `latest.yml` da release. O
`latest.yml` aponta para o **instalador do Tauri**; o `latest.json` serve o `tauri-plugin-updater` dos apps novos.
Os dois saem em toda release.

**M0, a última versão Electron** (publicada antes desta fase): na partida grava as chaves `concord:*` do `localStorage`
em `%APPDATA%\Concord\migrate.json` e fixa a pasta de instalação do updater. O formato que o Tauri lê:
`{ "version": 1, "exportedAt": "...", "entries": { "concord:<chave>": "<texto>" } }`.

O instalador Tauri (`src-tauri/windows/hooks.nsh`, gancho `NSIS_HOOK_PREINSTALL`) roda assim, na mesma pasta
(`%LOCALAPPDATA%\Programs\Concord`, passada em `/D=` pelo `electron-updater`):

1. Procura o desinstalador do Electron na chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\5913399b-029d-504c-af52-ca654e517444`
   (o GUID é o UUID v5 do `appId` `com.concord.app`; `.github/scripts/electron-guid.mjs`). Sem ela, procura em todas as
   chaves de desinstalação uma `UninstallString` que termine em `\Uninstall Concord.exe`. Não achou: não há Electron e
   a instalação segue normal.
2. Define a pasta do Electron como a do desinstalador e **confere antes de rodar o desinstalador** se ela é mesmo uma
   instalação do Electron: tem `concord.exe`, `Uninstall Concord.exe` e `resources\app.asar`, não é o `$INSTDIR` nem
   a raiz de um disco. Não confere: o resto segue, mas a pasta nunca é apagada (registra "Pasta do Electron não
   confere, mantida").
3. **Regra do iniciar com o Windows:** se nenhuma entrada de `HKCU\...\Run` aponta para o `concord.exe` dessa pasta (o
   Electron estava com o início desligado), cria `%APPDATA%\com.concord.app\startup-default-applied`. Com a marca, o
   padrão "ligado" do Tauri não se aplica e a escolha da pessoa vale; sem a marca (Electron ligado), o Tauri liga.
4. Fecha o `concord.exe` (`taskkill /F`); o código de saída vai para o registro do instalador.
5. Copia `%APPDATA%\Concord\migrate.json` para `%APPDATA%\com.concord.app\migrate.json`, se existir.
6. Copia o desinstalador para `%TEMP%\concord-electron-uninstaller.exe` e roda `/S /currentuser _?=<pasta>` esperando.
   Código diferente de 0: registra "O desinstalador do Electron terminou com o código N", mostra a mensagem "Não foi
   possível remover a versão anterior do Concord ..." e **aborta a instalação** (a pessoa fica na versão atual e a
   atualização é tentada de novo depois). Nada mais é apagado.
7. Com código 0 apaga o resto: a pasta antiga (só se confirmada no passo 2), `%APPDATA%\Concord`, `%APPDATA%\concord`,
   `%LOCALAPPDATA%\concord-updater`, as chaves `HKCU\Software\<GUID>` e de desinstalação do GUID e as entradas de `Run`
   que apontavam para o `concord.exe` antigo.
7b. Cada passo acima grava uma linha em `%TEMP%\concord-bridge.log` (pasta e desinstalador achados, decisão da pasta, códigos do `taskkill` e do desinstalador, `migrate.json` copiado ou não, cada limpeza, motivo do aborto). Toda mensagem do gancho tem `/SD IDOK`: no modo silencioso nada espera clique. O `cutover-test.ps1` imprime o log e, se o instalador passar do prazo, a lista de processos (pai e linha de comando) antes de matar a árvore.
8. O instalador segue e grava o Tauri na mesma pasta. No `NSIS_HOOK_POSTINSTALL`, com `--force-run` (como o
   `electron-updater` chama), abre o app como o usuário.

**Primeira abertura do Tauri** (`windows/main_window.rs`, `native/migration/`): se existe `migrate.json`, a janela
principal ganha um script de inicialização que, **antes de a tela ler o `localStorage`**, grava as entradas e marca
`concord:migrated`; se a marca já existe, nada é gravado. Limites: arquivo até 1 MiB, `version` 1, só chaves `concord:*`
(nunca `concord:migrated`); arquivo inválido é apagado e ignorado. Depois do primeiro quadro a tela chama
`migration-done` e o arquivo é apagado.

**Teste de troca no CI** (job `desktop-cutover`, `.github/scripts/cutover-test.ps1`): instala a última release com
instalador Electron (`latest.yml` e `.blockmap`), cria dados falsos (`migrate.json`, cache do updater, entrada de `Run`
quando `-AutostartWasOn`), roda o instalador novo com `--updated /S --force-run /D=<pasta antiga>` e confere: nenhuma
pasta nem chave do Electron, `concord.exe` do Tauri na mesma pasta, entrada de desinstalação do Tauri, `migrate.json`
copiado, marca do iniciar com o Windows só quando o Electron estava com ele desligado e saída 0. Também cria uma pasta isca (só `concord.exe`, sem `app.asar`) com uma chave de desinstalação falsa e confere
que ela continua intacta. Roda com o início
ligado e desligado e depende de existir uma release Electron publicada.

## Pré-ponte para o Tauri (M0)

Última versão Electron antes da troca pelo Tauri (ADR 0013, "Troca do Electron"). Prepara quem já tem o app instalado.

| Item | Como é |
|---|---|
| Arquivo | `<userData>/migrate.json`, escrito em `migrate.json.tmp` e renomeado (nunca fica pela metade). |
| Quando | No `did-finish-load` da janela principal e de novo ao fechá-la (`setupMigration`/`watchMigration` em `src/main/migration.ts`): o `close` é adiado até a gravação terminar, no máximo 2 s, uma vez só. |
| Formato | `{ "version": 1, "exportedAt": "<ISO>", "entries": { "<chave>": "<valor cru do localStorage>" } }`; só chaves `concord:*`. |
| Para quê | O app Tauri tem outra origem e não enxerga o localStorage do Electron: ele lê este arquivo na primeira execução. |
| Pasta de instalação | `autoUpdater.installDirectory` = pasta de `app.getPath('exe')` (só empacotado), para o instalador do Tauri cair na mesma pasta. |
| Falha | Só `console.error`; o app segue normalmente. |
| Limite | Só vale o que está salvo ao fechar pela janela: fechar por fora (processo morto, queda de energia, instalador que mata o app) deixa o arquivo da última gravação. |

Testes: `src/main/migration.test.ts` (filtro `concord:`, formato, temporário + rename, falha logada com o arquivo anterior intacto, gravação ao carregar e ao fechar, fechamento após 2 s) e `src/main/updater.test.ts` (pasta de instalação fixada só no app instalado).

## Testes

| Arquivo | Cobre |
|---|---|
| `cargo test -p concord` (módulo `native::updater`) | `UpdateMachine`: etapas e percentual, "pronta" não volta, repetir não emite, erro com texto amigável. |
| `.github/scripts/*.test.mjs` (vitest) | `latest.json`, `latest.yml` (nome de arquivo inválido, tamanho) e o GUID do Electron. |
| `server/release.test.ts` | Próxima versão (sem tag, maior tag por ordem de versão, labels minor/major/sem release, `package.json` acima da tag, tags fora do padrão, versão inválida) e coerência dos dois workflows. |
| `src/renderer/src/components/rail/UpdateButton.test.tsx` | Botão na barra: some sem atualização, acima do Início baixando (percentual, sem instalar) e pronta (instala), continua depois do "Depois"; "Procurar atualizações" no fim da barra (clique procura, girando sem clique, some baixando/pronta e fora do Electron). |
| `src/renderer/src/components/updates.test.tsx` | Situação da ponte, parar de ouvir, "procurar agora" (aviso de já na mais nova, erro, nada sem clique e uma vez por clique), faixa só pronta, "Reiniciar para atualizar", "Depois" e versão mais nova, fora do Electron. |

O caminho de verdade (baixar e instalar) só dá para conferir com duas releases publicadas; a troca do Electron, com o job `desktop-cutover` e, no fim, numa instalação Electron real (checklist do `ROADMAP.md`).

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| App não atualiza | Clique em "Procurar atualizações" (fim da barra de úteis): diz se já está na mais nova ou mostra o erro. Nenhuma release publicada ainda (`gh release list` vazio: crie a tag), rodando em dev (`npm run dev` nunca atualiza); versão instalada anterior à A13; ou a release não tem o `latest.json` (publicada à mão). Log `[atualização]` no terminal (`eprintln!`). |
| Ao atualizar abre o assistente de instalação | O `installMode` do atualizador não é `passive` no `tauri.conf.json`. |
| Instalador da release abre em `localhost:3001` | A variável do repositório `VITE_DEFAULT_SERVER` não está definida (só afeta quem nunca entrou). |
| Merge na `main` não gerou release | O PR tinha o label `sem release`, ou o job "criar a tag" falhou (aba Actions → Release automática). A tag criada fica mesmo se a publicação falhar: rode o `release.yml` de novo pela tag ou apague-a (`git push --delete origin vX.Y.Z`). |
| PR não recebeu o commit da versão | PR de fork, ou o workflow "Versão do PR" falhou (aba Actions). Com o label `sem release`, a versão volta para a da `main` (pode não haver commit). |
| Commit "chore: versão" sem check de CI | Falta o secret `RELEASE_TOKEN`: o commit foi feito com o `GITHUB_TOKEN`, que não dispara o CI. |
| `git push` recusado no PR (non-fast-forward) | O bot fez o commit da versão: `git pull` (ou `git pull --rebase`) e envie de novo. |
| Releases duplicadas da mesma tag | Versões antigas do `release.yml` (antes de criar a release primeiro). Apague a que só tem arquivos soltos. |
| Workflow falhou em "Usar a versão da tag" | A tag não é `vX.Y.Z` (ex.: `v1.2`). |
| Windows avisa "editor desconhecido" | O instalador não tem assinatura de código do Windows (certificado pago; a assinatura minisign é só da atualização). O SmartScreen avisa na primeira instalação; as atualizações seguem normais. |
| Atualização baixa e não instala | A assinatura não bate com a `pubkey` do `tauri.conf.json`: confira os secrets `TAURI_SIGNING_PRIVATE_KEY*` e o `.sig` da release. |
| "A atualização só funciona no app instalado." | Clicou em "Procurar atualizações" no `npm run dev`: o dev nunca atualiza. |
| Pendente | Assinatura do código, canal "beta", notas da versão na faixa e aviso instantâneo pelo servidor (Socket.IO) quando sair release. |
