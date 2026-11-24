import { expect, it } from 'vitest'
import { deviceZipFileName } from './deviceZipFileName'

it('formats ZIP filenames in UTC and avoids same-second collisions', () => {
  const createdAt = '2026-11-24T10:30:45.987Z'
  expect(deviceZipFileName(createdAt, 'daten')).toBe('wah_daten_2026-11-24_10-30-45.zip')
  expect(deviceZipFileName(createdAt, 'daten')).toBe('wah_daten_2026-11-24_10-30-45-2.zip')
  expect(deviceZipFileName(createdAt, 'update')).toBe('wah_update_2026-11-24_10-30-45.zip')
})
