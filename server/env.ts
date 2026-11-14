// Carrega server/.env (se existir) antes de qualquer outro módulo ler process.env.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const envFile = join(__dirname, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
