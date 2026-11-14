---
name: concord-add-feature
description: Passo a passo para adicionar uma funcionalidade de ponta a ponta no Concord (tipos compartilhados → servidor Socket.IO → lib/client.ts → store → componente React/shadcn), com exemplo completo e convenções de código. Use ao criar eventos, telas, componentes ou mudar o comportamento do chat.
---

# Adicionando uma funcionalidade

Siga sempre esta ordem, porque o TypeScript acusa o que falta a cada passo:

1. **Contrato** em `src/shared/types.ts`: tipos novos e eventos em `ClientToServerEvents` / `ServerToClientEvents`.
   Use callback de ack como último argumento quando o cliente precisar de resposta.
2. **Servidor** em `server/index.ts`, dentro de `io.on('connection')`:
   - exija `user` (o usuário já mandou `hello`); o socket só existe com sessão válida e `socket.data.accountId` diz de quem é;
   - para "quem é dono de quê", compare `accountId`, nunca `user.id` (é o `socket.id` e muda a cada conexão);
   - valide o payload em tempo de execução (`typeof`, tamanho, se o canal existe e é do tipo certo);
   - se houver ack, confira `typeof ack === 'function'`;
   - altere `db` e chame `save()` se precisar persistir;
   - emita com `io.emit` (todos), `socket.broadcast.emit` (todos menos quem enviou) ou `io.to(room)`.
3. **Cliente** em `src/renderer/src/lib/client.ts`:
   - listener dentro de `connect()`, atualizando a store com `set((st) => ({ ... }))` de forma imutável;
   - uma função exportada para a ação (`requireSocket().emit(...)` ou `await socket.emitWithAck(...)`);
   - erros visíveis ao usuário com `notify('mensagem')`.
4. **Estado** em `src/renderer/src/store.ts`: campo novo em `AppState` **e** em `initialState`.
5. **UI**: componente em `src/renderer/src/components/`, lendo com `useApp(s => ...)` e chamando a função do passo 3.
6. `npm run typecheck`.

## Exemplo: editar mensagem

```ts
// 1. src/shared/types.ts
//   Message ganha:              editedAt?: number
//   ClientToServerEvents ganha: 'message:edit': (p: { messageId: string; content: string }) => void
//   ServerToClientEvents ganha: 'message:updated': (m: Message) => void

// 2. server/index.ts
socket.on('message:edit', (payload) => {
  if (!user || !payload) return
  const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MAX_MESSAGE_LENGTH) : ''
  if (!content) return
  for (const list of Object.values(db.messages)) {
    const msg = list.find((m) => m.id === payload.messageId)
    if (!msg) continue
    if (msg.author.accountId !== user.accountId) return // só o autor edita (vale entre conexões)
    msg.content = content
    msg.editedAt = Date.now()
    save()
    io.emit('message:updated', msg)
    return
  }
})

// 3. lib/client.ts, dentro de connect():
s.on('message:updated', (m) =>
  set((st) => {
    const list = st.messages[m.channelId]
    if (!list) return {}
    return { messages: { ...st.messages, [m.channelId]: list.map((x) => (x.id === m.id ? m : x)) } }
  })
)
// e fora de connect():
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

- [ ] O tipo existe em `shared/types.ts` e o servidor valida o payload
- [ ] O estado novo também está no `initialState`
- [ ] Funciona depois de reconectar (o `hello` repõe o estado?)
- [ ] `npm run typecheck` passa
- [ ] Testado com duas janelas e **duas contas** (ver `concord-dev-workflow`)
