// Caminhos e configuração do servidor (lidos do ambiente / server/.env).
import { join } from 'node:path'

/** Pasta de dados: fotos, banco PGlite (quando não há DATABASE_URL) e o db.json antigo. */
export const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
export const AVATAR_DIR = join(DATA_DIR, 'avatars')
/** Banco JSON das versões antigas; importado automaticamente se o Postgres estiver vazio. */
export const LEGACY_JSON_FILE = join(DATA_DIR, 'db.json')
/** Onde o PGlite guarda o banco quando não há DATABASE_URL. */
export const PGLITE_DIR = join(DATA_DIR, 'pgdata')
