import type { EntityTable, IDType } from 'dexie'
import type { Entity, EntityUpdate, ISODate, NewEntity } from '../../models'
import { createId } from '../../utils/id'
import { appDatabase } from '../database/appDatabase'
import {
  mutateJournaledRecord,
  PERSONAL_TABLES,
  type PersonalTable,
} from '../../features/settings/changeJournal'
import { deviceId } from '../../features/settings/fullExport'
import { isIsoDate, nextIsoTimestamp, nowIsoTimestamp } from '../../utils/date'
import { InvalidRecordError, RepositoryError } from './repositoryErrors'

export interface ListOptions<T extends Entity> {
  sortBy?: keyof T
  direction?: 'asc' | 'desc'
}

type Validator<T> = (value: unknown) => asserts value is T

export class BaseRepository<T extends Entity> {
  constructor(
    protected readonly table: EntityTable<T, 'id'>,
    readonly tableName: string,
    private readonly validateRecord: Validator<T>,
    private readonly defaultSortField: keyof T,
    private readonly birdRelated = false,
    private readonly dateField?: keyof T,
  ) {}

  async create(input: NewEntity<T>): Promise<T> {
    const createdAt = input.createdAt ?? nowIsoTimestamp()
    const record = {
      ...input,
      id: input.id ?? createId(),
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    } as T
    this.validateRecord(record)

    return this.run('create', () =>
      this.withBirdReference(async () => {
        await this.validateBirdReference(record)
        if (this.journalingEnabled()) {
          await mutateJournaledRecord(
            this.tableName as PersonalTable,
            record.id,
            deviceId(),
            (before) => {
              if (before) throw new Error('Ein Datensatz mit dieser ID existiert bereits.')
              return record as unknown as Record<string, unknown> & { id: string }
            },
          )
          return record
        }
        await this.table.add(record)
        return record
      }),
    )
  }

  async update(id: string, changes: EntityUpdate<T>): Promise<T | undefined> {
    return this.run('update', () =>
      this.withBirdReference(async () => {
        if (this.birdRelated) {
          const existing = await this.table.get(id as IDType<T, 'id'>)
          if (!existing) return undefined
          await this.validateBirdReference({ ...existing, ...changes })
        }
        if (this.journalingEnabled()) {
          const operation = await mutateJournaledRecord(
            this.tableName as PersonalTable,
            id,
            deviceId(),
            (before) => {
              if (!before) return undefined
              const existing = before as unknown as T
              const updated = {
                ...existing,
                ...changes,
                id: existing.id,
                createdAt: existing.createdAt,
                updatedAt: nextIsoTimestamp(existing.updatedAt),
              } as T
              this.validateRecord(updated)
              return updated as unknown as Record<string, unknown> & { id: string }
            },
          )
          return operation?.after as unknown as T | undefined
        }
        return this.table.db.transaction('rw', this.table, async () => {
          const existing = await this.table.get(id as IDType<T, 'id'>)
          if (!existing) return undefined

          const updated = {
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: nextIsoTimestamp(existing.updatedAt),
          } as T
          this.validateRecord(updated)
          await this.table.put(updated)
          return updated
        })
      }),
    )
  }

  async getById(id: string): Promise<T | undefined> {
    return this.run('getById', () => this.table.get(id as IDType<T, 'id'>))
  }

  async list(options: ListOptions<T> = {}): Promise<T[]> {
    return this.run('list', async () => {
      const records = await this.table.toArray()
      return this.sortRecords(
        records,
        options.sortBy ?? this.defaultSortField,
        options.direction ?? 'asc',
      )
    })
  }

  async listByBirdId(birdId: string, options: ListOptions<T> = {}): Promise<T[]> {
    if (!this.birdRelated) {
      throw new InvalidRecordError(
        'birdId',
        `Die Tabelle „${this.tableName}“ ist keinem Vogel zugeordnet.`,
      )
    }
    if (!birdId.trim()) throw new InvalidRecordError('birdId', 'Die ID darf nicht leer sein.')

    return this.run('listByBirdId', async () => {
      const records = await this.table.where('birdId').equals(birdId).toArray()
      return this.sortRecords(
        records,
        options.sortBy ?? this.defaultSortField,
        options.direction ?? 'asc',
      )
    })
  }

  async listByDateRange(
    from: ISODate,
    to: ISODate,
    direction: 'asc' | 'desc' = 'asc',
  ): Promise<T[]> {
    if (!this.dateField) {
      throw new InvalidRecordError(
        'date',
        `Für „${this.tableName}“ ist kein Datumsfeld konfiguriert.`,
      )
    }
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      throw new InvalidRecordError(
        'date',
        'Der Datumsbereich muss gültige ISO-Daten in aufsteigender Reihenfolge enthalten.',
      )
    }

    return this.run('listByDateRange', async () => {
      const field = String(this.dateField)
      const records = await this.table.where(field).between(from, to, true, true).toArray()
      return this.sortRecords(records, this.dateField!, direction)
    })
  }

  async delete(id: string): Promise<boolean> {
    return this.run('delete', async () => {
      if (this.journalingEnabled()) {
        const operation = await mutateJournaledRecord(
          this.tableName as PersonalTable,
          id,
          deviceId(),
          () => null,
        )
        return operation !== null
      }
      const existing = await this.table.get(id as IDType<T, 'id'>)
      if (!existing) return false
      await this.table.delete(id as IDType<T, 'id'>)
      return true
    })
  }

  private journalingEnabled(): boolean {
    return (
      this.table.db === appDatabase &&
      (PERSONAL_TABLES as readonly string[]).includes(this.tableName) &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('welliathome-device-sync-enabled') === 'true'
    )
  }
  private withBirdReference<R>(action: () => Promise<R>): Promise<R> {
    if (!this.birdRelated) return action()
    const db = this.table.db
    const tables = [this.table, db.table('birds')]
    if (this.journalingEnabled()) tables.push(db.table('deviceOperations'), db.table('appMetadata'))
    return db.transaction('rw', tables, action)
  }

  private async validateBirdReference(record: object): Promise<void> {
    if (!this.birdRelated) return
    const birdId = (record as { birdId?: unknown }).birdId
    if (birdId === undefined || birdId === '') return
    if (typeof birdId !== 'string' || !(await this.table.db.table('birds').get(birdId))) {
      throw new InvalidRecordError('birdId', 'Das zugehörige Vogelprofil existiert nicht mehr.')
    }
  }
  private sortRecords(records: T[], field: keyof T, direction: 'asc' | 'desc'): T[] {
    const multiplier = direction === 'asc' ? 1 : -1
    return records.sort((left, right) => {
      const leftValue = left[field]
      const rightValue = right[field]
      if (leftValue === rightValue) return 0
      if (leftValue === undefined) return 1 * multiplier
      if (rightValue === undefined) return -1 * multiplier
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * multiplier
      }
      return String(leftValue).localeCompare(String(rightValue)) * multiplier
    })
  }

  private async run<R>(operation: string, action: () => Promise<R>): Promise<R> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof InvalidRecordError || error instanceof RepositoryError) throw error
      throw new RepositoryError(operation, this.tableName, error)
    }
  }
}
