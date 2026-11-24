// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { appDatabase, initializeDatabase } from '../../data/database/appDatabase'
import { reminderRepository } from '../../data/repositories'
import { localIsoDate } from '../../utils/date'
import { HomePage } from './HomePage'

afterEach(() => cleanup())

describe('Startseite', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })

  afterAll(async () => {
    await appDatabase.delete()
  })

  it('verlinkt fällige offene Erinnerungen, aber zählt keine späteren oder erledigten', async () => {
    const today = localIsoDate()
    const tomorrowDate = new Date(`${today}T00:00:00Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    await reminderRepository.create({
      title: 'Heute fällig',
      dueDate: today,
      completed: false,
      reminderType: 'Pflege',
    })
    await reminderRepository.create({
      title: 'Später fällig',
      dueDate: tomorrow,
      completed: false,
      reminderType: 'Pflege',
    })
    await reminderRepository.create({
      title: 'Erledigt',
      dueDate: today,
      completed: true,
      reminderType: 'Pflege',
    })

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: '1 Erinnerung ist fällig' })
    expect(link.getAttribute('href')).toBe('/schwarm/erinnerungen')
  })
})
