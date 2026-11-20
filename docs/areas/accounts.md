# Contas e autenticação

Toda pessoa precisa de uma conta. Login por **e-mail + senha** ou **Google**. Cada conta tem um **nome** (livre,
pode mudar) e um **id** (`tag`, 1 a 5 letras/números) e aparece como `Nome#id`.

## Regras de negócio (não quebre)

1. **O id é único entre todas as contas** (comparação sem diferenciar maiúsculas: `ANA1` = `ana1`).
   Não é "único por nome": se fosse, alguém poderia trocar de nome e colidir com outra pessoa.
2. **O id é imutável.** Ele é o que diferencia pessoas com o mesmo nome. O servidor recusa qualquer troca
   (`'O id não pode ser alterado'`), mesmo que o cliente tente.
3. **Exceção única:** conta criada pelo Google nasce com id provisório aleatório (`tagLocked: false`). Ela pode
   escolher o id definitivo **uma vez** pelo `account:update`; qualquer envio de `tag` trava (`tagLocked = true`),
   mesmo mantendo o provisório. O `UserPanel` abre as Configurações sozinho, só em "Minha conta" (sem o menu), enquanto `tagLocked === false` (`docs/areas/settings.md`).
4. Nome: sem `#`, espaços colapsados, de 2 a 32 caracteres (`NAME_MAX`). O nome **não** precisa ser único.
5. Senha: mínimo `PASSWORD_MIN` (8), máximo 200.
6. Para identificar uma pessoa use **`accountId`**, nunca `User.id` (que é o `socket.id` e muda a cada conexão).
7. **Banida não entra (A19).** Com uma linha em `community_bans` (pela conta **ou** pelo e-mail), `server/auth.ts`
   recusa com `BANNED_MESSAGE` ("Você foi banido desta comunidade"): login com e-mail e senha (só depois de a senha
   conferir, para não revelar o banimento a quem não sabe a senha), login com Google (pelo e-mail antes de tudo e pela
   conta no fim) e cadastro com o e-mail banido (antes de "Este e-mail já está cadastrado"). `accountFromToken` também
   devolve `undefined` para conta banida: uma sessão que sobrasse não abre conexão (handshake `unauthorized`). Banir
   apaga todas as sessões (`deleteAccountSessions`); expulsar também, sem gravar nada. Ver `docs/areas/moderation.md`.

Constantes compartilhadas em `src/shared/types/account.ts`: `NAME_MAX`, `TAG_MAX`, `TAG_PATTERN`, `PASSWORD_MIN`,
`AVATAR_MAX_BYTES`. Use-as dos dois lados em vez de repetir números.

## Onde fica cada coisa

| Arquivo | Papel |
|---|---|
| `src/shared/types/account.ts` | `User` (com `accountId`, `tag`, `avatarUrl`), `AccountInfo`, requests/`AuthResult` HTTP, `ProfileUpdate`, eventos `account:update` e `user:updated` |
| `server/repo/types.ts` | `Account` (com `passwordHash`, `googleId`, `tagLocked`, `avatarType`, `avatarVersion`) e `Session` |
| `server/repo/accounts.ts`, `server/repo/sessions.ts` | acesso async às contas e sessões (devolvem cópias; alteração só por `updateAccount(id, patch)`) |
| `server/db/schema/accounts.ts` | tabelas `accounts` (únicos: e-mail, `lower(tag)`, Google id) e `sessions` (cascata ao apagar a conta) |
| `server/db/seed.ts` | importa contas/sessões do `db.json` antigo no primeiro boot (senhas e sessões continuam valendo) |
| `server/auth.ts` | regras: hash de senha, sessões, cadastro, login, Google, perfil e foto (tudo async) |
| `server/env.ts` | carrega `server/.env` (importado **primeiro** no `index.ts`, porque `auth.ts` lê `process.env` ao carregar) |
| `server/modules/accounts.ts` | rotas HTTP `/auth/*` e `/avatars/*`, evento `account:update` |
| `server/modules/presence.ts` | `hello` (`userFor()` monta o `User`) |
| `server/index.ts` | middleware `io.use` que exige token (erro do banco vira `server_error`, que **não** apaga o token no app) |
| `src-tauri/src/native/google_auth.rs`, `src-tauri/src/commands/google.rs` | abre o navegador e captura o código do Google (comando `google-sign-in`, prazo de 180 s) |
| `src/renderer/src/lib/desktop/google.ts` | expõe `window.api.googleSignIn(clientId)` |
| `src/renderer/src/lib/client.ts` | `register`, `login`, `loginWithGoogle`, `restoreSession`, `cancelRestore`, `logout` |
| `src/renderer/src/lib/actions/account.ts` | `updateProfile`, `resolveAvatarUrl`, listener `user:updated` |
| `src/renderer/src/lib/image.ts` | `fileToAvatarDataUrl` (recorte quadrado 256×256 em WebP) e `randomTag` |
| `components/LoginScreen.tsx` | abas Entrar / Criar conta, botão Google, troca de servidor, tela "Entrando..." |
| `components/settings/AccountSettings.tsx` | Configurações → "Minha conta" (era `ProfileDialog`): nome, foto, id com cadeado (ou campo de escolha única), Salvar e sair da conta |
| `components/AvatarPicker.tsx` | foto clicável + trocar/remover (usado no cadastro e no perfil) |
| `components/UserAvatar.tsx` | mostra a foto (`AvatarImage`) com as iniciais como fallback |

## Fluxo

```
LoginScreen ──fetch──> POST /auth/register | /auth/login | /auth/google ──> { ok, token, account }
     │                                                                          │
     └─ client.startSession(): salva concord:server + concord:token no localStorage
                       └─> connect(url, token) ── io(url, { auth: { token } }) ──> io.use() valida
                                                                                  └─> hello → { self, account, state }
```

- **HTTP antes do socket.** Cadastro/login/Google são rotas HTTP (`accountsModule.http` em `server/modules/accounts.ts`,
  CORS `*` em `server/index.ts`, corpo JSON até 16 KB). Um socket sem token válido nem conecta (`next(new Error('unauthorized'))`).
- **Sessão:** token aleatório de 32 bytes; o banco guarda só o `sha256` (`server/repo/sessions.ts`).
  `POST /auth/logout { token }` revoga.
- **Validade deslizante:** 30 dias **desde o último uso**. Cada validação do token (`accountFromToken`: handshake do
  socket, rotas que pedem `Bearer`) renova para `agora + 30 dias` (`renewSession`), mas só grava se a renovação
  andar pelo menos 1 dia (`SESSION_RENEW_AFTER_MS`): no máximo uma escrita por sessão por dia. Quem abre o app pelo
  menos uma vez a cada 30 dias nunca cai; sessão parada 30 dias vence e é apagada pela limpeza.
- **Ao abrir o app:** `App` chama `restoreSession()`, que usa o token salvo. Enquanto isso `store.restoring = true`
  e o `LoginScreen` mostra "Entrando..." com o link "Entrar com outra conta" (`cancelRestore()`: fecha a conexão,
  mostra o formulário e **mantém** o token). O `connect()` preserva `restoring` ao chamar `disconnect()` (que volta
  ao `initialState`).
- **Só `unauthorized` derruba a sessão:** `connect_error` com `err.message === 'unauthorized'` apaga o token
  (`connect()` rejeita com "Sua sessão expirou"; numa reconexão, desconecta e mostra o aviso). Qualquer outro erro
  (servidor fora, timeout, `server_error` do banco) mantém o token e o `connect()` continua tentando: falha de
  transporte o próprio socket.io repete; recusa do middleware (`socket.active === false`) é repetida com
  `s.connect()` a cada 3 s (`RETRY_REFUSED_CONNECTION_MS`). Por isso o `connect()` só rejeita com `unauthorized`.
- **Origem do `localStorage`:** o token fica no `localStorage` da origem da página. No dev é
  `http://localhost:5173`, no app instalado é `file://`: são armazenamentos diferentes, então logar no dev não loga
  no instalado (e vice-versa). Atualizar o app instalado mantém o token (mesmo `appId`, mesma pasta de dados).
- **Limite de tentativas:** 10 senhas erradas por e-mail em 15 min bloqueiam aquele e-mail (memória, zera ao
  reiniciar o servidor).

## Login com Google (gratuito)

OAuth 2.0 para **apps instalados**: navegador do sistema + redirecionamento loopback + PKCE.

1. `loginWithGoogle(url)` busca `GET /auth/config` → `googleClientId` (null = botão desativado).
2. O main (`google-auth.ts`) sobe um HTTP em `127.0.0.1:<porta livre>`, abre
   `accounts.google.com/o/oauth2/v2/auth` com `code_challenge` S256 + `state` e espera o retorno (3 min).
3. O renderer manda `{ code, codeVerifier, redirectUri }` para `POST /auth/google`.
4. **O servidor** troca o código em `oauth2.googleapis.com/token` usando o `GOOGLE_CLIENT_SECRET` (que nunca vai
   para o app). Como o `id_token` vem direto do Google por HTTPS, basta conferir `iss`, `aud`, `exp` e
   `email_verified` (sem checar assinatura).
5. Procura a conta por `googleId`; senão, por e-mail (vincula); senão, cria com o nome do Google, id provisório
   e a foto do Google baixada em 256 px.

Configuração: copie `server/.env.example` para `server/.env` e preencha `GOOGLE_CLIENT_ID` e
`GOOGLE_CLIENT_SECRET` de um cliente OAuth do tipo **"App para computador"** (Google Cloud Console → APIs e
serviços → Credenciais). O servidor mostra `Login com Google: ativado/desativado` ao iniciar. O `redirectUri` só é
aceito se for `http://127.0.0.1:<porta>`.

Erros do comando `google-sign-in` chegam à tela como o texto escrito no Rust (`Login com Google não configurado`, tempo esgotado, acesso negado).

## Foto de perfil

- O renderer reduz a imagem (`fileToAvatarDataUrl`) e manda um **data URL** no `account:update`
  (`avatar`: string = trocar, `null` = remover, ausente = manter). `maxHttpBufferSize` do Socket.IO é 1 MB.
- O servidor só aceita `image/png|jpeg|webp|gif` até `AVATAR_MAX_BYTES`, salva em `DATA_DIR/avatars/<accountId>`
  e incrementa `avatarVersion`.
- `GET /avatars/<accountId>` serve com o content-type salvo, `nosniff` e cache longo. O `User.avatarUrl` é só o
  caminho (`/avatars/<id>?v=<versão>`); o cliente monta o endereço com `resolveAvatarUrl(path, serverUrl)`.
  O `?v=` muda a cada troca, então o cache nunca mostra a foto velha.
- A CSP (`src/renderer/index.html`) libera `img-src http: https:` por causa disso.

## Perfil em tempo real

`account:update` → `updateProfile()` no servidor → atualiza todas as conexões daquela conta no mapa `users` →
`io.emit('user:updated', { accountId, name, tag, avatarUrl })`. O cliente aplica em `users`, `self` e `account`.

Mensagens guardam uma **cópia** do autor do momento do envio. O `MessageItem` (`ChatView`) mostra o nome/foto
atuais se o autor estiver online (busca por `accountId`) e agrupa mensagens seguidas por `accountId`.
A `MemberList` deduplica por `accountId` (a mesma conta pode estar em duas janelas).

## Adicionar algo às contas (exemplo: campo "bio")

1. `src/shared/types/account.ts`: campo em `AccountInfo`/`User` (se outros precisam ver) e em `ProfileUpdate`.
2. `server/db/schema/accounts.ts`: coluna nova (com `default` para as contas existentes) → `npm run db:generate`;
   `server/repo/types.ts`: campo em `Account`.
3. `server/auth.ts`: validar em `updateProfile()` (entra no `patch`) e incluir em `toAccountInfo()`;
   `server/modules/presence.ts`: `userFor()`; `server/modules/accounts.ts`: payload de `user:updated`.
4. `lib/actions/account.ts`: nada novo se couber no `updateProfile`/`user:updated`.
5. UI em `components/settings/AccountSettings.tsx` (seção "Minha conta" das Configurações). Textos em pt-BR, tokens de cor do tema.

## Testar

- `npm run typecheck && npm test`. Os testes de contas ficam em `server/tests/auth.test.ts` (servidor real) e
  `server/repo/repo.test.ts` (repo direto no banco).
- Servidor isolado para não sujar `server/data` (Git Bash):
  `DATA_DIR="$TMPDIR/concord-teste" DATABASE_URL= PORT=3999 npx tsx server/index.ts` (PGlite no DATA_DIR temporário).
- Para simular uma conta do Google sem credenciais: no teste, `TestServer.start({ prepare })` escreve um `db.json`
  com uma conta `tagLocked: false`, `passwordHash: null` e uma sessão cujo `tokenHash` seja o `sha256` de um token
  conhecido; o boot importa (veja `server/tests/database.test.ts`).
- Casos que devem continuar valendo: mesmo nome + ids diferentes = ok; id repetido (outra caixa) = erro; trocar id
  de conta travada = erro; trocar só o nome = ok; conta Google escolhe id uma vez e na segunda = erro;
  token inválido ou revogado = `unauthorized`; sessão usada é renovada (no máximo 1 vez por dia) e parada 30 dias
  vence (`server/auth.test.ts`, "sessões"); só `unauthorized` apaga o token, servidor fora mantém e tenta de novo
  (`src/renderer/src/lib/client-session.test.ts`, `components/login-restoring.test.tsx`); imagem que não é PNG/JPEG/WebP/GIF = erro;
  conta ou e-mail banido: login (só com a senha certa), Google, cadastro e sessão antiga recusados (`server/auth.test.ts`,
  "banimento da comunidade").
- No app (`npm run dev:all`), o renderer também abre em `http://localhost:5173` no navegador; só o botão do Google
  depende do app desktop (`window.api`).

## Limitações atuais

- Sem recuperação ou troca de senha, sem verificação de e-mail no cadastro com senha, sem excluir conta.
- Conta só com Google não ganha senha; conta com senha ganha Google automaticamente ao entrar com o mesmo e-mail.
- Cargos e permissões são da v2 (`server/modules/permissions.ts`); a primeira conta criada é a dona e pode tudo.
- Limites: 5 cadastros e 20 logins por IP (além dos 10 erros por e-mail), 10 alterações de perfil seguidas por conta
  (`server/middleware/rate-limit.ts`). Sessões vencidas são apagadas a cada hora.
