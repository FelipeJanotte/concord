import { Button } from '@ui-sdk/react/button'
import { Play, X } from 'lucide-react'
import type { Message } from '@shared/types'
import { externalUrl } from '@shared/links'
import { notify, playEmbedInBot, removeEmbed, resolveServerUrl } from '@/lib/client'
import { useApp } from '@/store'

const reportError = (err: unknown): void => notify(err instanceof Error ? err.message : 'Não foi possível remover a prévia')

export function LinkEmbed({ message }: { message: Message }) {
  const isAuthor = useApp((s) => !!s.self && s.self.accountId === message.author.accountId)
  const inVoice = useApp((s) => !!s.myVoiceChannelId)
  const serverUrl = useApp((s) => s.serverUrl)
  const embed = message.embed
  const href = embed && externalUrl(embed.url)
  if (!embed || !href) return null
  const image = resolveServerUrl(embed.imageUrl, serverUrl)

  return (
    <div className="group/embed relative mt-1 flex max-w-[520px] flex-col gap-1 rounded border-l-4 border-primary bg-panel py-2 pr-8 pl-3">
      {embed.siteName && <span className="text-xs text-muted-foreground">{embed.siteName}</span>}
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={href}
        className="font-semibold break-words text-primary hover:underline"
      >
        {embed.title ?? embed.url}
      </a>
      {embed.description && <p className="line-clamp-3 text-sm break-words whitespace-pre-line text-muted-foreground">{embed.description}</p>}
      {image && <img src={image} alt={embed.title ?? ''} loading="lazy" className="mt-1 max-h-[300px] max-w-full self-start rounded object-contain" />}
      {embed.music && inVoice && (
        <Button
          onClick={() => playEmbedInBot(embed.url, message.channelId).then(() => undefined)}
          pendingAnnouncement=""
          className="mt-1 flex items-center gap-1.5 self-start rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-pending:opacity-60"
        >
          <Play aria-hidden className="size-4" />
          Tocar no bot
        </Button>
      )}
      {isAuthor && (
        <Button
          aria-label="Remover prévia"
          title="Remover prévia"
          onClick={() => removeEmbed(message.id).catch(reportError)}
          pendingAnnouncement=""
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/embed:opacity-100 hover:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden className="size-4" />
        </Button>
      )}
    </div>
  )
}
