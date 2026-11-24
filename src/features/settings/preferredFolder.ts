import { validateFullExport } from './validateFullExport'

// Folder handles are stored separately from personal data and require permission on every use.
export type Permission = 'granted' | 'denied' | 'prompt'
interface DirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<Permission>
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<Permission>
  values(): AsyncIterableIterator<FileSystemHandle>
}
type PickerWindow = Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }
export class FolderCleanupError extends Error {}

export function supportsPreferredFolder(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as PickerWindow).showDirectoryPicker === 'function'
  )
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('WelliAtHomePreferredFolder', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function storedHandle(write?: DirectoryHandle): Promise<DirectoryHandle | undefined> {
  const db = await openStore()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', write ? 'readwrite' : 'readonly')
      const request = write
        ? tx.objectStore('handles').put(write, 'preferred')
        : tx.objectStore('handles').get('preferred')
      let value: DirectoryHandle | undefined
      request.onsuccess = () => {
        value = write ?? (request.result as DirectoryHandle | undefined)
      }
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function choosePreferredFolder(): Promise<string> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) throw new Error('Dieser Browser unterstützt keine dauerhafte Ordnerauswahl.')
  const handle = await picker.call(window)
  try {
    await storedHandle(handle)
  } catch (reason) {
    throw new Error(
      'Der ausgewählte Ordner konnte nicht dauerhaft gespeichert werden. Bitte prüfe die Browsereinstellungen für Website-Daten.',
      { cause: reason },
    )
  }
  return handle.name
}

export async function preferredFolderName(): Promise<string | undefined> {
  return (await storedHandle())?.name
}

export async function preferredFolderPermission(): Promise<Permission | undefined> {
  const handle = await storedHandle()
  return handle ? handle.queryPermission({ mode: 'readwrite' }) : undefined
}

export async function requestPreferredFolderPermission(): Promise<Permission> {
  const handle = await storedHandle()
  if (!handle) throw new Error('Bitte zuerst einen Ordner auswählen.')
  return handle.requestPermission({ mode: 'readwrite' })
}

async function permittedFolder(mode: 'read' | 'readwrite'): Promise<DirectoryHandle> {
  const handle = await storedHandle()
  if (!handle) throw new Error('Bitte zuerst einen Ordner auswählen.')
  if (
    (await handle.queryPermission({ mode })) !== 'granted' &&
    (await handle.requestPermission({ mode })) !== 'granted'
  ) {
    throw new Error(
      'Der Zugriff auf den Ordner wurde nicht erlaubt. Die manuelle Dateiauswahl bleibt verfügbar.',
    )
  }
  return handle
}

export async function saveInPreferredFolder(file: File): Promise<string> {
  const folder = await permittedFolder('readwrite')
  const snapshot = /^wha_daten-.*\.zip$/i.test(file.name)
    ? await validateFullExport(file)
    : undefined
  // Unique names avoid replacing an existing export, even when several devices export concurrently.
  const name = `${file.name.replace(/\.zip$/i, '')}-${crypto.randomUUID()}.zip`
  const handle = await folder.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(file)
    await writable.close()
  } catch (error) {
    await writable.abort()
    throw error
  }
  if (snapshot) {
    const written = await handle.getFile()
    const verified = await validateFullExport(written)
    const [expectedHash, writtenHash] = await Promise.all(
      [file, written].map(async (input) =>
        crypto.subtle.digest('SHA-256', await input.arrayBuffer()),
      ),
    )
    if (
      verified.packageId !== snapshot.packageId ||
      !new Uint8Array(expectedHash).every(
        (byte, index) => byte === new Uint8Array(writtenHash)[index],
      )
    ) {
      throw new Error(
        `Die Datei ${name} konnte nicht verifiziert werden. Ältere Datenbestände bleiben erhalten.`,
      )
    }
    const older: string[] = []
    try {
      for await (const entry of folder.values()) {
        if (
          entry.kind !== 'file' ||
          entry.name === name ||
          !/^(?:wha_daten-|wah_daten-|welliathome-datenbestand-).*\.zip$/i.test(entry.name)
        )
          continue
        try {
          const existing = await validateFullExport(await (entry as FileSystemFileHandle).getFile())
          if (existing.createdAt < snapshot.createdAt || existing.packageId === snapshot.packageId)
            older.push(entry.name)
        } catch {
          /* Leave unrecognized or unreadable files untouched. */
        }
      }
    } catch {
      throw new FolderCleanupError(
        `Die Datei ${name} wurde gespeichert, aber ältere Datenbestände konnten nicht überprüft werden.`,
      )
    }
    for (const oldName of older) {
      try {
        await folder.removeEntry(oldName)
      } catch {
        throw new FolderCleanupError(
          `Die Datei ${name} wurde gespeichert, aber ältere Datenbestände konnten nicht vollständig entfernt werden.`,
        )
      }
    }
  }
  return name
}

export async function listPreferredFolderZips(): Promise<File[]> {
  const folder = await permittedFolder('read')
  const files: File[] = []
  for await (const entry of folder.values()) {
    if (entry.kind === 'file' && /\.zip$/i.test(entry.name))
      files.push(await (entry as FileSystemFileHandle).getFile())
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
