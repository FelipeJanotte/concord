/**
 * Contas do Concord: cadastro com e-mail + senha, login, sessões por token,
 * login com Google (OAuth 2.0 "app para computador", gratuito) e perfil (nome#tag + foto).
 *
 * Os dados ficam no repo (`server/repo/*`); aqui só ficam as regras.
 */
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  AVATAR_MAX_BYTES,
  NAME_MAX,
  PASSWORD_MIN,
  TAG_PATTERN,
  type AccountInfo,
  type AuthResult,
  type GoogleLoginRequest,
  type LoginRequest,
  type ProfileUpdate,
  type ProfileUpdateResult,
  type RegisterRequest
} from '../src/shared/types'
import { AVATAR_DIR } from './config'
import {
  avatarUrl,
  findAccount,
  findAccountByEmail,
  findAccountByGoogleId,
  insertAccount,
  isTagTaken,
  updateAccount
} from './repo/accounts'
import { deleteSession, findValidSession, insertSession } from './repo/sessions'
import type { Account } from './repo/types'
import { DuplicateError } from './repo/util'

export { avatarUrl, findAccount }

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const COLORS = ['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#9b59b6', '#1abc9c', '#e67e22', '#2e86de', '#f47b67']

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || null
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''

// ---------- Utilidades ----------

function colorFor(seed: string): string {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

/** Mensagem para quando o banco recusa um valor repetido (corrida entre dois pedidos iguais). */
function duplicateMessage(err: unknown, tag: string): string | null {
  if (!(err instanceof DuplicateError)) return null
  if (err.field === 'email') return 'Este e-mail já está cadastrado'
  if (err.field === 'tag') return `O id #${tag} já está em uso. Escolha outro.`
  return 'Esta conta já existe'
}

export function toAccountInfo(a: Account): AccountInfo {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    tag: a.tag,
    color: a.color,
    avatarUrl: avatarUrl(a),
    hasPassword: !!a.passwordHash,
    hasGoogle: !!a.googleId,
    tagLocked: a.tagLocked
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function normalizeEmail(raw: unknown): string | null {
  const email = str(raw).trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** Nome: sem "#", espaços colapsados, de 2 a 32 caracteres. */
function normalizeName(raw: unknown): string | null {
  const name = str(raw).replace(/#/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  return name.length >= 2 ? name : null
}

function normalizeTag(raw: unknown): string | null {
  const tag = str(raw).trim()
  return TAG_PATTERN.test(tag) ? tag : null
}

/**
 * O id é único entre todas as contas (sem diferenciar maiúsculas). Como ele não
 * muda, é o que distingue duas pessoas com o mesmo nome, mesmo que elas troquem de nome.
 */
async function randomFreeTag(): Promise<string> {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; ; i++) {
    let tag = ''
    for (let j = 0; j < 5; j++) tag += chars[randomBytes(1)[0] % chars.length]
    if (!(await isTagTaken(tag)) || i > 1000) return tag
  }
}

// ---------- Senhas ----------

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$')
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

// Limite simples de tentativas erradas por e-mail (10 a cada 15 min).
const failures = new Map<string, { count: number; resetAt: number }>()
function isLocked(email: string): boolean {
  const f = failures.get(email)
  if (!f) return false
  if (Date.now() > f.resetAt) {
    failures.delete(email)
    return false
  }
  return f.count >= 10
}
function recordFailure(email: string): void {
  const f = failures.get(email)
  if (!f || Date.now() > f.resetAt) failures.set(email, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 })
  else f.count++
}

// ---------- Sessões ----------

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

async function createSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await insertSession({ tokenHash: sha256(token), accountId, expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}

export async function accountFromToken(token: unknown): Promise<Account | undefined> {
  if (typeof token !== 'string' || !token) return undefined
  const session = await findValidSession(sha256(token))
  return session ? findAccount(session.accountId) : undefined
}

export async function revokeSession(token: unknown): Promise<void> {
  if (typeof token !== 'string') return
  await deleteSession(sha256(token))
}

const success = async (a: Account): Promise<AuthResult> => ({
  ok: true,
  token: await createSession(a.id),
  account: toAccountInfo(a)
})

// ---------- Foto ----------

type AvatarPatch = Pick<Account, 'avatarType' | 'avatarVersion'>

/** Grava o arquivo e devolve os campos que a conta precisa atualizar. */
function writeAvatar(account: Account, bytes: Buffer, type: string): AvatarPatch {
  mkdirSync(AVATAR_DIR, { recursive: true })
  writeFileSync(join(AVATAR_DIR, account.id), bytes)
  return { avatarType: type, avatarVersion: account.avatarVersion + 1 }
}

function removeAvatar(account: Account): AvatarPatch {
  rmSync(join(AVATAR_DIR, account.id), { force: true })
  return { avatarType: null, avatarVersion: account.avatarVersion + 1 }
}

/** Aceita só data URLs de imagem (png, jpeg, webp ou gif) até AVATAR_MAX_BYTES. */
function parseAvatar(dataUrl: unknown): { bytes: Buffer; type: string } | null {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(str(dataUrl))
  if (!m) return null
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) return null
  return { bytes, type: m[1] }
}

// ---------- Cadastro / login ----------

export async function register(req: Partial<RegisterRequest>): Promise<AuthResult> {
  const email = normalizeEmail(req.email)
  if (!email) return { ok: false, error: 'E-mail inválido' }
  const password = str(req.password)
  if (password.length < PASSWORD_MIN) return { ok: false, error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres` }
  if (password.length > 200) return { ok: false, error: 'Senha longa demais' }
  const name = normalizeName(req.name)
  if (!name) return { ok: false, error: 'O nome precisa ter pelo menos 2 caracteres (sem "#")' }
  const tag = normalizeTag(req.tag)
  if (!tag) return { ok: false, error: 'O id precisa ter de 1 a 5 letras ou números' }
  if (await findAccountByEmail(email)) return { ok: false, error: 'Este e-mail já está cadastrado' }
  if (await isTagTaken(tag)) return { ok: false, error: `O id #${tag} já está em uso. Escolha outro.` }

  const id = randomUUID()
  let account: Account
  try {
    account = await insertAccount({
      id,
      email,
      name,
      tag,
      tagLocked: true,
      color: colorFor(id),
      passwordHash: await hashPassword(password),
      googleId: null,
      avatarType: null,
      avatarVersion: 0,
      createdAt: Date.now()
    })
  } catch (err) {
    const message = duplicateMessage(err, tag)
    if (message) return { ok: false, error: message }
    throw err
  }
  console.log(`[conta] criada: ${name}#${tag}`)
  return success(account)
}

export async function login(req: Partial<LoginRequest>): Promise<AuthResult> {
  const email = normalizeEmail(req.email)
  const password = str(req.password)
  if (!email || !password) return { ok: false, error: 'E-mail ou senha incorretos' }
  if (isLocked(email)) return { ok: false, error: 'Muitas tentativas. Tente de novo em alguns minutos.' }
  const account = await findAccountByEmail(email)
  if (account && !account.passwordHash) {
    return { ok: false, error: 'Esta conta foi criada com o Google. Use "Entrar com Google".' }
  }
  if (!account || !(await verifyPassword(password, account.passwordHash!))) {
    recordFailure(email)
    return { ok: false, error: 'E-mail ou senha incorretos' }
  }
  failures.delete(email)
  return success(account)
}

// ---------- Google ----------

interface GoogleIdToken {
  iss: string
  aud: string
  sub: string
  exp: number
  email?: string
  email_verified?: boolean
  name?: string
  given_name?: string
  picture?: string
}

async function downloadGooglePicture(account: Account, url: string): Promise<AvatarPatch | null> {
  try {
    const res = await fetch(url.replace(/=s\d+(-c)?$/, '=s256-c'))
    const type = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > 0 && bytes.length <= AVATAR_MAX_BYTES) return writeAvatar(account, bytes, type)
  } catch {
    // foto é opcional
  }
  return null
}

export async function googleLogin(req: Partial<GoogleLoginRequest>): Promise<AuthResult> {
  if (!GOOGLE_CLIENT_ID) return { ok: false, error: 'Login com Google não está configurado neste servidor' }
  const code = str(req.code)
  const codeVerifier = str(req.codeVerifier)
  const redirectUri = str(req.redirectUri)
  if (!code || !codeVerifier || !/^http:\/\/127\.0\.0\.1:\d{2,5}\/?$/.test(redirectUri)) {
    return { ok: false, error: 'Requisição de login inválida' }
  }

  // O servidor troca o código pelo token (o client secret fica só aqui).
  let idToken: string
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        code_verifier: codeVerifier,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })
    const json = (await res.json()) as { id_token?: string; error_description?: string; error?: string }
    if (!res.ok || !json.id_token) {
      console.warn('[google] troca de código falhou:', json.error, json.error_description)
      return { ok: false, error: 'O Google recusou o login. Tente de novo.' }
    }
    idToken = json.id_token
  } catch {
    return { ok: false, error: 'Não foi possível falar com o Google' }
  }

  // O id_token veio direto do Google por HTTPS, então basta conferir os campos.
  let claims: GoogleIdToken
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as GoogleIdToken
  } catch {
    return { ok: false, error: 'Resposta inválida do Google' }
  }
  const validIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!validIss || claims.aud !== GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || !claims.sub) {
    return { ok: false, error: 'Resposta inválida do Google' }
  }
  const email = normalizeEmail(claims.email)
  if (!email || !claims.email_verified) return { ok: false, error: 'Sua conta Google não tem e-mail verificado' }

  let account = await findAccountByGoogleId(claims.sub)
  if (!account) {
    // Mesmo e-mail (verificado pelo Google) de uma conta existente: vincula.
    const byEmail = await findAccountByEmail(email)
    if (byEmail) account = await updateAccount(byEmail.id, { googleId: claims.sub })
  }
  if (!account) {
    const name = normalizeName(claims.name) ?? normalizeName(claims.given_name) ?? normalizeName(email.split('@')[0]) ?? 'Usuário'
    const id = randomUUID()
    const draft: Account = {
      id,
      email,
      name,
      // id provisório: a pessoa escolhe o definitivo uma vez, logo após entrar
      tag: await randomFreeTag(),
      tagLocked: false,
      color: colorFor(id),
      passwordHash: null,
      googleId: claims.sub,
      avatarType: null,
      avatarVersion: 0,
      createdAt: Date.now()
    }
    const picture = claims.picture ? await downloadGooglePicture(draft, claims.picture) : null
    try {
      account = await insertAccount({ ...draft, ...picture })
    } catch (err) {
      // Dois logins simultâneos da mesma conta Google: usa a que acabou de ser criada.
      if (!(err instanceof DuplicateError)) throw err
      account = (await findAccountByGoogleId(claims.sub)) ?? (await findAccountByEmail(email))
      if (!account) return { ok: false, error: 'Não foi possível criar a conta. Tente de novo.' }
    }
    console.log(`[conta] criada via Google: ${account.name}#${account.tag}`)
  }
  return success(account)
}

// ---------- Perfil ----------

export async function updateProfile(account: Account, payload: Partial<ProfileUpdate>): Promise<ProfileUpdateResult> {
  const name = normalizeName(payload?.name)
  if (!name) return { ok: false, error: 'O nome precisa ter pelo menos 2 caracteres (sem "#")' }

  // O id é imutável. Exceção: conta do Google ainda com id provisório escolhe uma única vez.
  let tag: string | null = null
  if (payload.tag !== undefined && payload.tag !== account.tag) {
    if (account.tagLocked) return { ok: false, error: 'O id não pode ser alterado' }
    tag = normalizeTag(payload.tag)
    if (!tag) return { ok: false, error: 'O id precisa ter de 1 a 5 letras ou números' }
    if (await isTagTaken(tag, account.id)) return { ok: false, error: `O id #${tag} já está em uso. Escolha outro.` }
  }

  let avatar: { bytes: Buffer; type: string } | null = null
  if (payload.avatar) {
    avatar = parseAvatar(payload.avatar)
    if (!avatar) return { ok: false, error: 'Imagem inválida ou grande demais' }
  }

  const patch: Partial<Account> = { name }
  if (tag) patch.tag = tag
  // Confirmar o id (mesmo mantendo o provisório) trava de vez.
  if (payload.tag !== undefined) patch.tagLocked = true
  if (avatar) Object.assign(patch, writeAvatar(account, avatar.bytes, avatar.type))
  else if (payload.avatar === null && account.avatarType) Object.assign(patch, removeAvatar(account))

  let updated: Account | undefined
  try {
    updated = await updateAccount(account.id, patch)
  } catch (err) {
    const message = duplicateMessage(err, tag ?? account.tag)
    if (message) return { ok: false, error: message }
    throw err
  }
  if (!updated) return { ok: false, error: 'Conta não encontrada' }
  return { ok: true, account: toAccountInfo(updated) }
}
