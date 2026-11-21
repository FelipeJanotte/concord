Element.prototype.getAnimations = () => []

const POPOVER_OPEN = 'data-popover-open'

HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
  this.setAttribute(POPOVER_OPEN, '')
}

HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
  this.removeAttribute(POPOVER_OPEN)
}

HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement, force?: boolean) {
  const open = typeof force === 'boolean' ? force : !this.hasAttribute(POPOVER_OPEN)
  if (open) this.showPopover()
  else this.hidePopover()
  return open
}

const visibleWhenOpen = document.createElement('style')
visibleWhenOpen.textContent = `[popover][${POPOVER_OPEN}]{display:block !important}`
document.head.appendChild(visibleWhenOpen)

class SilentResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= SilentResizeObserver

Element.prototype.scrollIntoView ??= function scrollIntoView(): void {}
