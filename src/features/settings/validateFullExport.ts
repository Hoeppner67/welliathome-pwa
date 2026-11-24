import { Unzip, UnzipInflate } from 'fflate'
import {
  validateBirdProfile,
  validateMedication,
  validateWeightEntry,
  validateObservation,
  validateHealthEvent,
  validateVetAppointment,
  validateReminder,
  validateFeedMix,
  validateFavorite,
  validateMediaAsset,
} from '../../data/repositories/validators'
import {
  FEED_RECOMMENDATIONS_INITIALIZATION_ID,
  FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
} from '../../models/appMetadata'
import { isIsoTimestamp } from '../../utils/date'
import type { PendingPackage } from './importFullExport'
import { validateChangesExport } from './validateChangesExport'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 10002
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validators: Record<string, (value: unknown) => void> = {
  birds: validateBirdProfile,
  medications: validateMedication,
  weights: validateWeightEntry,
  observations: validateObservation,
  healthEvents: validateHealthEvent,
  vetAppointments: validateVetAppointment,
  reminders: validateReminder,
  feedMixes: validateFeedMix,
  favorites: validateFavorite,
  mediaAssets: validateMediaAsset,
}
type Row = Record<string, unknown> & { id: string }
export interface ValidatedSnapshot {
  packageId: string
  deviceId: string
  createdAt: string
  data: Record<string, Row[]>
  initialization: { id: string; value: string } | null
  archives: PendingPackage[]
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültiger Datenaufbau.')
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Unerwartete oder fehlende Datenfelder.')
  }
}
function json(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Die ZIP-Datei enthält ungültiges JSON.')
  }
}
async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Parses a snapshot without reading or modifying the local database. */
export async function validateFullExport(input: Blob, depth = 0): Promise<ValidatedSnapshot> {
  if (depth > 8) throw new Error('Konfliktarchive sind zu tief verschachtelt.')
  if (input.size === 0 || input.size > MAX_BYTES)
    throw new Error('Die ZIP-Datei ist leer oder größer als 100 MB.')
  const bytes = new Uint8Array(await input.arrayBuffer())
  // Our format has no ZIP comment, ZIP64 records, or trailing data.
  if (bytes.length < 22) throw new Error('Die ZIP-Datei ist unvollständig.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  if (
    view.getUint32(end, true) !== 0x06054b50 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 20, true) !== 0 ||
    view.getUint16(end + 8, true) !== view.getUint16(end + 10, true) ||
    view.getUint32(end + 12, true) + view.getUint32(end + 16, true) !== end
  ) {
    throw new Error('Die ZIP-Datei besitzt ein ungültiges Inhaltsverzeichnis.')
  }
  const entryCount = view.getUint16(end + 10, true)
  const files = new Map<string, Uint8Array>()
  const names = new Set<string>()
  let total = 0
  const unzip = new Unzip((file) => {
    if (
      !/^(manifest\.json|data\.json|media\/(0|[1-9][0-9]*)|conflicts\/(0|[1-9][0-9]*)-(source|(0|[1-9][0-9]*)-(local|incoming)))$/.test(
        file.name,
      ) ||
      names.has(file.name) ||
      names.size >= MAX_FILES
    ) {
      throw new Error('Die ZIP-Datei enthält unerlaubte oder doppelte Dateinamen.')
    }
    names.add(file.name)
    const chunks: Uint8Array[] = []
    let size = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      size += chunk.length
      total += chunk.length
      if (
        total > MAX_BYTES ||
        size > MAX_BYTES ||
        (file.name === 'manifest.json' && size > 1024 * 1024)
      ) {
        throw new Error('Die entpackten Daten überschreiten das Größenlimit.')
      }
      chunks.push(chunk)
      if (final) {
        const content = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) {
          content.set(part, offset)
          offset += part.length
        }
        files.set(file.name, content)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      unzip.push(bytes.subarray(offset, offset + 65536), offset + 65536 >= bytes.length)
    }
  } catch (error) {
    throw new Error('Die ZIP-Datei ist beschädigt oder unzulässig.', { cause: error })
  }
  if (
    !files.has('manifest.json') ||
    !files.has('data.json') ||
    files.size !== names.size ||
    files.size !== entryCount
  )
    throw new Error('Die ZIP-Datei ist unvollständig.')
  const manifest = object(json(files.get('manifest.json')!))
  exactKeys(manifest, [
    'format',
    'formatVersion',
    'packageId',
    'deviceId',
    'createdAt',
    'checksums',
  ])
  if (
    manifest.format !== 'welliathome-device-snapshot' ||
    (manifest.formatVersion !== 1 && manifest.formatVersion !== 2) ||
    typeof manifest.packageId !== 'string' ||
    !UUID.test(manifest.packageId) ||
    typeof manifest.deviceId !== 'string' ||
    !UUID.test(manifest.deviceId) ||
    !isIsoTimestamp(manifest.createdAt)
  ) {
    throw new Error('Das Manifest enthält ein ungültiges Format oder ungültige Kennungen.')
  }
  const checksums = object(manifest.checksums)
  const paths = [...files.keys()].filter((name) => name !== 'manifest.json')
  exactKeys(checksums, paths)
  for (const path of paths) {
    if (
      typeof checksums[path] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(checksums[path] as string) ||
      (await hash(files.get(path)!)) !== checksums[path]
    ) {
      throw new Error('Eine Prüfsumme stimmt nicht überein.')
    }
  }
  const payload = object(json(files.get('data.json')!))
  exactKeys(
    payload,
    manifest.formatVersion === 1
      ? ['data', 'initialization']
      : ['data', 'initialization', 'archives'],
  )
  const raw = object(payload.data)
  exactKeys(raw, Object.keys(validators))
  const data: Record<string, Row[]> = {}
  const usedMedia = new Set<string>()
  for (const [name, validate] of Object.entries(validators)) {
    if (!Array.isArray(raw[name])) throw new Error(`Ungültige Tabelle: ${name}.`)
    const ids = new Set<string>()
    data[name] = raw[name].map((value: unknown) => {
      const record = object(value)
      let result = record
      if (name === 'mediaAssets') {
        const { mediaPath, ...fields } = record
        if (
          typeof mediaPath !== 'string' ||
          !/^media\/(0|[1-9][0-9]*)$/.test(mediaPath) ||
          usedMedia.has(mediaPath) ||
          !files.has(mediaPath) ||
          typeof fields.mimeType !== 'string'
        )
          throw new Error('Ungültiger Medienverweis.')
        usedMedia.add(mediaPath)
        const bytes = files.get(mediaPath)!
        if (fields.fileSize !== bytes.length)
          throw new Error('Die Mediengröße stimmt nicht überein.')
        result = {
          ...fields,
          blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: fields.mimeType }),
        }
      }
      validate(result)
      const row = result as Row
      if (ids.has(row.id)) throw new Error(`Doppelte ID in ${name}.`)
      ids.add(row.id)
      return row
    })
  }
  if (paths.filter((path) => path.startsWith('media/')).length !== usedMedia.size)
    throw new Error('Nicht referenzierte Mediendatei.')
  const birds = new Set(data.birds.map((row) => row.id))
  const media = new Map(data.mediaAssets.map((row) => [row.id, row]))
  for (const bird of data.birds) {
    if (bird.imageId && (typeof bird.imageId !== 'string' || !media.has(bird.imageId)))
      throw new Error('Ein Vogelbild fehlt.')
    const image = typeof bird.imageId === 'string' ? media.get(bird.imageId) : undefined
    if (image?.relatedType === 'bird-profile' && image.relatedId !== bird.id)
      throw new Error('Ein Vogelbild ist falsch zugeordnet.')
  }
  for (const name of [
    'medications',
    'weights',
    'observations',
    'healthEvents',
    'vetAppointments',
    'reminders',
  ]) {
    for (const row of data[name])
      if (row.birdId && (typeof row.birdId !== 'string' || !birds.has(row.birdId)))
        throw new Error('Ein Vogelverweis fehlt.')
  }
  for (const row of data.mediaAssets)
    if (
      row.relatedType === 'bird-profile' &&
      (typeof row.relatedId !== 'string' || !birds.has(row.relatedId))
    )
      throw new Error('Ein Medienverweis ist ungültig.')
  const favorites = new Set<string>()
  for (const row of data.favorites) {
    const key = JSON.stringify([row.itemType, row.itemId])
    if (favorites.has(key)) throw new Error('Doppelte Favoriten.')
    favorites.add(key)
  }
  let initialization: ValidatedSnapshot['initialization'] = null
  if (payload.initialization !== null) {
    const marker = object(payload.initialization)
    exactKeys(marker, ['id', 'value'])
    if (
      marker.id !== FEED_RECOMMENDATIONS_INITIALIZATION_ID ||
      marker.value !== FEED_RECOMMENDATIONS_INITIALIZED_VALUE
    )
      throw new Error('Ungültige Initialisierung.')
    initialization = { id: marker.id, value: marker.value }
  }
  const archives: PendingPackage[] = []
  const usedArchives = new Set<string>()
  const archiveIds = new Set<string>()
  if (manifest.formatVersion === 2) {
    if (!Array.isArray(payload.archives)) throw new Error('Ungültige Konfliktarchive.')
    for (const [index, rawArchive] of payload.archives.entries()) {
      const item = object(rawArchive)
      exactKeys(item, [
        'packageId',
        'createdAt',
        'resolvedAt',
        'resolvedChoice',
        'kind',
        'archivePath',
        'conflicts',
      ])
      const source = `conflicts/${index}-source`
      if (
        typeof item.packageId !== 'string' ||
        !UUID.test(item.packageId) ||
        item.packageId === manifest.packageId ||
        archiveIds.has(item.packageId) ||
        !isIsoTimestamp(item.createdAt) ||
        (item.resolvedAt !== null && !isIsoTimestamp(item.resolvedAt)) ||
        (item.resolvedChoice !== null &&
          item.resolvedChoice !== 'local' &&
          item.resolvedChoice !== 'incoming') ||
        (item.kind !== 'snapshot' && item.kind !== 'changes') ||
        item.archivePath !== source ||
        !files.has(source) ||
        !Array.isArray(item.conflicts)
      )
        throw new Error('Ungültiges Konfliktarchiv.')
      archiveIds.add(item.packageId)
      usedArchives.add(source)
      const conflicts = item.conflicts.map((rawConflict: unknown, position: number) => {
        const conflict = object(rawConflict)
        const allowed = [
          'table',
          'recordId',
          'local',
          'incoming',
          ...(Object.hasOwn(conflict, 'operationId') ? ['operationId'] : []),
        ]
        exactKeys(conflict, allowed)
        if (
          typeof conflict.table !== 'string' ||
          !Object.hasOwn(validators, conflict.table) ||
          typeof conflict.recordId !== 'string' ||
          !conflict.recordId ||
          (conflict.operationId !== undefined &&
            (typeof conflict.operationId !== 'string' || !UUID.test(conflict.operationId)))
        )
          throw new Error('Ungültiger Konflikt.')
        function decode(value: unknown, label: 'local' | 'incoming'): Row | null {
          if (value === null) return null
          const row = object(value)
          let decoded = row
          if (conflict.table === 'mediaAssets') {
            const { mediaPath, mediaType, ...fields } = row
            const path = `conflicts/${index}-${position}-${label}`
            if (
              mediaPath !== path ||
              typeof mediaType !== 'string' ||
              mediaType !== fields.mimeType ||
              !files.has(path) ||
              fields.fileSize !== files.get(path)!.length
            )
              throw new Error('Ungültige archivierte Mediendatei.')
            usedArchives.add(path)
            decoded = {
              ...fields,
              blob: new Blob([files.get(path)! as Uint8Array<ArrayBuffer>], { type: mediaType }),
            }
          } else if (Object.hasOwn(row, 'blob') || Object.hasOwn(row, 'mediaPath'))
            throw new Error('Ungültige archivierte Mediendatei.')
          validators[conflict.table as string](decoded)
          if (decoded.id !== conflict.recordId && conflict.table !== 'favorites')
            throw new Error('Ungültiger Konfliktdatensatz.')
          return decoded as Row
        }
        return {
          table: conflict.table as string,
          recordId: conflict.recordId as string,
          local: decode(conflict.local, 'local'),
          incoming: decode(conflict.incoming, 'incoming'),
          ...(conflict.operationId ? { operationId: conflict.operationId as string } : {}),
        }
      })
      archives.push({
        packageId: item.packageId,
        createdAt: item.createdAt as string,
        archive: new Blob([files.get(source)! as Uint8Array<ArrayBuffer>], {
          type: 'application/zip',
        }),
        conflicts,
        kind: item.kind,
        ...(item.resolvedAt ? { resolvedAt: item.resolvedAt as string } : {}),
        ...(item.resolvedChoice
          ? { resolvedChoice: item.resolvedChoice as 'local' | 'incoming' }
          : {}),
      })
    }
  }
  if (paths.filter((path) => path.startsWith('conflicts/')).length !== usedArchives.size)
    throw new Error('Nicht referenziertes Konfliktarchiv.')
  for (const archive of archives) {
    const source =
      archive.kind === 'changes'
        ? await validateChangesExport(archive.archive)
        : await validateFullExport(archive.archive, depth + 1)
    if (source.packageId !== archive.packageId)
      throw new Error('Die Kennung des archivierten Pakets stimmt nicht überein.')
  }
  return {
    packageId: manifest.packageId as string,
    deviceId: manifest.deviceId as string,
    createdAt: manifest.createdAt as string,
    data,
    initialization,
    archives,
  }
}
