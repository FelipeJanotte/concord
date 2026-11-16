/**
 * Efeitos sonoros (soundboard, B17): a coleção da comunidade, enviar (`POST /sounds`), tocar na
 * minha sala (`sound:play`) e apagar. Ao receber `sound:played`, cada app toca o som localmente
 * pela saída escolhida (B4), respeitando o deafen e o volume/"Silenciar" que dei para quem tocou.
 *
 * O HTTP e o áudio ficam em `soundTransport` e `soundOutput`, que os testes substituem.
 * Skill `concord-sounds`.
 */
import {
  cleanSoundEmoji,
  SOUND_MAX_BYTES,
  SOUND_MAX_DURATION_MS,
  SOUND_NAME_MAX,
  type Sound,
  type SoundUploadResult
} from '@shared/types'
import { omit } from '../utils'
import { baseUrl, get, getSocket, requireSocket, resolveServerUrl, sessionToken, set, type AppSocket } from '../core'

// ---------- HTTP e áudio (substituídos nos testes) ----------

export interface SoundUploadArgs {
  serverUrl: string
  token: string
  file: Blob
  name: string
  emoji: string | null
}

async function postSound({ serverUrl, token, file, name, emoji }: SoundUploadArgs): Promise<Sound> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': file.type || 'application/octet-stream',
    'x-sound-name': encodeURIComponent(name)
  }
  if (emoji) headers['x-sound-emoji'] = encodeURIComponent(emoji)
  let res: Response
  try {
    res = await fetch(`${baseUrl(serverUrl)}/sounds`, { method: 'POST', headers, body: file })
  } catch {
    throw new Error('Falha de conexão no envio')
  }
  const body = (await res.json().catch(() => null)) as SoundUploadResult | null
  if (res.ok && body?.ok) return body.sound
  throw new Error(body && !body.ok ? body.error : `Falha no envio (${res.status})`)
}

/** Duração do áudio em ms, lida pelo próprio navegador (null = não deu para ler). */
function readDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (ms: number | null): void => {
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}

export const soundTransport = { send: postSound, duration: readDuration }

/** Toca um endereço de áudio uma vez (volume 0–1, saída escolhida ou a padrão). */
function playUrl(url: string, { volume, outputId }: { volume: number; outputId: string | null }): void {
  const audio = new Audio(url)
  audio.volume = Math.max(0, Math.min(1, volume))
  const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
  const start = (): void => void audio.play().catch((err: unknown) => console.warn('[sons] não foi possível tocar:', err))
  if (outputId && sink.setSinkId) void sink.setSinkId(outputId).then(start, start)
  else start()
}

export const soundOutput = { play: playUrl }

// ---------- Estado ----------

const byName = (a: Sound, b: Sound): number => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })

function upsertSound(sound: Sound): void {
  set((st) => ({ sounds: [...st.sounds.filter((s) => s.id !== sound.id), sound].sort(byName) }))
}

/** Timers que tiram o indicador "fulano tocou X" quando o som acaba (por conta). */
const playingTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearPlaying(): void {
  for (const t of playingTimers.values()) clearTimeout(t)
  playingTimers.clear()
  set({ soundsPlaying: {} })
}

export function bindSoundsEvents(s: AppSocket): void {
  clearPlaying() // conexão nova: nada tocando
  s.on('sound:created', (sound) => upsertSound(sound))
  s.on('sound:deleted', (soundId) => set((st) => ({ sounds: st.sounds.filter((x) => x.id !== soundId) })))
  s.on('sound:played', ({ channelId, soundId, by, accountId }) => {
    const st = get()
    // o servidor só manda para quem está na sala; confere de novo (posso ter trocado de sala no meio)
    if (st.myVoiceChannelId !== channelId) return
    const sound = st.sounds.find((x) => x.id === soundId)
    if (!sound) return
    // `by` é a conexão de quem tocou: o indicador mostra o nome (conexão que já saiu: o nome da conta, se eu a vejo)
    const who = st.users.find((u) => u.id === by)?.name ?? st.users.find((u) => u.accountId === accountId)?.name ?? 'Alguém'

    // indicador de quem tocou, até o som acabar
    const prev = playingTimers.get(accountId)
    if (prev) clearTimeout(prev)
    set((x) => ({ soundsPlaying: { ...x.soundsPlaying, [accountId]: { soundId, by: who, until: Date.now() + sound.durationMs } } }))
    playingTimers.set(
      accountId,
      setTimeout(() => {
        playingTimers.delete(accountId)
        set((x) => ({ soundsPlaying: omit(x.soundsPlaying, accountId) }))
      }, sound.durationMs)
    )

    // tocar aqui: sem deafen e sem ter silenciado essa pessoa (o volume dela vale para os sons)
    if (st.deafened || st.userMuted[accountId]) return
    const url = resolveServerUrl(sound.url, st.serverUrl)
    if (!url) return
    soundOutput.play(url, { volume: (st.userVolumes[accountId] ?? 1) * st.outputVolume, outputId: st.audioOutputId })
  })
}

// ---------- Ações ----------

/** Busca a coleção (depois do `hello`; os links vêm assinados para esta conta). */
export async function loadSounds(): Promise<void> {
  const s = getSocket()
  if (!s) return
  const sounds = await s.emitWithAck('sound:list')
  set({ sounds: [...sounds].sort(byName), soundsLoaded: true })
}

export function refreshSounds(): void {
  void loadSounds().catch(() => {})
}

/** Toca o som para todos na minha sala de voz. Lança `Error` com a mensagem do servidor. */
export async function playSound(soundId: string): Promise<void> {
  const channelId = get().myVoiceChannelId
  if (!channelId) throw new Error('Entre na sala de voz para tocar sons')
  const res = await requireSocket().emitWithAck('sound:play', { channelId, soundId })
  if (!res.ok) throw new Error(res.error)
}

/** Apaga o som da coleção (quem enviou ou quem gerencia mensagens). */
export async function deleteSound(soundId: string): Promise<void> {
  const res = await requireSocket().emitWithAck('sound:delete', soundId)
  if (!res.ok) throw new Error(res.error)
  set((st) => ({ sounds: st.sounds.filter((x) => x.id !== soundId) }))
}

/** Nome sugerido a partir do arquivo: sem a extensão, sem `_`/`-`, até o limite. */
export function soundNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SOUND_NAME_MAX)
}

/**
 * Confere o que dá para conferir antes de enviar (o servidor confere tudo de novo, inclusive o tipo
 * pelos bytes). Devolve o erro em português ou null.
 */
export async function checkSoundFile(file: Blob): Promise<string | null> {
  if (file.size > SOUND_MAX_BYTES) return 'O som pode ter no máximo 512 KB'
  const ms = await soundTransport.duration(file)
  if (ms === null) return 'Não foi possível ler esse áudio. Use MP3, OGG, WAV ou WebM.'
  if (ms > SOUND_MAX_DURATION_MS + 50) return 'O som pode ter no máximo 5 segundos'
  return null
}

/** Envia um som para a coleção. Lança `Error` com a mensagem (validação local ou do servidor). */
export async function uploadSound({ file, name, emoji }: { file: Blob; name: string; emoji?: string }): Promise<Sound> {
  const cleanName = name.replace(/\s+/g, ' ').trim()
  if (!cleanName || cleanName.length > SOUND_NAME_MAX) throw new Error(`O nome precisa ter de 1 a ${SOUND_NAME_MAX} caracteres`)
  const cleanEmoji = cleanSoundEmoji(emoji ?? '')
  if (cleanEmoji === undefined) throw new Error('Use no máximo um emoji (ou poucos caracteres)')
  const problem = await checkSoundFile(file)
  if (problem) throw new Error(problem)
  const { serverUrl } = get()
  const token = sessionToken()
  if (!serverUrl || !token) throw new Error('Não autenticado')
  const sound = await soundTransport.send({ serverUrl, token, file, name: cleanName, emoji: cleanEmoji })
  upsertSound(sound)
  return sound
}
