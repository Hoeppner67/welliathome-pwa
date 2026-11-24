import { describe, expect, it } from 'vitest'
import { isBirdDate } from './date'
import {
  emptyBirdForm,
  validateBirdForm,
  valuesToBirdInput,
} from '../features/flock/utils/birdFormValidation'

describe('Datumsangaben im Vogelprofil', () => {
  it.each([
    '15.07.2020',
    'Juli 2020',
    '07/2020',
    '03/23',
    '2020',
    '2020-07-15',
    '29.02.2024',
    '12/00',
  ])('akzeptiert und erhält %s', (date) => {
    expect(isBirdDate(date)).toBe(true)
    const values = { ...emptyBirdForm, name: 'Pico', hatchDate: date }
    expect(validateBirdForm(values).hatchDate).toBeUndefined()
    expect(valuesToBirdInput(values).hatchDate).toBe(date)
  })
  it.each(['31.02.2020', '29.02.2023', '13/23', '00/2020', '2020-02-31', 'Juli', '0000', 'abc'])(
    'verwirft %s',
    (date) => {
      expect(isBirdDate(date)).toBe(false)
      expect(
        validateBirdForm({ ...emptyBirdForm, name: 'Pico', arrivalDate: date }).arrivalDate,
      ).toMatch(/gültiges Datum/)
    },
  )
})
