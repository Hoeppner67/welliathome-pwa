import { describe, expect, it, vi } from 'vitest'
import {
  isStandaloneDisplayMode,
  offlineContentMessage,
  PWA_METADATA,
  persistentStorageStatus,
  requestPersistentStorage,
  requestPersistentStorageWhenDataExists,
  shouldShowIosInstallHelp,
} from './pwaEnvironment'

describe('PWA-Umgebung', () => {
  it('stellt die geforderten Basis-Metadaten bereit', () => {
    expect(PWA_METADATA).toMatchObject({
      appName: 'Welli@Home',
      startUrl: '/',
      scope: '/',
      themeColor: '#F2F2F2',
      backgroundColor: '#E5E2D3',
      language: 'de-DE',
    })
  })

  it('erkennt Browser- und iOS-Standalone-Modi', () => {
    expect(isStandaloneDisplayMode({ displayMode: 'standalone' })).toBe(true)
    expect(isStandaloneDisplayMode({ navigatorStandalone: true })).toBe(true)
    expect(isStandaloneDisplayMode({ displayMode: 'browser' })).toBe(false)
  })

  it('zeigt Installationshilfe nur in Safari auf iOS und nicht in installierter Ansicht', () => {
    expect(shouldShowIosInstallHelp('Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1', false)).toBe(
      true,
    )
    expect(shouldShowIosInstallHelp('Mozilla/5.0 (iPhone) CriOS/120.0 Safari/604.1', false)).toBe(
      false,
    )
    expect(shouldShowIosInstallHelp('Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1', true)).toBe(
      false,
    )
    expect(shouldShowIosInstallHelp('Mozilla/5.0 (Windows NT 10.0) Safari/604.1', false)).toBe(
      false,
    )
  })

  it('liefert Offline-Hinweis nur ohne Verbindung', () => {
    expect(offlineContentMessage(true)).toBeUndefined()
    expect(offlineContentMessage(false)).toContain('noch nicht lokal gespeicherte Online-Inhalte')
    expect(offlineContentMessage(false)).toContain('regelmäßig ein Backup')
  })
  it('fragt dauerhaften Speicher bei vorhandenen Daten einmalig und nicht bei leerer Datenbank an', async () => {
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockImplementation(async () => {
      persisted.mockResolvedValue(true)
      return true
    })
    const storage = { persist, persisted } as unknown as StorageManager
    await requestPersistentStorageWhenDataExists(storage, false)
    expect(persist).not.toHaveBeenCalled()
    await requestPersistentStorageWhenDataExists(storage, true)
    await requestPersistentStorageWhenDataExists(storage, true)
    expect(persist).toHaveBeenCalledOnce()
    await expect(persistentStorageStatus(storage)).resolves.toBe(true)
    await expect(persistentStorageStatus(undefined)).resolves.toBeUndefined()
  })

  it('meldet das Ergebnis der manuellen Speicheranfrage zurück', async () => {
    const storage = {
      persist: vi.fn().mockResolvedValue(true),
    } as unknown as StorageManager
    await expect(requestPersistentStorage(storage)).resolves.toBe(true)
  })
})
