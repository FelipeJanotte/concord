import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, type LucideIcon } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THUMBAR_ICON_SIZE } from '@shared/thumbar'

const ICONS = {
  mic: { Icon: Mic, alert: false },
  micOff: { Icon: MicOff, alert: true },
  headphones: { Icon: Headphones, alert: false },
  headphonesOff: { Icon: HeadphoneOff, alert: true },
  leave: { Icon: PhoneOff, alert: true }
} satisfies Record<string, { Icon: LucideIcon; alert: boolean }>

export type ThumbarIcon = keyof typeof ICONS
export type ThumbarIcons = Record<ThumbarIcon, string>

const NORMAL_COLOR = 'white'
const ALERT_FALLBACK_COLOR = 'red'

export function thumbarIconSvg(icon: ThumbarIcon, color: string): string {
  const { Icon } = ICONS[icon]
  return renderToStaticMarkup(<Icon xmlns="http://www.w3.org/2000/svg" size={THUMBAR_ICON_SIZE} color={color} />)
}

async function rasterize(svg: string): Promise<string> {
  const image = new Image(THUMBAR_ICON_SIZE, THUMBAR_ICON_SIZE)
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = THUMBAR_ICON_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponível')
  ctx.drawImage(image, 0, 0, THUMBAR_ICON_SIZE, THUMBAR_ICON_SIZE)
  return canvas.toDataURL('image/png')
}

export async function drawThumbarIcons(): Promise<ThumbarIcons | null> {
  if (typeof document === 'undefined') return null
  const alertColor = getComputedStyle(document.documentElement).getPropertyValue('--destructive').trim() || ALERT_FALLBACK_COLOR
  try {
    const entries = await Promise.all(
      (Object.keys(ICONS) as ThumbarIcon[]).map(async (icon) => {
        const color = ICONS[icon].alert ? alertColor : NORMAL_COLOR
        return [icon, await rasterize(thumbarIconSvg(icon, color))] as const
      })
    )
    return Object.fromEntries(entries) as ThumbarIcons
  } catch {
    return null
  }
}
