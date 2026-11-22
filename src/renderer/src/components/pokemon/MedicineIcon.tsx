import hyperPotion from '@/assets/pokemon/medicine/hyper-potion.png'
import maxPotion from '@/assets/pokemon/medicine/max-potion.png'
import maxRevive from '@/assets/pokemon/medicine/max-revive.png'
import potion from '@/assets/pokemon/medicine/potion.png'
import revive from '@/assets/pokemon/medicine/revive.png'
import superPotion from '@/assets/pokemon/medicine/super-potion.png'
import type { PotionId, ReviveId } from '@shared/pokemon/items'
import { cn } from '@/lib/utils'

export type MedicineId = PotionId | ReviveId

const ART: Record<MedicineId, string> = {
  potion,
  'super-potion': superPotion,
  'hyper-potion': hyperPotion,
  'max-potion': maxPotion,
  revive,
  'max-revive': maxRevive
}

export const isMedicine = (id: string): id is MedicineId => Object.hasOwn(ART, id)

export function MedicineIcon({ item, className }: { item: MedicineId; className?: string }) {
  return <img src={ART[item]} alt="" aria-hidden data-medicine={item} className={cn('inline-block size-6 shrink-0 align-middle [image-rendering:pixelated]', className)} />
}
