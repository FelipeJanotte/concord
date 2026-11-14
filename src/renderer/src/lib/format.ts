// Formatação de valores para a interface (pt-BR).

const units = ['B', 'KB', 'MB', 'GB']

/** Tamanho de arquivo legível: 512 B, 1,5 KB, 25 MB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${units[unit]}`
}
