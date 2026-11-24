import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { Icon } from '../../../shared/components/Icon'
import {
  backupFilename,
  createBackupExport,
  getBackupStatus,
  parseBackupJson,
  recordBackup,
  restoreBackup,
  validateBackupFileSize,
  type ParsedBackup,
} from '../backupService'
import { persistentStorageWasDenied, requestPersistentStorage } from '../../pwa/pwaEnvironment'
import '../../../styles/backup.css'

type BusyAction = 'export' | 'read' | 'restore' | null
type PersistenceState = 'checking' | 'active' | 'inactive' | 'unsupported' | 'error'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

async function backupFile(): Promise<{ file: File; invalidRecords: number }> {
  const backup = await createBackupExport()
  return {
    file: new File([backup.json], backupFilename(), { type: 'application/json' }),
    invalidRecords: backup.invalidRecords,
  }
}

export function BackupPage() {
  const fileInput = useRef<HTMLInputElement>(null)
  const exportInProgress = useRef(false)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [backup, setBackup] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [safetyFile, setSafetyFile] = useState<File | null>(null)
  const [fallbackFile, setFallbackFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getBackupStatus>>>()
  const [backupStatusError, setBackupStatusError] = useState('')
  const [backupWarning, setBackupWarning] = useState('')
  const [persistent, setPersistent] = useState<PersistenceState>('checking')
  const [persistenceDenied, setPersistenceDenied] = useState(persistentStorageWasDenied)
  const [persistenceError, setPersistenceError] = useState('')
  const [requestingPersistence, setRequestingPersistence] = useState(false)
  useEffect(() => {
    let active = true
    const storage = navigator.storage
    if (typeof storage?.persisted !== 'function') {
      setPersistent('unsupported')
    } else {
      void storage
        .persisted()
        .then((granted) => {
          if (active)
            setPersistent(
              granted
                ? 'active'
                : typeof storage.persist === 'function'
                  ? 'inactive'
                  : 'unsupported',
            )
        })
        .catch(() => {
          if (active) {
            setPersistent('error')
            setPersistenceError(
              'Der Speicherstatus konnte nicht geprüft werden. Bitte versuche es erneut.',
            )
          }
        })
    }
    void getBackupStatus()
      .then((result) => {
        if (active) setStatus(result)
      })
      .catch(() => {
        if (active) {
          setBackupStatusError(
            'Der Datensicherungsstatus konnte nicht geladen werden. Bitte öffne die Seite erneut.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  async function requestPersistence() {
    if (requestingPersistence || !navigator.storage?.persist) return
    setRequestingPersistence(true)
    setPersistenceError('')
    try {
      const granted = await requestPersistentStorage(navigator.storage)
      setPersistent(granted ? 'active' : 'inactive')
      setPersistenceDenied(persistentStorageWasDenied())
    } catch {
      setPersistent('inactive')
      setPersistenceError(
        'Der dauerhafte Speicher konnte nicht angefordert werden. Bitte versuche es erneut.',
      )
    } finally {
      setRequestingPersistence(false)
    }
  }

  async function markBackup() {
    try {
      await recordBackup()
    } catch {
      setBackupStatusError(
        'Der Backup-Export wurde gestartet, aber sein Zeitpunkt konnte nicht gespeichert werden. Prüfe deinen Download.',
      )
      return
    }
    await refreshBackupStatus(
      'Der Exportzeitpunkt wurde gespeichert, aber der aktuelle Datensicherungsstatus konnte nicht geladen werden.',
    )
  }

  async function refreshBackupStatus(errorMessage: string) {
    try {
      setStatus(await getBackupStatus())
      setBackupStatusError('')
    } catch {
      setBackupStatusError(errorMessage)
    }
  }

  async function exportBackup(mode: 'download' | 'share' | 'safety') {
    if (exportInProgress.current) return
    exportInProgress.current = true
    setBusy('export')
    setError('')
    setBackupStatusError('')
    setBackupWarning('')
    setNotice('Backup wird vorbereitet …')
    setFallbackFile(null)
    try {
      const backup = await backupFile()
      const file = backup.file
      if (backup.invalidRecords > 0) {
        setBackupWarning(
          `Das Backup enthält ${backup.invalidRecords} auffällige Datensätze, die unverändert gesichert wurden. Prüfe die Datei nach dem Export.`,
        )
      }
      let canShare = false
      if (
        mode === 'share' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function'
      ) {
        try {
          canShare = navigator.canShare({ files: [file] })
        } catch {
          canShare = false
        }
      }
      if (canShare) {
        try {
          await navigator.share({ files: [file] })
          setNotice('Backup an den Teilen-Dialog übergeben.')
          await markBackup()
          return
        } catch (cause) {
          if (
            typeof cause === 'object' &&
            cause !== null &&
            'name' in cause &&
            cause.name === 'AbortError'
          ) {
            setNotice('')
            return
          }
          setFallbackFile(file)
          setNotice('')
          setError(
            'Der Teilen-Dialog konnte nicht geöffnet werden. Du kannst das vorbereitete Backup herunterladen.',
          )
          return
        }
      }
      if (mode !== 'safety') setFallbackFile(file)
      downloadFile(file)
      if (mode !== 'safety') setFallbackFile(null)
      if (mode === 'safety') setSafetyFile(file)
      await markBackup()
      if (mode !== 'safety') setNotice('Backup-Download gestartet')
      else setNotice('')
    } catch {
      setNotice('')
      setError(
        'Das Backup konnte nicht erstellt oder heruntergeladen werden. Bitte versuche den Download erneut.',
      )
    } finally {
      exportInProgress.current = false
      setBusy(null)
    }
  }

  async function downloadFallback() {
    if (!fallbackFile || exportInProgress.current) return
    exportInProgress.current = true
    setError('')
    setBackupStatusError('')
    try {
      downloadFile(fallbackFile)
      setNotice('Backup-Download gestartet')
      setFallbackFile(null)
      await markBackup()
    } catch {
      setError('Der Download konnte nicht gestartet werden. Bitte versuche es erneut.')
    } finally {
      exportInProgress.current = false
    }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setBusy('read')
    setBackup(null)
    setSafetyFile(null)
    setError('')
    setNotice('')
    setBackupWarning('')
    try {
      validateBackupFileSize(file.size)
      const parsed = await parseBackupJson(await file.text())
      setBackup(parsed)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Die Backupdatei konnte nicht gelesen werden.',
      )
    } finally {
      setBusy(null)
    }
  }

  function cancelRestore() {
    setBackup(null)
    setSafetyFile(null)
    setError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function confirmRestore() {
    if (!backup || !safetyFile) return
    setBusy('restore')
    setError('')
    setNotice('')
    setBackupStatusError('')
    try {
      await restoreBackup(backup)
      setBackup(null)
      setSafetyFile(null)
      await refreshBackupStatus(
        'Die Daten wurden wiederhergestellt, aber der Datensicherungsstatus konnte nicht aktualisiert werden.',
      )
      setNotice('Die Daten aus dem Backup wurden wiederhergestellt.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Die Wiederherstellung ist fehlgeschlagen. Deine bisherigen Daten wurden beibehalten.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="backup-page" aria-labelledby="backup-title">
      <Link className="back-link" to="/">
        ← Startseite
      </Link>
      <header className="backup-page__intro">
        <p className="eyebrow">Welli@Home</p>
        <h1 id="backup-title">Datensicherung</h1>
        <p>
          Erstelle eine Datei mit deinen lokalen Daten oder stelle deine Daten aus einem vorhandenen
          Backup wieder her.
        </p>
        <p>
          Dauerhafter Browserspeicher:{' '}
          <span className={`storage-status storage-status--${persistent}`}>
            {persistent === 'active'
              ? 'Aktiv'
              : persistent === 'inactive'
                ? 'Inaktiv'
                : persistent === 'unsupported'
                  ? 'Nicht unterstützt'
                  : persistent === 'checking'
                    ? 'Wird geprüft'
                    : 'Status nicht verfügbar'}
          </span>
        </p>
        {persistent !== 'active' && persistent !== 'checking' && (
          <Button
            type="button"
            disabled={persistent === 'unsupported' || persistenceDenied || requestingPersistence}
            onClick={() => void requestPersistence()}
          >
            Dauerhaften Speicher anfordern
          </Button>
        )}
        {persistent === 'unsupported' && (
          <p role="status">Dein Browser unterstützt diese Funktion nicht.</p>
        )}
        {persistent === 'inactive' && persistenceDenied && (
          <p role="status">Der Browser hat die dauerhafte Speicherung nicht erlaubt.</p>
        )}
        {persistenceError && <p role="alert">{persistenceError}</p>}
      </header>

      {notice && (
        <p className="backup-message backup-message--success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="backup-message backup-message--error" role="alert">
          {error}
        </p>
      )}
      {backupStatusError && (
        <p className="backup-message backup-message--error" role="alert">
          {backupStatusError}
        </p>
      )}
      {backupWarning && (
        <p className="backup-message backup-message--warning" role="status">
          {backupWarning}
        </p>
      )}

      <div className="backup-sections">
        <Card className="backup-card">
          <h2>Datensicherung erstellen</h2>
          <p>
            Das Backup enthält deine Vogelprofile, Dokumentationen, Körnermischungen, Favoriten und
            Profilbilder. Die Datei wird lokal auf diesem Gerät erstellt.
          </p>
          {status && (
            <p>
              Letzter Backup-Export angestoßen:{' '}
              {status.lastBackup ? dateFormat.format(new Date(status.lastBackup)) : 'noch keines'}.
            </p>
          )}
          <p>
            Die App kann nicht prüfen, ob die Datei dauerhaft gespeichert wurde. Kontrolliere den
            Download und bewahre die Datei sicher auf.
          </p>
          {status?.needsBackup && (
            <p className="backup-warning">
              Sichere deine Daten. Dein letzter Backup-Export liegt über 30 Tage zurück oder es
              wurde noch keiner gestartet.
            </p>
          )}
          <div className="backup-export-actions">
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void exportBackup('download')}
            >
              {busy === 'export' ? 'Backup wird vorbereitet …' : 'Backup herunterladen'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="backup-share-button"
              aria-label="Backup teilen"
              title="Backup teilen"
              disabled={busy !== null}
              onClick={() => void exportBackup('share')}
            >
              <Icon name="share" />
            </Button>
          </div>
          {fallbackFile && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void downloadFallback()}
            >
              Vorbereitetes Backup herunterladen
            </Button>
          )}
        </Card>

        <Card className="backup-card">
          <h2>Daten wiederherstellen</h2>
          <p>
            Wähle eine zuvor erstellte Welli@Home-JSON-Backupdatei aus. Ihre Inhalte werden vor dem
            Import vollständig geprüft.
          </p>
          <div className="backup-file-picker">
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => fileInput.current?.click()}
            >
              Backupdatei auswählen
            </Button>
            <input
              ref={fileInput}
              className="backup-file-input"
              id="backup-file"
              type="file"
              accept=".json,application/json"
              aria-label="Backupdatei auswählen"
              disabled={busy !== null}
              onChange={(event) => void selectBackup(event)}
            />
          </div>
          {busy === 'read' && <p role="status">Backupdatei wird geprüft …</p>}

          {backup && (
            <div className="backup-preview" aria-labelledby="backup-preview-title">
              <h3 id="backup-preview-title">Backup geprüft</h3>
              <p>Erstellt am {dateFormat.format(new Date(backup.createdAt))}</p>
              {backup.ignoredFields > 0 && (
                <p>Übersprungene unbekannte Felder: {backup.ignoredFields}.</p>
              )}
              <dl>
                <div>
                  <dt>Vogelprofile</dt>
                  <dd>{backup.summary.birds}</dd>
                </div>
                <div>
                  <dt>Dokumentationen</dt>
                  <dd>{backup.summary.documentation}</dd>
                </div>
                <div>
                  <dt>Körnermischungen</dt>
                  <dd>{backup.summary.feedMixes}</dd>
                </div>
              </dl>
              <p className="backup-warning" role="alert">
                Achtung: Die vorhandenen persönlichen Daten werden vollständig durch die Daten aus
                diesem Backup ersetzt.
              </p>
              {safetyFile && (
                <p role="status">
                  Deine Sicherheitskopie wurde zum Download bereitgestellt. Prüfe den Download,
                  bevor du die Daten ersetzt.
                </p>
              )}
              <div className="backup-actions">
                {safetyFile ? (
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void confirmRestore()}
                  >
                    {busy === 'restore' ? 'Wird wiederhergestellt …' : 'Wiederherstellen'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void exportBackup('safety')}
                  >
                    Aktuelle Daten zuerst sichern
                  </Button>
                )}
                <Button
                  className="button--align-right"
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={cancelRestore}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </section>
  )
}
