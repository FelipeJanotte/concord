// Cartão de perfil de alguém (aberto pelo menu de botão direito). Só leitura.
import { Volume2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/store'
import { UserAvatar } from './UserAvatar'

interface Props {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserProfileDialog({ userId, open, onOpenChange }: Props) {
  const user = useApp((s) => s.users.find((u) => u.id === userId))
  const isSelf = useApp((s) => s.self?.accountId === user?.accountId)
  const voiceChannel = useApp((s) => {
    const state = s.voice.find((v) => v.userId === userId)
    return state ? s.channels.find((c) => c.id === state.channelId) : undefined
  })

  return (
    <Dialog open={open && !!user} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
        {user && (
          <>
            {/* faixa com a cor da pessoa (a mesma do avatar sem foto) */}
            <div className="h-16" style={{ backgroundColor: user.color }} />
            <div className="-mt-10 space-y-3 px-5 pb-5">
              <div className="w-fit rounded-full border-4 border-background">
                <UserAvatar user={user} size="xl" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-accent-foreground">
                  {user.name}
                  {isSelf && <span className="ml-2 text-sm font-normal text-muted-foreground">(você)</span>}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {user.name}#{user.tag}
                </DialogDescription>
              </div>
              <div className="space-y-1.5 rounded-md bg-sidebar p-3 text-sm">
                <div className="flex items-center gap-2 text-foreground">
                  <span className="size-2.5 rounded-full bg-success" />
                  Online
                </div>
                {voiceChannel && (
                  <div className="flex items-center gap-2 text-foreground">
                    <Volume2 className="size-4 text-muted-foreground" />
                    Na sala de voz <span className="font-semibold">{voiceChannel.name}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
