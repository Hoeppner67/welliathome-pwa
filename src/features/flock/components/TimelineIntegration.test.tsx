// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../app/App'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import {
  birdRepository,
  medicationRepository,
  observationRepository,
  vetAppointmentRepository,
} from '../../../data/repositories'
import type { Medication } from '../../../models'
import { buildTimeline } from '../services/timelineService'
import { TimelineList } from './TimelineList'

afterEach(cleanup)

describe('Ereignisse im Vogelprofil und Chronik', () => {
  let birdId = ''
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
    birdId = (await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })).id
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  async function openEvents() {
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    fireEvent.click(document.querySelectorAll('.documentation-accordion summary')[2]!)
  }

  it('erfasst, bearbeitet und löscht eine Beobachtung; aktualisiert die Chronik', async () => {
    await openEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis hinzufügen' }))
    fireEvent.change(screen.getByLabelText('Beobachtung'), { target: { value: 'Sang am Morgen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis speichern' }))
    expect(await screen.findByText('Sang am Morgen')).toBeTruthy()
    const before = await observationRepository.listByBirdId(birdId)
    expect(before).toHaveLength(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Ereignis bearbeiten: Beobachtung' }))
    fireEvent.change(screen.getByLabelText('Beobachtung'), {
      target: { value: 'Frisst wieder gut' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await observationRepository.getById(before[0].id))?.description).toBe(
        'Frisst wieder gut',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis löschen: Beobachtung' }))
    expect(await screen.findByRole('alertdialog', { name: 'Ereignis löschen?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis löschen' }))
    await waitFor(async () =>
      expect(await observationRepository.listByBirdId(birdId)).toHaveLength(0),
    )
    fireEvent.click(document.querySelectorAll('.documentation-accordion summary')[3]!)
    expect(document.querySelectorAll('.documentation-accordion[open]')).toHaveLength(2)
    expect(
      await screen.findByText('Für diesen Filter gibt es noch keine Chronikeinträge.'),
    ).toBeTruthy()
  })

  it('erfasst Probleme und zukünftige Tierarzttermine mit optionaler Diagnose', async () => {
    await openEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis hinzufügen' }))
    fireEvent.change(screen.getByLabelText('Art des Ereignisses'), { target: { value: 'problem' } })
    fireEvent.change(screen.getByLabelText('Problem'), { target: { value: 'Weniger aktiv' } })
    fireEvent.change(screen.getByLabelText('Beschreibung'), {
      target: { value: 'Seit heute ruhig' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis speichern' }))
    expect(await screen.findByText('Weniger aktiv')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ereignis hinzufügen' }))
    fireEvent.change(screen.getByLabelText('Art des Ereignisses'), { target: { value: 'vet' } })
    fireEvent.change(screen.getByLabelText('Anlass'), { target: { value: 'Kontrolltermin' } })
    fireEvent.change(document.getElementById('event-date')!, { target: { value: '2999-05-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ereignis speichern' }))
    expect(await screen.findByText('Kontrolltermin')).toBeTruthy()
    expect(await vetAppointmentRepository.listByBirdId(birdId)).toHaveLength(1)

    fireEvent.click(document.querySelectorAll('.documentation-accordion summary')[2]!)
    fireEvent.click(document.querySelectorAll('.documentation-accordion summary')[3]!)
    expect(await screen.findByText('Geplant')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alle' }))
    expect(screen.getByRole('button', { name: 'Alle' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Tierarzt' }))
    expect(screen.getByRole('button', { name: 'Tierarzt' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(
      Array.from(document.querySelectorAll('.timeline-list h3')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Kontrolltermin'])
    expect(
      Array.from(document.querySelectorAll('.timeline-list h3')).some(
        (heading) => heading.textContent === 'Weniger aktiv',
      ),
    ).toBe(false)
  })

  it('führt Medikamente nur abgeleitet in der Chronik auf und filtert ohne zusätzliche Datensätze', async () => {
    const medication = await medicationRepository.create({
      birdId,
      name: 'Tropfen',
      startDate: '2999-04-01',
      endDate: '2999-04-10',
      dosage: '1 Tropfen',
    })
    await openEvents()
    fireEvent.click(document.querySelectorAll('.documentation-accordion summary')[3]!)
    expect((await screen.findAllByRole('heading', { name: 'Tropfen' })).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Geplant').length).toBeGreaterThan(0)
    expect(await screen.findByText('ab 01.04.2999 · 1 Tropfen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Medikamente' }))
    expect(document.querySelectorAll('.timeline-list h3')).toHaveLength(2)
    expect(await medicationRepository.listByBirdId(birdId)).toHaveLength(1)
    expect(medication.id).toBeTruthy()
  })

  it('zeigt bei fehlendem Startdatum weder ein erfundenes Datum noch eine leere Datumsmarke', () => {
    const medication: Medication = {
      id: 'm',
      birdId,
      name: 'Unvollständig',
      startDate: '',
      dosage: '2 Tropfen',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    render(<TimelineList items={buildTimeline([], [], [], [medication])} birdId={birdId} />)

    const entry = screen.getByRole('heading', { name: 'Unvollständig' }).closest('article')
    expect(entry?.textContent).toContain('2 Tropfen')
    expect(entry?.textContent).not.toContain('ab ')
    expect(entry?.querySelector('time')).toBeNull()
  })

  it('beschriftet den PDF-Button exakt wie gefordert', async () => {
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    const button = screen.getByRole('button', { name: 'Tierarzt-Dokumentaion erstellen' })
    expect(button.getAttribute('title')).toBe('Tierarzt-Dokumentaion erstellen')
  })

  it('zeigt vor dem Löschen die betroffenen Daten und löscht sie erst nach Bestätigung', async () => {
    await medicationRepository.create({
      birdId,
      name: 'Tropfen',
      startDate: '2026-04-01',
    })
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    fireEvent.click(screen.getByRole('button', { name: 'Profil löschen' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Vogelprofil löschen?' })
    expect(await within(dialog).findByText('Medikamente')).toBeTruthy()
    expect(within(dialog).getByText('Anzahl zugehöriger Einträge: 1')).toBeTruthy()
    expect(await medicationRepository.listByBirdId(birdId)).toHaveLength(1)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Profil und Daten löschen' }))
    await screen.findByRole('heading', { name: 'Mein Schwarm' })
    expect(await birdRepository.getById(birdId)).toBeUndefined()
    expect(await medicationRepository.listByBirdId(birdId)).toHaveLength(0)
  })
})
