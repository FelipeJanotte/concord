// Temas prontos (v5): a galeria de "Configurações → Aparência". Cada um é só um ThemeConfig válido.
import { DEFAULT_THEME, type ThemeConfig } from '@shared/types'

export interface ThemePreset {
  id: string
  name: string
  theme: ThemeConfig
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'padrao', name: 'Padrão', theme: DEFAULT_THEME },
  {
    id: 'aurora',
    name: 'Aurora',
    theme: { base: 'escuro', accent: '#3ddc97', background: { stops: ['#0b3d3a', '#1d6b5c', '#5b2a86'], angle: 160 }, intensity: 70 }
  },
  {
    id: 'por-do-sol',
    name: 'Pôr do sol',
    theme: { base: 'escuro', accent: '#ff7a45', background: { stops: ['#4a1942', '#c0392b', '#f39c12'], angle: 200 }, intensity: 65 }
  },
  {
    id: 'oceano',
    name: 'Oceano',
    theme: { base: 'escuro', accent: '#38bdf8', background: { stops: ['#0c2a4a', '#0e5a8a', '#1fa2b8'], angle: 180 }, intensity: 70 }
  },
  {
    id: 'floresta',
    name: 'Floresta',
    theme: { base: 'escuro', accent: '#7bc96f', background: { stops: ['#1b3022', '#2f5233', '#4f7942'], angle: 145 }, intensity: 65 }
  },
  {
    id: 'neon',
    name: 'Neon',
    theme: { base: 'escuro', accent: '#ff2bd6', background: { stops: ['#12002f', '#3a0ca3', '#f72585'], angle: 125 }, intensity: 75 }
  },
  {
    id: 'grafite',
    name: 'Grafite',
    theme: { base: 'escuro', accent: '#a3a3a3', background: { stops: ['#1c1c1e', '#3a3a3c'], angle: 180 }, intensity: 60 }
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    theme: { base: 'escuro', accent: '#b197fc', background: { stops: ['#2b2140', '#5f3dc4', '#9775fa'], angle: 170 }, intensity: 60 }
  },
  {
    id: 'cereja',
    name: 'Cereja',
    theme: { base: 'escuro', accent: '#ff4d6d', background: { stops: ['#2d0a14', '#7a1131', '#c9184a'], angle: 190 }, intensity: 65 }
  },
  {
    id: 'claro',
    name: 'Claro',
    theme: { base: 'claro', accent: '#5865f2', background: { stops: ['#ffffff'], angle: 180 }, intensity: 0 }
  },
  {
    id: 'amanhecer',
    name: 'Amanhecer',
    theme: { base: 'claro', accent: '#d9480f', background: { stops: ['#ffe8cc', '#ffc9c9', '#d0bfff'], angle: 160 }, intensity: 70 }
  },
  // translúcidos: a área de trabalho aparece desfocada atrás (onde o sistema não tem o efeito, ficam opacos)
  {
    id: 'vidro',
    name: 'Vidro',
    theme: { base: 'escuro', accent: '#7aa2ff', background: { stops: ['#1b2440', '#3b2f63'], angle: 150 }, intensity: 45, translucent: true }
  },
  {
    id: 'vidro-claro',
    name: 'Vidro claro',
    theme: { base: 'claro', accent: '#2f6feb', background: { stops: ['#dbeafe', '#ede9fe'], angle: 150 }, intensity: 45, translucent: true }
  }
]
