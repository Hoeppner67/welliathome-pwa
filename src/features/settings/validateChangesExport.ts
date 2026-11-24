import { Unzip, UnzipInflate } from 'fflate'
import { isIsoTimestamp } from '../../utils/date'
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
import type { DeviceOperation, PersonalTable } from './changeJournal'

const MAX_BYTES = 100 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validators: Record<PersonalTable, (value: unknown) => void> = {
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
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültiger Paketinhalt.')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('Ungültige Paketstruktur.')
}
function parse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Das Paket enthält ungültiges JSON.')
  }
}

/** Validate and decode without reading or modifying the destination database. */
export async function validateChangesExport(input: Blob): Promise<{
  packageId: string
  deviceId: string
  operations: DeviceOperation[]
  entryCount: number
  expandedBytes: number
}> {
  if (!input.size || input.size > MAX_BYTES)
    throw new Error('Die ZIP-Datei ist leer oder größer als 100 MB.')
  const bytes = new Uint8Array(await input.arrayBuffer())
  if (bytes.length < 22) throw new Error('Die ZIP-Datei ist unvollständig.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  if (
    view.getUint32(end, true) !== 0x06054b50 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 20, true) ||
    view.getUint16(end + 8, true) !== view.getUint16(end + 10, true) ||
    view.getUint32(end + 12, true) + view.getUint32(end + 16, true) !== end
  )
    throw new Error('Ungültiges ZIP-Inhaltsverzeichnis.')
  const files = new Map<string, Uint8Array>()
  const names = new Set<string>()
  let total = 0
  const unzip = new Unzip((file) => {
    if (
      !/^(manifest\.json|operations\.json|media\/(0|[1-9][0-9]*)-(before|after))$/.test(
        file.name,
      ) ||
      names.has(file.name) ||
      names.size >= 10002
    )
      throw new Error('Unerlaubte oder doppelte Dateien.')
    names.add(file.name)
    const chunks: Uint8Array[] = []
    let size = 0
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      size += chunk.length
      total += chunk.length
      if (total > MAX_BYTES || (file.name === 'manifest.json' && size > 1024 * 1024))
        throw new Error('Das Paket überschreitet das Größenlimit.')
      chunks.push(chunk)
      if (final) {
        const data = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) {
          data.set(part, offset)
          offset += part.length
        }
        files.set(file.name, data)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length; offset += 65536)
      unzip.push(bytes.subarray(offset, offset + 65536), offset + 65536 >= bytes.length)
  } catch (cause) {
    throw new Error('Die ZIP-Datei ist beschädigt oder unzulässig.', { cause })
  }
  if (
    files.size !== names.size ||
    files.size !== view.getUint16(end + 10, true) ||
    !files.has('manifest.json') ||
    !files.has('operations.json')
  )
    throw new Error('Das Paket ist unvollständig.')
  const manifest = obj(parse(files.get('manifest.json')!))
  keys(manifest, ['format', 'formatVersion', 'packageId', 'deviceId', 'createdAt', 'checksums'])
  if (
    manifest.format !== 'welliathome-device-changes' ||
    manifest.formatVersion !== 1 ||
    typeof manifest.packageId !== 'string' ||
    !UUID.test(manifest.packageId) ||
    typeof manifest.deviceId !== 'string' ||
    !UUID.test(manifest.deviceId) ||
    !isIsoTimestamp(manifest.createdAt)
  )
    throw new Error('Ungültiges Änderungsmanifest.')
  const checksums = obj(manifest.checksums)
  const paths = [...files.keys()].filter((path) => path !== 'manifest.json')
  keys(checksums, paths)
  for (const path of paths) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      files.get(path)! as Uint8Array<ArrayBuffer>,
    )
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    if (checksums[path] !== actual) throw new Error('Eine Prüfsumme stimmt nicht überein.')
  }
  const raw = parse(files.get('operations.json')!)
  if (!Array.isArray(raw)) throw new Error('Ungültige Operationsliste.')
  const ids = new Set<string>()
  const sequences = new Set<string>()
  const media = new Set<string>()
  const operations: DeviceOperation[] = raw.map((value: unknown, index: number) => {
    const op = obj(value)
    const allowed = [
      'operationId',
      'deviceId',
      'sequence',
      'tableName',
      'recordId',
      'action',
      'before',
      'after',
      'createdAt',
      'resolutionParents',
    ]
    if (
      Object.keys(op).length < 9 ||
      Object.keys(op).length > allowed.length ||
      Object.keys(op).some((key) => !allowed.includes(key))
    )
      throw new Error('Ungültige Paketstruktur.')
    if (
      Object.hasOwn(op, 'resolutionParents') &&
      (!Array.isArray(op.resolutionParents) ||
        op.resolutionParents.length !== 2 ||
        op.resolutionParents.some(
          (parent: unknown) => typeof parent !== 'string' || !UUID.test(parent),
        ))
    )
      throw new Error('Ungültige Konfliktauflösungs-Eltern.')
    if (
      typeof op.operationId !== 'string' ||
      !UUID.test(op.operationId) ||
      ids.has(op.operationId) ||
      typeof op.deviceId !== 'string' ||
      !UUID.test(op.deviceId) ||
      !Number.isSafeInteger(op.sequence) ||
      (op.sequence as number) < 1 ||
      typeof op.tableName !== 'string' ||
      !Object.hasOwn(validators, op.tableName) ||
      typeof op.recordId !== 'string' ||
      !op.recordId.trim() ||
      (op.action !== 'put' && op.action !== 'delete') ||
      !isIsoTimestamp(op.createdAt)
    )
      throw new Error('Ungültige Änderungsoperation.')
    ids.add(op.operationId)
    const seq = `${op.deviceId}:${op.sequence}`
    if (sequences.has(seq)) throw new Error('Doppelte Operationssequenz.')
    sequences.add(seq)
    const tableName = op.tableName as PersonalTable
    function row(rawRow: unknown, label: 'before' | 'after') {
      if (rawRow === null) return null
      const item = obj(rawRow)
      let decoded = item
      if (tableName === 'mediaAssets') {
        const { mediaPath, mediaType, ...fields } = item
        const expected = `media/${index}-${label}`
        if (
          mediaPath !== expected ||
          media.has(expected) ||
          !files.has(expected) ||
          typeof mediaType !== 'string' ||
          mediaType !== fields.mimeType
        )
          throw new Error('Ungültiger Medienverweis.')
        media.add(expected)
        const data = files.get(expected)!
        if (fields.fileSize !== data.length) throw new Error('Ungültige Mediengröße.')
        decoded = {
          ...fields,
          blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: mediaType }),
        }
      } else if (Object.hasOwn(item, 'mediaPath') || Object.hasOwn(item, 'blob'))
        throw new Error('Unerwartete Mediendaten.')
      validators[tableName](decoded)
      if (decoded.id !== op.recordId) throw new Error('Die Datensatz-ID stimmt nicht überein.')
      return decoded as Record<string, unknown> & { id: string }
    }
    const before = row(op.before, 'before')
    const after = row(op.after, 'after')
    if ((op.action === 'delete' && (!before || after)) || (op.action === 'put' && !after))
      throw new Error('Ungültiger Operationszustand.')
    return {
      operationId: op.operationId,
      deviceId: op.deviceId,
      sequence: op.sequence as number,
      tableName,
      recordId: op.recordId,
      action: op.action,
      before,
      after,
      createdAt: op.createdAt as string,
      ...(Object.hasOwn(op, 'resolutionParents')
        ? { resolutionParents: op.resolutionParents as readonly [string, string] }
        : {}),
    }
  })
  for (const operation of operations) {
    if (!operation.resolutionParents) continue
    const [first, second] = operation.resolutionParents
    if (first === second) throw new Error('Ungültige Konfliktauflösungs-Eltern.')
    for (const parentId of operation.resolutionParents) {
      const parent = operations.find((item) => item.operationId === parentId)
      if (
        !parent ||
        parent.tableName !== operation.tableName ||
        parent.recordId !== operation.recordId
      )
        throw new Error('Ungültige Konfliktauflösungs-Eltern.')
    }
  }
  if (paths.filter((path) => path.startsWith('media/')).length !== media.size)
    throw new Error('Nicht referenzierte Mediendatei.')
  return {
    packageId: manifest.packageId,
    deviceId: manifest.deviceId,
    operations,
    entryCount: names.size,
    expandedBytes: total,
  }
}
