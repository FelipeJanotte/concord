export interface Page<T> {
  items: T[]
  page: number
  pages: number
  start: number
}

export function paginate<T>(items: T[], page: number, perPage: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(pages, Math.max(1, page))
  const start = (current - 1) * perPage
  return { items: items.slice(start, start + perPage), page: current, pages, start }
}
