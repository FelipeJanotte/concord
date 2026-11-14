import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes ficam ao lado do código: `*.test.ts` em server/, src/shared/ e src/renderer/src/.
// Ambiente padrão é node; um teste de componente pode pedir DOM com `// @vitest-environment jsdom`
// (instale jsdom quando o primeiro precisar).
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['server/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'out/**', 'dist/**'],
    environment: 'node',
    // Carrega server/.env (DATABASE_URL_TEST etc.) como o servidor faz.
    setupFiles: ['server/env.ts'],
    // Os testes de integração (server/tests/) sobem o servidor real em cada arquivo.
    testTimeout: 15_000,
    hookTimeout: 30_000
  }
})
