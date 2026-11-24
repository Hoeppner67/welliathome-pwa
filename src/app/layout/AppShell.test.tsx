// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('aktualisiert Seitentitel und Fokus beim Routenwechsel und bietet einen Skip-Link', () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <>
                <h1>Start</h1>
                <Link to="/naechste">Nächste Seite</Link>
              </>
            }
          />
          <Route path="naechste" element={<h1>Nächste Seite</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  expect(document.title).toBe('Start | Welli@Home')
  const skipLink = screen.getByRole('link', { name: 'Zum Inhalt springen' })
  expect(skipLink.getAttribute('href')).toBe('#main-content')
  fireEvent.click(skipLink)
  expect(document.activeElement).toBe(screen.getByRole('main'))
  fireEvent.click(screen.getByRole('link', { name: 'Nächste Seite' }))
  expect(document.title).toBe('Nächste Seite | Welli@Home')
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Nächste Seite' }))
})

it('fängt Routenfehler ab und verlinkt die Datensicherung', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  function BrokenPage(): never {
    throw new Error('Testfehler')
  }
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<BrokenPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Seite konnte nicht geladen werden' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Zur Datensicherung' }).getAttribute('href')).toBe(
    '/datensicherung',
  )
})
