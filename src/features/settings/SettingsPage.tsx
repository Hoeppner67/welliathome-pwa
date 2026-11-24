import { useEffect, useRef, useState } from 'react'
import { appDatabase } from '../../data/database/appDatabase'
import { createFullExport } from './fullExport'
import { createConflictArchive } from './conflictArchive'
import { createChangesExport } from './changesExport'
import { reconcileChanges } from './reconcileChanges'
import { importChangesExports, previewChangesExports, resolveChanges } from './importChangesExport'
import { downloadFile, shareFile } from './shareFile'
import {
  choosePreferredFolder,
  FolderCleanupError,
  listPreferredFolderZips,
  preferredFolderName,
  preferredFolderPermission,
  requestPreferredFolderPermission,
  saveInPreferredFolder,
  supportsPreferredFolder,
} from './preferredFolder'
import {
  folderFileKind,
  inspectFolderPackage,
  type FolderPackageStatus,
} from './folderPackageStatus'
import {
  importFullExport,
  previewFullExport,
  LAST_IMPORT_KEY,
  resolveKeepingLocal,
  resolveUsingIncoming,
  type FullImportPreview,
  type PendingPackage,
} from './importFullExport'
import { Icon } from '../../shared/components/Icon'
import { ConflictPackages } from './ConflictPackages'
import './settings.css'

const DEVICE_SYNC_ENABLED_KEY = 'welliathome-device-sync-enabled'
const INITIALIZATION_KEY = 'welliathome-device-sync-initialized'
const PREFERRED_FOLDER_NAME_KEY = 'welliathome-preferred-folder-name'

export function SettingsPage() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(DEVICE_SYNC_ENABLED_KEY) === 'true',
  )
  const [initializationRequired, setInitializationRequired] = useState(
    () => localStorage.getItem(INITIALIZATION_KEY) === 'required',
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fullPreview, setFullPreview] = useState<FullImportPreview | null>(null)
  const [shareReady, setShareReady] = useState<File | null>(null)
  const [changesReady, setChangesReady] = useState<File | null>(null)
  const [changesExported, setChangesExported] = useState(false)
  const [fullExported, setFullExported] = useState(false)
  const [changesImported, setChangesImported] = useState(false)
  const [fullImported, setFullImported] = useState(false)
  const [changesFiles, setChangesFiles] = useState<File[]>([])
  const [changesPreview, setChangesPreview] = useState<{
    applied: number
    alreadyKnown: number
    conflicts?: number
  } | null>(null)
  const [lastImport, setLastImport] = useState<string>()
  const [pendingPackages, setPendingPackages] = useState<PendingPackage[]>([])
  const [showSyncInfo, setShowSyncInfo] = useState(false)
  const [useFolder, setUseFolder] = useState(
    () => localStorage.getItem('welliathome-preferred-folder-enabled') === 'true',
  )
  const [folderName, setFolderName] = useState<string | undefined>(
    () => localStorage.getItem(PREFERRED_FOLDER_NAME_KEY) || undefined,
  )
  const [folderPermission, setFolderPermission] = useState<'granted' | 'denied' | 'prompt'>()
  const [folderFiles, setFolderFiles] = useState<File[]>([])
  const [folderListOpen, setFolderListOpen] = useState(false)
  const [folderSelection, setFolderSelection] = useState<string[]>([])
  const [folderSelectionError, setFolderSelectionError] = useState('')
  const [folderStatuses, setFolderStatuses] = useState<Record<string, FolderPackageStatus>>({})
  const [folderKinds, setFolderKinds] = useState<Record<string, 'full' | 'changes'>>({})
  const [folderDates, setFolderDates] = useState<Record<string, string>>({})
  const [folderSettingsOpen, setFolderSettingsOpen] = useState(false)
  const [openSection, setOpenSection] = useState<'changes' | 'all' | null>(() => {
    if (localStorage.getItem(INITIALIZATION_KEY) === 'required') {
      localStorage.setItem('welliathome-sync-open-section', 'all')
      return 'all'
    }
    const saved = localStorage.getItem('welliathome-sync-open-section')
    return saved === 'changes' || saved === 'all' ? saved : 'changes'
  })
  function toggleSection(section: 'changes' | 'all') {
    const next = openSection === section ? null : section
    setOpenSection(next)
    if (next) localStorage.setItem('welliathome-sync-open-section', next)
    else localStorage.removeItem('welliathome-sync-open-section')
  }

  const folderRevision = useRef(0)

  useEffect(() => {
    if (!supportsPreferredFolder()) return
    let active = true
    const revision = folderRevision.current
    void preferredFolderName()
      .then((name) => {
        if (active && folderRevision.current === revision) {
          setFolderName(name)
          if (name)
            void preferredFolderPermission()
              .then(setFolderPermission)
              .catch(() => setFolderPermission('prompt'))
          else setFolderPermission(undefined)
          if (name) {
            localStorage.setItem(PREFERRED_FOLDER_NAME_KEY, name)
            // A stored handle must not silently turn the optional feature on.
          } else {
            localStorage.removeItem(PREFERRED_FOLDER_NAME_KEY)
          }
        }
      })
      .catch(() => {
        if (active && folderRevision.current === revision) {
          setError(
            'Der gespeicherte Ordner konnte nicht geladen werden. Bitte wähle ihn erneut aus.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [enabled])

  async function selectFolder() {
    setError('')
    setNotice('')
    try {
      const name = await choosePreferredFolder()
      folderRevision.current++
      localStorage.setItem(PREFERRED_FOLDER_NAME_KEY, name)
      setFolderName(name)
      void preferredFolderPermission()
        .then(setFolderPermission)
        .catch(() => setFolderPermission('prompt'))
      setFolderFiles([])
      setFolderSelection([])
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError'))
        setError(
          reason instanceof Error ? reason.message : 'Der Ordner konnte nicht ausgewählt werden.',
        )
    }
  }
  async function grantFolderAccess() {
    setError('')
    try {
      const permission = await requestPreferredFolderPermission()
      setFolderPermission(permission)
      if (permission !== 'granted')
        setError('Der Zugriff wurde nicht freigegeben. Die manuelle Dateiauswahl bleibt verfügbar.')
    } catch {
      setFolderPermission('prompt')
      setError(
        'Die Freigabe konnte nicht erteilt werden. Die manuelle Dateiauswahl bleibt verfügbar.',
      )
    }
  }
  async function saveToFolder(file: File) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setNotice(
        `Die ZIP-Datei wurde im bevorzugten Ordner gespeichert: ${await saveInPreferredFolder(file)}`,
      )
      clearPrepared(file)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `${reason.message} Der manuelle Download bleibt verfügbar.`
          : 'Speichern fehlgeschlagen. Der manuelle Download bleibt verfügbar.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function readFolder() {
    setFolderListOpen(true)
    setFolderSelectionError('')
    setFolderFiles([])
    setFolderSelection([])
    setFolderStatuses({})
    setFolderKinds({})
    setFolderDates({})
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const files = await listPreferredFolderZips()
      const statuses: Record<string, FolderPackageStatus> = {}
      const kinds: Record<string, 'full' | 'changes'> = {}
      const dates: Record<string, string> = {}
      for (const file of files) {
        const info = await inspectFolderPackage(file)
        statuses[file.name] = info.status
        if (info.kind) kinds[file.name] = info.kind
        if (info.createdAt) dates[file.name] = info.createdAt
        if (statuses[file.name] === 'new') {
          try {
            const preview = dates[file.name]
              ? await previewFullExport(file)
              : await previewChangesExports([file])
            if (preview.conflicts) statuses[file.name] = 'conflict'
          } catch {
            statuses[file.name] = 'unchecked'
          }
        }
      }
      setFolderFiles(files)
      setFolderStatuses(statuses)
      setFolderKinds(kinds)
      setFolderDates(dates)
      setFolderSelection([])
      if (!files.length) setNotice('Im ausgewählten Ordner wurden keine ZIP-Dateien gefunden.')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `${reason.message} Die manuelle Dateiauswahl bleibt verfügbar.`
          : 'Ordner konnte nicht gelesen werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  function selectFolderFiles() {
    const files = folderFiles.filter((file) => folderSelection.includes(file.name))
    const kinds = files.map((file) => folderKinds[file.name] ?? folderFileKind(file.name))
    if (kinds.some((kind) => !kind)) {
      setFolderSelectionError(
        'Der Dateityp ist am Namen nicht erkennbar. Bitte verwende die manuelle Dateiauswahl.',
      )
      return
    }
    if (new Set(kinds).size !== 1) {
      setFolderSelectionError(
        'Bitte wähle entweder Änderungspakete oder einen vollständigen Datenbestand aus.',
      )
      return
    }
    if (kinds[0] === 'full') {
      if (files.length !== 1) {
        setFolderSelectionError('Bitte wähle nur einen vollständigen Datenbestand aus.')
        return
      }
      setSelectedFile(files[0])
      setFullPreview(null)
      setOpenSection('all')
    } else {
      if (initializationRequired) {
        setFolderSelectionError('Bitte richte zuerst den vollständigen Datenbestand ein.')
        return
      }
      setChangesFiles(files)
      setChangesPreview(null)
      setOpenSection('changes')
    }
    setFolderSelectionError('')
    setFolderListOpen(false)
  }

  useEffect(() => {
    if (!enabled) return
    let active = true
    void Promise.all([
      appDatabase.appMetadata.get(LAST_IMPORT_KEY),
      appDatabase.devicePendingPackages.toArray(),
    ])
      .then(([entry, pending]) => {
        if (active) {
          setLastImport(entry?.value)
          setPendingPackages(pending)
        }
      })
      .catch(() => {
        if (active) setError('Der letzte Import konnte nicht ermittelt werden.')
      })
    return () => {
      active = false
    }
  }, [enabled])

  async function changeEnabled(value: boolean) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (value) {
        const result = await reconcileChanges()
        if (result.initialized) {
          localStorage.setItem(INITIALIZATION_KEY, 'required')
          setInitializationRequired(true)
        }
        localStorage.setItem(DEVICE_SYNC_ENABLED_KEY, 'true')
        setEnabled(true)
        if (result.initialized)
          setNotice(
            'Bitte lege zunächst fest, wie der gemeinsame Datenbestand eingerichtet werden soll.',
          )
        else if (result.captured)
          setNotice(
            `${result.captured} lokale Änderungen seit dem Ausschalten wurden für den nächsten Austausch erfasst.`,
          )
      } else {
        try {
          await reconcileChanges()
        } catch {
          setError(
            'Der Geräteabgleich wird deaktiviert. Die lokale Vergleichsbasis konnte nicht aktualisiert werden; prüfe vor dem nächsten Teilen den vollständigen Datenbestand.',
          )
        }
        localStorage.setItem(DEVICE_SYNC_ENABLED_KEY, 'false')
        setEnabled(false)
        setSelectedFile(null)
        setFullPreview(null)
        setShareReady(null)
        setChangesReady(null)
        setChangesFiles([])
        setChangesPreview(null)
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Die Einstellung konnte auf diesem Gerät nicht gespeichert werden.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function prepareShare() {
    setBusy(true)
    setError('')
    setNotice('')
    setShareReady(null)
    setFullExported(false)
    try {
      const file = await createFullExport()
      setShareReady(file)
      if (useFolder) {
        try {
          const name = await saveInPreferredFolder(file)
          setNotice(
            `Der vollständige Datenbestand wurde im bevorzugten Ordner gespeichert: ${name}`,
          )
          setFullExported(true)
        } catch (reason) {
          if (reason instanceof FolderCleanupError) {
            setFullExported(true)
            setError(reason.message)
          } else
            setNotice(
              'Der vollständige Datenbestand ist erstellt und kann heruntergeladen oder geteilt werden.',
            )
        }
      } else
        setNotice(
          'Der vollständige Datenbestand ist erstellt und kann heruntergeladen oder geteilt werden.',
        )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Das ZIP konnte nicht erstellt werden.')
    } finally {
      setBusy(false)
    }
  }

  async function beginNewDataSet() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await reconcileChanges()
      const file = await createFullExport()
      setShareReady(file)
      setFullExported(false)
      localStorage.setItem(INITIALIZATION_KEY, 'ready')
      setInitializationRequired(false)
      setOpenSection('all')
      localStorage.setItem('welliathome-sync-open-section', 'all')
      setNotice(
        'Der vollständige Datenbestand ist vorbereitet. Speichere oder teile ihn für die Einrichtung weiterer Geräte.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Der Datenbestand konnte nicht vorbereitet werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function sharePrepared() {
    if (!shareReady) return
    setBusy(true)
    setError('')
    try {
      const result = await shareFile(shareReady)
      if (result === 'download') {
        downloadFile(shareReady)
        setNotice('Teilen ist nicht verfügbar. Die ZIP-Datei wurde zum Download bereitgestellt.')
        setFullExported(true)
      } else if (result === 'shared') {
        setNotice('Die ZIP-Datei wurde an den Teilen-Dialog übergeben.')
        setFullExported(true)
      } else {
        setNotice('Das Teilen wurde abgebrochen; das ZIP bleibt vorbereitet.')
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Das ZIP konnte nicht bereitgestellt werden.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function prepareChanges() {
    setBusy(true)
    setError('')
    setNotice('')
    setChangesReady(null)
    setChangesExported(false)
    try {
      const file = await createChangesExport()
      setChangesReady(file)
      if (useFolder) {
        try {
          const name = await saveInPreferredFolder(file)
          setNotice(`Das Änderungspaket wurde im bevorzugten Ordner gespeichert: ${name}`)
          setChangesExported(true)
        } catch {
          setNotice('Das Änderungspaket ist erstellt und kann heruntergeladen oder geteilt werden.')
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Das Änderungspaket konnte nicht erstellt werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  function clearPrepared(file: File) {
    if (file === changesReady) setChangesExported(true)
    if (file === shareReady) setFullExported(true)
  }

  async function downloadPrepared(file: File | null) {
    if (!file) return
    setError('')
    if (useFolder && folderName && supportsPreferredFolder()) {
      setBusy(true)
      try {
        const name = await saveInPreferredFolder(file)
        setNotice(`Die ZIP-Datei wurde im bevorzugten Ordner gespeichert: ${name}`)
        clearPrepared(file)
        return
      } catch (reason) {
        if (reason instanceof FolderCleanupError) {
          clearPrepared(file)
          setError(reason.message)
          return
        }
        setFolderPermission('prompt')
        setNotice(
          'Der Ordnerzugriff ist nicht möglich. Die ZIP-Datei wird zum Download bereitgestellt.',
        )
      } finally {
        setBusy(false)
      }
    }
    try {
      downloadFile(file)
      clearPrepared(file)
      if (useFolder && supportsPreferredFolder() && !folderName)
        setNotice(
          'Es ist kein bevorzugter Ordner gespeichert. Wähle unter Speicherordner einen Ordner aus. Die ZIP-Datei wurde zum Download bereitgestellt.',
        )
      else if (!useFolder || !folderName || !supportsPreferredFolder())
        setNotice('Die ZIP-Datei wurde zum Download bereitgestellt.')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Der Download konnte nicht bereitgestellt werden.',
      )
    }
  }

  async function shareChanges() {
    if (!changesReady) return
    setBusy(true)
    setError('')
    try {
      const result = await shareFile(changesReady)
      if (result === 'download') {
        downloadFile(changesReady)
        setNotice('Das Änderungspaket wurde zum Download bereitgestellt.')
        setChangesExported(true)
      } else if (result === 'shared') {
        setNotice('Das Änderungspaket wurde an den Teilen-Dialog übergeben.')
        setChangesExported(true)
      } else setNotice('Das Teilen wurde abgebrochen; das Paket bleibt vorbereitet.')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Das Änderungspaket konnte nicht bereitgestellt werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function previewChanges() {
    if (!changesFiles.length) return
    setBusy(true)
    setError('')
    setNotice('')
    setChangesPreview(null)
    try {
      setChangesPreview(await previewChangesExports(changesFiles))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Das Änderungspaket konnte nicht geprüft werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function importChanges() {
    if (!changesFiles.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await importChangesExports(changesFiles)
      if (!result.conflicts) setChangesImported(true)
      try {
        const [entry, pending] = await Promise.all([
          appDatabase.appMetadata.get(LAST_IMPORT_KEY),
          appDatabase.devicePendingPackages.toArray(),
        ])
        setLastImport(entry?.value)
        setPendingPackages(pending)
      } catch {
        setLastImport(undefined)
      }
      setNotice(
        result.conflicts
          ? `Das Paket enthält ${result.conflicts} offene Konflikte. Beide Versionen sind gespeichert.`
          : `${result.applied} Operationen übernommen, ${result.alreadyKnown} bereits bekannt.`,
      )
      setChangesFiles([])
      setChangesPreview(null)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Das Änderungspaket konnte nicht importiert werden.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function previewData() {
    if (!selectedFile) return
    setBusy(true)
    setError('')
    setNotice('')
    setFullPreview(null)
    try {
      setFullPreview(await previewFullExport(selectedFile))
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Der Datenbestand konnte nicht geprüft werden.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function importData() {
    if (!selectedFile) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await importFullExport(selectedFile)
      if (result === 'imported') setFullImported(true)
      if (result === 'imported' && initializationRequired) {
        await reconcileChanges()
        localStorage.setItem(INITIALIZATION_KEY, 'ready')
        setInitializationRequired(false)
      }
      try {
        const [entry, pending] = await Promise.all([
          appDatabase.appMetadata.get(LAST_IMPORT_KEY),
          appDatabase.devicePendingPackages.toArray(),
        ])
        setLastImport(entry?.value)
        setPendingPackages(pending)
      } catch {
        setLastImport(undefined)
      }
      setNotice(
        result === 'imported'
          ? 'Der Datenbestand wurde wiederhergestellt.'
          : result === 'conflicts'
            ? 'Der Import wurde wegen Konflikten angehalten. Beide Versionen und das Paket wurden lokal gespeichert.'
            : 'Dieses Paket wurde bereits importiert.',
      )
      setSelectedFile(null)
      setFullPreview(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Import ist fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function exportConflictArchive(pending: PendingPackage) {
    setBusy(true)
    setError('')
    try {
      downloadFile(await createConflictArchive(pending))
      setNotice('Das Konfliktarchiv wurde zum Download bereitgestellt.')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Das Konfliktarchiv konnte nicht exportiert werden.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function resolve(packageId: string, choice: 'local' | 'incoming') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const selected = pendingPackages.find((item) => item.packageId === packageId)
      if (selected?.kind === 'changes') {
        const result = await resolveChanges(packageId, choice)
        if (result.conflicts)
          setNotice('Ein weiterer Konflikt wurde gefunden. Bitte erneut prüfen.')
        else
          setNotice(
            'Die gewählten Versionen wurden übernommen. Beide Versionen bleiben lokal archiviert.',
          )
      } else {
        if (choice === 'local') await resolveKeepingLocal(packageId)
        else await resolveUsingIncoming(packageId)
        setNotice(
          'Die gewählten Versionen wurden übernommen. Das Paket und beide Versionen bleiben lokal archiviert.',
        )
      }
      const [entry, pending] = await Promise.all([
        appDatabase.appMetadata.get(LAST_IMPORT_KEY),
        appDatabase.devicePendingPackages.toArray(),
      ])
      setLastImport(entry?.value)
      setPendingPackages(pending)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Die Konflikte konnten nicht abgeschlossen werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  const openPackages = pendingPackages.filter((pending) => !pending.resolvedAt)
  return (
    <section className="settings-page">
      <h1>Synchronisation</h1>
      <div className="card settings-card">
        <label className="settings-toggle">
          <span>Geräteabgleich aktivieren</span>
          <input
            className="settings-toggle__input"
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => void changeEnabled(event.target.checked)}
            disabled={busy}
          />
        </label>
        {!enabled && error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {enabled && (
        <section className="card settings-card" aria-labelledby="device-sync-heading">
          <div className="settings-card-heading">
            <h2 id="device-sync-heading">Manueller Geräteabgleich</h2>
            {supportsPreferredFolder() && (
              <button
                className="settings-folder-toggle"
                type="button"
                aria-label="Speicherordner"
                aria-expanded={folderSettingsOpen}
                aria-controls="preferred-folder-settings"
                onClick={() => setFolderSettingsOpen((open) => !open)}
              >
                <span className="settings-folder-toggle__icon" aria-hidden="true" />
              </button>
            )}
          </div>
          {supportsPreferredFolder() && (
            <section
              id="preferred-folder-settings"
              className="settings-folder-settings"
              aria-labelledby="preferred-folder-heading"
              hidden={!folderSettingsOpen}
            >
              <h3 id="preferred-folder-heading">Speicherordner</h3>
              <div className="settings-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={useFolder}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.checked
                      localStorage.setItem('welliathome-preferred-folder-enabled', String(value))
                      setUseFolder(value)
                    }}
                  />{' '}
                  Bevorzugten Speicherordner verwenden
                </label>
                {folderName && (
                  <p className="settings-folder-name">Ausgewählter Ordner: {folderName}</p>
                )}
                {folderName && folderPermission && folderPermission !== 'granted' && (
                  <p>
                    Der Ordner ist gespeichert. Für den Zugriff ist eine erneute Freigabe
                    erforderlich.{' '}
                    <button
                      className="button"
                      type="button"
                      disabled={busy}
                      onClick={() => void grantFolderAccess()}
                    >
                      Ordnerzugriff freigeben
                    </button>
                  </p>
                )}
                <button
                  className={`button${folderName ? ' settings-folder-select--selected' : ''}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void selectFolder()}
                >
                  {folderName ? 'Ordner ändern ✓' : 'Ordner auswählen'}
                </button>
                {!folderName && (
                  <p>
                    Wähle einen gemeinsamen Ordner aus. Danach wird er als Standardziel verwendet,
                    solange diese Option aktiviert bleibt.
                  </p>
                )}
              </div>
            </section>
          )}
          {initializationRequired && (
            <div className="settings-info-box" role="status">
              <h3>Initialisierung erforderlich</h3>
              <p>
                Wähle einen vollständigen Datenbestand eines anderen Geräts unten aus und prüfe ihn,
                oder beginne mit den Daten auf diesem Gerät einen neuen gemeinsamen Datenbestand.
              </p>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void beginNewDataSet()}
              >
                Neuen gemeinsamen Datenbestand beginnen
              </button>
            </div>
          )}
          <p>
            Auf unterstützten Browsern kann die App den gespeicherten Ordner direkt für Export und
            Import verwenden. Andernfalls bleibt die manuelle Dateiauswahl verfügbar.
          </p>
          <div className="settings-info-heading">
            <p>Änderungen anderen Geräten zum Abgleich zur Verfügung stellen.</p>
            <button
              className="settings-info-button"
              type="button"
              aria-label="Informationen zum Geräteabgleich"
              title="Informationen zum Geräteabgleich"
              aria-expanded={showSyncInfo}
              aria-controls="device-sync-info"
              onClick={() => setShowSyncInfo((shown) => !shown)}
            >
              <img src="/welli-icons/Info.svg" alt="" />
            </button>
          </div>
          <div id="device-sync-info" className="settings-info-box" hidden={!showSyncInfo}>
            <h3>Geräteabgleich – So funktioniert's</h3>
            <p>Beim Geräteabgleich werden neue Einträge automatisch hinzugefügt.</p>
            <p>
              Wurde ein Eintrag auf beiden Geräten unterschiedlich geändert, wird der Abgleich
              unterbrochen. <strong>Keine Daten gehen verloren.</strong> Du kannst anschließend
              entscheiden, welche Version du behalten möchtest: die Daten auf diesem Gerät oder die
              Daten aus der übertragenen Datei.
            </p>
            <p>
              <strong>Wichtig bei einem neuen Gerät:</strong> Übertrage zuerst alle vorhandenen
              Daten, bevor du mit dem Geräteabgleich beginnst.
            </p>
            <p>
              Wenn du den Geräteabgleich ausschaltest, merkt sich die App den aktuellen Datenstand.
              Beim erneuten Einschalten erkennt sie, was sich seitdem geändert hat.
            </p>
            <p>
              Ältere Änderungen, für die noch kein gespeicherter Vergleich vorliegt, können nicht
              automatisch erkannt werden. Diese musst du anhand eines vollständigen Datenbestands
              selbst überprüfen.
            </p>
          </div>
          {notice && (
            <p className="settings-success" role="status">
              {notice}
            </p>
          )}
          <div className="settings-sync-accordion" role="group" aria-label="Datenpakete">
            <details
              className="settings-folder settings-sync-section"
              open={openSection === 'changes'}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault()
                  toggleSection('changes')
                }}
              >
                Änderungen
              </summary>
              <div className="settings-accordion-content">
                <fieldset disabled={initializationRequired}>
                  <div className="settings-export-actions">
                    <button
                      className="button settings-create-button"
                      type="button"
                      onClick={() => void prepareChanges()}
                      disabled={busy || !!changesReady}
                    >
                      Erstellen
                    </button>
                    <button
                      className={`settings-share-button${changesExported ? ' settings-share-button--exported' : ''}`}
                      type="button"
                      aria-label="Änderungen herunterladen"
                      title="Änderungen herunterladen"
                      onClick={() => void downloadPrepared(changesReady)}
                      disabled={busy || !changesReady}
                    >
                      <Icon name="download" />
                    </button>
                    <button
                      className={`settings-share-button${changesExported ? ' settings-share-button--exported' : ''}`}
                      type="button"
                      aria-label="Änderungen teilen"
                      title="Änderungen teilen"
                      onClick={() => void shareChanges()}
                      disabled={busy || !changesReady}
                    >
                      <Icon name="share" />
                    </button>
                    {useFolder && folderName && supportsPreferredFolder() && (
                      <button
                        className={`settings-share-button settings-folder-action${changesExported ? ' settings-share-button--exported settings-folder-action--completed' : ''}`}
                        type="button"
                        aria-label="Änderungen direkt speichern"
                        title="Direkt speichern"
                        disabled={busy || !changesReady}
                        onClick={() => changesReady && void saveToFolder(changesReady)}
                      >
                        <Icon name="folderSync" />
                      </button>
                    )}
                  </div>
                  <div className="settings-actions settings-import-actions">
                    {useFolder && folderName && supportsPreferredFolder() && (
                      <button
                        className={`button settings-folder-action${changesImported ? ' settings-folder-action--completed' : ''}`}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setChangesImported(false)
                          void readFolder()
                        }}
                      >
                        Änderungen importieren
                      </button>
                    )}
                    <div className="settings-file-picker">
                      <input
                        id="changes-file"
                        className="settings-file-picker__input"
                        type="file"
                        accept=".zip,application/zip"
                        multiple
                        aria-label={
                          useFolder && folderName && supportsPreferredFolder()
                            ? 'ZIP-Dateien manuell auswählen'
                            : 'Änderungen importieren'
                        }
                        disabled={busy}
                        onChange={(event) => {
                          setChangesFiles(Array.from(event.target.files ?? []))
                          setChangesPreview(null)
                          event.target.value = ''
                          setError('')
                          setNotice('')
                        }}
                      />
                      <label className="button settings-file-picker__button" htmlFor="changes-file">
                        Datei auswählen
                      </label>
                      <span className="settings-file-picker__name" aria-live="polite">
                        {changesFiles.length
                          ? changesFiles.map((file) => file.name).join(', ')
                          : 'Keine Datei ausgewählt'}
                      </span>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={() => void previewChanges()}
                      disabled={busy || !changesFiles.length}
                    >
                      Änderungen prüfen
                    </button>
                    {changesPreview && (
                      <div aria-live="polite">
                        {changesPreview.conflicts ? (
                          <p>
                            Mindestens ein Konflikt wurde gefunden.{' '}
                            {changesFiles.length > 1
                              ? 'Bitte die Pakete einzeln einlesen und entscheiden.'
                              : 'Beim Übernehmen wird das Paket zur Entscheidung gespeichert.'}
                          </p>
                        ) : (
                          <p>
                            {changesPreview.applied} neue Änderungen, {changesPreview.alreadyKnown}{' '}
                            bereits vorhanden.
                          </p>
                        )}
                        <div className="settings-preview-actions">
                          <button
                            className="button"
                            type="button"
                            disabled={
                              busy || (!!changesPreview.conflicts && changesFiles.length > 1)
                            }
                            onClick={() => void importChanges()}
                          >
                            Änderungen übernehmen
                          </button>
                          <button
                            className="button button--align-right"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setChangesFiles([])
                              setChangesPreview(null)
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </fieldset>
              </div>
            </details>
            <details className="settings-folder settings-sync-section" open={openSection === 'all'}>
              <summary
                onClick={(event) => {
                  event.preventDefault()
                  toggleSection('all')
                }}
              >
                Alle Daten
              </summary>
              <div className="settings-accordion-content">
                <div className="settings-export-actions">
                  <button
                    className="button settings-create-button"
                    type="button"
                    onClick={() => void prepareShare()}
                    disabled={busy || !!shareReady}
                  >
                    Erstellen
                  </button>
                  <button
                    className={`settings-share-button${fullExported ? ' settings-share-button--exported' : ''}`}
                    type="button"
                    aria-label="Alle Daten herunterladen"
                    title="Alle Daten herunterladen"
                    onClick={() => void downloadPrepared(shareReady)}
                    disabled={busy || !shareReady}
                  >
                    <Icon name="download" />
                  </button>
                  <button
                    className={`settings-share-button${fullExported ? ' settings-share-button--exported' : ''}`}
                    type="button"
                    aria-label="Alle Daten teilen"
                    title="Alle Daten teilen"
                    onClick={() => void sharePrepared()}
                    disabled={busy || !shareReady}
                  >
                    <Icon name="share" />
                  </button>
                  {useFolder && folderName && supportsPreferredFolder() && (
                    <button
                      className={`settings-share-button settings-folder-action${fullExported ? ' settings-share-button--exported settings-folder-action--completed' : ''}`}
                      type="button"
                      aria-label="Alle Daten direkt speichern"
                      title="Direkt speichern"
                      disabled={busy || !shareReady}
                      onClick={() => shareReady && void saveToFolder(shareReady)}
                    >
                      <Icon name="folderSync" />
                    </button>
                  )}
                </div>
                <div className="settings-actions settings-import-actions">
                  {useFolder && folderName && supportsPreferredFolder() && (
                    <button
                      className={`button settings-folder-action${fullImported ? ' settings-folder-action--completed' : ''}`}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFullImported(false)
                        void readFolder()
                      }}
                    >
                      Aus bevorzugtem Ordner einlesen
                    </button>
                  )}
                  <div className="settings-file-picker">
                    <input
                      id="snapshot-file"
                      className="settings-file-picker__input"
                      type="file"
                      accept=".zip,application/zip"
                      aria-label="Vollständigen Datenbestand importieren"
                      disabled={busy}
                      onChange={(event) => {
                        setSelectedFile(event.target.files?.[0] ?? null)
                        setFullPreview(null)
                        event.target.value = ''
                        setError('')
                        setNotice('')
                      }}
                    />
                    <label className="button settings-file-picker__button" htmlFor="snapshot-file">
                      Datei auswählen
                    </label>
                    <span className="settings-file-picker__name" aria-live="polite">
                      {selectedFile?.name ?? 'Keine Datei ausgewählt'}
                    </span>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void previewData()}
                    disabled={busy || !selectedFile}
                  >
                    Datenbestand prüfen
                  </button>
                  {fullPreview && (
                    <div aria-live="polite">
                      <p>
                        {fullPreview.alreadyImported
                          ? 'Dieses Paket wurde bereits eingelesen.'
                          : `${fullPreview.additions} neue Einträge, ${fullPreview.conflicts} Konflikte.`}
                      </p>
                      <div className="settings-preview-actions">
                        <button
                          className="button"
                          type="button"
                          disabled={busy || !!fullPreview.alreadyImported}
                          onClick={() => void importData()}
                        >
                          Datenbestand übernehmen
                        </button>
                        <button
                          className="button button--align-right"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSelectedFile(null)
                            setFullPreview(null)
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
          {folderListOpen && useFolder && folderName && (
            <section className="settings-folder-list" aria-labelledby="folder-list-heading">
              <h3 id="folder-list-heading">ZIP-Dateien im bevorzugten Ordner</h3>
              <div className="settings-actions">
                {busy && <p>Ordner wird gelesen …</p>}
                {folderFiles.map((file) => (
                  <label className="settings-folder-list__file" key={file.name} title={file.name}>
                    <input
                      type="checkbox"
                      checked={folderSelection.includes(file.name)}
                      onChange={(event) =>
                        setFolderSelection((selected) =>
                          event.target.checked
                            ? [...selected, file.name]
                            : selected.filter((name) => name !== file.name),
                        )
                      }
                    />{' '}
                    <span
                      className={
                        folderStatuses[file.name] === 'new'
                          ? 'settings-folder-list__new'
                          : folderStatuses[file.name] === 'conflict' ||
                              folderStatuses[file.name] === 'changed'
                            ? 'settings-folder-list__conflict'
                            : undefined
                      }
                    >
                      {file.name}
                    </span>
                    {folderDates[file.name] &&
                      ` (${new Date(folderDates[file.name]).toLocaleDateString('de-DE')} / ${new Date(folderDates[file.name]).toLocaleTimeString('de-DE')} Uhr)`}
                    {folderStatuses[file.name] === 'new' ? (
                      <span className="settings-folder-list__sr-only">
                        {' '}
                        – noch nicht importiert
                      </span>
                    ) : (
                      ` – ${folderStatuses[file.name] === 'imported' ? 'bereits importiert' : folderStatuses[file.name] === 'conflict' ? 'Konflikt' : folderStatuses[file.name] === 'changed' ? 'Paketkennung mit anderem Inhalt' : folderStatuses[file.name] === 'unchecked' ? 'Prüfung nicht möglich' : 'kein gültiges Abgleichpaket'}`
                    )}
                  </label>
                ))}
                {folderSelectionError && (
                  <p className="settings-error" role="alert">
                    {folderSelectionError}
                  </p>
                )}
                <div className="settings-folder-list__actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy || !folderSelection.length}
                    onClick={selectFolderFiles}
                  >
                    Auswählen
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setFolderListOpen(false)}
                  >
                    Schließen
                  </button>
                </div>
              </div>
            </section>
          )}
          <ConflictPackages
            pendingPackages={pendingPackages}
            busy={busy}
            onResolve={resolve}
            onExportArchive={exportConflictArchive}
          />
          <div className="settings-status-box">
            <p>
              <strong>Letzter erfolgreicher Import:</strong>{' '}
              {lastImport ? new Date(lastImport).toLocaleString('de-DE') : 'Noch keiner'}
            </p>
            <p>
              <strong>Offene Konflikte:</strong>{' '}
              {openPackages.reduce((count, pending) => count + pending.conflicts.length, 0)}
            </p>
            {error && (
              <p className="settings-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      )}
    </section>
  )
}
