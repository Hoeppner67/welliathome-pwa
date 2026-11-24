// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

afterEach(cleanup)

it('verlinkt das Logo zur Webseite und den Titel zur App-Startseite', () => {
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )
  const logo = screen.getByRole('link', { name: 'Welli@Home Webseite öffnen' })
  expect(logo.getAttribute('href')).toBe('https://welliathome.de/')
  expect(logo.getAttribute('title')).toBe('welliathome.de öffnen')
  expect(logo.getAttribute('target')).toBe('_blank')
  expect(logo.getAttribute('rel')).toBe('noopener noreferrer')
  expect(screen.getByRole('link', { name: 'Welli@Home – Startseite' }).getAttribute('href')).toBe(
    '/',
  )
  expect(screen.getByRole('link', { name: 'Welli@Home – Startseite' }).getAttribute('title')).toBe(
    'Startseite öffnen',
  )
  expect(screen.getByRole('link', { name: 'Synchronisation' }).getAttribute('href')).toBe(
    '/synchronisation',
  )
})
