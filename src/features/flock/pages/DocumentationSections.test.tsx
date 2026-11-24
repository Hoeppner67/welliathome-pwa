// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../app/App'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { birdRepository, medicationRepository, weightRepository } from '../../../data/repositories'
import { localIsoDate } from '../../../utils/date'

afterEach(cleanup)

describe('Gewicht und Medikamente im Vogelprofil', () => {
  let birdId = ''
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
    birdId = (await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })).id
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('erfasst, bearbeitet und gezielt löscht einen Gewichtseintrag mit Dezimalkomma', async () => {
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    const summary = document.querySelector('.documentation-accordion summary')
    if (!summary) throw new Error('Gewichtsabschnitt fehlt')
    fireEvent.click(summary)
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-05-10' } })
    fireEvent.change(screen.getByLabelText('Gewicht (g)'), { target: { value: '36,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gewicht speichern' }))
    expect(await screen.findByText('36,5 g')).toBeTruthy()
    let stored = await weightRepository.listByBirdId(birdId)
    expect(stored).toHaveLength(1)
    expect(stored[0].weight).toBe(36.5)

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Gewicht (g)'), { target: { value: '37' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await weightRepository.getById(stored[0].id))?.weight).toBe(37),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(
      await screen.findByRole('alertdialog', { name: 'Gewichtseintrag löschen?' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Eintrag löschen' }))
    await waitFor(async () => expect(await weightRepository.listByBirdId(birdId)).toHaveLength(0))
  })

  it('erfasst, bearbeitet und löscht ein Medikament', async () => {
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    const medicationSummary = document.querySelectorAll('.documentation-accordion summary')[1]
    if (!medicationSummary) throw new Error('Medikamentenabschnitt fehlt')
    fireEvent.click(medicationSummary)
    fireEvent.change(screen.getByLabelText('Medikament'), { target: { value: 'Augentropfen' } })
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: localIsoDate() } })
    fireEvent.change(screen.getByLabelText('Dosierung / Menge (optional)'), {
      target: { value: '1 Tropfen' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Medikament speichern' }))
    expect(await screen.findByText('Augentropfen')).toBeTruthy()
    let stored = await medicationRepository.listByBirdId(birdId)
    expect(stored).toHaveLength(1)
    expect(screen.getByText('Laufende Behandlungen')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    fireEvent.change(screen.getByLabelText('Dosierung / Menge (optional)'), {
      target: { value: '2 Tropfen' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await medicationRepository.getById(stored[0].id))?.dosage).toBe('2 Tropfen'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(await screen.findByRole('alertdialog', { name: 'Medikament löschen?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Medikament löschen' }))
    await waitFor(async () =>
      expect(await medicationRepository.listByBirdId(birdId)).toHaveLength(0),
    )
  })

  it('lässt Gewicht- und Medikamentenabschnitt unabhängig gleichzeitig geöffnet', async () => {
    render(
      <MemoryRouter initialEntries={[`/schwarm/${birdId}`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Profilinformationen' })
    const summaries = document.querySelectorAll('.documentation-accordion summary')
    fireEvent.click(summaries[0])
    fireEvent.click(summaries[1])
    expect(document.querySelectorAll('.documentation-accordion[open]')).toHaveLength(2)
  })
})
