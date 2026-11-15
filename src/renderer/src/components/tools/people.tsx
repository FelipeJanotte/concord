// Importar nomes para as ferramentas (B10): quem está na minha sala de voz ou quem está online.
// Cada pessoa vai com o `accountId`, para "mover os times" achar a pessoa certa (skill `concord-tools`).
import { useMemo } from 'react'
import { Headphones, Users } from 'lucide-react'
import type { User, VoiceState } from '@shared/types'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store'

export interface Person {
  name: string
  accountId: string
}

/** Uma pessoa por conta (a mesma conta pode estar com duas janelas abertas). */
function uniqueByAccount(users: User[]): Person[] {
  const seen = new Set<string>()
  const out: Person[] = []
  for (const u of users) {
    if (seen.has(u.accountId)) continue
    seen.add(u.accountId)
    out.push({ name: u.name, accountId: u.accountId })
  }
  return out
}

/** Quem está na sala de voz `channelId` (pelas conexões do `voice:state`). */
export function peopleInRoom(voice: VoiceState[], users: User[], channelId: string | null): Person[] {
  if (!channelId) return []
  const ids = new Set(voice.filter((v) => v.channelId === channelId).map((v) => v.userId))
  return uniqueByAccount(users.filter((u) => ids.has(u.id)))
}

/** Todo mundo online na comunidade. */
export function onlinePeople(users: User[]): Person[] {
  return uniqueByAccount(users)
}

export function ImportPeopleButtons({ onImport }: { onImport: (people: Person[]) => void }) {
  // os seletores devolvem o que está na store; as listas novas são montadas fora (senão re-renderiza sem parar)
  const voice = useApp((s) => s.voice)
  const users = useApp((s) => s.users)
  const room = useApp((s) => s.myVoiceChannelId)
  const inRoom = useMemo(() => peopleInRoom(voice, users, room), [voice, users, room])
  const online = useMemo(() => onlinePeople(users), [users])
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={inRoom.length === 0} onClick={() => onImport(inRoom)}>
        <Headphones className="size-4" />
        Da minha sala de voz ({inRoom.length})
      </Button>
      <Button variant="secondary" size="sm" disabled={online.length === 0} onClick={() => onImport(online)}>
        <Users className="size-4" />
        Online ({online.length})
      </Button>
    </div>
  )
}
