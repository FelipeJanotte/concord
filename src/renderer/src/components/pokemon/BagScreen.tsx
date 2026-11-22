import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { ChevronDown } from 'lucide-react'
import { displayName, type Mon } from '@shared/pokemon/game'
import { isHoldItem, itemCategory, itemDescription, itemLabel, type ItemCategory } from '@shared/pokemon/items'
import { holdPokemonItem } from '@/lib/client'
import { useApp } from '@/store'
import { ItemIcon } from './ItemIcon'
import { SELECT_CONTENT, SELECT_ITEM, SELECT_TRIGGER } from './styles'

const SECTIONS: { category: ItemCategory; title: string }[] = [
  { category: 'ball', title: 'Pokébolas' },
  { category: 'potion', title: 'Poções' },
  { category: 'revive', title: 'Reviver' },
  { category: 'hold', title: 'Hold Items' },
  { category: 'stone', title: 'Pedras de evolução' }
]
const NONE = 'none'

function HeldItemSelect({ mon, owned }: { mon: Mon; owned: string[] }) {
  const options = [...new Set([...(mon.heldItem ? [mon.heldItem] : []), ...owned])]
  return (
    <Select<string> value={mon.heldItem ?? NONE} onValueChange={(next) => next && void holdPokemonItem(mon.uid, next === NONE ? null : next)}>
      <div className="space-y-1">
        <SelectLabel className="text-xs font-medium text-muted-foreground">{displayName(mon)} segura</SelectLabel>
        <SelectTrigger className={SELECT_TRIGGER}>
          <SelectValue />
          <ChevronDown aria-hidden />
        </SelectTrigger>
      </div>
      <SelectContent className={SELECT_CONTENT}>
        <SelectItem value={NONE} label="Nada" className={SELECT_ITEM}>
          Nada
        </SelectItem>
        {options.map((id) => (
          <SelectItem key={id} value={id} label={itemLabel(id)} className={SELECT_ITEM}>
            {itemLabel(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function BagScreen() {
  const game = useApp((s) => s.pokemonGame)!
  const owned = Object.entries(game.bag).filter(([, count]) => count > 0)
  const holdable = owned.map(([id]) => id).filter(isHoldItem)
  return (
    <div className="flex w-full flex-col gap-4">
      {SECTIONS.map(({ category, title }) => {
        const items = owned.filter(([id]) => itemCategory(id) === category)
        return (
          <section key={category} aria-label={title} className="px-window flex flex-col gap-2 p-3">
            <h3 className="px-title text-sm">{title}</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum.</p>
            ) : (
              <ul className="flex flex-wrap gap-2 text-sm">
                {items.map(([id, count]) => (
                  <li key={id} className="px-window flex items-center gap-1 px-2 py-1" title={itemDescription(id) ?? undefined}>
                    <ItemIcon item={id} />
                    {itemLabel(id)} x{count}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      <section aria-label="Itens segurados" className="px-window flex flex-col gap-2 p-3">
        <h3 className="px-title text-sm">Itens segurados pela equipe</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {game.team.map((m) => (
            <HeldItemSelect key={m.uid} mon={m} owned={holdable} />
          ))}
        </div>
      </section>
    </div>
  )
}
