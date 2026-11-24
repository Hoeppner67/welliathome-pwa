import type {
  BirdProfile,
  Favorite,
  FeedMix,
  HealthEvent,
  MediaAsset,
  Medication,
  Observation,
  Reminder,
  VetAppointment,
  WeightEntry,
} from '../../models'
import { appDatabase } from '../../data/database/appDatabase'
import {
  validateBirdProfile,
  validateFavorite,
  validateFeedMix,
  validateHealthEvent,
  validateMediaAsset,
  validateMedication,
  validateObservation,
  validateReminder,
  validateVetAppointment,
  validateWeightEntry,
} from '../../data/repositories/validators'
import { isIsoTimestamp } from '../../utils/date'
import {
  FEED_RECOMMENDATIONS_INITIALIZATION_ID,
  FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
} from '../../models/appMetadata'
import { FEED_RECOMMENDATIONS } from '../feed-mixes/services/feedRecommendations'
import {
  activeJournalDevice,
  writeCompoundRecord,
  type PersonalTable,
} from '../settings/changeJournal'

export const BACKUP_FORMAT = 'welliathome-backup'
export const BACKUP_FORMAT_VERSION = 2
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024
export const MAX_BACKUP_IMAGE_BYTES = 2 * 1024 * 1024
const LAST_BACKUP_ID = 'last-personal-backup-at'

type BackupData = {
  birds: BirdProfile[]
  medications: Medication[]
  weights: WeightEntry[]
  observations: Observation[]
  healthEvents: HealthEvent[]
  vetAppointments: VetAppointment[]
  reminders: Reminder[]
  feedMixes: FeedMix[]
  favorites: Favorite[]
  mediaAssets: MediaAsset[]
}

export interface BackupExport {
  json: string
  invalidRecords: number
}

type SerializedMediaAsset = Omit<MediaAsset, 'blob'> & {
  blob: { type: string; base64: string }
}

export interface ParsedBackup {
  format: typeof BACKUP_FORMAT
  formatVersion: 1 | typeof BACKUP_FORMAT_VERSION
  createdAt: string
  initialization: {
    feedRecommendationsSeeded: boolean
  }
  data: BackupData
  ignoredFields: number
  summary: {
    birds: number
    documentation: number
    feedMixes: number
  }
}

export class BackupValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BackupValidationError'
  }
}

const personalTableNames = new Set([
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
])
const personalTables = appDatabase.tables.filter((table) => personalTableNames.has(table.name))
const backupTables = [...personalTables, appDatabase.appMetadata]

function isUnmodifiedRecommendation(mix: FeedMix): boolean {
  return (
    mix.createdAt === mix.updatedAt &&
    FEED_RECOMMENDATIONS.some(
      (recommendation) =>
        mix.name === recommendation.name &&
        mix.provider === recommendation.provider &&
        JSON.stringify(mix.ingredients) === JSON.stringify(recommendation.ingredients) &&
        mix.productUrl === recommendation.productUrl &&
        mix.notes === recommendation.notes,
    )
  )
}

async function hasUserCreatedData(): Promise<boolean> {
  const nonMixCounts = await Promise.all(
    personalTables
      .filter((table) => table.name !== appDatabase.feedMixes.name)
      .map((table) => table.count()),
  )
  if (nonMixCounts.some((count) => count > 0)) return true
  return (await appDatabase.feedMixes.toArray()).some((mix) => !isUnmodifiedRecommendation(mix))
}

export async function hasUserData(): Promise<boolean> {
  return appDatabase.transaction('r', backupTables, hasUserCreatedData)
}

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

const recordFields: Record<string, readonly string[]> = {
  birds: [
    'id',
    'name',
    'nickname',
    'species',
    'gender',
    'hatchDate',
    'arrivalDate',
    'color',
    'ringNumber',
    'origin',
    'notes',
    'imageId',
    'createdAt',
    'updatedAt',
  ],
  medications: [
    'id',
    'birdId',
    'name',
    'dosage',
    'startDate',
    'endDate',
    'notes',
    'createdAt',
    'updatedAt',
  ],
  weights: ['id', 'birdId', 'weight', 'date', 'notes', 'createdAt', 'updatedAt'],
  observations: [
    'id',
    'birdId',
    'title',
    'description',
    'date',
    'category',
    'createdAt',
    'updatedAt',
  ],
  healthEvents: [
    'id',
    'birdId',
    'title',
    'description',
    'date',
    'severity',
    'resolved',
    'notes',
    'createdAt',
    'updatedAt',
  ],
  vetAppointments: [
    'id',
    'birdId',
    'date',
    'title',
    'veterinarian',
    'reason',
    'diagnosis',
    'notes',
    'completed',
    'createdAt',
    'updatedAt',
  ],
  reminders: [
    'id',
    'birdId',
    'title',
    'description',
    'dueDate',
    'completed',
    'reminderType',
    'createdAt',
    'updatedAt',
  ],
  feedMixes: [
    'id',
    'name',
    'provider',
    'ingredients',
    'productUrl',
    'notes',
    'createdAt',
    'updatedAt',
  ],
  favorites: ['id', 'itemType', 'itemId', 'title', 'createdAt', 'updatedAt'],
  mediaAssets: [
    'id',
    'fileName',
    'mimeType',
    'fileSize',
    'blob',
    'relatedType',
    'relatedId',
    'createdAt',
    'updatedAt',
  ],
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BackupValidationError(`${label} muss ein JSON-Objekt sein.`)
  }
  return value as Record<string, unknown>
}

function knownFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  ignored?: { count: number },
): Record<string, unknown> {
  const entries = Object.entries(record).filter(([key]) => allowed.includes(key))
  if (ignored) ignored.count += Object.keys(record).length - entries.length
  return Object.fromEntries(entries)
}

function validateRows<T>(
  value: unknown,
  tableName: string,
  validator: (value: unknown) => void,
  ignored?: { count: number },
): T[] {
  if (!Array.isArray(value)) {
    throw new BackupValidationError(`Im Backup fehlt eine gültige Tabelle „${tableName}“.`)
  }
  return value.map((row, index) => {
    try {
      const record = knownFields(
        asObject(row, `Ein Datensatz aus „${tableName}“`),
        recordFields[tableName],
        ignored,
      )
      validator(record)
      return record as T
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unbekannter Validierungsfehler.'
      throw new BackupValidationError(
        `Ungültiger Datensatz in „${tableName}“ (Eintrag ${index + 1}): ${detail}`,
        { cause: error },
      )
    }
  })
}

function assertUniqueIds<T extends { id: string }>(records: T[], tableName: string): void {
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.id))
      throw new BackupValidationError(`Die Tabelle „${tableName}“ enthält doppelte IDs.`)
    ids.add(record.id)
  }
}

function decodeBase64(value: string, type: string): Blob {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new BackupValidationError('Ein Profilbild enthält ungültige Base64-Daten.')
  }
  let binary: string
  try {
    binary = atob(value)
  } catch (error) {
    throw new BackupValidationError('Ein Profilbild konnte nicht decodiert werden.', {
      cause: error,
    })
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new Blob([buffer], { type })
}

export function validateBackupFileSize(size: number): void {
  if (size > MAX_BACKUP_FILE_BYTES) {
    throw new BackupValidationError('Die Backupdatei ist größer als das erlaubte Limit von 50 MB.')
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function serializeMediaAsset(asset: MediaAsset): Promise<SerializedMediaAsset> {
  const { blob, ...fields } = asset
  if (!(blob instanceof Blob)) return { ...fields, blob: { type: '', base64: '' } }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { ...fields, blob: { type: blob.type, base64: encodeBase64(bytes) } }
}

function countInvalidRecords(data: BackupData): number {
  const validators: {
    [K in keyof BackupData]: (value: unknown) => void
  } = {
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
  let invalidRecords = 0
  for (const tableName of tableNames) {
    const seenIds = new Set<string>()
    for (const record of data[tableName]) {
      let invalid = false
      try {
        validators[tableName](record)
        if (seenIds.has(record.id)) invalid = true
        if (tableName === 'mediaAssets' && hasMediaAssetExportIssue(record)) {
          invalid = true
        }
        seenIds.add(record.id)
      } catch {
        invalid = true
      }
      if (invalid) invalidRecords += 1
    }
  }
  try {
    validateRelationships(data)
  } catch {
    invalidRecords += 1
  }
  return invalidRecords
}

function hasMediaAssetExportIssue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<MediaAsset>
  return (
    typeof asset.mimeType !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ||
    typeof asset.fileSize !== 'number' ||
    asset.fileSize > MAX_BACKUP_IMAGE_BYTES ||
    !(asset.blob instanceof Blob) ||
    asset.blob.size !== asset.fileSize
  )
}

function validateRelationships(data: BackupData): void {
  const birdIds = new Set(data.birds.map((bird) => bird.id))
  const mediaById = new Map(data.mediaAssets.map((asset) => [asset.id, asset]))

  for (const bird of data.birds) {
    if (bird.imageId && !mediaById.has(bird.imageId)) {
      throw new BackupValidationError(
        `Das Profil „${bird.name}“ verweist auf ein fehlendes Profilbild.`,
      )
    }
    if (bird.imageId) {
      const asset = mediaById.get(bird.imageId)
      if (asset?.relatedType === 'bird-profile' && asset.relatedId !== bird.id) {
        throw new BackupValidationError(
          `Das Profilbild von „${bird.name}“ ist einem anderen Vogel zugeordnet.`,
        )
      }
    }
  }

  const birdRelated = [
    ['Medikamente', data.medications],
    ['Gewichtseinträge', data.weights],
    ['Beobachtungen', data.observations],
    ['Gesundheitsereignisse', data.healthEvents],
    ['Tierarzttermine', data.vetAppointments],
    ['Erinnerungen', data.reminders],
  ] as const

  for (const [label, records] of birdRelated) {
    for (const record of records) {
      if (record.birdId && !birdIds.has(record.birdId)) {
        throw new BackupValidationError(
          `Ein Eintrag unter „${label}“ verweist auf ein nicht vorhandenes Vogelprofil.`,
        )
      }
    }
  }

  for (const asset of data.mediaAssets) {
    if (
      asset.relatedType === 'bird-profile' &&
      (!asset.relatedId || !birdIds.has(asset.relatedId))
    ) {
      throw new BackupValidationError(
        'Ein Profilbild verweist auf ein nicht vorhandenes Vogelprofil.',
      )
    }
  }

  const favoriteKeys = new Set<string>()
  for (const favorite of data.favorites) {
    const key = JSON.stringify([favorite.itemType, favorite.itemId])
    if (favoriteKeys.has(key))
      throw new BackupValidationError('Das Backup enthält doppelte Favoriten.')
    favoriteKeys.add(key)
  }
}

function validateBackupData(
  value: unknown,
  decodeMedia: boolean,
  ignored?: { count: number },
): BackupData {
  const raw = asObject(value, 'Der Datenbereich')
  const keys = Object.keys(raw)
  if (
    keys.length !== tableNames.length ||
    tableNames.some((name) => !Object.prototype.hasOwnProperty.call(raw, name))
  ) {
    throw new BackupValidationError(
      'Das Backup enthält nicht genau die unterstützten Welli@Home-Datentabellen.',
    )
  }

  const birds = validateRows<BirdProfile>(raw.birds, 'birds', validateBirdProfile, ignored)
  const medications = validateRows<Medication>(
    raw.medications,
    'medications',
    validateMedication,
    ignored,
  )
  const weights = validateRows<WeightEntry>(raw.weights, 'weights', validateWeightEntry, ignored)
  const observations = validateRows<Observation>(
    raw.observations,
    'observations',
    validateObservation,
    ignored,
  )
  const healthEvents = validateRows<HealthEvent>(
    raw.healthEvents,
    'healthEvents',
    validateHealthEvent,
    ignored,
  )
  const vetAppointments = validateRows<VetAppointment>(
    raw.vetAppointments,
    'vetAppointments',
    validateVetAppointment,
    ignored,
  )
  const reminders = validateRows<Reminder>(raw.reminders, 'reminders', validateReminder, ignored)
  const feedMixes = validateRows<FeedMix>(raw.feedMixes, 'feedMixes', validateFeedMix, ignored)
  const favorites = validateRows<Favorite>(raw.favorites, 'favorites', validateFavorite, ignored)

  let mediaAssets: MediaAsset[]
  if (decodeMedia) {
    if (!Array.isArray(raw.mediaAssets))
      throw new BackupValidationError('Im Backup fehlt eine gültige Tabelle „mediaAssets“.')
    mediaAssets = raw.mediaAssets.map((item, index) => {
      const serialized = knownFields(
        asObject(item, `mediaAssets[${index}]`),
        recordFields.mediaAssets,
        ignored,
      )
      const blobData = knownFields(
        asObject(serialized.blob, `mediaAssets[${index}].blob`),
        ['type', 'base64'],
        ignored,
      )
      if (typeof blobData.type !== 'string' || typeof blobData.base64 !== 'string') {
        throw new BackupValidationError(
          `Das Profilbild ${index + 1} besitzt keine gültige Bilddatei.`,
        )
      }
      if (
        blobData.type !== serialized.mimeType ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(blobData.type)
      ) {
        throw new BackupValidationError(
          `Das Profilbild ${index + 1} besitzt keinen unterstützten Bildtyp.`,
        )
      }
      if (typeof serialized.fileSize === 'number' && serialized.fileSize > MAX_BACKUP_IMAGE_BYTES) {
        throw new BackupValidationError(
          `Das Profilbild ${index + 1} überschreitet das Limit von 2 MB.`,
        )
      }
      if (blobData.base64.length > Math.ceil(MAX_BACKUP_IMAGE_BYTES / 3) * 4) {
        throw new BackupValidationError(
          `Das Profilbild ${index + 1} überschreitet das Limit von 2 MB.`,
        )
      }
      const { blob: _blob, ...fields } = serialized
      const record = { ...fields, blob: decodeBase64(blobData.base64, blobData.type) }
      try {
        validateMediaAsset(record)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unbekannter Validierungsfehler.'
        throw new BackupValidationError(
          `Ungültiger Datensatz in „mediaAssets“ (Eintrag ${index + 1}): ${detail}`,
          { cause: error },
        )
      }
      if (record.fileSize !== record.blob.size) {
        throw new BackupValidationError(
          `Die Dateigröße des Profilbilds ${index + 1} stimmt nicht mit dessen Inhalt überein.`,
        )
      }
      if (record.blob.size > MAX_BACKUP_IMAGE_BYTES) {
        throw new BackupValidationError(
          `Das Profilbild ${index + 1} überschreitet das Limit von 2 MB.`,
        )
      }
      return record
    })
  } else {
    mediaAssets = validateRows<MediaAsset>(
      raw.mediaAssets,
      'mediaAssets',
      validateMediaAsset,
      ignored,
    )
  }

  for (const [name, rows] of Object.entries({
    birds,
    medications,
    weights,
    observations,
    healthEvents,
    vetAppointments,
    reminders,
    feedMixes,
    favorites,
    mediaAssets,
  }) as [string, Array<{ id: string }>][]) {
    assertUniqueIds(rows, name)
  }

  const data: BackupData = {
    birds,
    medications,
    weights,
    observations,
    healthEvents,
    vetAppointments,
    reminders,
    feedMixes,
    favorites,
    mediaAssets,
  }
  validateRelationships(data)
  return data
}

function summarize(data: BackupData): ParsedBackup['summary'] {
  return {
    birds: data.birds.length,
    documentation:
      data.medications.length +
      data.weights.length +
      data.observations.length +
      data.healthEvents.length +
      data.vetAppointments.length +
      data.reminders.length,
    feedMixes: data.feedMixes.length,
  }
}

function validateMetadata(value: unknown): asserts value is Record<string, unknown> & {
  format: typeof BACKUP_FORMAT
  formatVersion: 1 | typeof BACKUP_FORMAT_VERSION
  createdAt: string
  data: unknown
  initialization?: unknown
} {
  const backup = asObject(value, 'Die Backupdatei')
  if (backup.format !== BACKUP_FORMAT) {
    throw new BackupValidationError('Diese Datei ist kein Welli@Home-Backup.')
  }
  if (backup.formatVersion !== 1 && backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      `Die Backup-Version „${String(backup.formatVersion)}“ wird nicht unterstützt.`,
    )
  }
  if (!isIsoTimestamp(backup.createdAt)) {
    throw new BackupValidationError('Das Erstellungsdatum des Backups ist ungültig.')
  }
  if (!Object.prototype.hasOwnProperty.call(backup, 'data')) {
    throw new BackupValidationError('Die Backupdatei enthält keine Datensammlung.')
  }
  if (backup.formatVersion === BACKUP_FORMAT_VERSION) {
    const initialization = asObject(backup.initialization, 'Die Initialisierungsangaben')
    if (
      Object.keys(initialization).some((key) => key !== 'feedRecommendationsSeeded') ||
      typeof initialization.feedRecommendationsSeeded !== 'boolean'
    ) {
      throw new BackupValidationError('Die Initialisierungsangaben im Backup sind ungültig.')
    }
  }
}

export async function createBackupExport({ pretty = false } = {}): Promise<BackupExport> {
  const snapshot = await appDatabase.transaction('r', backupTables, async () => ({
    feedRecommendationsSeeded:
      (await appDatabase.appMetadata.get(FEED_RECOMMENDATIONS_INITIALIZATION_ID))?.value ===
      FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
    birds: await appDatabase.birds.toArray(),
    medications: await appDatabase.medications.toArray(),
    weights: await appDatabase.weights.toArray(),
    observations: await appDatabase.observations.toArray(),
    healthEvents: await appDatabase.healthEvents.toArray(),
    vetAppointments: await appDatabase.vetAppointments.toArray(),
    reminders: await appDatabase.reminders.toArray(),
    feedMixes: await appDatabase.feedMixes.toArray(),
    favorites: await appDatabase.favorites.toArray(),
    mediaAssets: await appDatabase.mediaAssets.toArray(),
  }))
  const { feedRecommendationsSeeded, ...snapshotData } = snapshot
  const invalidRecords = countInvalidRecords(snapshotData)
  const mediaAssets = await Promise.all(snapshotData.mediaAssets.map(serializeMediaAsset))

  const backup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    initialization: { feedRecommendationsSeeded: snapshot.feedRecommendationsSeeded },
    data: { ...snapshotData, mediaAssets },
  }
  return {
    json: JSON.stringify(backup, null, pretty ? 2 : undefined),
    invalidRecords,
  }
}

export async function createBackupJson(options: { pretty?: boolean } = {}): Promise<string> {
  return (await createBackupExport(options)).json
}

export async function parseBackupJson(json: string): Promise<ParsedBackup> {
  validateBackupFileSize(new Blob([json]).size)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new BackupValidationError('Die ausgewählte Datei enthält kein gültiges JSON.', {
      cause: error,
    })
  }
  validateMetadata(parsed)
  const ignored = { count: 0 }
  const data = validateBackupData(parsed.data, true, ignored)
  return {
    format: BACKUP_FORMAT,
    formatVersion: parsed.formatVersion,
    createdAt: parsed.createdAt,
    initialization:
      parsed.formatVersion === BACKUP_FORMAT_VERSION
        ? (parsed.initialization as { feedRecommendationsSeeded: boolean })
        : { feedRecommendationsSeeded: false },
    data,
    ignoredFields: ignored.count,
    summary: summarize(data),
  }
}

export async function restoreBackup(backup: ParsedBackup): Promise<void> {
  if (
    backup.format !== BACKUP_FORMAT ||
    (backup.formatVersion !== 1 && backup.formatVersion !== BACKUP_FORMAT_VERSION) ||
    !isIsoTimestamp(backup.createdAt) ||
    typeof backup.initialization?.feedRecommendationsSeeded !== 'boolean'
  ) {
    throw new BackupValidationError(
      'Das ausgewählte Backup ist ungültig oder wird nicht unterstützt.',
    )
  }
  const data = validateBackupData(backup.data, false)

  try {
    const device = activeJournalDevice()
    await appDatabase.transaction(
      'rw',
      [...backupTables, appDatabase.deviceOperations],
      async () => {
        if (device) {
          for (const table of personalTables) {
            const rows = (await table.toArray()) as Array<{ id: string }>
            for (const row of rows)
              await writeCompoundRecord(table.name as PersonalTable, row.id, null, device)
          }
        } else {
          for (const table of personalTables) await table.clear()
        }
        await appDatabase.appMetadata.delete(FEED_RECOMMENDATIONS_INITIALIZATION_ID)
        if (device) {
          for (const table of personalTables) {
            const rows = data[table.name as keyof BackupData] as Array<{ id: string }>
            for (const row of rows)
              await writeCompoundRecord(
                table.name as PersonalTable,
                row.id,
                row as Record<string, unknown> & { id: string },
                device,
                true,
              )
          }
        } else {
          await appDatabase.birds.bulkAdd(data.birds)
          await appDatabase.mediaAssets.bulkAdd(data.mediaAssets)
          await appDatabase.medications.bulkAdd(data.medications)
          await appDatabase.weights.bulkAdd(data.weights)
          await appDatabase.observations.bulkAdd(data.observations)
          await appDatabase.healthEvents.bulkAdd(data.healthEvents)
          await appDatabase.vetAppointments.bulkAdd(data.vetAppointments)
          await appDatabase.reminders.bulkAdd(data.reminders)
          await appDatabase.feedMixes.bulkAdd(data.feedMixes)
          await appDatabase.favorites.bulkAdd(data.favorites)
        }
        if (backup.initialization.feedRecommendationsSeeded) {
          await appDatabase.appMetadata.put({
            id: FEED_RECOMMENDATIONS_INITIALIZATION_ID,
            value: FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
          })
        }
      },
    )
  } catch (error) {
    throw new Error(
      'Die Wiederherstellung ist fehlgeschlagen. Die bisherigen Daten wurden beibehalten.',
      { cause: error },
    )
  }
}

export function backupFilename(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `welliathome-backup-${year}-${month}-${day}.json`
}

export async function getBackupStatus(now = Date.now()) {
  return appDatabase.transaction('r', backupTables, async () => {
    const value = (await appDatabase.appMetadata.get(LAST_BACKUP_ID))?.value
    const lastBackup = isIsoTimestamp(value) ? value : undefined
    const hasUserData = await hasUserCreatedData()
    return {
      lastBackup,
      needsBackup: hasUserData && (!lastBackup || now - Date.parse(lastBackup) > 30 * 86400000),
    }
  })
}

export async function recordBackup(date = new Date()): Promise<void> {
  await appDatabase.appMetadata.put({ id: LAST_BACKUP_ID, value: date.toISOString() })
}
