/**
 * Notificações (B9): liga os eventos às notificações nativas e mantém o selo do ícone em dia.
 * As regras (quando avisar, número do selo) ficam em `lib/notifications.ts`. A ponte com o
 * processo principal (`window.api.notifications`) e o "a janela está em foco?" ficam em
 * `notificationEnv`, que os testes substituem. Fora do Electron (navegador), não faz nada.
 */
import type { Message } from '@shared/types'
import type { NativeNotification, NotificationsBridge, NotificationTarget } from '@shared/notifications'
import { useApp, type ChannelNotifyMode } from '@/store'
import { NOTIFICATION_SOUND_KINDS, type NotificationSoundKind } from '@/store/notifications'
import { badgeCount, callNotification, drawBadge, friendRequestNotification, friendRequestSound, messageNotification, messageSound } from '../notifications'
import { ChimePlayer } from '../sounds/chime'
import { get, set, type AppSocket } from '../core'
import { selectTextChannel } from './channels'
import { isChatOnScreen, openDmChat, openVoiceChat, showFriends } from './navigation'

const notificationChimes = new ChimePlayer()

export const notificationEnv = {
  bridge: (): NotificationsBridge | null => (typeof window !== 'undefined' ? (window.api?.notifications ?? null) : null),
  isFocused: (): boolean => typeof document !== 'undefined' && document.hasFocus(),
  playSound: (kind: NotificationSoundKind, opts: { volume: number; outputId: string | null }): void => {
    notificationChimes.play(`notify-${kind}`, opts)
  }
}

function playSound(kind: NotificationSoundKind | null): boolean {
  if (!kind) return false
  const st = get()
  notificationEnv.playSound(kind, { volume: st.outputVolume, outputId: st.audioOutputId })
  return true
}

function show(n: NativeNotification | null, soundPlayed = false): void {
  if (!n || !get().notificationsEnabled) return
  notificationEnv.bridge()?.show(soundPlayed ? { ...n, silent: true } : n)
}

/** Clique numa notificação: abre a conversa ou a tela de amigos. */
export function openNotificationTarget(target: NotificationTarget | null): void {
  if (!target) return
  if (target.kind === 'friends') showFriends()
  // menção num canal da comunidade (B19): abre o canal, se eu ainda vejo
  else if (target.kind === 'channel') {
    const channel = get().channels.find((c) => c.id === target.channelId)
    if (channel?.type === 'text') selectTextChannel(channel.id)
    // chat da sala de voz: abre a sala com o painel "Chat"
    else if (channel?.type === 'voice') openVoiceChat(channel.id)
  } else if (get().dms.some((d) => d.channel.id === target.channelId)) openDmChat(target.channelId)
}

let lastBadge = -1
/** Manda o número (e a imagem, no Windows) só quando muda. */
export function syncBadge(): void {
  const count = get().notificationsEnabled ? badgeCount(get()) : 0
  if (count === lastBadge) return
  lastBadge = count
  notificationEnv.bridge()?.setBadge(count, drawBadge(count))
}

let stopBadge: (() => void) | null = null
let stopClick: (() => void) | null = null

/** Para de acompanhar (sair da conta) e zera o selo. */
export function stopNotifications(): void {
  stopBadge?.()
  stopClick?.()
  stopBadge = stopClick = null
  lastBadge = -1
  notificationEnv.bridge()?.setBadge(0, null)
}

function onMessage(message: Message): void {
  const st = get()
  const focused = notificationEnv.isFocused()
  const soundPlayed = playSound(messageSound(message, st, focused && isChatOnScreen(st, message.channelId)))
  show(messageNotification(message, st, focused), soundPlayed)
}

export function bindNotificationEvents(s: AppSocket): void {
  const announcedRequests = new Set<string>()

  s.on('message:new', onMessage)
  s.on('call:updated', (call) => show(callNotification(call, get(), notificationEnv.isFocused())))
  s.on('friend:updated', (entry) => {
    if (entry.status !== 'incoming') return void announcedRequests.delete(entry.account.id)
    if (announcedRequests.has(entry.account.id)) return
    announcedRequests.add(entry.account.id)
    const soundPlayed = playSound(friendRequestSound(entry, get()))
    show(friendRequestNotification(entry, notificationEnv.isFocused()), soundPlayed)
  })

  if (!stopBadge) {
    stopBadge = useApp.subscribe(syncBadge)
    syncBadge()
  }
  if (!stopClick) stopClick = notificationEnv.bridge()?.onClick(openNotificationTarget) ?? null
}

const STORAGE_KEY = 'concord:notifications'
const MODES: readonly ChannelNotifyMode[] = ['all', 'mentions', 'none']

interface SavedPreferences {
  channels?: unknown
  enabled?: unknown
  sounds?: Partial<Record<NotificationSoundKind, unknown>>
}

function readSaved(): SavedPreferences {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as SavedPreferences) : {}
  } catch {
    return {}
  }
}

function savePreferences(): void {
  const { channelNotifications, notificationsEnabled, notificationSounds } = get()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ channels: channelNotifications, enabled: notificationsEnabled, sounds: notificationSounds }))
  } catch (err) {
    console.warn('[notificações] não foi possível salvar a preferência:', err)
  }
}

const savedFlag = (value: unknown): boolean => (typeof value === 'boolean' ? value : true)

export function loadNotificationPreferences(): void {
  const saved = readSaved()
  const sounds = saved.sounds && typeof saved.sounds === 'object' ? saved.sounds : {}
  set({
    channelNotifications: MODES.includes(saved.channels as ChannelNotifyMode) ? (saved.channels as ChannelNotifyMode) : 'all',
    notificationsEnabled: savedFlag(saved.enabled),
    notificationSounds: { dm: savedFlag(sounds.dm), mention: savedFlag(sounds.mention), friend: savedFlag(sounds.friend) }
  })
}

loadNotificationPreferences()

export function setChannelNotifications(mode: ChannelNotifyMode): void {
  if (!MODES.includes(mode)) return
  set({ channelNotifications: mode })
  savePreferences()
}

export function setNotificationsEnabled(enabled: boolean): void {
  set({ notificationsEnabled: enabled })
  savePreferences()
}

export function setNotificationSound(kind: NotificationSoundKind, enabled: boolean): void {
  if (!NOTIFICATION_SOUND_KINDS.includes(kind)) return
  set({ notificationSounds: { ...get().notificationSounds, [kind]: enabled } })
  savePreferences()
}
