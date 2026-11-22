import { useEffect, useState, type CSSProperties } from 'react'
import type { Dir, Pos } from '@shared/pokemon/map'
import { DEFAULT_LOOK } from '@shared/pokemon/trainers'
import female1 from '@/assets/pokemon/trainers/female-1.png'
import female2 from '@/assets/pokemon/trainers/female-2.png'
import female3 from '@/assets/pokemon/trainers/female-3.png'
import female4 from '@/assets/pokemon/trainers/female-4.png'
import male1 from '@/assets/pokemon/trainers/male-1.png'
import male2 from '@/assets/pokemon/trainers/male-2.png'
import male3 from '@/assets/pokemon/trainers/male-3.png'
import male4 from '@/assets/pokemon/trainers/male-4.png'
import { cn } from '@/lib/utils'

const SHEETS: Record<string, string> = {
  'male-1': male1,
  'male-2': male2,
  'male-3': male3,
  'male-4': male4,
  'female-1': female1,
  'female-2': female2,
  'female-3': female3,
  'female-4': female4
}
const sheetOf = (look: string) => SHEETS[look] ?? SHEETS[DEFAULT_LOOK]

const ROWS: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 }
const FRAMES = 4
const STEP_MS = 70

export function TrainerSprite({ look, facing = 'down', frame = 0, className, style }: { look: string; facing?: Dir; frame?: number; className?: string; style?: CSSProperties }) {
  return (
    <div
      data-look={look}
      data-facing={facing}
      className={cn('[image-rendering:pixelated]', className)}
      style={{
        backgroundImage: `url(${sheetOf(look)})`,
        backgroundSize: `${FRAMES * 100}% ${FRAMES * 100}%`,
        backgroundPosition: `${(frame * 100) / (FRAMES - 1)}% ${(ROWS[facing] * 100) / (FRAMES - 1)}%`,
        ...style
      }}
    />
  )
}

export function useStepFrame(pos: Pos | undefined): number {
  const [frame, setFrame] = useState(0)
  const key = pos ? `${pos.x},${pos.y}` : ''
  useEffect(() => {
    if (!key) return
    let step = 1
    setFrame(step)
    const timer = setInterval(() => {
      step += 1
      if (step >= FRAMES) {
        clearInterval(timer)
        setFrame(0)
      } else setFrame(step)
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [key])
  return frame
}
