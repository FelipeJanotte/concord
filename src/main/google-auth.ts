/**
 * Login com Google no processo main: fluxo OAuth 2.0 para apps instalados
 * (navegador do sistema + redirecionamento loopback 127.0.0.1 + PKCE).
 * Só devolve o código; quem troca pelo token é o servidor do Concord,
 * que guarda o client secret.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'

export interface GoogleCode {
  code: string
  codeVerifier: string
  redirectUri: string
}

const TIMEOUT_MS = 3 * 60 * 1000

const page = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Concord</title>
<body style="font-family:system-ui;background:#1e1f22;color:#dbdee1;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#fff">${title}</h1><p>${text}</p></div></body>`

export function googleSignIn(clientId: string): Promise<GoogleCode> {
  const codeVerifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  return new Promise((resolve, reject) => {
    let redirectUri = ''
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      if (url.searchParams.get('state') !== state || (!code && !error)) {
        res.end(page('Algo deu errado', 'Volte ao Concord e tente de novo.'))
        return finish(new Error('Resposta inválida do Google'))
      }
      if (error || !code) {
        res.end(page('Login cancelado', 'Você pode fechar esta aba.'))
        return finish(new Error(error === 'access_denied' ? 'Login com Google cancelado' : `Google: ${error}`))
      }
      res.end(page('Pronto!', 'Login feito. Pode fechar esta aba e voltar ao Concord.'))
      finish(null, { code, codeVerifier, redirectUri })
    })

    const timer = setTimeout(() => finish(new Error('Tempo esgotado para o login com Google')), TIMEOUT_MS)

    function finish(err: Error | null, value?: GoogleCode): void {
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve(value!)
    }

    server.on('error', (err) => finish(err))
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account'
      }).toString()
      void shell.openExternal(auth.toString())
    })
  })
}
