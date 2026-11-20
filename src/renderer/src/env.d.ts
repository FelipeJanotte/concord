// Variáveis de build do renderer (Vite troca `import.meta.env.VITE_*` pelo valor no momento do build).
interface ImportMetaEnv {
  /** Endereço padrão do servidor na tela de login (ex.: https://concord.seudominio.com). Sem ela: localhost:3001. */
  readonly VITE_DEFAULT_SERVER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  api: import('@shared/desktop-api').DesktopApi
}
