// Ferramentas do grupo (v4): o que só esta conta sabe sobre as enquetes (os próprios votos).
export interface ToolsState {
  /** id da mensagem da enquete → índices que eu marquei (ausente = não votei ou ainda não carregou) */
  myPollVotes: Record<string, number[]>
}

export const toolsInitial: ToolsState = {
  myPollVotes: {}
}
