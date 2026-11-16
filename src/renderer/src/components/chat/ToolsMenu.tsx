import { useState } from 'react'
import { Plus } from 'lucide-react'
import { TOOLS } from '@/components/tools/registry'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { openTool } from '@/lib/client'

export function ToolsMenu({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Ferramentas"
          title="Ferramentas"
          className="text-muted-foreground hover:text-accent-foreground"
        >
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56 p-1">
        <div role="menu" aria-label="Ferramentas" className="flex flex-col">
          {TOOLS.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                openTool(id, channelId)
              }}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            >
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              {name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
