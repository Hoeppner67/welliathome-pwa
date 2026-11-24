// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

afterEach(cleanup)

it('schließt Links und Eingaben in die Fokusfalle ein und gibt den Fokus nach Escape zurück', () => {
  function Fixture() {
    const [open, setOpen] = useState(false)
    const dialog = useRef<HTMLDivElement>(null)
    const initialFocus = useRef<HTMLInputElement>(null)
    useDialogFocus(dialog, initialFocus, open, () => setOpen(false))
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Öffnen
        </button>
        {open && (
          <div ref={dialog} role="dialog" tabIndex={-1}>
            <input aria-label="Name" ref={initialFocus} />
            <a href="/details">Details</a>
            <button type="button" disabled>
              Deaktiviert
            </button>
          </div>
        )}
      </>
    )
  }
  render(<Fixture />)
  const trigger = screen.getByRole('button', { name: 'Öffnen' })
  trigger.focus()
  fireEvent.click(trigger)
  const input = screen.getByRole('textbox', { name: 'Name' })
  const link = screen.getByRole('link', { name: 'Details' })
  expect(document.activeElement).toBe(input)
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(link)
  fireEvent.keyDown(link, { key: 'Tab' })
  expect(document.activeElement).toBe(input)
  trigger.focus()
  expect(document.activeElement).toBe(input)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
