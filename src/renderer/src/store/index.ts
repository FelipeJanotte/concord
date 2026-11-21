import { create } from 'zustand'
import { callsInitial, type CallsState } from './calls'
import { channelsInitial, type ChannelsState } from './channels'
import { devicesInitial, type DevicesState } from './devices'
import { friendsInitial, type FriendsState } from './friends'
import { preferencesInitial, type PreferencesState } from './preferences'
import { toolsInitial, type ToolsState } from './tools'
import { navigationInitial, type NavigationState } from './navigation'
import { notificationsInitial, type NotificationsState } from './notifications'
import { overlayInitial, type OverlayState } from './overlay'
import { messagesInitial, type MessagesState } from './messages'
import { moderationInitial, type ModerationState } from './moderation'
import { musicInitial, type MusicSliceState } from './music'
import { playlistsInitial, type PlaylistsState } from './playlists'
import { pushToTalkInitial, type PushToTalkState } from './push-to-talk'
import { permissionsInitial, type PermissionsState } from './permissions'
import { searchInitial, type SearchState } from './search'
import { screenPipInitial, type ScreenPipState } from './screen-pip'
import { sessionInitial, type SessionState } from './session'
import { settingsInitial, type SettingsState } from './settings'
import { soundsInitial, type SoundsState } from './sounds'
import { startupInitial, type StartupState } from './startup'
import { updatesInitial, type UpdatesState } from './updates'
import { windowInitial, type WindowState } from './window'
import { uploadsInitial, type UploadsState } from './uploads'
import { voiceInitial, type VoiceSliceState } from './voice'

export type { View } from './channels'
export type { HomeView, Section } from './navigation'
export type { TypingEntry } from './messages'
export type { ConnectionStatus, Notice } from './session'
export type { PendingUpload } from './uploads'
export type { PlayingSound } from './sounds'
export type { ChannelNotifyMode } from './notifications'
export type { SettingsSection } from './settings'

export interface AppState extends SessionState, ChannelsState, MessagesState, UploadsState, VoiceSliceState, DevicesState, PermissionsState, FriendsState, ToolsState, PreferencesState, NavigationState, CallsState, SoundsState, MusicSliceState, PlaylistsState, OverlayState, UpdatesState, PushToTalkState, NotificationsState, SettingsState, StartupState, WindowState, ModerationState, SearchState, ScreenPipState {}

export const initialState: AppState = {
  ...sessionInitial,
  ...channelsInitial,
  ...messagesInitial,
  ...uploadsInitial,
  ...voiceInitial,
  ...notificationsInitial,
  ...devicesInitial,
  ...permissionsInitial,
  ...friendsInitial,
  ...toolsInitial,
  ...preferencesInitial,
  ...navigationInitial,
  ...callsInitial,
  ...soundsInitial,
  ...musicInitial,
  ...playlistsInitial,
  ...overlayInitial,
  ...updatesInitial,
  ...windowInitial,
  ...pushToTalkInitial,
  ...settingsInitial,
  ...startupInitial,
  ...screenPipInitial,
  ...moderationInitial,
  ...searchInitial
}

export const useApp = create<AppState>()(() => initialState)
