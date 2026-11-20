// Caminhos e configuração do servidor (lidos do ambiente / server/.env).
import { join } from 'node:path'

/** Pasta de dados: fotos, banco PGlite (quando não há DATABASE_URL) e o db.json antigo. */
export const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
export const AVATAR_DIR = join(DATA_DIR, 'avatars')
/** Arquivos enviados (anexos), um por id. */
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')
/** Efeitos sonoros (A10), separados dos anexos (a limpeza de anexos não pode apagá-los). */
export const SOUND_DIR = join(DATA_DIR, 'sounds')
export const EMBED_DIR = join(DATA_DIR, 'embeds')
/** Quantos sons cada conta pode ter e quantos a comunidade toda (padrões 20 e 200). */
export const SOUNDS_PER_ACCOUNT = Number(process.env.SOUNDS_PER_ACCOUNT) || 20
export const SOUNDS_TOTAL = Number(process.env.SOUNDS_TOTAL) || 200
/** Anexo que não entrou numa mensagem depois deste tempo é apagado (padrão 1 h). */
export const UPLOAD_ORPHAN_TTL_MS = Number(process.env.UPLOAD_ORPHAN_TTL_MS) || 60 * 60 * 1000
/** De quanto em quanto tempo apaga sessões vencidas e limpa os limites de requisição (padrão 1 h). */
export const SESSION_SWEEP_INTERVAL_MS = Number(process.env.SESSION_SWEEP_INTERVAL_MS) || 60 * 60 * 1000
export const CUSTOM_STATUS_SWEEP_INTERVAL_MS = 60 * 1000
/** Backups automáticos do PGlite: pasta, intervalo (padrão 24 h) e quantos manter (padrão 7). */
export const BACKUP_DIR = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')
export const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS) || 24 * 60 * 60 * 1000
export const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 7)
/** De quanto em quanto tempo procura anexos soltos (padrão 10 min). */
export const UPLOAD_SWEEP_INTERVAL_MS = Number(process.env.UPLOAD_SWEEP_INTERVAL_MS) || 10 * 60 * 1000
/** Banco JSON das versões antigas; importado automaticamente se o Postgres estiver vazio. */
export const LEGACY_JSON_FILE = join(DATA_DIR, 'db.json')
/** Onde o PGlite guarda o banco quando não há DATABASE_URL. */
export const PGLITE_DIR = join(DATA_DIR, 'pgdata')
