export function featuredScreens(screens: string[], selfId: string | undefined, chosen: string[], grid: boolean): string[] {
  if (grid || screens.length === 0) return []
  const live = chosen.filter((id) => screens.includes(id))
  if (live.length > 0) return live
  return [screens.find((id) => id !== selfId) ?? screens[0]]
}

export function toggleFeatured(featured: string[], id: string): string[] {
  if (!featured.includes(id)) return [...featured, id]
  if (featured.length === 1) return featured
  return featured.filter((other) => other !== id)
}

export function moveScreen(order: string[], dragged: string, target: string): string[] {
  const targetIndex = order.indexOf(target)
  if (dragged === target || targetIndex === -1 || !order.includes(dragged)) return order
  const rest = order.filter((id) => id !== dragged)
  return [...rest.slice(0, targetIndex), dragged, ...rest.slice(targetIndex)]
}
