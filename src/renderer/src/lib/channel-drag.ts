import { useState, type DragEvent } from 'react'

export const CHANNEL_DRAG = 'application/x-concord-channel'
export const CATEGORY_DRAG = 'application/x-concord-category'

export type DragKind = typeof CHANNEL_DRAG | typeof CATEGORY_DRAG
export type DropEdge = 'before' | 'after'

const draggedKind = (e: DragEvent, accepts: DragKind[]): DragKind | undefined => {
  const types = Array.from(e.dataTransfer?.types ?? [])
  return accepts.find((kind) => types.includes(kind))
}

const edgeOf = (e: DragEvent<HTMLElement>): DropEdge => {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
}

export function dragSource(kind: DragKind, id: string, enabled: boolean) {
  return {
    draggable: enabled,
    onDragStart: (e: DragEvent) => {
      if (!enabled) return
      e.dataTransfer.setData(kind, id)
      e.dataTransfer.effectAllowed = 'move'
    }
  }
}

export function useDropTarget(accepts: DragKind[], onDrop: (kind: DragKind, id: string, edge: DropEdge) => void) {
  const [edge, setEdge] = useState<DropEdge | null>(null)
  const props = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!draggedKind(e, accepts)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setEdge(edgeOf(e))
    },
    onDragLeave: () => setEdge(null),
    onDrop: (e: DragEvent<HTMLElement>) => {
      const kind = draggedKind(e, accepts)
      if (!kind) return
      e.preventDefault()
      setEdge(null)
      const id = e.dataTransfer.getData(kind)
      if (id) onDrop(kind, id, edgeOf(e))
    }
  }
  return { edge, props }
}
