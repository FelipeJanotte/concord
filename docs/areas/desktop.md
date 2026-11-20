# App desktop (Tauri 2 + Rust)

O Concord desktop é um **shell Tauri 2 em Rust** que abre a tela React no **WebView2** do Windows. Não há Chromium
nem Node dentro do binário. Só Windows é produto; no Linux o shell compila e a tela abre, mas voz, tela
compartilhada e o resto do nativo respondem "só existem no Windows". A razão e as alternativas descartadas estão no
ADR `docs/decisions/0013-app-desktop-em-tauri-rust.md`.

A tela não conhece o Tauri: ela usa `window.api`, o mesmo objeto de antes. Um adaptador monta esse objeto sobre
`invoke` e eventos do Tauri. Voz, tela e atualização têm doc próprio (`voice.md`, `overlay.md`, `updates.md`,
`notifications.md`, `settings.md`); este arquivo é a visão do shell.

## Processos e camadas

| Camada | O que é |
|---|---|
| Shell (`src-tauri/`) | Processo Rust: janelas, plugins, comandos, permissões. Fino: o comando só traduz e delega. |
| `src-tauri/src/native/` | A lógica do shell (limites, regras, máquinas de estado), testável sem janela. |
| `crates/` | Lógica nativa que não depende do Tauri: `concord-capture`, `concord-ptt`, `concord-taskbar`. |
| Renderer | A tela React no WebView2: `index.html` (janela `main`) e `overlay.html` (janela `overlay`). |
| Threads nativas | Raw Input (pressione para falar), ocioso, overlay, captura de tela, vigia do primeiro plano. Todas param no encerramento. |

## Arquivos

| Arquivo | Papel |
|---|---|
| `Cargo.toml` (raiz) | Workspace (`src-tauri` e `crates/*`), lints do Clippy (`unwrap_used`, `expect_used`, `await_holding_lock` negados) e perfil release (`lto = "thin"`, `codegen-units = 1`, `opt-level = "s"`, `strip`). |
| `src-tauri/tauri.conf.json` | Identificador `com.concord.app`, produto `Concord`, binário `concord`, versão lida do `package.json`, janela `main` (`decorations: false`, `create: false`, `visible: false`), CSP por diretiva, alvo `nsis` por usuário, atualizador (`pubkey` minisign e endpoint `latest.json`), esquema `concord` do deep link. |
| `src-tauri/build.rs` | Lê `src/shared/desktop-channels.json` e gera a permissão `allow-<comando>` de cada comando. |
| `src-tauri/capabilities/main.json`, `overlay.json` | O que cada janela pode chamar (tabela abaixo). |
| `src-tauri/src/lib.rs` | `run()`: plugins (instância única, deep link, log, iniciar com o Windows, abrir links, atalhos globais, atualizador), estados, `setup` (janela principal, overlay, encerramento da tela, pressione para falar, ocioso, notificações, iniciar com o Windows, atualizador) e `RunEvent::Exit`. |
| `src-tauri/src/commands/` | Um arquivo por domínio, só `#[tauri::command]`. `mod.rs` registra os comandos em `command_registry!` (`handler()` e `NAMES`). |
| `src-tauri/src/native/` | `environment`, `permissions`, `links`, `data_url`, `windows_version`, `logging`, `main_window_events` e a lógica de cada domínio (`notifications`, `startup`, `translucency`, `thumbar`, `window_controls`, `idle`, `google_auth`, `push_to_talk`, `screen_share`, `main_window_focus` (`MainWindowFocus`: foco da janela principal como enum), `overlay/`, `updater/`, `migration/`). |
| `src-tauri/src/windows/main_window.rs`, `overlay_window.rs` | Criação e comportamento das duas janelas. |
| `src-tauri/src/events.rs` | `event_names!`: os nomes dos eventos que o Rust emite (`events::ALL`). |
| `src-tauri/src/errors.rs` | `domain_error!`: erro de cada domínio, serializado como a mensagem em texto (a promessa do `invoke` rejeita com ela). |
| `src-tauri/src/shutdown.rs` | `Shutdown`: registro dos "parar" de cada thread nativa. |
| `src-tauri/windows/hooks.nsh` | Ganchos do instalador NSIS (troca do Electron: `docs/areas/updates.md`). |
| `src-tauri/tests/channels.rs` | Teste de integração do contrato de canais (abaixo). |
| `src/shared/desktop-channels.json` | Lista única de comandos (kebab-case) e eventos. |
| `src/shared/desktop-api.ts` | `DesktopApi` (o tipo de `window.api`) e `DesktopEnvironment`. Os tipos de cada ponte ficam em `src/shared/<dominio>.ts`. |
| `src/renderer/src/lib/desktop/` | `install.ts` (`installDesktopApi`), `api.ts` (`buildDesktopApi`), `ipc.ts` (`command`, `send`, `subscribe`), `environment.ts` e uma ponte por arquivo. |

## Como `window.api` é montado

1. O Rust cria a janela `main` com um script de inicialização que define `window.__CONCORD_DESKTOP__`
   (`DesktopEnvironment`: `platform`, `translucencySupported`, `windowButtons`, `canShareAudio`).
2. `installDesktopApi()` (no `main.tsx`) sai sem fazer nada se não houver `__TAURI_INTERNALS__` (navegador). Dentro do
   Tauri lê o ambiente (falha alto se faltar) e atribui `window.api = buildDesktopApi(ambiente)`.
3. Cada ponte usa `command(canal, args)` (`invoke` com o nome em snake_case: `screen-start` vira `screen_start`),
   `send` (comando sem resposta; falha vai para o console) ou `subscribe(evento, ouvinte)` (`listen`; devolve a
   função que cancela).
4. Na janela principal, depois do primeiro quadro pintado (dois `requestAnimationFrame`), chama `show-main-window`
   (a janela nasce invisível para não piscar) e `migration-done`.

A janela do overlay também recebe o script de ambiente e roda `installDesktopApi`, mas só a janela `main` mostra a principal e fecha a migração.

## Ambiente injetado (`__CONCORD_DESKTOP__`)

| Campo | Regra (`native/environment.rs`) |
|---|---|
| `platform` | `win32` no Windows, `darwin` no macOS, `linux` no resto. |
| `translucencySupported` | `supports_translucency`: Windows com build >= 22621. |
| `windowButtons` | Falso só no macOS: no Windows e no Linux a barra de título é a do app. |
| `canShareAudio` | Verdadeiro só no Windows. |

## Canais: comandos

Nome em `desktop-channels.json` em kebab-case; a função Rust usa snake_case. Quem pode chamar: `main` = janela
principal; `overlay` = também a página do overlay.

| Comando | Rust | O que faz | Janelas |
|---|---|---|---|
| `google-sign-in` | `commands/google.rs` | Login com Google (navegador + loopback + PKCE). | main |
| `screen-sources` | `commands/screen.rs` | Lista telas e janelas com miniatura. | main |
| `screen-start` | `commands/screen.rs` | Começa a compartilhar com o token do servidor. | main |
| `screen-stop` | `commands/screen.rs` | Para a captura ativa. | main |
| `screen-preview` | `commands/screen.rs` | Captura única da fonte em uso (prévia do "ao vivo"). | main |
| `overlay-config`, `overlay-room`, `overlay-theme`, `overlay-shortcuts`, `overlay-shortcuts-pause` | `commands/overlay.rs` | Configuração, sala, tema e atalhos do overlay. | main |
| `overlay-edit`, `overlay-resize` | `commands/overlay.rs` | Modo de mover e largura. | main, overlay |
| `ptt-config`, `ptt-capture` | `commands/push_to_talk.rs` | Liga/desliga o modo e captura a próxima tecla (a ponte devolve `PttCapture`: `{ kind: 'chosen', binding }` ou `{ kind: 'cancelled' }`). | main |
| `idle-get` | `commands/idle.rs` | Está ocioso agora? | main |
| `notify`, `badge` | `commands/notifications.rs` | Toast nativo e selo no ícone. | main |
| `thumbar-buttons` | `commands/thumbar.rs` | Botões da miniatura da barra de tarefas. | main |
| `update-get`, `update-check`, `update-install` | `commands/updater.rs` | Situação, procurar agora e instalar. `update-install` sem nada baixado rejeita com `NothingDownloaded` ("Não há atualização baixada para instalar"). | main |
| `window-translucency` | `commands/translucency.rs` | Liga o vidro e o esquema claro/escuro. | main |
| `startup-get`, `startup-set` | `commands/startup.rs` | Iniciar com o Windows. | main |
| `window-control`, `window-maximized-get`, `show-main-window` | `commands/window_controls.rs` | Minimizar/maximizar/fechar, estado e mostrar a janela. | main |
| `migration-done` | `commands/migration.rs` | Apaga o `migrate.json` já lido. | main |

## Canais: eventos (Rust para a tela)

| Evento | Quem emite | Conteúdo | Destino |
|---|---|---|---|
| `window-maximized` | `windows/main_window.rs` | `bool` | todas as janelas |
| `overlay-toggled` | `windows/overlay_window.rs` | `bool` (ligado/desligado pelo atalho) | main |
| `overlay-editing` | idem | `bool` (modo de mover) | main |
| `overlay-moved` | idem | `{ x, y }` | main |
| `overlay-resized` | idem | largura (número) | main |
| `overlay-update` | idem | sala, configuração e modo de mover | overlay |
| `overlay-theme` | idem | tema do app | overlay |
| `ptt-change` | `commands/push_to_talk.rs` | `bool` (tecla apertada) | main |
| `ptt-unavailable` | idem | vazio (não foi possível ouvir a tecla) | main |
| `idle-change` | `commands/idle.rs` | `bool` | main |
| `notification-click` | `commands/notifications.rs` | alvo (`dm`, `channel`, `friends`) ou nulo; a ponte entrega `NotificationClick` (`{ kind: 'target', target }` ou `{ kind: 'no-target' }`) | main |
| `thumbar-click` | `commands/thumbar.rs` | `mute`, `deafen` ou `leave` | main |
| `update-status` | `commands/updater.rs` | situação do atualizador | todas |
| `screen-ended` | `commands/screen.rs` | `stopped`, `source-closed`, `disconnected` ou `failed` | main |

`emit_to_main` (`native/main_window_events.rs`) manda só para a janela principal.

## Contrato de canais e capacidades

O `desktop-channels.json` é a única lista. O teste `src-tauri/tests/channels.rs` quebra se:

- os comandos registrados em `commands::NAMES` diferirem da lista;
- os eventos de `events::ALL` diferirem da lista;
- `capabilities/main.json` não tiver exatamente `core:event:default` mais `allow-<comando>` de cada comando;
- `capabilities/overlay.json` tiver mais que `core:event:default`, `allow-overlay-edit` e `allow-overlay-resize`.

No TS, o teste `lib/desktop/desktop.test.ts` ("canais compartilhados") confere que as pontes só usam comandos e
eventos da lista. Comando novo: JSON, função Rust em `commands/`, linha em `command_registry!`, permissão na
capacidade da janela, ponte em `lib/desktop/` e tipo em `src/shared/`.

## Segurança

| Item | Regra |
|---|---|
| CSP | Por diretiva em `tauri.conf.json` (`default-src 'self'`; scripts só `'self'` e `'wasm-unsafe-eval'`; `connect-src` com `ws:`, `wss:`, `http:`, `https:` para o servidor). |
| Permissões da página | `native/permissions.rs`: microfone, câmera e notificações; o resto é negado. |
| Links | `native/links.rs`: só `http`/`https` abrem no navegador do sistema; a navegação interna é bloqueada (só `tauri://`, `tauri.localhost` e o servidor de dev); nova janela é sempre negada. |
| Notificação | Título até 64 caracteres, corpo até 200, id de canal até 64, selo até 999 (`native/notifications.rs`). A ativação `concord://notification?target=` só aceita esse host e um alvo válido. |
| Migração | `migrate.json` até 1 MiB, versão 1, só chaves `concord:*` (e nunca `concord:migrated`). Arquivo inválido é apagado e ignorado. |
| Overlay | Janela só com eventos e os dois comandos da página dela. |

## Encerramento

`Shutdown` guarda os "parar" das threads nativas (tela, overlay, ocioso, pressione para falar). No
`RunEvent::Exit`, `run_all` roda todos em **ordem inversa** ao registro e só uma vez. Thread nativa nova registra o
seu "parar" no `setup`.

Nenhuma espera do encerramento é infinita:

| Espera | Limite | Onde |
|---|---|---|
| Thread do pressione para falar avisar que saiu (`exit_handshake.rs`: junta a thread só depois do aviso) | 2 s | `crates/concord-ptt/src/push_to_talk.rs` (`EXIT_LIMIT`) |
| `SendMessageTimeoutW` para a janela de mensagens do pressione para falar | 2 s | idem (`SYNC_LIMIT`) |
| Resposta do registro dos atalhos do overlay | 2 s | `native/overlay/worker.rs` (`SHORTCUTS_ANSWER_LIMIT`) |
| Conectar a sala do LiveKit na tela nativa (espera pelo pronto: 12 s, 10 s mais 2 s de folga) | 10 s | `crates/concord-capture/src/room_start.rs` (`ROOM_CONNECT_LIMIT`) |
| Fechar a sala do LiveKit ao parar a tela | 3 s | `crates/concord-capture/src/platform/session.rs` (`ROOM_CLOSE_LIMIT`) |

O token da sala é um `LiveKitToken` (`crates/concord-capture/src/livekit_token.rs`): o `Debug` mostra só
`LiveKitToken(…)`; o texto sai apenas por `expose()` na hora de conectar.

## Logs e dados

| O quê | Onde |
|---|---|
| Log do Rust | `tauri-plugin-log`, pasta de logs do app (`%LOCALAPPDATA%\com.concord.app\logs`). Nível `Info` em release e `Debug` em dev (dev também escreve no terminal). |
| Dados do app | Pasta de dados do app (`%APPDATA%\com.concord.app`): `startup-default-applied`, `migrate.json` (até a tela ler) e o armazenamento do WebView2. |

Alguns avisos de plugin saem por `eprintln!` (terminal do dev) e não chegam ao arquivo de log.

## Como testar

| Quê | Como |
|---|---|
| Lógica do shell e das crates | `cargo test --workspace` (roda no Linux; o Win32 fica atrás de trait com implementação falsa). |
| Lint | `cargo clippy --workspace --all-targets -- -D warnings` e `cargo fmt --all --check`. |
| Código Windows a partir do Linux | `cargo xwin clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (veja `dev-workflow.md`). |
| Testes que só rodam no Windows | Job `desktop-windows` do `.github/workflows/ci.yml`: mesmos comandos mais o `tauri build`. Cobre o registro do Raw Input, o ícone a partir do PNG e o encoder do Media Foundation com quadros sintéticos. |
| Troca do Electron | Job `desktop-cutover` (`docs/areas/updates.md`). |
| Adaptador | `lib/desktop/desktop.test.ts` (vitest com `mockIPC` e `mockWindows` do `@tauri-apps/api/mocks`): ambiente, comandos, eventos, `installDesktopApi` e o contrato de canais. |

## Limites conhecidos

- **Só Windows.** No Linux o shell abre a tela e o chat; `screen-*`, `thumbar-buttons`, toast e vidro respondem erro ou
  não fazem nada. Voz e tela se testam no Windows ou na versão web (`npm run dev:web`).
- **O que só um Windows real prova** (portão 6 do ADR 0013, checklist no `ROADMAP.md`, v9): tela com GPU NVIDIA, AMD e
  Intel; pressione para falar com jogo e com janela de administrador em foco; overlay sobre jogo; clique de
  notificação com o app fechado; botões da miniatura; vidro; troca de uma instalação Electron real.
- O CI compila e testa o encoder de software; o encoder de hardware só roda numa máquina com GPU.
- `unwrap`/`expect` são negados pelo Clippy: erro vira `Result` ou log.

## Problemas conhecidos

| Sintoma | Causa |
|---|---|
| Janela não aparece | A janela `main` nasce invisível e só aparece pelo comando `show-main-window`, depois do primeiro quadro. Se a tela falhar antes disso, ela fica escondida; veja o log do Rust. |
