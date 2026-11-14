/**
 * Importa um db.json das versões antigas para o banco configurado.
 *
 *   npm run db:import-json                 (usa DATA_DIR/db.json)
 *   npm run db:import-json -- caminho.json
 *
 * Usa DATABASE_URL (Postgres) ou, sem ela, o PGlite em DATA_DIR/pgdata, igual ao
 * servidor. Pode rodar mais de uma vez: o que já existe é ignorado.
 * Não rode com o servidor usando o mesmo PGlite (ele só aceita um processo por vez).
 */
import '../env'
import { resolve } from 'node:path'
import { LEGACY_JSON_FILE } from '../config'
import { closeDatabase, databaseConfigFromEnv, describeDatabase, openDatabase } from '../db/client'
import { importLegacyJson } from '../db/seed'

async function main(): Promise<void> {
  const file = resolve(process.argv[2] ?? LEGACY_JSON_FILE)
  await openDatabase(databaseConfigFromEnv())
  console.log(`Importando ${file} para ${describeDatabase()}...`)
  const r = await importLegacyJson(file)
  console.log(`Pronto: ${r.accounts} contas, ${r.sessions} sessões, ${r.channels} canais, ${r.messages} mensagens novas.`)
  await closeDatabase()
}

main().catch(async (err) => {
  console.error(err)
  await closeDatabase().catch(() => {})
  process.exit(1)
})
