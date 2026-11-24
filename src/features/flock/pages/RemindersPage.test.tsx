// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { birdRepository, reminderRepository } from '../../../data/repositories'
import { RemindersPage } from './RemindersPage'

function isoDateOffset(days: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days))
    .toISOString()
    .slice(0, 10)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Erinnerungen verwalten', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('gruppiert fällige, bald fällige, spätere und erledigte Erinnerungen', async () => {
    await reminderRepository.create({
      title: 'Futter prüfen',
      dueDate: isoDateOffset(0),
      completed: false,
      reminderType: 'Pflege',
    })
    await reminderRepository.create({
      title: 'Krallen kontrollieren',
      dueDate: isoDateOffset(3),
      completed: false,
      reminderType: 'Gesundheit',
    })
    await reminderRepository.create({
      title: 'Vorrat auffüllen',
      dueDate: isoDateOffset(14),
      completed: false,
      reminderType: 'Futter',
    })
    await reminderRepository.create({
      title: 'Käfig reinigen',
      dueDate: isoDateOffset(-2),
      completed: true,
      reminderType: 'Pflege',
    })

    render(
      <MemoryRouter>
        <RemindersPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Fällig (1)', level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Bald fällig (1)', level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Später (1)', level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Erledigt (1)', level: 2 })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '← Mein Schwarm' })).toBeNull()
    expect(screen.getAllByText(/\d{2}\.\d{2}\.\d{4}/)).toHaveLength(4)

    const dueCard = screen.getByRole('heading', { name: 'Futter prüfen' }).closest('article')
    if (!dueCard) throw new Error('Erinnerungskarte fehlt')
    fireEvent.click(within(dueCard).getByRole('button', { name: 'Als erledigt markieren' }))
    expect(await screen.findByRole('heading', { name: 'Erledigt (2)', level: 2 })).toBeTruthy()
    expect(
      (await reminderRepository.list()).find((item) => item.title === 'Futter prüfen')?.completed,
    ).toBe(true)

    const completedCard = screen.getByRole('heading', { name: 'Käfig reinigen' }).closest('article')
    if (!completedCard) throw new Error('Erledigte Erinnerungskarte fehlt')
    fireEvent.click(within(completedCard).getByRole('button', { name: 'Als offen markieren' }))
    await waitFor(async () =>
      expect(
        (await reminderRepository.list()).find((item) => item.title === 'Käfig reinigen')
          ?.completed,
      ).toBe(false),
    )
  })

  it('löscht Erinnerungen erst nach einer Bestätigung', async () => {
    const saved = await reminderRepository.create({
      title: 'Vorrat prüfen',
      dueDate: isoDateOffset(1),
      completed: false,
      reminderType: 'Futter',
    })
    render(
      <MemoryRouter>
        <RemindersPage />
      </MemoryRouter>,
    )
    const card = (await screen.findByRole('heading', { name: 'Vorrat prüfen' })).closest('article')
    if (!card) throw new Error('Erinnerungskarte fehlt')
    fireEvent.click(within(card).getByRole('button', { name: 'Löschen' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(await reminderRepository.getById(saved.id)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Erinnerung löschen' }))
    expect(await screen.findByText('Erinnerung wurde gelöscht.')).toBeTruthy()
    expect(await reminderRepository.getById(saved.id)).toBeUndefined()
  })

  it('erstellt und bearbeitet Erinnerungen mit optionalem Vogelbezug', async () => {
    const bird = await birdRepository.create({
      name: 'Pico',
      species: 'Wellensittich',
    })
    render(
      <MemoryRouter>
        <RemindersPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Erinnerungen' })
    const addReminderButton = screen.getByRole('button', { name: 'Erinnerung hinzufügen' })
    expect(addReminderButton.classList.contains('add-button')).toBe(true)
    expect(addReminderButton.querySelector('img')?.getAttribute('src')).toBe('/welli-icons/add.svg')
    fireEvent.click(addReminderButton)
    const form = screen.getByRole('heading', { name: 'Erinnerung hinzufügen' }).closest('form')
    if (!form) throw new Error('Erinnerungsformular fehlt')
    fireEvent.submit(form)
    expect((await screen.findByRole('alert')).textContent).toContain('Bitte gib einen Titel ein.')

    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Tierarzttermin' } })
    fireEvent.change(screen.getByLabelText('Fällig am'), {
      target: { value: isoDateOffset(5) },
    })
    fireEvent.change(screen.getByLabelText('Wellensittich (optional)'), {
      target: { value: bird.id },
    })
    fireEvent.change(screen.getByLabelText('Notiz (optional)'), {
      target: { value: 'Jahreskontrolle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Erinnerung speichern' }))

    const cardHeading = await screen.findByRole('heading', { name: 'Tierarzttermin' })
    const card = cardHeading.closest('article')
    if (!card) throw new Error('Erinnerungskarte fehlt')
    expect(within(card).getByText(/Pico/)).toBeTruthy()
    const saved = (await reminderRepository.list())[0]
    expect(saved.description).toBe('Jahreskontrolle')
    expect(saved.birdId).toBe(bird.id)
    expect(saved.reminderType).toBe('Allgemein')

    let calendarBlob: Blob | undefined
    const createObjectUrl = vi.fn((blob: Blob) => {
      calendarBlob = blob
      return 'blob:calendar'
    })
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: createObjectUrl,
        revokeObjectURL: vi.fn(),
      }),
    )
    let downloadName = ''
    const clickDownload = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download
      })
    const calendarButton = within(card).getByRole('button', {
      name: 'In Kalender eintragen: Tierarzttermin',
    })
    expect(calendarButton.querySelector('img')?.getAttribute('src')).toBe(
      '/welli-icons/kalender.svg',
    )
    const completeButton = within(card).getByRole('button', { name: 'Als erledigt markieren' })
    const editButton = within(card).getByRole('button', { name: 'Bearbeiten' })
    expect(completeButton.classList.contains('reminder-complete-button')).toBe(true)
    expect(editButton.nextElementSibling).toBe(
      within(card).getByRole('button', { name: 'Löschen' }),
    )
    fireEvent.click(calendarButton)
    expect(clickDownload).toHaveBeenCalledOnce()
    expect(downloadName).toMatch(/^welliathome-erinnerung-\d{4}-\d{2}-\d{2}-tierarzttermin\.ics$/)
    expect(await calendarBlob?.text()).toContain('SUMMARY:Tierarzttermin')
    expect(await screen.findByText('Kalenderdatei wurde zum Download bereitgestellt.')).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: 'Bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Kontrolltermin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await reminderRepository.getById(saved.id))?.title).toBe('Kontrolltermin'),
    )
    expect((await reminderRepository.getById(saved.id))?.createdAt).toBe(saved.createdAt)
  })
})
