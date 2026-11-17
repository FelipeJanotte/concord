import { AtSign, Users } from 'lucide-react'
import { MENTION_EVERYONE } from '@shared/types'
import type { MentionCandidate } from '@/lib/mentions'
import { SuggestionList } from './SuggestionList'

export function MentionMenu({
  items,
  active,
  onPick
}: {
  items: MentionCandidate[]
  active: number
  onPick: (item: MentionCandidate) => void
}) {
  return (
    <SuggestionList label="Mencionar" items={items} active={active} keyOf={(item) => item.id} onPick={onPick}>
      {(item) => (
        <>
          {item.id === MENTION_EVERYONE ? <Users className="size-4" /> : <AtSign className="size-4" />}
          <span className="font-medium text-foreground">{item.label.slice(1)}</span>
          {item.id === MENTION_EVERYONE && <span className="text-xs">avisa todo mundo que vê o canal</span>}
        </>
      )}
    </SuggestionList>
  )
}
