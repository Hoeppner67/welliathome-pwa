// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../../app/App'

afterEach(cleanup)

describe('Rechtliche Informationsseiten', () => {
  it('verlinkt Impressum und Datenschutz am Ende der Startseite', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Alles für deinen Schwarm' })
    const navigation = screen.getByRole('navigation', { name: 'Weitere Informationen' })
    const backupLink = within(navigation).getByRole('link', { name: 'Datensicherung' })
    expect(backupLink.classList.contains('button')).toBe(true)
    expect(backupLink.classList.contains('button--primary')).toBe(true)
    expect(within(navigation).getByRole('link', { name: 'Impressum' })).toBeTruthy()
    expect(within(navigation).getByRole('link', { name: 'Datenschutz' })).toBeTruthy()
  })

  it('öffnet die Datenschutzseite über den Startseitenlink', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Alles für deinen Schwarm' })
    fireEvent.click(screen.getByRole('link', { name: 'Datenschutz' }))

    expect(await screen.findByRole('heading', { name: 'Datenschutz' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '← Startseite' })).toBeNull()
    expect(screen.queryByText(/Entwurf/)).toBeNull()
    expect(screen.getByText(/nicht verschlüsselt/)).toBeTruthy()
    expect(screen.queryByText(/Bitte prüfe trotzdem/)).toBeNull()
    expect(screen.queryByText(/Als Vorlage dient/)).toBeNull()
    expect(screen.getByText('Stand: 21. November 2026')).toBeTruthy()
  })

  it('öffnet das Impressum mit den Anbieterangaben aus der verlinkten Vorlage', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Alles für deinen Schwarm' })
    fireEvent.click(screen.getByRole('link', { name: 'Impressum' }))

    expect(await screen.findByRole('heading', { name: 'Impressum' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '← Startseite' })).toBeNull()
    expect(screen.queryByText(/Entwurf/)).toBeNull()
    expect(screen.getAllByText('Thorsten Hoeppner')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'mail@welliathome.de' })).toBeTruthy()
  })
})
