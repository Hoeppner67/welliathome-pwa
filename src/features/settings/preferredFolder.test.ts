// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  choosePreferredFolder,
  listPreferredFolderZips,
  saveInPreferredFolder,
  supportsPreferredFolder,
} from './preferredFolder'
import * as fullValidation from './validateFullExport'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('speichert und liest ZIP-Dateien über einen erneut geprüften Ordnerzugriff', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn().mockResolvedValue(undefined)
  const queryPermission = vi.fn().mockResolvedValue('prompt')
  const requestPermission = vi.fn().mockResolvedValue('granted')
  const handle = {
    name: 'Freigabe',
    kind: 'directory',
    queryPermission,
    requestPermission,
    getFileHandle: vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close }) }),
    values: async function* () {
      yield { kind: 'file', name: 'test.zip', getFile: async () => new File(['a'], 'test.zip') }
    },
  }
  // IndexedDB structured cloning cannot clone mock functions; simulate a browser handle store.
  const realOpen = indexedDB.open.bind(indexedDB)
  vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
    if (name !== 'WelliAtHomePreferredFolder') return realOpen(name, version)
    const request = {} as IDBOpenDBRequest
    queueMicrotask(() => {
      const database = {
        close() {},
        transaction: () => {
          const tx = {} as IDBTransaction
          Object.assign(tx, { objectStore: () => ({ put: () => op(), get: () => op() }) })
          function op() {
            const result = { result: handle } as IDBRequest
            queueMicrotask(() => {
              result.onsuccess?.(new Event('success'))
              tx.oncomplete?.(new Event('complete'))
            })
            return result
          }
          return tx
        },
      }
      Object.defineProperty(request, 'result', { value: database })
      request.onsuccess?.(new Event('success'))
    })
    return request
  })
  Object.defineProperty(window, 'showDirectoryPicker', {
    configurable: true,
    value: vi.fn().mockResolvedValue(handle),
  })
  try {
    expect(supportsPreferredFolder()).toBe(true)
    expect(await choosePreferredFolder()).toBe('Freigabe')
    const file = new File(['zip'], 'daten.zip')
    expect(await saveInPreferredFolder(file)).toMatch(/^daten-.+\.zip$/)
    expect(write).toHaveBeenCalledWith(file)
    expect(close).toHaveBeenCalled()
    expect((await listPreferredFolderZips()).map((item) => item.name)).toEqual(['test.zip'])
    expect(requestPermission).toHaveBeenCalledTimes(2)
    requestPermission.mockResolvedValue('denied')
    await expect(listPreferredFolderZips()).rejects.toThrow(/nicht erlaubt/)
  } finally {
    delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker
  }
})

it('entfernt nur ältere gültige vollständige Pakete nach geprüftem Schreiben', async () => {
  const current = new File(['new'], 'wha_daten-new.zip')
  const old = new File(['old'], 'welliathome-datenbestand-old.zip')
  const update = new File(['update'], 'wha_update-old.zip')
  const invalid = new File(['invalid'], 'wha_daten-invalid.zip')
  const entries = [old, update, invalid]
  const removeEntry = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn().mockResolvedValue(undefined)
  const directory = {
    queryPermission: vi.fn().mockResolvedValue('granted'),
    removeEntry,
    getFileHandle: vi.fn().mockResolvedValue({
      createWritable: async () => ({ write: vi.fn(), close }),
      getFile: async () => current,
    }),
    values: async function* () {
      for (const file of entries) yield { kind: 'file', name: file.name, getFile: async () => file }
    },
  }
  vi.spyOn(fullValidation, 'validateFullExport').mockImplementation(async (file) => {
    if (file === invalid) throw new Error('invalid')
    return {
      packageId: file === old ? 'old' : 'new',
      deviceId: 'device',
      createdAt: file === old ? '2025-01-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
      data: {},
      initialization: null,
      archives: [],
    }
  })
  const realOpen = indexedDB.open.bind(indexedDB)
  vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
    if (name !== 'WelliAtHomePreferredFolder') return realOpen(name, version)
    const request = {} as IDBOpenDBRequest
    queueMicrotask(() => {
      const db = {
        close() {},
        transaction: () => {
          const tx = {} as IDBTransaction
          Object.assign(tx, {
            objectStore: () => ({
              get: () => {
                const result = { result: directory } as IDBRequest
                queueMicrotask(() => {
                  result.onsuccess?.(new Event('success'))
                  tx.oncomplete?.(new Event('complete'))
                })
                return result
              },
            }),
          })
          return tx
        },
      }
      Object.defineProperty(request, 'result', { value: db })
      request.onsuccess?.(new Event('success'))
    })
    return request
  })
  await saveInPreferredFolder(current)
  expect(close).toHaveBeenCalled()
  expect(removeEntry).toHaveBeenCalledExactlyOnceWith(old.name)
  close.mockRejectedValueOnce(new Error('write failed'))
  removeEntry.mockClear()
  await expect(saveInPreferredFolder(current)).rejects.toThrow()
  expect(removeEntry).not.toHaveBeenCalled()
})
