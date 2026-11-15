# Adicionando uma funcionalidade

O código é dividido **por domínio** para que duas pessoas trabalhem em paralelo sem conflito (ver
`docs/ROADMAP.md`). Domínio existente = edite os arquivos dele. Domínio novo = crie arquivos novos e acrescente
**uma linha de registro** em cada arquivo de registro (marcados com ★).

Siga sempre esta ordem, porque o TypeScript acusa o que falta a cada passo:

1. **Contrato** em `src/shared/types/<dominio>.ts`: tipos novos e eventos em `<Dominio>ClientEvents` /
   `<Dominio>ServerEvents`. Use callback de ack como último argumento quando o cliente precisar de resposta.
   ★ Domínio novo: `export *` e os dois `extends` em `src/shared/types/index.ts`.
2. **Dados**:
   - tabela/coluna nova em `server/db/schema/<dominio>.ts` (Drizzle; restrições como `check`/`uniqueIndex` ficam no
     banco), depois `npm run db:generate` **só depois do rebase na main** e confira o SQL em `server/db/migrations/`;
     ★ tabela de domínio novo: exporte em `server/db/schema/index.ts`;
   - funções **async** em `server/repo/<dominio>.ts` (`findX`, `insertX`, `updateX`...) usando `db()` de
     `server/db/client.ts`. Só o repo importa `server/db/`. Ids vindos do cliente passam por `isUuid` (senão o
     Postgres dá erro); violação de unicidade vira `DuplicateError` (veja `uniqueViolation`).
3. **Servidor** em `server/modules/<dominio>.ts`, que exporta um `ServerModule` (`socket(io, socket)` e/ou `http(req, res, path)`):
   - exija `socket.data.user` (existe depois do `hello`); `socket.data.accountId` diz de quem é o socket;
   - para "quem é dono de quê", compare `accountId`, nunca `user.id` (é o `socket.id` e muda a cada conexão);
   - **permissões (v2):** confira `await allowed(user.accountId, '<perm>', channelId)` de `server/access.ts`
     (sem `view`, responda como se o canal não existisse) e emita eventos de canal com `emitToViewers(io, channelId, ...)`;
     ação administrativa nova ganha uma permissão no contrato `src/shared/types/permissions.ts`;
   - valide o payload em tempo de execução (`typeof`, tamanho, se o canal existe e é do tipo certo);
   - se houver ack, confira `typeof ack === 'function'` **antes** do `guard`;
   - todo trabalho async vai dentro de `void guard('evento', async () => { ... })` (de `server/context.ts`);
   - emita com `io.emit` (todos), `socket.broadcast.emit` (todos menos quem enviou) ou `io.to(room)`.
   ★ Domínio novo: acrescente o módulo na lista `modules` de `server/index.ts`.
4. **Cliente** em `src/renderer/src/lib/actions/<dominio>.ts`:
   - `bind<Dominio>Events(s)` com os listeners, atualizando a store com `set((st) => ({ ... }))` de forma imutável;
   - funções exportadas para as ações (`requireSocket().emit(...)` ou `await requireSocket().emitWithAck(...)`);
   - erros visíveis ao usuário com `notify('mensagem')`. `set`, `get`, `requireSocket`, `getSocket` e `notify` vêm de `../core`.
   ★ Domínio novo: chame `bind<Dominio>Events(s)` em `connect()` e acrescente `export * from './actions/<dominio>'` em `lib/client.ts`.
5. **Estado** em `src/renderer/src/store/<dominio>.ts`: campo na interface do slice **e** no `<dominio>Initial`.
   ★ Domínio novo: acrescente o slice em `AppState` e `initialState` de `store/index.ts`.
6. **UI**: componente em `src/renderer/src/components/` (de preferência numa subpasta do domínio), lendo com
   `useApp(s => ...)` e chamando as ações importadas de `@/lib/client`.
7. **Testes** (obrigatórios; a tarefa só termina com tudo verde):
   - servidor em `server/tests/<dominio>.test.ts`: `TestServer.start()` (de `server/tests/helpers.ts`) sobe o servidor real com DATA_DIR temporário;
     `server.newUser()` cria conta, conecta e manda `hello`; `waitFor(socket, 'evento', filtro)` espera um evento e
     `expectNoEvent(...)` garante que ele não chega. Teste o caminho feliz **e** cada validação (payload inválido,
     sem permissão, antes do `hello`). Persistência: `server.restart()`;
   - app em `src/renderer/src/lib/actions/<dominio>.test.ts`: `FakeSocket` (de `@/test/fake-socket`) + `bind<Dominio>Events(socket.asSocket())`, depois
     `socket.receive('evento', ...)` e confira a store; `socket.replyTo('evento', fn)` responde `emitWithAck`.
8. `npm run typecheck && npm test`.

## Exemplo: editar mensagem (domínio `message`, já existe)

```ts
// 1. src/shared/types/message.ts
//   Message ganha:             editedAt?: number
//   MessageClientEvents ganha: 'message:edit': (p: { messageId: string; content: string }) => void
//   MessageServerEvents ganha: 'message:updated': (m: Message) => void

// 2. server/db/schema/messages.ts ganha:  editedAt: timestamp('edited_at', { withTimezone: true })
//    npm run db:generate  → server/db/migrations/000N_<nome>.sql
//    server/repo/messages.ts:
export async function findMessage(id: string): Promise<Message | undefined> {
  if (!isUuid(id)) return undefined
  /* db().select().from(messages).leftJoin(accounts, ...).where(eq(messages.id, id)) ... */
}
export async function updateMessageContent(id: string, content: string): Promise<Message | undefined> { /* db().update(...) */ }

// 3. server/modules/messages.ts, dentro de socket(io, socket):
socket.on('message:edit', (payload) => {
  const user = socket.data.user
  if (!user || !payload || typeof payload.messageId !== 'string') return
  const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MESSAGE_MAX_LENGTH) : ''
  if (!content) return
  void guard('message:edit', async () => {
    const msg = await findMessage(payload.messageId)
    if (!msg || msg.author.accountId !== user.accountId) return // só o autor edita (vale entre conexões)
    const updated = await updateMessageContent(msg.id, content)
    if (updated) io.emit('message:updated', updated)
  })
})

// 4. lib/actions/messages.ts, dentro de bindMessageEvents(s):
s.on('message:updated', (m) =>
  set((st) => {
    const list = st.messages[m.channelId]
    if (!list) return {}
    return { messages: { ...st.messages, [m.channelId]: list.map((x) => (x.id === m.id ? m : x)) } }
  })
)
// e no mesmo arquivo (já reexportado por lib/client.ts):
export function editMessage(messageId: string, content: string): void {
  requireSocket().emit('message:edit', { messageId, content })
}
```

Observação: `author.id` é o `socket.id` do momento do envio; a autoria de verdade é `author.accountId`.
Mudanças em contas/perfil seguem a `docs/areas/accounts.md`.

## Convenções de UI

- **shadcn/ui**: `npx shadcn@latest add <componente>` gera os arquivos em `src/renderer/src/components/ui/`. Os componentes importam de `radix-ui` (pacote único) e usam `cn()` de `@/lib/utils`.
- **Botão de ícone com tooltip**: use `IconButton` (`components/IconButton.tsx`).
- **Avatar**: use `UserAvatar` (foto da conta via `avatarUrl`, com as iniciais sobre a cor do usuário como fallback; `speaking` mostra o anel verde). Para identificar a pessoa na tela, mostre `nome#tag` (ex.: `title`).
- **Tokens de cor** (em `assets/globals.css`): `bg-background` (chat), `bg-sidebar`, `bg-rail` (barra de servidores e fundo da voz), `bg-panel` (painel do usuário), `bg-composer` (campo de mensagem), `bg-accent` (hover e item selecionado), `text-muted-foreground`, `text-accent-foreground`, `text-success`, `text-destructive`, `bg-primary` (azul do Discord). Para um token novo, adicione a variável em `:root` **e** em `@theme inline`.
- Títulos de seção: `text-xs font-bold tracking-wide uppercase text-muted-foreground`.
- Elementos clicáveis que contêm outros botões (itens de canal) são `div` com `role="button"` (veja `onActivate` em `ChannelSidebar.tsx`), porque botão dentro de botão é HTML inválido.
- Seletor que gera array novo → `useApp(useShallow(s => s.voice.filter(...)))`.
- Textos em português do Brasil.

## Documentação da mudança (obrigatória)

Toda tarefa, módulo novo ou alteração só está pronta com a documentação em dia (R14 e "Definição de pronto"
no `AGENTS.md`).

- **Área nova** → crie `docs/areas/<area>.md` com o modelo abaixo, a skill-ponteiro
  `.claude/skills/concord-<area>/SKILL.md` e acrescente a área em "Documentação por área" no `AGENTS.md`.
  Área pequena que cabe num doc existente → uma seção nova nele.
- **Alteração** → atualize as seções afetadas do doc da área no mesmo PR (e a tabela de eventos de
  `docs/areas/architecture.md` se mexeu em evento).
- **Decisão que custa caro desfazer** (biblioteca, formato de dado, protocolo, limite) → ADR em
  `docs/decisions/NNNN-*.md` com as alternativas descartadas.

Modelo para `docs/areas/<area>.md`:

```markdown
# <Área>

O que faz e por quê (2–3 linhas).

## Arquivos
| Arquivo | Papel |

## Contrato
Tipos e eventos em `shared/types/<dominio>.ts` (payload, ack, quem recebe).

## Fluxo
O caminho principal, do clique ao servidor e de volta.

## Regras e limites
Validações, permissões, limites de requisição, o que não é suportado.

## Testes
Onde estão e o que cobrem; como testar à mão (duas janelas, duas contas).

## Depuração
Sintoma → causa → como resolver.
```

A skill-ponteiro é só o gatilho (sem conteúdo, para não existir duas versões da mesma regra):

```markdown
---
name: concord-<area>
description: O que a área faz em uma frase. Use ao mexer em <arquivos principais>, nos eventos <area>:* ou ao investigar <sintomas comuns>.
---

A documentação desta área fica em **`docs/areas/<area>.md`**. Leia esse arquivo antes de mexer no código.
```

## Checklist antes de terminar

- [ ] O tipo existe em `shared/types/<dominio>.ts` e o servidor valida o payload
- [ ] O módulo do servidor só acessa dados pelo `server/repo/` e usa `guard` no que é async
- [ ] O estado novo também está no `<dominio>Initial` do slice
- [ ] Arquivos de registro (★) receberam só linhas de registro
- [ ] Funciona depois de reconectar (o `hello` repõe o estado?)
- [ ] Testes novos (`server/tests/` e/ou `*.test.ts` ao lado do código) cobrindo o caminho feliz e as validações
- [ ] `npm run typecheck` **e** `npm test` passam por completo
- [ ] **`docs/areas/<area>.md` criado (área nova) ou atualizado (alteração)**, listado no `AGENTS.md` se for novo; eventos em `docs/areas/architecture.md`; skill-ponteiro criada se a área é nova
- [ ] Arquivos novos no "Mapa rápido" do `AGENTS.md`
- [ ] A descrição do PR diz quais docs e ADRs foram criados ou atualizados
- [ ] Testado com duas janelas e **duas contas** (ver `docs/areas/dev-workflow.md`)
