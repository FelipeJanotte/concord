// Cartão do resultado de uma ferramenta no chat (B10): escolhe pelo `message.tool.tool`.
// Mensagem `kind: 'tool'` sem cartão conhecido (servidor mais novo) mostra o `content` por extenso.
import { Coins, Dices, Target } from 'lucide-react'
import type { CoinResult, DiceResult, Message, PickResult } from '@shared/types'
import { cn } from '@/lib/utils'
import { MusicReplyCard } from '../voice/MusicBotReply'
import { CardFrame } from './CardFrame'
import { PollCard } from './PollCard'
import { TeamResultCard } from './TeamResultCard'

export function ToolResultCard({ message }: { message: Message }) {
  const tool = message.tool
  switch (tool?.tool) {
    case 'teams':
      return <TeamResultCard message={message} result={tool.result} />
    case 'dice':
      return <DiceCard result={tool.result} />
    case 'coin':
      return <CoinCard result={tool.result} />
    case 'pick':
      return <PickCard result={tool.result} />
    case 'poll':
      return <PollCard message={message} result={tool.result} />
    case 'music':
      return <MusicReplyCard message={message} reply={tool.result} />
    default:
      return <p className="text-[15px] leading-[22px] break-words whitespace-pre-wrap">{message.content}</p>
  }
}

function DiceCard({ result }: { result: DiceResult }) {
  const label = `${result.rolls.length > 1 ? result.rolls.length : ''}d${result.sides}`
  return (
    <CardFrame icon={<Dices className="size-4" />} title={`Dado ${label}`} label="Resultado do dado">
      <div className="flex flex-wrap items-center gap-2">
        {result.rolls.map((roll, i) => (
          <span
            key={i}
            className="flex size-10 items-center justify-center rounded-md bg-accent text-lg font-bold text-accent-foreground"
          >
            {roll}
          </span>
        ))}
        {result.rolls.length > 1 && (
          <span className="ml-1 text-sm text-muted-foreground">
            Total: <strong className="text-lg text-foreground">{result.total}</strong>
          </span>
        )}
      </div>
    </CardFrame>
  )
}

function CoinCard({ result }: { result: CoinResult }) {
  const heads = result.flips.filter((f) => f === 'cara').length
  return (
    <CardFrame icon={<Coins className="size-4" />} title={result.flips.length > 1 ? `${result.flips.length} moedas` : 'Moeda'} label="Resultado da moeda">
      <div className="flex flex-wrap gap-2">
        {result.flips.map((flip, i) => (
          <span
            key={i}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-semibold capitalize',
              flip === 'cara' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
            )}
          >
            {flip}
          </span>
        ))}
      </div>
      {result.flips.length > 1 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {heads} cara{heads === 1 ? '' : 's'}, {result.flips.length - heads} coroa{result.flips.length - heads === 1 ? '' : 's'}
        </p>
      )}
    </CardFrame>
  )
}

function PickCard({ result }: { result: PickResult }) {
  return (
    <CardFrame icon={<Target className="size-4" />} title="Sorteio" label="Resultado do sorteio">
      <p className="text-xl font-bold text-accent-foreground">{result.picked}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        entre {result.options.length} opções: {result.options.join(', ')}
      </p>
    </CardFrame>
  )
}
