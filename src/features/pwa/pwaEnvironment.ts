export const PWA_METADATA = {
  appName: 'Welli@Home',
  startUrl: '/',
  scope: '/',
  themeColor: '#F2F2F2',
  backgroundColor: '#E5E2D3',
  language: 'de-DE',
} as const

export interface DisplayEnvironment {
  displayMode?: string
  navigatorStandalone?: boolean
}

let persistenceDenied = false
let persistenceRequest: Promise<boolean> | undefined
let automaticPersistenceRequested = false

export function persistentStorageWasDenied(): boolean {
  return persistenceDenied
}

export function isStandaloneDisplayMode(environment: DisplayEnvironment): boolean {
  return environment.navigatorStandalone === true || environment.displayMode === 'standalone'
}

export function shouldShowIosInstallHelp(userAgent: string, standalone: boolean): boolean {
  if (standalone) return false
  const isIos =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))
  const isSafari =
    /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(userAgent)
  return isIos && isSafari
}

export function offlineContentMessage(isOnline: boolean): string | undefined {
  return isOnline
    ? undefined
    : 'Du bist offline. App und lokal gespeicherte Daten bleiben verfügbar; noch nicht lokal gespeicherte Online-Inhalte sind derzeit nicht erreichbar. Bestelllinks und WordPress-Aktualisierungen benötigen eine Internetverbindung. Lege regelmäßig ein Backup deiner Daten an.'
}

export async function requestPersistentStorage(
  storage: StorageManager | undefined,
): Promise<boolean | undefined> {
  if (persistenceDenied || typeof storage?.persist !== 'function') return undefined
  persistenceRequest ??= storage.persist()
  try {
    const granted = await persistenceRequest
    if (!granted) persistenceDenied = true
    return granted
  } finally {
    persistenceRequest = undefined
  }
}

export async function requestPersistentStorageWhenDataExists(
  storage: StorageManager | undefined,
  hasData: boolean,
): Promise<void> {
  if (!hasData || automaticPersistenceRequested) return
  automaticPersistenceRequested = true
  try {
    if (await persistentStorageStatus(storage)) return
    await requestPersistentStorage(storage)
  } catch {
    // Automatic persistence is optional and must not interrupt app use.
  }
}

export async function persistentStorageStatus(
  storage: StorageManager | undefined,
): Promise<boolean | undefined> {
  try {
    return await storage?.persisted?.()
  } catch {
    return undefined
  }
}
