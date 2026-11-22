import { useEffect, useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Field, FieldLabel } from '@ui-sdk/react/field'
import { NumberInput, NumberInputControl, NumberInputGroup } from '@ui-sdk/react/number-input'
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs'
import { ChevronDown } from 'lucide-react'
import { MARKET_PRICE_MAX, type MarketListing, type SellRequest } from '@shared/types'
import { displayName } from '@shared/pokemon/game'
import { itemDescription, itemLabel, itemPrice, MARKET } from '@shared/pokemon/items'
import { buyListing, buyPokemonItem, cancelListing, loadListings, sellOnMarket } from '@/lib/client'
import { useApp } from '@/store'
import { ItemIcon } from './ItemIcon'
import { FIELD_INPUT, PRIMARY_BUTTON, QUIET_BUTTON, SELECT_CONTENT, SELECT_ITEM, SELECT_TRIGGER, TAB, TAB_LIST } from './styles'

const MARKET_TABS = [
  { value: 'ball', label: 'Pokébolas' },
  { value: 'potion', label: 'Poções' },
  { value: 'hold', label: 'Hold Items' }
] as const

const money = (value: number) => `₽${value.toLocaleString('pt-BR')}`

function MarketItem({ id }: { id: string }) {
  const wallet = useApp((s) => s.pokemonGame?.money ?? 0)
  const busy = useApp((s) => s.pokemonBusy)
  const price = itemPrice(id)!
  const description = itemDescription(id)
  return (
    <li className="px-window flex items-center gap-3 p-2">
      <ItemIcon item={id} />
      <div className="min-w-0 flex-1">
        <div className="font-bold">{itemLabel(id)}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <span className="text-sm">{money(price)}</span>
      {[1, 10].map((quantity) => (
        <Button
          key={quantity}
          aria-label={`Comprar ${quantity} ${itemLabel(id)}`}
          disabled={busy || wallet < price * quantity}
          onClick={() => void buyPokemonItem(id, quantity)}
          className={PRIMARY_BUTTON}
        >
          x{quantity}
        </Button>
      ))}
    </li>
  )
}

function Market() {
  return (
    <Tabs defaultValue="ball" className="flex flex-col gap-3">
      <TabsList aria-label="Categorias" className={TAB_LIST}>
        {MARKET_TABS.map((t) => (
          <TabsTab key={t.value} value={t.value} className={TAB}>
            {t.label}
          </TabsTab>
        ))}
      </TabsList>
      {MARKET_TABS.map((t) => (
        <TabsPanel key={t.value} value={t.value}>
          <ul className="flex flex-col gap-2">
            {MARKET[t.value].map((id) => (
              <MarketItem key={id} id={id} />
            ))}
          </ul>
        </TabsPanel>
      ))}
    </Tabs>
  )
}

function listingTitle(listing: MarketListing): string {
  if (listing.mon) return `${displayName(listing.mon)} Nv. ${listing.mon.level}`
  return `${itemLabel(listing.item!)} x${listing.quantity}`
}

function ListingRow({ listing }: { listing: MarketListing }) {
  const mine = useApp((s) => s.self?.accountId === listing.seller.accountId)
  const wallet = useApp((s) => s.pokemonGame?.money ?? 0)
  const busy = useApp((s) => s.pokemonBusy)
  return (
    <li className="px-window flex items-center gap-3 p-2">
      {listing.mon && <img src={listing.mon.species.sprite} alt="" className="size-10" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-bold">
          {listing.item && <ItemIcon item={listing.item} />}
          {listingTitle(listing)}
        </div>
        <div className="text-xs text-muted-foreground">por {listing.seller.name}</div>
      </div>
      <span className="text-sm">{money(listing.price)}</span>
      {mine ? (
        <Button className={QUIET_BUTTON} disabled={busy} onClick={() => void cancelListing(listing.id)}>
          Cancelar
        </Button>
      ) : (
        <Button className={PRIMARY_BUTTON} disabled={busy || wallet < listing.price} onClick={() => void buyListing(listing.id)}>
          Comprar
        </Button>
      )}
    </li>
  )
}

function SellForm() {
  const game = useApp((s) => s.pokemonGame)!
  const busy = useApp((s) => s.pokemonBusy)
  const [choice, setChoice] = useState<string | null>(null)
  const [quantity, setQuantity] = useState<number | null>(1)
  const [price, setPrice] = useState<number | null>(100)
  const items = Object.entries(game.bag).filter(([, count]) => count > 0)
  const mons = [...game.team.slice(game.team.length > 1 ? 0 : 1), ...game.pc]
  const isItem = choice?.startsWith('item:') ?? false

  function submit() {
    if (!choice || !price) return
    const [kind, id] = [choice.slice(0, choice.indexOf(':')), choice.slice(choice.indexOf(':') + 1)]
    const request: SellRequest = kind === 'item' ? { kind: 'item', item: id, quantity: quantity ?? 1, price } : { kind: 'mon', uid: id, price }
    void sellOnMarket(request).then((res) => res.ok && setChoice(null))
  }

  return (
    <form
      aria-label="Anunciar"
      className="px-window px-window--deep grid items-end gap-2 p-3 md:grid-cols-[2fr_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Select<string> value={choice} onValueChange={setChoice} placeholder="Escolha um item ou pokémon">
        <div className="space-y-1">
          <SelectLabel className="text-xs font-medium text-muted-foreground">O que vender</SelectLabel>
          <SelectTrigger className={SELECT_TRIGGER}>
            <SelectValue />
            <ChevronDown aria-hidden />
          </SelectTrigger>
        </div>
        <SelectContent className={SELECT_CONTENT}>
          {items.map(([id, count]) => (
            <SelectItem key={id} value={`item:${id}`} label={`${itemLabel(id)} (${count})`} className={SELECT_ITEM}>
              {itemLabel(id)} ({count})
            </SelectItem>
          ))}
          {mons.map((m) => (
            <SelectItem key={m.uid} value={`mon:${m.uid}`} label={`${displayName(m)} Nv. ${m.level}`} className={SELECT_ITEM}>
              {displayName(m)} Nv. {m.level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Field className="space-y-1">
        <FieldLabel className="text-xs font-medium text-muted-foreground">Quantidade</FieldLabel>
        <NumberInput value={quantity} onValueChange={setQuantity} min={1} disabled={!isItem}>
          <NumberInputGroup>
            <NumberInputControl className={FIELD_INPUT} />
          </NumberInputGroup>
        </NumberInput>
      </Field>
      <Field className="space-y-1">
        <FieldLabel className="text-xs font-medium text-muted-foreground">Preço (₽)</FieldLabel>
        <NumberInput value={price} onValueChange={setPrice} min={1} max={MARKET_PRICE_MAX}>
          <NumberInputGroup>
            <NumberInputControl className={FIELD_INPUT} />
          </NumberInputGroup>
        </NumberInput>
      </Field>
      <Button type="submit" className={PRIMARY_BUTTON} disabled={busy || !choice || !price}>
        Anunciar
      </Button>
    </form>
  )
}

function Rmt() {
  const listings = useApp((s) => s.pokemonListings)
  useEffect(() => {
    void loadListings()
  }, [])
  return (
    <div className="flex flex-col gap-3">
      <SellForm />
      {listings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anúncio ainda.</p>
      ) : (
        <ul aria-label="Anúncios" className="flex flex-col gap-2">
          {listings.map((l) => (
            <ListingRow key={l.id} listing={l} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function ShopScreen() {
  return (
    <Tabs defaultValue="market" className="flex w-full flex-col gap-3">
      <TabsList aria-label="Shop" className={TAB_LIST}>
        <TabsTab value="market" className={TAB}>
          Market
        </TabsTab>
        <TabsTab value="rmt" className={TAB}>
          RMT
        </TabsTab>
      </TabsList>
      <TabsPanel value="market">
        <Market />
      </TabsPanel>
      <TabsPanel value="rmt">
        <Rmt />
      </TabsPanel>
    </Tabs>
  )
}
