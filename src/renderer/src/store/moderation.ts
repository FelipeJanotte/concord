export interface ModerationState {
  timeouts: Record<string, number>
}

export const moderationInitial: ModerationState = {
  timeouts: {}
}
