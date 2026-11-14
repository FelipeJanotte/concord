// Caminhos e configuração do servidor (lidos do ambiente / server/.env).
import { join } from 'node:path'

/** Pasta de dados: fotos, banco PGlite (quando não há DATABASE_URL) e o db.json antigo. */
export const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
export const AVATAR_DIR = join(DATA_DIR, 'avatars')
/** Arquivos enviados (anexos), um por id. */
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')
/** Anexo que não entrou numa mensagem depois deste tempo é apagado (padrão 1 h). */
export const UPLOAD_ORPHAN_TTL_MS = Number(process.env.UPLOAD_ORPHAN_TTL_MS) || 60 * 60 * 1000
/** De quanto em quanto tempo procura anexos soltos (padrão 10 min). */
export const UPLOAD_SWEEP_INTERVAL_MS = Number(process.env.UPLOAD_SWEEP_INTERVAL_MS) || 10 * 60 * 1000
/** Banco JSON das versões antigas; importado automaticamente se o Postgres estiver vazio. */
export const LEGACY_JSON_FILE = join(DATA_DIR, 'db.json')
/** Onde o PGlite guarda o banco quando não há DATABASE_URL. */
export const PGLITE_DIR = join(DATA_DIR, 'pgdata')
