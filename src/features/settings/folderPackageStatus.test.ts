import { beforeEach, expect, it, vi } from 'vitest'
import { folderDisplayName, folderFileKind, folderPackageStatus } from './folderPackageStatus'

it('erkennt vollständige und Änderungsdateien anhand des Namens', () => {
  expect(folderFileKind('wha_daten-2026.zip')).toBe('full')
  expect(folderFileKind('wah_daten_2026.zip')).toBe('full')
  expect(folderFileKind('wha_update-2026.zip')).toBe('changes')
  expect(folderFileKind('welliathome-datenbestand-alt.zip')).toBe('full')
  expect(folderFileKind('welliathome-aenderungen-alt.zip')).toBe('changes')
  expect(folderFileKind('andere.zip')).toBeUndefined()
})

it('kürzt Zeitstempel-Dateinamen nur für die Anzeige', () => {
  expect(folderDisplayName('wha_daten-2026-11-24T09-30-23-123Z-123.zip')).toBe(
    'wah_daten_2026-11-24_09-30-23.zip',
  )
  expect(folderDisplayName('wha_update-2026-11-24T09-30-23-123Z-456.zip')).toBe(
    'wah_update_2026-11-24_09-30-23.zip',
  )
  expect(folderDisplayName('andere-datei.zip')).toBe('andere-datei.zip')
})
import { validateChangesExport } from './validateChangesExport'
import { validateFullExport } from './validateFullExport'
import { appDatabase } from '../../data/database/appDatabase'

vi.mock('./validateChangesExport', () => ({ validateChangesExport: vi.fn() }))
vi.mock('./validateFullExport', () => ({ validateFullExport: vi.fn() }))
vi.mock('../../data/database/appDatabase', () => ({
  appDatabase: { appMetadata: { get: vi.fn() } },
}))

beforeEach(() => {
  vi.resetAllMocks()
})

it('unterscheidet neue, bereits importierte und ungültige Pakete', async () => {
  const file = {} as File
  vi.mocked(validateChangesExport).mockResolvedValue({ packageId: 'id' } as Awaited<
    ReturnType<typeof validateChangesExport>
  >)
  vi.mocked(appDatabase.appMetadata.get).mockResolvedValueOnce(undefined)
  expect(await folderPackageStatus(file)).toBe('new')
  vi.mocked(appDatabase.appMetadata.get).mockResolvedValueOnce({
    id: 'device-change-package:id',
    value: '',
  })
  expect(await folderPackageStatus(file)).toBe('imported')
  vi.mocked(validateChangesExport).mockRejectedValue(new Error('invalid'))
  vi.mocked(validateFullExport).mockRejectedValue(new Error('invalid'))
  expect(await folderPackageStatus(file)).toBe('invalid')
})
