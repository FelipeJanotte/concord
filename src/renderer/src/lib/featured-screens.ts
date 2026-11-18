import type { VoiceState } from '@shared/types'

export function featuredScreens(screens: string[], chosen: string[]): string[] {
  return chosen.filter((id) => screens.includes(id))
}

export function watchedScreens(featured: string[], selfId: string | undefined): string[] {
  return featured.filter((id) => id !== selfId)
}

export function toggleFeatured(featured: string[], id: string): string[] {
  if (!featured.includes(id)) return [...featured, id]
  return featured.filter((other) => other !== id)
}

export function moveScreen(order: string[], dragged: string, target: string): string[] {
  const targetIndex = order.indexOf(target)
  if (dragged === target || targetIndex === -1 || !order.includes(dragged)) return order
  const rest = order.filter((id) => id !== dragged)
  return [...rest.slice(0, targetIndex), dragged, ...rest.slice(targetIndex)]
}

export function screenViewers(voice: VoiceState[], screenId: string): string[] {
  return voice.filter((v) => v.watching?.includes(screenId)).map((v) => v.userId)
}
