/**
 * Endereço padrão do servidor na tela de login. Vem da variável de build `VITE_DEFAULT_SERVER` (ex.: no site da
 * Vercel ou num instalador para os amigos), para ninguém precisar clicar em "alterar". Sem ela, ou com um valor que
 * não é um endereço http(s), fica o servidor local de desenvolvimento. Skill `concord-deploy` ("Versão web na Vercel").
 */
export const LOCAL_SERVER = 'http://localhost:3001'

export function defaultServerUrl(raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) return LOCAL_SERVER
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return LOCAL_SERVER
    // só a origem: caminho, barra final, busca e âncora não fazem parte do endereço do servidor
    return url.origin
  } catch {
    return LOCAL_SERVER
  }
}
