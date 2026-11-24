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

export function folderDisplayName(name: string, createdAt?: string): string {
  const match = name.match(
    /^(?:wha|wah)_(daten|update)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z-/i,
  )
  if (match)
    return `wah_${match[1].toLowerCase()}_${match[2]}_${match[3]}-${match[4]}-${match[5]}.zip`
  if (createdAt && /^welliathome-datenbestand-/i.test(name)) {
    const stamp = createdAt.slice(0, 19).replace('T', '_').replace(/:/g, '-')
    return `wah_daten_${stamp}.zip`
  }
  return name
}

/** Classify only after the existing validators have checked the complete package. */
export async function folderPackageStatus(file: File): Promise<FolderPackageStatus> {
  let packageId: string
  let kind: 'changes' | 'full'
  try {
    packageId = (await validateChangesExport(file)).packageId
    kind = 'changes'
  } catch {
    try {
      packageId = (await validateFullExport(file)).packageId
      kind = 'full'
    } catch {
      return 'invalid'
    }
  }
  const prefix = kind === 'changes' ? 'device-change-package:' : 'device-import-package:'
  const marker = await appDatabase.appMetadata.get(`${prefix}${packageId}`)
  if (!marker) return 'new'
  const expected =
    kind === 'changes'
      ? marker.value
      : (await appDatabase.appMetadata.get(`${prefix}${packageId}:sha256`))?.value
  // Old markers may lack a hash; the import validator remains authoritative.
  if (!expected) return 'imported'
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return hash === expected ? 'imported' : 'changed'
}
