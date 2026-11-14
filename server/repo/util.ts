// Utilidades do repo.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids vindos do cliente são conferidos antes de ir ao banco: uma coluna uuid
 * recusaria o texto com erro, e "não existe" é a resposta certa.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Erro de valor repetido (e-mail, id, nome de canal...). `field` diz qual. */
export class DuplicateError extends Error {
  constructor(readonly field: string) {
    super(`valor repetido: ${field}`)
  }
}
