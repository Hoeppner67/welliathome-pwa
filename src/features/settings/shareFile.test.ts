// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { shareFile } from './shareFile'

afterEach(() => vi.unstubAllGlobals())

it('verwendet Web Share bei unterstützten Dateien', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { canShare: () => true, share })
  const file = new File(['zip'], 'daten.zip', { type: 'application/zip' })
  expect(await shareFile(file)).toBe('shared')
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }))
})

it('bietet bei fehlender Unterstützung oder Fehler den Download an', async () => {
  vi.stubGlobal('navigator', {})
  const file = new File(['zip'], 'daten.zip')
  expect(await shareFile(file)).toBe('download')
  vi.stubGlobal('navigator', {
    canShare: () => true,
    share: vi.fn().mockRejectedValue(new Error('unavailable')),
  })
  expect(await shareFile(file)).toBe('download')
})

it('behandelt einen Abbruch ohne automatischen Download', async () => {
  const error = new Error('cancelled')
  error.name = 'AbortError'
  vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(error) })
  expect(await shareFile(new File(['zip'], 'daten.zip'))).toBe('cancelled')
})
