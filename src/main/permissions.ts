/**
 * Permissões que a página pode pedir ao Electron (`setPermissionRequestHandler`). Tudo o que não está
 * aqui é negado. `fullscreen` é a da tela cheia (`requestFullscreen`, ver a tela compartilhada): sem
 * ela o botão "Tela cheia" não fazia nada.
 */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'media', // microfone, câmera (voz e B21)
  'notifications', // B9
  'fullscreen' // tela cheia da tela compartilhada
])

export function allowPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}
