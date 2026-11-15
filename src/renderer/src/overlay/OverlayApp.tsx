// Overlay em jogos (B15): quem está na minha sala de voz, com quem está falando em destaque e
// microfone/áudio desligados (sem o nome da sala: só as pessoas). A janela não recebe cliques (o clique
// passa para o jogo), menos no modo de mover: aí a página inteira vira área de arrastar
// (`-webkit-app-region: drag`), com moldura, "Concluir" e Esc para travar de novo. Fora de sala, o modo de
// mover mostra uma prévia.
//
// Alturas: cada linha (pessoa, "+N", barra do modo de mover) tem exatamente `OVERLAY_METRICS[size].line`,
// com `OVERLAY_GAP` entre elas e `OVERLAY_PADDING` em volta — os mesmos números com que o processo principal
// calcula o tamanho da janela (`overlayHeight`). Assim nada fica cortado embaixo.
import { useEffect, useState, type CSSProperties } from 'react'
import { HeadphoneOff, MicOff, Move } from 'lucide-react'
import {
  OVERLAY_EDIT_SHORTCUT_LABEL,
  OVERLAY_GAP,
  OVERLAY_METRICS,
  OVERLAY_PADDING,
  type OverlayConfig,
  type OverlayMember,
  type OverlayRoom,
  type OverlaySize,
  type OverlayViewBridge
} from '@shared/overlay'
import { cn } from '@/lib/utils'

/** Tamanho dos textos e ícones (as alturas vêm de `OVERLAY_METRICS`). */
const TEXT: Record<OverlaySize, { initial: string; name: string; icon: string; bar: string }> = {
  small: { initial: 'text-[10px]', name: 'text-xs', icon: 'size-3', bar: 'text-[10px]' },
  medium: { initial: 'text-xs', name: 'text-sm', icon: 'size-3.5', bar: 'text-xs' },
  large: { initial: 'text-sm', name: 'text-base', icon: 'size-4', bar: 'text-sm' }
}

/** O que aparece no modo de mover quando ainda não há ninguém na sala. */
const PREVIEW: OverlayRoom = {
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
  const text = TEXT[config.size]
  const { line, avatar } = OVERLAY_METRICS[config.size]
  // arrastado para um lugar livre: cresce para baixo, alinhado à esquerda
  const bottom = !config.position && config.corner.startsWith('bottom')
  const right = !config.position && config.corner.endsWith('right')

  return (
    <div
      data-editing={editing || undefined}
      style={{ padding: OVERLAY_PADDING, gap: OVERLAY_GAP, ...(editing ? DRAG : {}) }}
      className={cn(
        'flex h-screen flex-col select-none',
        bottom && 'justify-end',
        right && 'items-end',
        // outline (e não border): não ocupa espaço, então não come a altura calculada para as linhas
        editing && 'cursor-move rounded-lg bg-background/40 outline-2 -outline-offset-2 outline-primary outline-dashed'
      )}
    >
      {editing && (
        <div style={{ height: line }} className="flex w-full shrink-0 items-center gap-1 rounded-md bg-background/90 px-2 text-foreground">
          <Move className={cn('shrink-0', text.icon)} />
          <span className={cn('flex-1 truncate', text.bar)} title={`Arraste para mover · Esc ou ${OVERLAY_EDIT_SHORTCUT_LABEL} para travar`}>
            Arraste para mover
          </span>
          <button
            type="button"
            style={NO_DRAG}
            onClick={() => bridge?.finishEditing()}
            className={cn('rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/90', text.bar)}
          >
            Concluir
          </button>
        </div>
      )}
      <ul aria-label="Pessoas na sala" style={{ gap: OVERLAY_GAP }} className={cn('flex flex-col', right && 'items-end')}>
        {shown.members.map((m) => (
          <MemberRow key={m.id} member={m} line={line} avatar={avatar} text={text} />
        ))}
        {shown.more > 0 && (
          <li style={{ height: line }} className={cn('flex shrink-0 items-center px-2 text-foreground/70 drop-shadow', text.name)}>
            +{shown.more}
          </li>
        )}
      </ul>
    </div>
  )
}

function MemberRow({ member, line, avatar, text }: { member: OverlayMember; line: number; avatar: number; text: (typeof TEXT)[OverlaySize] }) {
  return (
    <li
      data-speaking={member.speaking || undefined}
      style={{ height: line }}
      className="flex max-w-full shrink-0 items-center gap-2 rounded-full bg-background/75 pr-3 pl-1 text-foreground"
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-2 transition-shadow',
          text.initial,
          member.speaking ? 'ring-success' : 'ring-transparent'
        )}
        style={{ width: avatar, height: avatar, ...(member.avatarUrl ? {} : { backgroundColor: member.color }) }}
      >
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}
      </span>
      <span className={cn('truncate font-medium', text.name, member.speaking ? 'text-foreground' : 'text-foreground/80')}>{member.name}</span>
      {member.deafened ? (
        <HeadphoneOff aria-label="Áudio desativado" className={cn('shrink-0 text-destructive', text.icon)} />
      ) : member.muted ? (
        <MicOff aria-label="Microfone desligado" className={cn('shrink-0 text-destructive', text.icon)} />
      ) : null}
    </li>
  )
}
