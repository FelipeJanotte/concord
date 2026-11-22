import { isBall } from '@shared/pokemon/items'
import { BallIcon } from './BallSprite'
import { isMedicine, MedicineIcon } from './MedicineIcon'
import { StoneIcon } from './StoneIcon'

export function ItemIcon({ item }: { item: string }) {
  if (isBall(item)) return <BallIcon ball={item} />
  if (isMedicine(item)) return <MedicineIcon item={item} />
  return <StoneIcon item={item} />
}
