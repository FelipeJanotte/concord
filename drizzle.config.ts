// drizzle-kit: `npm run db:generate` cria a migration a partir de server/db/schema.
// Regra (docs/ROADMAP.md): gere a migration só depois do rebase na main, logo antes do merge,
// e nunca edite uma migration já mergeada.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations'
})
