---
name: concord-add-feature
description: Passo a passo para adicionar uma funcionalidade de ponta a ponta no Concord (tipos em shared/types/<dominio>.ts → módulo do servidor em server/modules + repo → lib/actions → store/<slice> → componente React/shadcn), com exemplo completo e convenções de código. Use ao criar eventos, telas, componentes ou mudar o comportamento do chat.
---

# Adicionando uma funcionalidade

O código é dividido **por domínio** para que duas pessoas trabalhem em paralelo sem conflito (ver
`docs/ROADMAP.md`). Domínio existente = edite os arquivos dele. Domínio novo = crie arquivos novos e acrescente
**uma linha de registro** em cada arquivo de registro (marcados com ★).

Siga sempre esta ordem, porque o TypeScript acusa o que falta a cada passo:

1. **Contrato** em `src/shared/types/<dominio>.ts`: tipos novos e eventos em `<Dominio>ClientEvents` /
   `<Dominio>ServerEvents`. Use callback de ack como último argumento quando o cliente precisar de resposta.
   ★ Domínio novo: `export *` e os dois `extends` em `src/shared/types/index.ts`.
2. **Dados** em `server/repo/<dominio>.ts`: funções **async** que devolvem cópias (`findX`, `insertX`, `updateX`...).
   Só o repo importa `server/db.ts`. Isso deixa a troca para Postgres restrita a essa pasta.
3. **Servidor** em `server/modules/<dominio>.ts`, que exporta um `ServerModule` (`socket(io, socket)` e/ou `http(req, res, path)`):
   - exija `socket.data.user` (existe depois do `hello`); `socket.data.accountId` diz de quem é o socket;
   - para "quem é dono de quê", compare `accountId`, nunca `user.id` (é o `socket.id` e muda a cada conexão);
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

// 2. server/repo/messages.ts
export async function findMessage(id: string): Promise<Message | undefined> { /* ... */ }
export async function updateMessage(id: string, patch: Partial<Message>): Promise<Message | undefined> { /* ... */ }

// 3. server/modules/messages.ts, dentro de socket(io, socket):
socket.on('message:edit', (payload) => {
  const user = socket.data.user
  if (!user || !payload || typeof payload.messageId !== 'string') return
  const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MAX_MESSAGE_LENGTH) : ''
  if (!content) return
  void guard('message:edit', async () => {
    const msg = await findMessage(payload.messageId)
    if (!msg || msg.author.accountId !== user.accountId) return // só o autor edita (vale entre conexões)
    const updated = await updateMessage(msg.id, { content, editedAt: Date.now() })
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
Mudanças em contas/perfil seguem a skill `concord-accounts`.

## Convenções de UI

- **shadcn/ui**: `npx shadcn@latest add <componente>` gera os arquivos em `src/renderer/src/components/ui/`. Os componentes importam de `radix-ui` (pacote único) e usam `cn()` de `@/lib/utils`.
- **Botão de ícone com tooltip**: use `IconButton` (`components/IconButton.tsx`).
- **Avatar**: use `UserAvatar` (foto da conta via `avatarUrl`, com as iniciais sobre a cor do usuário como fallback; `speaking` mostra o anel verde). Para identificar a pessoa na tela, mostre `nome#tag` (ex.: `title`).
- **Tokens de cor** (em `assets/globals.css`): `bg-background` (chat), `bg-sidebar`, `bg-rail` (barra de servidores e fundo da voz), `bg-panel` (painel do usuário), `bg-composer` (campo de mensagem), `bg-accent` (hover e item selecionado), `text-muted-foreground`, `text-accent-foreground`, `text-success`, `text-destructive`, `bg-primary` (azul do Discord). Para um token novo, adicione a variável em `:root` **e** em `@theme inline`.
- Títulos de seção: `text-xs font-bold tracking-wide uppercase text-muted-foreground`.
- Elementos clicáveis que contêm outros botões (itens de canal) são `div` com `role="button"` (veja `onActivate` em `ChannelSidebar.tsx`), porque botão dentro de botão é HTML inválido.
- Seletor que gera array novo → `useApp(useShallow(s => s.voice.filter(...)))`.
- Textos em português do Brasil.

## Checklist antes de terminar

- [ ] O tipo existe em `shared/types/<dominio>.ts` e o servidor valida o payload
- [ ] O módulo do servidor só acessa dados pelo `server/repo/` e usa `guard` no que é async
- [ ] O estado novo também está no `<dominio>Initial` do slice
- [ ] Arquivos de registro (★) receberam só linhas de registro
- [ ] Funciona depois de reconectar (o `hello` repõe o estado?)
- [ ] Testes novos (`server/tests/` e/ou `*.test.ts` ao lado do código) cobrindo o caminho feliz e as validações
- [ ] `npm run typecheck` **e** `npm test` passam por completo
- [ ] Testado com duas janelas e **duas contas** (ver `concord-dev-workflow`)
