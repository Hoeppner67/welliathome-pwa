// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { feedMixRepository } from '../../../data/repositories'
import { FeedMixesPage } from './FeedMixesPage'

afterEach(cleanup)

describe('Körnermischungen verwalten', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('legt die vier Empfehlungen beim ersten Öffnen an und speichert eigene Mischungen in derselben Liste', async () => {
    render(
      <MemoryRouter>
        <FeedMixesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Welli-Fit' })).toBeTruthy()
    expect(await feedMixRepository.list()).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Körnermischungen' })).toBeTruthy()
    expect(screen.queryByText('Meine Körnermischungen')).toBeNull()
    expect(screen.queryByText('Futterempfehlungen')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Körnermischung hinzufügen' }))
    fireEvent.change(screen.getByLabelText(/Name der Körnermischung/), {
      target: { value: 'Abendmix' },
    })
    fireEvent.change(screen.getByLabelText(/Zusammensetzung/), {
      target: { value: ' Hirse \n\n Hafer ' },
    })
    fireEvent.change(screen.getByLabelText('Anbieter / Hersteller'), {
      target: { value: 'Futterhaus' },
    })
    fireEvent.change(screen.getByLabelText('Produkt- / Bestelllink'), {
      target: { value: 'https://example.org/mix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Körnermischung speichern' }))
    const ownMixHeading = await screen.findByRole('heading', { name: 'Abendmix' })
    const card = ownMixHeading.closest('article')
    if (!card) throw new Error('Karte fehlt')
    expect(within(card).getByRole('link', { name: 'Bestellen' }).getAttribute('rel')).toBe(
      'noopener noreferrer',
    )
    expect(within(card).getByRole('link', { name: 'Bestellen' }).getAttribute('target')).toBe(
      '_blank',
    )
    const stored = await feedMixRepository.list()
    expect(stored).toHaveLength(5)
    expect(stored.find((mix) => mix.name === 'Abendmix')?.ingredients).toEqual(['Hirse', 'Hafer'])
  })

  it('validiert Namen und URLs, bevor eine eigene Mischung gespeichert wird', async () => {
    render(
      <MemoryRouter>
        <FeedMixesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Welli-Fit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Körnermischung hinzufügen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Körnermischung speichern' }))
    expect(await screen.findByText('Bitte gib einen Namen ein.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Name der Körnermischung/), {
      target: { value: 'Test' },
    })
    fireEvent.change(screen.getByLabelText('Produkt- / Bestelllink'), {
      target: { value: 'javascript:alert(1)' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Körnermischung speichern' }))
    expect(
      await screen.findByText('Bitte gib eine gültige HTTP- oder HTTPS-Adresse ein.'),
    ).toBeTruthy()
    expect(await feedMixRepository.list()).toHaveLength(4)
  })

  it('bearbeitet, sucht, bricht Löschen ab und löscht nur nach Bestätigung', async () => {
    const mix = await feedMixRepository.create({
      name: 'Körnermix',
      provider: 'Sämerei Müller',
      ingredients: ['Hirse'],
      productUrl: 'https://example.org',
      notes: 'Notiz',
    })
    await feedMixRepository.create({ name: 'Abendmix', ingredients: [] })
    render(
      <MemoryRouter>
        <FeedMixesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Abendmix' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Körnermischung suchen'), {
      target: { value: 'muller' },
    })
    expect(screen.getByRole('heading', { name: 'Körnermix' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abendmix' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Körnermischung suchen'), {
      target: { value: '' },
    })

    const card = screen.getByRole('heading', { name: 'Körnermix' }).closest('article')
    if (!card) throw new Error('Karte fehlt')
    fireEvent.click(within(card).getByRole('button', { name: 'Bearbeiten: Körnermix' }))
    fireEvent.change(screen.getByLabelText(/Name der Körnermischung/), {
      target: { value: 'Morgenmix' },
    })
    fireEvent.change(screen.getByLabelText(/Zusammensetzung/), { target: { value: 'Hirse\\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await feedMixRepository.getById(mix.id))?.name).toBe('Morgenmix'),
    )
    const edited = await feedMixRepository.getById(mix.id)
    expect(edited?.createdAt).toBe(mix.createdAt)
    expect(edited?.updatedAt).not.toBe(mix.updatedAt)

    const editedCard = screen.getByRole('heading', { name: 'Morgenmix' }).closest('article')
    if (!editedCard) throw new Error('Bearbeitete Karte fehlt')
    fireEvent.click(within(editedCard).getByRole('button', { name: 'Löschen: Morgenmix' }))
    expect(await screen.findByRole('alertdialog', { name: 'Körnermischung löschen?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(await feedMixRepository.getById(mix.id)).toBeTruthy()

    fireEvent.click(within(editedCard).getByRole('button', { name: 'Löschen: Morgenmix' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Körnermischung löschen' }))
    await waitFor(async () => expect(await feedMixRepository.getById(mix.id)).toBeUndefined())
    expect(await feedMixRepository.list()).toHaveLength(5)
  })

  it('erlaubt Empfehlungen zu bearbeiten und erhält die unberührte Claus-Notiz', async () => {
    render(
      <MemoryRouter>
        <FeedMixesPage />
      </MemoryRouter>,
    )
    const primusHeading = await screen.findByRole('heading', { name: 'Primus Basis' })
    const card = primusHeading.closest('article')
    if (!card) throw new Error('Primus-Basis-Karte fehlt')
    const before = (await feedMixRepository.list()).find((mix) => mix.name === 'Primus Basis')
    if (!before) throw new Error('Primus Basis fehlt in IndexedDB')

    fireEvent.click(within(card).getByRole('button', { name: 'Bearbeiten: Primus Basis' }))
    fireEvent.change(screen.getByLabelText(/Name der Körnermischung/), {
      target: { value: 'Primus Basis Test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await feedMixRepository.getById(before.id))?.name).toBe('Primus Basis Test'),
    )
    const edited = await feedMixRepository.getById(before.id)
    expect(edited?.id).toBe(before.id)
    expect(edited?.createdAt).toBe(before.createdAt)
    expect(edited?.notes).toBe('10 % Rabatt mit dem Code Welli@Home10')
    expect(screen.getByText(/10 % Rabatt mit dem Code/)).toBeTruthy()
  })

  it('kopiert den Claus-Rabattcode und zeigt die Bestätigung', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(
      <MemoryRouter>
        <FeedMixesPage />
      </MemoryRouter>,
    )
    const primus = await screen.findByRole('heading', { name: 'Primus Basis' })
    const card = primus.closest('article')
    if (!card) throw new Error('Primus-Basis-Karte fehlt')
    fireEvent.click(within(card).getByRole('button', { name: 'Rabattcode kopieren' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Welli@Home10'))
    expect(await within(card).findByText('Rabattcode kopiert')).toBeTruthy()
  })
})
