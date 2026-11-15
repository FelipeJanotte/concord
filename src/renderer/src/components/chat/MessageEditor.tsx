// Editar mensagem no lugar (A15): Enter salva, Shift+Enter quebra linha, Esc cancela.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MESSAGE_MAX_LENGTH, type Message } from '@shared/types'
import { cancelEdit, editMessage } from '@/lib/client'

export function MessageEditor({ message }: { message: Message }) {
  const [value, setValue] = useState(message.content)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await editMessage(message, value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível editar a mensagem')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void save()
    }
  }

  return (
    <div className="my-1">
      <textarea
        ref={ref}
        aria-label="Editando a mensagem"
        value={value}
        maxLength={MESSAGE_MAX_LENGTH}
        disabled={busy}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none rounded-md bg-composer px-3 py-2 text-[15px] leading-[22px] outline-none"
      />
      <p className="text-xs text-muted-foreground">
        Esc para{' '}
        <button type="button" className="text-primary hover:underline" onClick={cancelEdit}>
          cancelar
        </button>{' '}
        · Enter para{' '}
        <button type="button" className="text-primary hover:underline" onClick={() => void save()}>
          salvar
        </button>
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
