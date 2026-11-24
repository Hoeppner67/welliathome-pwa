import { strToU8, zipSync } from 'fflate'
import { appDatabase } from '../../data/database/appDatabase'
import { FEED_RECOMMENDATIONS_INITIALIZATION_ID } from '../../models/appMetadata'
import { validateFullExport } from './validateFullExport'
import { deviceZipFileName } from './deviceZipFileName'

const DEVICE_ID_KEY = 'welliathome-device-id-v1'
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const tableNames = [
  'birds',
  'medications',
  'weights',
  'observations',
  'healthEvents',
  'vetAppointments',
  'reminders',
  'feedMixes',
  'favorites',
  'mediaAssets',
] as const

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Creates an independent snapshot; no record is marked as shared or removed. */
export async function createFullExport(): Promise<File> {
  const id = deviceId()
  const tables = tableNames.map((name) => appDatabase.table(name))
  const snapshot = await appDatabase.transaction(
    'r',
    [...tables, appDatabase.appMetadata, appDatabase.devicePendingPackages],
    async () => {
      const data: Record<string, unknown[]> = {}
      for (const name of tableNames) data[name] = await appDatabase.table(name).toArray()
      const initialization = await appDatabase.appMetadata.get(
        FEED_RECOMMENDATIONS_INITIALIZATION_ID,
      )
      const pending = await appDatabase.devicePendingPackages.toArray()
      return { data, initialization, pending }
    },
  )

  const files: Record<string, Uint8Array> = {}
  const media = snapshot.data.mediaAssets as Array<Record<string, unknown> & { blob: Blob }>
  let totalBytes = 0
  const serializedMedia = []
  for (let index = 0; index < media.length; index++) {
    const { blob, ...fields } = media[index]
    if (!(blob instanceof Blob) || blob.size !== fields.fileSize || blob.type !== fields.mimeType) {
      throw new Error('Eine Mediendatei ist ungültig. Der Export wurde nicht erstellt.')
    }
    totalBytes += blob.size
    if (totalBytes > MAX_ARCHIVE_BYTES)
      throw new Error('Die Daten überschreiten das Exportlimit von 100 MB.')
    const path = `media/${index}`
    files[path] = new Uint8Array(await blob.arrayBuffer())
    serializedMedia.push({ ...fields, mediaPath: path })
  }
  const archives = []
  for (const [index, item] of snapshot.pending.entries()) {
    const archivePath = `conflicts/${index}-source`
    totalBytes += item.archive.size
    if (totalBytes > MAX_ARCHIVE_BYTES)
      throw new Error('Die Daten überschreiten das Exportlimit von 100 MB.')
    files[archivePath] = new Uint8Array(await item.archive.arrayBuffer())
    const conflicts = []
    for (const [position, conflict] of item.conflicts.entries()) {
      const versions = []
      for (const [label, row] of [
        ['local', conflict.local],
        ['incoming', conflict.incoming],
      ] as const) {
        if (!row) {
          versions.push(null)
          continue
        }
        const { blob, ...fields } = row
        if (blob !== undefined && !(blob instanceof Blob))
          throw new Error('Eine archivierte Mediendatei ist ungültig.')
        if (blob instanceof Blob) {
          const path = `conflicts/${index}-${position}-${label}`
          totalBytes += blob.size
          if (totalBytes > MAX_ARCHIVE_BYTES)
            throw new Error('Die Daten überschreiten das Exportlimit von 100 MB.')
          files[path] = new Uint8Array(await blob.arrayBuffer())
          versions.push({ ...fields, mediaPath: path, mediaType: blob.type })
        } else versions.push(fields)
      }
      conflicts.push({ ...conflict, local: versions[0], incoming: versions[1] })
    }
    archives.push({
      packageId: item.packageId,
      createdAt: item.createdAt,
      resolvedAt: item.resolvedAt ?? null,
      resolvedChoice: item.resolvedChoice ?? null,
      kind: item.kind ?? 'snapshot',
      archivePath,
      conflicts,
    })
  }
  const payload = strToU8(
    JSON.stringify({
      data: { ...snapshot.data, mediaAssets: serializedMedia },
      initialization: snapshot.initialization ?? null,
      archives,
    }),
  )
  totalBytes += payload.length
  if (totalBytes > MAX_ARCHIVE_BYTES)
    throw new Error('Die Daten überschreiten das Exportlimit von 100 MB.')
  files['data.json'] = payload
  const checksums: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(files)) checksums[path] = await sha256(bytes)
  const createdAt = new Date().toISOString()
  const packageId = crypto.randomUUID()
  files['manifest.json'] = strToU8(
    JSON.stringify({
      format: 'welliathome-device-snapshot',
      formatVersion: 2,
      packageId,
      deviceId: id,
      createdAt,
      checksums,
    }),
  )
  const archive = zipSync(files, { level: 6 })
  if (archive.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error('Die Daten überschreiten das Exportlimit von 100 MB.')
  const file = new File(
    [archive as Uint8Array<ArrayBuffer>],
    deviceZipFileName(createdAt, 'daten'),
    { type: 'application/zip' },
  )
  await validateFullExport(file)
  return file
}
