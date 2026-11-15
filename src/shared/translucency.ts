// Tema translúcido (vidro): a janela usa o material do sistema por trás da página transparente.
// Windows 11 22H2+ (build 22621): `setBackgroundMaterial('acrylic')`; macOS: `setVibrancy`. Nos outros
// (Windows 10, Linux) uma página transparente mostraria preto atrás: o app fica com o tema opaco.

/** Primeira versão do Windows 11 com `backgroundMaterial` (22H2). */
export const WINDOWS_ACRYLIC_BUILD = 22621

/** O sistema tem o efeito de vidro? `release` = `os.release()` (no Windows, "10.0.<build>"). */
export function supportsTranslucency(platform: string, release: string): boolean {
  if (platform === 'darwin') return true
  if (platform !== 'win32') return false
  const build = Number(release.split('.')[2])
  return Number.isFinite(build) && build >= WINDOWS_ACRYLIC_BUILD
}

/** Ponte da janela principal (preload: `window.api.translucency`). */
export interface TranslucencyBridge {
  /** o sistema tem o efeito (decidido uma vez, no preload) */
  supported: boolean
  /** liga/desliga o vidro da janela */
  set: (on: boolean) => void
}
