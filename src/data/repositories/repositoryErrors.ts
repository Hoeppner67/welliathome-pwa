export class InvalidRecordError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`Ungültiger Datensatz (${field}): ${message}`)
    this.name = 'InvalidRecordError'
  }
}

export class RepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly tableName: string,
    cause: unknown,
  ) {
    super(`Datenbankoperation „${operation}“ für „${tableName}“ ist fehlgeschlagen.`, { cause })
    this.name = 'RepositoryError'
  }
}

export class DatabaseInitializationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause })
    this.name = 'DatabaseInitializationError'
  }
}

export class DependentBirdDataError extends Error {
  constructor(readonly recordCount: number) {
    super(
      'Das Vogelprofil enthält zugehörige Dokumentationen und kann deshalb noch nicht gelöscht werden.',
    )
    this.name = 'DependentBirdDataError'
  }
}
