import type { CSSProperties } from 'react'
import beastball from '@/assets/pokemon/balls/beastball.png'
import greatball from '@/assets/pokemon/balls/greatball.png'
import pokeball from '@/assets/pokemon/balls/pokeball.png'
import ultraball from '@/assets/pokemon/balls/ultraball.png'
import starArt from '@/assets/pokemon/star.png'
import { BALLS, type BallId } from '@shared/pokemon/items'
import { cn } from '@/lib/utils'
import type { BallThrow } from '@/store/pokemon'

const SHEETS: Record<BallId, string> = { pokeball, greatball, ultraball, beastball }
const STARS = ['px-star--left', 'px-star--up', 'px-star--right']
const pixelated = 'inline-block shrink-0 [image-rendering:pixelated]'

const frame = (ball: BallId, open: boolean): CSSProperties => ({
  backgroundImage: `url(${SHEETS[ball]})`,
  backgroundSize: '200% 100%',
  backgroundPosition: open ? '100% 0' : '0 0'
})

export function BallIcon({ ball, className }: { ball: BallId; className?: string }) {
  return <span aria-hidden data-ball={ball} className={cn(pixelated, 'size-6 align-middle', className)} style={frame(ball, false)} />
}

const LABELS: Record<BallThrow['result'], (ball: string) => string> = {
  shaking: (ball) => `${ball} balançando`,
  caught: (ball) => `${ball}: capturado!`,
  escaped: (ball) => `${ball} se abriu`
}

export function ThrownBall({ ball, result }: BallThrow) {
  return (
    <div role="img" aria-label={LABELS[result](BALLS[ball].label)} className="relative z-10 -mb-6 flex size-32 items-end justify-center">
      {result === 'escaped' && <span className="px-ball-flash absolute bottom-0 size-24" />}
      <span
        className={cn(pixelated, 'size-16', result === 'shaking' && 'px-ball-shake', result === 'caught' && 'brightness-50')}
        style={frame(ball, result === 'escaped')}
      />
      {result === 'caught' &&
        STARS.map((direction) => (
          <span key={direction} data-star className={cn(pixelated, 'px-star absolute bottom-6 size-6', direction)} style={{ backgroundImage: `url(${starArt})`, backgroundSize: '100% 100%' }} />
        ))}
    </div>
  )
}
