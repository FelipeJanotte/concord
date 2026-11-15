// Seletor de emoji do som (B17): grade por categoria; clicar escolhe, clicar no escolhido tira.
// Lista fixa (sem biblioteca): emojis comuns em soundboard, todos dentro de `SOUND_EMOJI_MAX`.
import { useState } from 'react'
import { cn } from '@/lib/utils'

export const EMOJI_GROUPS: { name: string; emojis: string[] }[] = [
  { name: 'Sons', emojis: ['🔊', '📢', '📯', '🎺', '🥁', '🎸', '🎹', '🎷', '🎻', '🎤', '🎧', '🎵', '🎶', '🔔', '🚨', '⏰', '📣', '💥'] },
  { name: 'Rostos', emojis: ['😂', '🤣', '😅', '😎', '😱', '😡', '😭', '🥳', '😴', '🤔', '🤯', '😈', '🤡', '💀', '👻', '🙄', '😏', '🫡'] },
  { name: 'Gestos', emojis: ['👏', '👍', '👎', '🙌', '🤘', '✌️', '👋', '🤙', '💪', '🙏', '🫶', '🤌'] },
  { name: 'Bichos', emojis: ['🐶', '🐱', '🐸', '🐔', '🐐', '🦆', '🐷', '🐮', '🦁', '🐺', '🐒', '🦉'] },
  { name: 'Coisas', emojis: ['🔥', '💯', '⭐', '❤️', '💔', '💣', '🏆', '🎉', '🎮', '⚽', '🚀', '💸', '🍕', '🍺', '☕', '🚗', '⚡', '❌'] }
]

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [group, setGroup] = useState(0)
  const current = EMOJI_GROUPS[group]
  return (
    <div className="flex flex-col gap-2 rounded-md bg-panel p-2">
      <div role="tablist" aria-label="Categorias de emoji" className="flex flex-wrap gap-1">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.name}
            type="button"
            role="tab"
            aria-selected={i === group}
            onClick={() => setGroup(i)}
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium',
              i === group ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div role="group" aria-label={`Emojis: ${current.name}`} className="grid grid-cols-9 gap-1">
        {current.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            aria-pressed={value === emoji}
            onClick={() => onChange(value === emoji ? '' : emoji)}
            className={cn(
              'flex size-8 items-center justify-center rounded text-lg hover:bg-accent',
              value === emoji && 'bg-primary/30 ring-2 ring-primary'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
