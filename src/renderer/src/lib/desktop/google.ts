import type { GoogleSignInResult } from '@shared/desktop-api'
import { command } from './ipc'

export const googleSignIn = (clientId: string): Promise<GoogleSignInResult> =>
  command<GoogleSignInResult>('google-sign-in', { clientId })
