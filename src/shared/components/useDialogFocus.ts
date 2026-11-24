import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

function tabStops(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[hidden], [inert]') &&
        getComputedStyle(element).visibility === 'visible' &&
        !findHiddenAncestor(element, dialog),
    )
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity))
}

function findHiddenAncestor(element: HTMLElement, dialog: HTMLElement): boolean {
  if (element.closest('details:not([open])') && !element.closest('summary')) return true
  for (let node: HTMLElement | null = element; node && node !== dialog; node = node.parentElement) {
    if (getComputedStyle(node).display === 'none') return true
  }
  return false
}

export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocus: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  busy = false,
) {
  const latest = useRef({ onClose, busy })
  useLayoutEffect(() => {
    latest.current = { onClose, busy }
  }, [onClose, busy])

  useLayoutEffect(() => {
    if (!open || !dialogRef.current) return
    const dialog = dialogRef.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusStart = () => {
      const stops = tabStops(dialog)
      const preferred = initialFocus.current
      const target = preferred && stops.includes(preferred) ? preferred : (stops[0] ?? dialog)
      target.focus({ preventScroll: true })
    }
    focusStart()

    function trapFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusStart()
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!latest.current.busy) latest.current.onClose()
      }
      if (event.key !== 'Tab') return
      const stops = tabStops(dialog)
      const current = stops.indexOf(document.activeElement as HTMLElement)
      if (current < 0 || (event.shiftKey ? current === 0 : current === stops.length - 1)) {
        event.preventDefault()
        const target = (event.shiftKey ? stops.at(-1) : stops[0]) ?? dialog
        target.focus({ preventScroll: true })
      }
    }

    document.addEventListener('focusin', trapFocus)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('focusin', trapFocus)
      document.removeEventListener('keydown', handleKey)
      if (trigger?.isConnected && !trigger.matches(':disabled'))
        trigger.focus({ preventScroll: true })
      else document.getElementById('main-content')?.focus({ preventScroll: true })
    }
  }, [open, dialogRef, initialFocus])

  useEffect(() => {
    const dialog = dialogRef.current
    if (
      open &&
      busy &&
      dialog &&
      (!dialog.contains(document.activeElement) || document.activeElement?.matches(':disabled'))
    ) {
      dialog.focus({ preventScroll: true })
    }
  }, [busy, dialogRef, open])
}
