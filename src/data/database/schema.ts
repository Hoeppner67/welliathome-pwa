export const DATABASE_SCHEMA_V1 = {
  birds: 'id, name, species, createdAt, updatedAt',
  medications: 'id, birdId, name, startDate, endDate, createdAt, updatedAt',
  weights: 'id, birdId, date, createdAt, updatedAt',
  observations: 'id, birdId, date, category, createdAt, updatedAt',
  healthEvents: 'id, birdId, date, severity, resolved, createdAt, updatedAt',
  vetAppointments: 'id, birdId, date, completed, createdAt, updatedAt',
  reminders: 'id, birdId, dueDate, completed, reminderType, createdAt, updatedAt',
  feedMixes: 'id, name, provider, createdAt, updatedAt',
  favorites: 'id, itemType, itemId, &[itemType+itemId], createdAt, updatedAt',
  mediaAssets: 'id, relatedType, relatedId, mimeType, createdAt, updatedAt',
} as const

export const DATABASE_SCHEMA_V2 = {
  ...DATABASE_SCHEMA_V1,
  wikiArticles: 'id, wpId, slug, title, updatedAt, *categoryIds',
  wikiCategories: 'id, wpId, slug, name',
  plants: 'id, wpId, slug, title, updatedAt, scientificName, *groupNames',
  contentSyncStatus: 'id, lastSuccessfulAt',
} as const

/** Add-only migration keeps all version 1 user data intact. */
export const DATABASE_SCHEMA_V3 = {
  ...DATABASE_SCHEMA_V2,
  appMetadata: 'id',
} as const

export const DATABASE_SCHEMA_V4 = {
  ...DATABASE_SCHEMA_V3,
  wikiArticles: DATABASE_SCHEMA_V3.wikiArticles + ', searchText',
} as const

export const DATABASE_SCHEMA_V5 = {
  ...DATABASE_SCHEMA_V4,
  syncOperations:
    'operationId, deviceId, sequence, recordType, recordId, action, revision, *predecessorRevisions, createdAt',
  syncDevices: 'deviceId, name, lastSeenAt, sequence, active',
  syncState: 'id',
  syncConflicts:
    'id, recordType, recordId, status, detectedAt, localOperationId, *remoteOperationIds',
  syncMedia: 'id, sha256, status, updatedAt',
  syncSnapshots: 'id, createdAt, dataHash',
} as const

export const DATABASE_SCHEMA_V6 = {
  ...DATABASE_SCHEMA_V5,
  syncOperations: null,
  syncDevices: null,
  syncState: null,
  syncConflicts: null,
  syncMedia: null,
  syncSnapshots: null,
} as const

export const DATABASE_SCHEMA_V7 = {
  ...DATABASE_SCHEMA_V6,
  devicePendingPackages: 'packageId, createdAt',
} as const

export const DATABASE_SCHEMA_V8 = {
  ...DATABASE_SCHEMA_V7,
  deviceOperations: 'operationId, deviceId, sequence, [tableName+recordId]',
} as const

export const DATABASE_SCHEMA_V9 = {
  ...DATABASE_SCHEMA_V8,
  deviceReconciliation: 'id',
} as const

export const DATABASE_VERSIONS = {
  1: DATABASE_SCHEMA_V1,
  2: DATABASE_SCHEMA_V2,
  3: DATABASE_SCHEMA_V3,
  4: DATABASE_SCHEMA_V4,
  5: DATABASE_SCHEMA_V5,
  6: DATABASE_SCHEMA_V6,
  7: DATABASE_SCHEMA_V7,
  8: DATABASE_SCHEMA_V8,
  9: DATABASE_SCHEMA_V9,
} as const
