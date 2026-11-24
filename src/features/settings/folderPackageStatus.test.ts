import { beforeEach, expect, it, vi } from 'vitest'
import {
  folderFileKind,
  folderPackageStatus,
  inspectFolderPackage,
} from './folderPackageStatus'
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

it('erkennt vollständige und Änderungsdateien anhand des Namens', () => {
  expect(folderFileKind('wha_daten-2026.zip')).toBe('full')
  expect(folderFileKind('wah_daten_2026.zip')).toBe('full')
  expect(folderFileKind('wah_daten_2026-11-24_10-30-45.zip')).toBe('full')
  expect(folderFileKind('wha_update-2026.zip')).toBe('changes')
  expect(folderFileKind('wah_update_2026-11-24_10-30-45.zip')).toBe('changes')
  expect(folderFileKind('welliathome-datenbestand-alt.zip')).toBe('full')
  expect(folderFileKind('welliathome-aenderungen-alt.zip')).toBe('changes')
  expect(folderFileKind('andere.zip')).toBeUndefined()
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

it('erkennt kurze ZIP-Namen über den validierten Paketinhalt', async () => {
  const file = new File(['zip'], 'wah_daten_2026-11-24_10-30-45.zip')
  vi.mocked(validateChangesExport).mockRejectedValue(new Error('not changes'))
  vi.mocked(validateFullExport).mockResolvedValue({
    packageId: 'snapshot',
    createdAt: '2026-11-24T10:30:45.000Z',
  } as Awaited<ReturnType<typeof validateFullExport>>)
  vi.mocked(appDatabase.appMetadata.get).mockResolvedValue(undefined)

  await expect(inspectFolderPackage(file)).resolves.toMatchObject({
    status: 'new',
    kind: 'full',
    createdAt: '2026-11-24T10:30:45.000Z',
  })
})

it('ordnet kurz benannte Änderungspakete beim Import als Änderungen zu', async () => {
  const file = new File(['zip'], 'wah_update_2026-11-24_10-30-45.zip')
  vi.mocked(validateChangesExport).mockResolvedValue({
    packageId: 'changes',
  } as Awaited<ReturnType<typeof validateChangesExport>>)
  vi.mocked(appDatabase.appMetadata.get).mockResolvedValue(undefined)

  await expect(inspectFolderPackage(file)).resolves.toMatchObject({
    status: 'new',
    kind: 'changes',
  })
})
