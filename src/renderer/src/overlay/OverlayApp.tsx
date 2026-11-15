// Overlay em jogos (B15): quem está na minha sala de voz, com quem está falando em destaque e
// microfone/áudio desligados. A janela não recebe cliques (o clique passa para o jogo), menos no
// modo de mover: aí a página inteira vira área de arrastar (`-webkit-app-region: drag`), com moldura,
// "Concluir" e Esc para travar de novo. Fora de sala, o modo de mover mostra uma prévia.
import { useEffect, useState, type CSSProperties } from 'react'
import { HeadphoneOff, MicOff, Move, Volume2 } from 'lucide-react'
import { OVERLAY_EDIT_SHORTCUT_LABEL, type OverlayConfig, type OverlayMember, type OverlayRoom, type OverlayViewBridge } from '@shared/overlay'
import { cn } from '@/lib/utils'

const SIZE = {
  small: { avatar: 'size-6 text-[10px]', name: 'text-xs', icon: 'size-3', header: 'text-[10px]' },
  medium: { avatar: 'size-8 text-xs', name: 'text-sm', icon: 'size-3.5', header: 'text-xs' },
  large: { avatar: 'size-10 text-sm', name: 'text-base', icon: 'size-4', header: 'text-sm' }
} as const

/** O que aparece no modo de mover quando ainda não há ninguém na sala. */
const PREVIEW: OverlayRoom = {
  channelName: 'Sala de voz',
  members: [{ id: 'preview', name: 'Prévia', avatarUrl: null, color: '#5865f2', speaking: true, muted: false, deafened: false }],
  more: 0
}

// propriedades do Electron para arrastar a janela sem borda
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function OverlayApp({ bridge }: { bridge: OverlayViewBridge | null }) {
  const [room, setRoom] = useState<OverlayRoom | null>(null)
  const [config, setConfig] = useState<OverlayConfig | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(
    () =>
      bridge?.onUpdate((nextRoom, nextConfig, nextEditing) => {
        setRoom(nextRoom)
        setConfig(nextConfig)
        setEditing(nextEditing === true)
      }),
    [bridge]
  )

  // Esc trava de novo (a janela só tem foco no modo de mover)
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') bridge?.finishEditing()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, bridge])

  const shown = room && room.members.length > 0 ? room : editing ? PREVIEW : null
  if (!shown || !config) return null
  const s = SIZE[config.size]
  // arrastado para um lugar livre: cresce para baixo, alinhado à esquerda
  const bottom = !config.position && config.corner.startsWith('bottom')
  const right = !config.position && config.corner.endsWith('right')

  return (
    <div
      data-editing={editing || undefined}
      style={editing ? DRAG : undefined}
      className={cn(
        'flex h-screen flex-col gap-1 p-2 select-none',
        bottom && 'justify-end',
        right && 'items-end',
        editing && 'cursor-move rounded-lg border-2 border-dashed border-primary bg-background/40'
      )}
    >
      {editing && (
        <div className="flex w-full items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-foreground">
          <Move className={cn('shrink-0', s.icon)} />
          <span className={cn('flex-1 truncate', s.header)} title={`Arraste para mover · Esc ou ${OVERLAY_EDIT_SHORTCUT_LABEL} para travar`}>
            Arraste para mover
          </span>
          <button
            type="button"
            style={NO_DRAG}
            onClick={() => bridge?.finishEditing()}
            className={cn('rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90', s.header)}
          >
            Concluir
          </button>
        </div>
      )}
      <div className={cn('flex items-center gap-1 px-1 font-semibold text-foreground/80 drop-shadow', s.header)}>
        <Volume2 className={s.icon} />
        <span className="truncate">{shown.channelName}</span>
      </div>
      <ul aria-label="Pessoas na sala" className={cn('flex flex-col gap-1', right && 'items-end')}>
        {shown.members.map((m) => (
          <MemberRow key={m.id} member={m} size={s} />
        ))}
        {shown.more > 0 && <li className={cn('px-2 text-foreground/70 drop-shadow', s.name)}>+{shown.more}</li>}
      </ul>
    </div>
  )
}

function MemberRow({ member, size }: { member: OverlayMember; size: (typeof SIZE)[keyof typeof SIZE] }) {
  return (
    <li
      data-speaking={member.speaking || undefined}
      className="flex max-w-full items-center gap-2 rounded-full bg-background/75 py-1 pr-3 pl-1 text-foreground"
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-2 transition-shadow',
          size.avatar,
          member.speaking ? 'ring-success' : 'ring-transparent'
        )}
        style={member.avatarUrl ? undefined : { backgroundColor: member.color }}
      >
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}
      </span>
      <span className={cn('truncate font-medium', size.name, member.speaking ? 'text-foreground' : 'text-foreground/80')}>{member.name}</span>
      {member.deafened ? (
        <HeadphoneOff aria-label="Áudio desativado" className={cn('shrink-0 text-destructive', size.icon)} />
      ) : member.muted ? (
        <MicOff aria-label="Microfone desligado" className={cn('shrink-0 text-destructive', size.icon)} />
      ) : null}
    </li>
  )
}
