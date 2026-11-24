import { appDatabase } from '../../data/database/appDatabase'
import { validateChangesExport } from './validateChangesExport'
import { validateFullExport } from './validateFullExport'

export type FolderPackageStatus =
  'new' | 'imported' | 'invalid' | 'changed' | 'conflict' | 'unchecked'

export function folderFileKind(name: string): 'full' | 'changes' | undefined {
  if (/^(?:(?:wha|wah)_daten[-_]|welliathome-datenbestand-)/i.test(name)) return 'full'
  if (/^(?:(?:wha|wah)_update[-_]|welliathome-aenderungen-)/i.test(name)) return 'changes'
  return undefined
}

/** Classify only after the existing validators have checked the complete package. */
export async function inspectFolderPackage(file: File): Promise<{
  status: FolderPackageStatus
  kind?: 'full' | 'changes'
  createdAt?: string
}> {
  let packageId: string
  let kind: 'changes' | 'full'
  let createdAt: string | undefined
  try {
    packageId = (await validateChangesExport(file)).packageId
    kind = 'changes'
  } catch {
    try {
      const full = await validateFullExport(file)
      packageId = full.packageId
      createdAt = full.createdAt
      kind = 'full'
    } catch {
      return { status: 'invalid' }
    }
  }
  const prefix = kind === 'changes' ? 'device-change-package:' : 'device-import-package:'
  const marker = await appDatabase.appMetadata.get(`${prefix}${packageId}`)
  if (!marker) return { status: 'new', kind, createdAt }
  const expected =
    kind === 'changes'
      ? marker.value
      : (await appDatabase.appMetadata.get(`${prefix}${packageId}:sha256`))?.value
  // Old markers may lack a hash; the import validator remains authoritative.
  if (!expected) return { status: 'imported', kind, createdAt }
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return { status: hash === expected ? 'imported' : 'changed', kind, createdAt }
}

export async function folderPackageStatus(file: File): Promise<FolderPackageStatus> {
  return (await inspectFolderPackage(file)).status
}
