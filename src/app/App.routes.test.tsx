// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App'
import { appDatabase, initializeDatabase } from '../data/database/appDatabase'

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  )
}

afterEach(cleanup)

beforeEach(async () => {
  await appDatabase.delete()
  await initializeDatabase()
})

afterAll(async () => {
  await appDatabase.delete()
})

it.each(['/oauth/pcloud/callback#access_token=legacy-token'])(
  'redirects legacy cloud-sync URL %s to the home page',
  async (url) => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'))
    expect(screen.getByRole('heading', { name: 'Alles für deinen Schwarm' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Synchronisation' }).getAttribute('href')).toBe(
      '/synchronisation',
    )
  },
)

it('leitet die frühere Einstellungsadresse zur Synchronisation weiter', async () => {
  render(
    <MemoryRouter initialEntries={['/einstellungen']}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/synchronisation'))
  expect(await screen.findByRole('heading', { name: 'Synchronisation' })).toBeTruthy()
})
