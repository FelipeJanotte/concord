# 0013 — App desktop em Tauri 2 e Rust (sai o Electron)

- **Data:** 2026-11-19
- **Situação:** aceita

## Contexto

O app embarca Chromium e Node inteiros (Electron 37): instalador pesado e memória alta na máquina de cada pessoa,
para uma tela que já roda num navegador. O produto só é distribuído para **Windows**, onde o WebView2 (Chromium do
sistema) já existe. A decisão do produto é tirar o Electron e o Node do binário. O servidor tem ADR próprio (0014).

O que a pesquisa achou (fontes nas PRs da migração):

- A tela não depende do Electron: tudo passa pelo objeto `window.api` (43 membros, 14 arquivos do renderer;
  nenhum `import 'electron'` fora de `src/main` e `src/preload`).
- O WebView2 **não deixa** escolher a fonte do `getDisplayMedia`: o evento `ScreenCaptureStarting` só cancela ou
  adia. Nosso seletor com miniaturas só sobrevive com captura nativa.
- O SDK Rust do LiveKit não tem encoder de GPU no Windows, mas aceita vídeo já codificado
  (`NativeVideoSource::new_encoded` + `capture_encoded_frame`), com pedido de quadro-chave e de taxa por consulta
  (`take_keyframe_request`, `take_rate_control_request`). Não achamos uso público desse caminho: é o maior risco.
- Pressione para falar: o Mumble (BSD) usa Raw Input numa janela só de mensagens, sem gancho de teclado.
- O instalador do Tauri não enxerga o do Electron (chaves de registro e pasta diferentes); a troca limpa precisa de
  gancho NSIS. O localStorage não atravessa (outra origem e outra pasta de dados).

## Decisão

O processo principal vira **Rust com Tauri 2**; a tela React continua a mesma, no WebView2. Só Windows.

| Parte | Como fica |
|---|---|
| Contrato | O tipo de `window.api` continua TS e passa a viver em `src/shared/desktop-api.ts`. Um adaptador (`lib/desktop/`) monta `window.api` sobre `invoke`/eventos do Tauri na partida. Nomes de comando e evento ficam num único `src/shared/desktop-channels.json`, lido pelo TS e pelo Rust (`include_str!`) — teste dos dois lados quebra se divergirem. |
| Estrutura | Workspace Cargo: `src-tauri/` fino (comandos, janelas, permissões, nenhuma regra) e `crates/` com a lógica — `concord-ptt`, `concord-capture` (tela), `concord-taskbar`, mais os módulos pequenos dentro do `src-tauri`. Código Win32 atrás de trait com implementação falsa para teste. Threads nativas param e são aguardadas no `RunEvent::Exit`. |
| Compartilhar tela | Seletor React próprio (lista e miniaturas por captura única via comando Rust). Captura Windows Graphics Capture (`windows-capture`, MIT) → `ID3D11VideoProcessor` para NV12 na GPU → encoder H.264 de hardware do Media Foundation (CBR, baixa latência, sem quadro B, GOP infinito, quadro-chave quando o LiveKit pede) → `new_encoded`. Se a GPU falhar, cai sozinho para `NativeVideoSource` com I420 e encoder de software. Captura e encoder no mesmo adaptador. Áudio do sistema por WASAPI *process loopback* **excluindo a árvore do Concord** (sem eco da chamada) → `NativeAudioSource`. Publica como participante `<accountId>:screen` com token emitido pelo servidor; a tela de quem assiste mapeia esse participante para o dono e o tira de membros, "falando" e contagem. |
| Pressione para falar | Raw Input (`RIDEV_INPUTSINK`) em thread própria com janela só de mensagens, ligado só com o modo ativo. Tecla guardada como scan code + bit estendido (independe do layout); botões laterais do mouse. A tecla salva do `uiohook` é convertida na primeira leitura. |
| Overlay | Segunda janela (`overlay.html`) transparente, sem moldura, sempre no topo, sem clique; `WS_EX_NOACTIVATE`/`WS_EX_TOOLWINDOW` aplicados em Rust e topo reafirmado quando a janela em foco muda. Atalhos pelo `tauri-plugin-global-shortcut` (erro no registro = outro programa usa). Permissão da janela: só eventos. |
| Botões da miniatura | `ITaskbarList3` + `SetWindowSubclass`, refeitos no `TaskbarButtonCreated` (Explorer reiniciado). |
| Notificações | `tauri-plugin-notification`; clique abre `concord://...` (deep link + instância única), funciona mesmo com o app fechado. Selo por `set_overlay_icon`, piscar por `request_user_attention`. |
| Resto | Vidro: `set_effects` Mica/Acrylic só no Windows 11 22H2+ (regra de hoje). Iniciar com o Windows: `tauri-plugin-autostart`. Barra de título: `decorations: false`. Google: loopback 127.0.0.1 + PKCE em Rust. Links: só http/https, navegação interna bloqueada. Ocioso: `GetLastInputInfo`. |
| Atualização | `tauri-plugin-updater` com chave minisign (`TAURI_SIGNING_PRIVATE_KEY` no GitHub) e `latest.json`. Cada release segue publicando também `latest.yml` apontando para o instalador Tauri, para quem ainda está no Electron. |
| Identidade | `identifier` e AUMID `com.concord.app`, produto `Concord`, executável `concord`, instalação por usuário na **mesma pasta** do Electron (`%LOCALAPPDATA%\Programs\Concord`): fixar na barra de tarefas continua funcionando. |
| Troca do Electron | (1) Última versão Electron (PR 0) grava as chaves `concord:*` em `userData/migrate.json` na partida e fixa a pasta de instalação do updater. (2) O instalador Tauri chega pelo `electron-updater`; o gancho `NSIS_HOOK_PREINSTALL` fecha o `concord.exe`, acha o desinstalador antigo (chave do GUID do appId, com busca de reserva), copia o `migrate.json`, roda o desinstalador em silêncio e esperando, e só se deu certo apaga **todo** resto: `%APPDATA%\Concord` e `\concord`, `%LOCALAPPDATA%\concord-updater`, chaves do GUID e a entrada antiga de iniciar com o Windows. (3) Na primeira abertura, um script de inicialização grava as chaves no localStorage antes da tela ler, marca `concord:migrated` e o arquivo é apagado. |
| Build | Vite puro com duas entradas (`index`, `overlay`); o Node fica só como ferramenta de build, fora do binário. Perfil release `lto = "thin"`, `codegen-units = 1`, `opt-level = "s"`, `strip`; clippy com `await_holding_lock` e `unwrap_used` negados; CSP escrita por diretiva. |

**Portões de verificação** (nenhum "pronto" sem todos):

1. `cargo test` das crates puras e `cargo clippy -D warnings`, no Linux e no Windows (CI).
2. Job Windows no CI: testes Win32 (registro do Raw Input, ícone a partir do PNG, encoder MF com quadros sintéticos
   codificados e decodificados de volta) e `tauri build` gerando o instalador.
3. Teste de troca no CI Windows: instala a release Electron real da PR 0, roda o instalador novo como o
   `electron-updater` roda (`--updated /S --force-run`) e confere: nenhuma pasta nem chave do Electron, Tauri na
   mesma pasta (o `electron-updater` passa `/D=<pasta>`, que o NSIS do Tauri precisa honrar), preferências
   importadas, app aberto.
4. `npm test` e `npm run typecheck` como hoje, mais os testes do adaptador e do contrato de canais.
5. Revisão de doutrina do diff.
6. Teste manual num Windows real (não dá para automatizar): tela com GPU NVIDIA/AMD/Intel, pressione para falar com
   jogo e com janela de administrador, overlay sobre jogo, clique em notificação com o app fechado, botões da
   miniatura, vidro.

## Alternativas descartadas

| Opção | Por que não |
|---|---|
| Ficar no Electron | O peso no PC de quem usa é o problema que motivou a troca. |
| Seletor de tela do Chromium no WebView2 | Perde o nosso seletor e o estilo do app; o produto quer o próprio. |
| Mandar quadros nativos para a página (WebCodecs/`MediaStreamTrackGenerator`) | Cruza processos com cópia pela CPU; mais caro que publicar do Rust. |
| Codificar só por CPU (caminho pronto do LiveKit) | Gasta mais que o Chromium de hoje, que usa a GPU. Fica só como reserva automática. |
| NVENC/AMF direto como padrão | Um caminho por fabricante; o Media Foundation cobre os três. NVENC direto fica para depois, se medir necessidade. |
| `tauri-specta` gerando os tipos | Ainda em versão *release candidate*; o contrato já é TS e o arquivo de canais compartilhado basta. |
| `uiohook`/`rdev`/`willhook` ou gancho `WH_*_LL` | Sem manutenção ou sujeito a remoção silenciosa por tempo limite; Raw Input é o método do Mumble. |
| Ler o localStorage do Electron direto (leveldb) | Formato interno do Chromium, sem garantia. |
| Reinstalar na mão | Perde login e preferências; o produto quer troca automática e limpa. |
| Suportar Linux | WebRTC no WebKitGTK é incerto; o produto é Windows. |

## Consequências

- Binário sem Chromium nem Node; o WebView2 vem do Windows (instalador baixa o bootstrapper se faltar).
- Quem desenvolve precisa de Rust (`rustup`) e, no Windows, das ferramentas de build do MSVC.
- No Linux o app abre para tela, chat e socket; voz e tela se testam no Windows ou na versão web.
- A tela nativa só se prova num Windows real com GPU: o CI compila e testa o encoder em software, não o hardware.
- O `migrate.json` leva o token de sessão em texto, como o próprio localStorage do Electron já guarda. Vive só até a
  troca: o gancho NSIS apaga a pasta do Electron e o Tauri apaga a cópia depois de importar. Token de quem saiu da
  conta já foi revogado no servidor (`/auth/logout`).
- Perder a chave minisign = nenhum app instalado atualiza mais. Ela vive no secret do GitHub e numa cópia fora dele.
- O servidor (ainda Node na fase 1) ganha a emissão do token do participante `<accountId>:screen`.
- Os docs `docs/areas/{voice,overlay,updates,notifications,settings,dev-workflow,deploy}.md` mudam no PR da fase 1.
