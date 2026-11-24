import type {
  BirdProfile,
  Entity,
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
import { isBirdDate, isIsoDate, isIsoTimestamp } from '../../utils/date'
import { InvalidRecordError } from './repositoryErrors'

type RecordData = Record<string, unknown>

function asRecord(value: unknown): RecordData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidRecordError('record', 'Es wird ein Objekt erwartet.')
  }
  return value as RecordData
}

function requiredString(record: RecordData, field: string): void {
  if (typeof record[field] !== 'string' || record[field].trim().length === 0) {
    throw new InvalidRecordError(field, 'Ein nicht leerer Text ist erforderlich.')
  }
}

function optionalString(record: RecordData, field: string): void {
  if (record[field] !== undefined && typeof record[field] !== 'string') {
    throw new InvalidRecordError(field, 'Der Wert muss Text sein.')
  }
}

function dateField(record: RecordData, field: string, optional = false): void {
  const value = record[field]
  if (optional && value === undefined) return
  if (!isIsoDate(value)) {
    throw new InvalidRecordError(field, 'Erwartet wird ein gültiges Datum im Format JJJJ-MM-TT.')
  }
}

function optionalBoolean(record: RecordData, field: string): void {
  if (record[field] !== undefined && typeof record[field] !== 'boolean') {
    throw new InvalidRecordError(field, 'Der Wert muss wahr oder falsch sein.')
  }
}

function entityFields(record: RecordData): asserts record is RecordData & Entity {
  requiredString(record, 'id')
  if (!isIsoTimestamp(record.createdAt)) {
    throw new InvalidRecordError('createdAt', 'Erwartet wird ein ISO-Zeitstempel in UTC.')
  }
  if (!isIsoTimestamp(record.updatedAt)) {
    throw new InvalidRecordError('updatedAt', 'Erwartet wird ein ISO-Zeitstempel in UTC.')
  }
}

export function validateBirdProfile(value: unknown): asserts value is BirdProfile {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'name')
  requiredString(record, 'species')
  for (const field of ['nickname', 'gender', 'color', 'ringNumber', 'origin', 'notes', 'imageId']) {
    optionalString(record, field)
  }
  for (const field of ['hatchDate', 'arrivalDate']) {
    if (record[field] !== undefined && !isBirdDate(record[field]))
      throw new InvalidRecordError(
        field,
        'Bitte ein gültiges Datum, Monat und Jahr oder ein Jahr eingeben.',
      )
  }
}

export function validateMedication(value: unknown): asserts value is Medication {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'birdId')
  requiredString(record, 'name')
  optionalString(record, 'dosage')
  optionalString(record, 'notes')
  dateField(record, 'startDate')
  dateField(record, 'endDate', true)
  if (typeof record.endDate === 'string' && record.endDate < String(record.startDate)) {
    throw new InvalidRecordError('endDate', 'Das Enddatum darf nicht vor dem Startdatum liegen.')
  }
}

export function validateWeightEntry(value: unknown): asserts value is WeightEntry {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'birdId')
  optionalString(record, 'notes')
  dateField(record, 'date')
  if (typeof record.weight !== 'number' || !Number.isFinite(record.weight) || record.weight <= 0) {
    throw new InvalidRecordError('weight', 'Das Gewicht muss eine positive Zahl sein.')
  }
}

export function validateObservation(value: unknown): asserts value is Observation {
  const record = asRecord(value)
  entityFields(record)
  optionalString(record, 'birdId')
  optionalString(record, 'title')
  requiredString(record, 'description')
  optionalString(record, 'category')
  dateField(record, 'date')
}

export function validateHealthEvent(value: unknown): asserts value is HealthEvent {
  const record = asRecord(value)
  entityFields(record)
  optionalString(record, 'birdId')
  requiredString(record, 'title')
  requiredString(record, 'description')
  optionalString(record, 'severity')
  optionalString(record, 'notes')
  optionalBoolean(record, 'resolved')
  dateField(record, 'date')
}

export function validateVetAppointment(value: unknown): asserts value is VetAppointment {
  const record = asRecord(value)
  entityFields(record)
  optionalString(record, 'birdId')
  requiredString(record, 'title')
  for (const field of ['veterinarian', 'reason', 'diagnosis', 'notes'])
    optionalString(record, field)
  optionalBoolean(record, 'completed')
  dateField(record, 'date')
}

export function validateReminder(value: unknown): asserts value is Reminder {
  const record = asRecord(value)
  entityFields(record)
  optionalString(record, 'birdId')
  requiredString(record, 'title')
  optionalString(record, 'description')
  requiredString(record, 'reminderType')
  if (typeof record.completed !== 'boolean') {
    throw new InvalidRecordError('completed', 'Der Wert muss wahr oder falsch sein.')
  }
  dateField(record, 'dueDate')
}

export function validateFeedMix(value: unknown): asserts value is FeedMix {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'name')
  optionalString(record, 'provider')
  optionalString(record, 'productUrl')
  optionalString(record, 'notes')
  if (
    !Array.isArray(record.ingredients) ||
    record.ingredients.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new InvalidRecordError('ingredients', 'Erwartet wird eine Liste nicht leerer Zutaten.')
  }
}

export function validateFavorite(value: unknown): asserts value is Favorite {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'itemType')
  requiredString(record, 'itemId')
  optionalString(record, 'title')
}

export function validateMediaAsset(value: unknown): asserts value is MediaAsset {
  const record = asRecord(value)
  entityFields(record)
  requiredString(record, 'fileName')
  requiredString(record, 'mimeType')
  optionalString(record, 'relatedType')
  optionalString(record, 'relatedId')
  if (
    typeof record.fileSize !== 'number' ||
    !Number.isInteger(record.fileSize) ||
    record.fileSize < 0
  ) {
    throw new InvalidRecordError(
      'fileSize',
      'Die Dateigröße muss eine nicht negative ganze Zahl sein.',
    )
  }
  if (typeof Blob === 'undefined' || !(record.blob instanceof Blob)) {
    throw new InvalidRecordError('blob', 'Erwartet wird ein Blob oder eine File-Instanz.')
  }
}
