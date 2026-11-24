import { strToU8, zipSync } from 'fflate'
import { appDatabase, type AppDatabase } from '../../data/database/appDatabase'
import { deviceId } from './fullExport'
import { reconcileChanges } from './reconcileChanges'
import { validateChangesExport } from './validateChangesExport'

const MAX_BYTES = 100 * 1024 * 1024

/** Exports the complete retained journal; creating a ZIP never marks entries as delivered. */
export async function createChangesExport(
  database: AppDatabase = appDatabase,
  senderId?: string,
): Promise<File> {
  if (
    database === appDatabase &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('welliathome-device-sync-enabled') === 'true'
  )
    await reconcileChanges()
  const sender = senderId ?? deviceId()
  const operations = await database.transaction('r', database.deviceOperations, () =>
    database.deviceOperations.toArray(),
  )
  operations.sort((a, b) => a.deviceId.localeCompare(b.deviceId) || a.sequence - b.sequence)
  const files: Record<string, Uint8Array> = {}
  const encoded = []
  let total = 0
  for (const [index, operation] of operations.entries()) {
    const versions = []
    for (const [label, value] of [
      ['before', operation.before],
      ['after', operation.after],
    ] as const) {
      if (!value) {
        versions.push(null)
        continue
      }
      const { blob, ...fields } = value
      if (blob === undefined) {
        versions.push(fields)
        continue
      }
      if (!(blob instanceof Blob))
        throw new Error('Das Änderungsprotokoll enthält eine ungültige Mediendatei.')
      const path = `media/${index}-${label}`
      total += blob.size
      if (total > MAX_BYTES)
        throw new Error('Das Änderungspaket überschreitet das Limit von 100 MB.')
      files[path] = new Uint8Array(await blob.arrayBuffer())
      versions.push({ ...fields, mediaPath: path, mediaType: blob.type })
    }
    encoded.push({ ...operation, before: versions[0], after: versions[1] })
  }
  files['operations.json'] = strToU8(JSON.stringify(encoded))
  total += files['operations.json'].length
  if (total > MAX_BYTES) throw new Error('Das Änderungspaket überschreitet das Limit von 100 MB.')
  const checksums: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(files)) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
    checksums[path] = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  }
  const now = new Date().toISOString()
  const packageId = crypto.randomUUID()
  files['manifest.json'] = strToU8(
    JSON.stringify({
      format: 'welliathome-device-changes',
      formatVersion: 1,
      packageId,
      deviceId: sender,
      createdAt: now,
      checksums,
    }),
  )
  const archive = zipSync(files, { level: 6 })
  if (archive.byteLength > MAX_BYTES)
    throw new Error('Das Änderungspaket überschreitet das Limit von 100 MB.')
  const file = new File(
    [archive as Uint8Array<ArrayBuffer>],
    `wha_update-${now.replace(/[:.]/g, '-')}-${packageId}.zip`,
    { type: 'application/zip' },
  )
  await validateChangesExport(file)
  return file
}
