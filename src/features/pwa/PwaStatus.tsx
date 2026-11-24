import { useEffect, useRef, useState } from 'react'
import {
  isStandaloneDisplayMode,
  offlineContentMessage,
  requestPersistentStorageWhenDataExists,
  shouldShowIosInstallHelp,
} from './pwaEnvironment'
import {
  clearInstallPrompt,
  subscribeToInstallPrompt,
  type InstallPromptEvent,
} from './installPrompt'
import { hasUserData } from '../backup/backupService'
import '../../styles/pwa.css'
import { ActivityProgress } from '../../shared/components/ActivityProgress'

export function PwaStatus() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [wasInstalled, setWasInstalled] = useState(false)
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [hasUnsavedForm, setHasUnsavedForm] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [installError, setInstallError] = useState('')
  const dirtyForms = useRef(new Set<HTMLFormElement>())
  const activationRequested = useRef(false)
  const updateActivated = useRef(false)

  const standalone =
    typeof window !== 'undefined' &&
    isStandaloneDisplayMode({
      displayMode: window.matchMedia?.('(display-mode: standalone)').matches
        ? 'standalone'
        : 'browser',
      navigatorStandalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    })
  const showIosHelp =
    typeof navigator !== 'undefined' &&
    shouldShowIosInstallHelp(navigator.userAgent, standalone || wasInstalled)

  useEffect(() => {
    if (standalone) {
      void hasUserData()
        .then((hasData) => requestPersistentStorageWhenDataExists(navigator.storage, hasData))
        .catch((error) =>
          console.warn(
            '[Welli@Home] Lokale Daten für den Speicherschutz konnten nicht geprüft werden.',
            error,
          ),
        )
    }
    const updateConnection = () => setIsOnline(navigator.onLine)
    const unsubscribeInstallPrompt = subscribeToInstallPrompt((event) => {
      if (!standalone) {
        setInstallError('')
        setInstallPrompt(event)
      }
    })
    const installed = () => {
      clearInstallPrompt()
      setInstallPrompt(null)
      setWasInstalled(true)
    }
    const markFormDirty = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const form = target.closest('form')
        if (form?.hasAttribute('data-guard-unsaved')) {
          dirtyForms.current.add(form)
          setHasUnsavedForm(true)
        }
      }
    }
    const markFormReset = (event: Event) => {
      const form = event.target
      if (form instanceof HTMLFormElement) {
        dirtyForms.current.delete(form)
        setHasUnsavedForm(dirtyForms.current.size > 0)
      }
    }
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    window.addEventListener('appinstalled', installed)
    document.addEventListener('input', markFormDirty, true)
    document.addEventListener('change', markFormDirty, true)
    document.addEventListener('reset', markFormReset, true)

    const observer = new MutationObserver(() => {
      for (const form of dirtyForms.current) {
        if (!form.isConnected) dirtyForms.current.delete(form)
      }
      setHasUnsavedForm(dirtyForms.current.size > 0)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    let disposed = false
    let registration: ServiceWorkerRegistration | undefined
    let updatePoll = 0
    let updateCheck: Promise<void> | null = null
    const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
    let hadController = Boolean(serviceWorker?.controller)
    const checkWaiting = (candidate: ServiceWorkerRegistration) => {
      if (!disposed && candidate.waiting && serviceWorker?.controller) {
        setUpdateWorker(candidate.waiting)
        setUpdateError('')
      }
    }
    const checkForUpdate = (): Promise<void> => {
      if (disposed || !registration || document.visibilityState !== 'visible' || !navigator.onLine)
        return Promise.resolve()
      if (updateCheck) return updateCheck
      updateCheck = (async () => {
        try {
          await registration!.update()
          if (!disposed) setUpdateError('')
        } catch {
          if (!disposed)
            setUpdateError(
              'Neue App-Versionen konnten gerade nicht geprüft werden. Versuche es später erneut.',
            )
        }
      })().finally(() => {
        updateCheck = null
      })
      return updateCheck
    }
    const register = async () => {
      if (!serviceWorker) return
      if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
        const existing = await serviceWorker.getRegistration('/')
        if (existing) await existing.unregister()
        return
      }
      try {
        registration = await serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        if (disposed) return
        checkWaiting(registration)
        void checkForUpdate()
        const watchInstallingWorker = (installingWorker: ServiceWorker | null) => {
          if (!installingWorker || !serviceWorker.controller) return
          const onStateChange = () => {
            if (disposed) return
            setDownloadingUpdate(
              installingWorker.state === 'installing' || installingWorker.state === 'parsed',
            )
            if (installingWorker.state === 'redundant') {
              setUpdateError(
                'Das App-Update konnte nicht heruntergeladen werden. Bitte versuche es später erneut.',
              )
            }
            if (
              installingWorker.state === 'installed' &&
              serviceWorker.controller &&
              registration
            ) {
              checkWaiting(registration)
            }
          }
          installingWorker.addEventListener('statechange', onStateChange)
          onStateChange()
        }
        registration.addEventListener('updatefound', () =>
          watchInstallingWorker(registration?.installing ?? null),
        )
        watchInstallingWorker(registration.installing)
      } catch (error) {
        console.warn('[Welli@Home] Service Worker konnte nicht registriert werden.', error)
      }
    }
    const onLoad = () => void register()
    const onVisibilityChange = () => void checkForUpdate()
    const onOnline = () => void checkForUpdate()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    updatePoll = window.setInterval(() => void checkForUpdate(), 60 * 60 * 1000)
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    const onControllerChange = () => {
      if (!serviceWorker?.controller) return
      if (!hadController) {
        hadController = true
        return
      }
      updateActivated.current = true
      setUpdating(false)
      if (
        activationRequested.current &&
        ![...dirtyForms.current].some((form) => form.isConnected)
      ) {
        window.location.reload()
      } else {
        setUpdateWorker(serviceWorker.controller)
      }
    }
    serviceWorker?.addEventListener('controllerchange', onControllerChange)

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      window.removeEventListener('appinstalled', installed)
      window.removeEventListener('load', onLoad)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.clearInterval(updatePoll)
      unsubscribeInstallPrompt()
      document.removeEventListener('input', markFormDirty, true)
      document.removeEventListener('change', markFormDirty, true)
      document.removeEventListener('reset', markFormReset, true)
      serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [standalone])

  async function promptInstall() {
    if (!installPrompt || installing) return
    setInstalling(true)
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
      clearInstallPrompt()
      setInstallPrompt(null)
    } catch {
      setInstallError(
        'Die Installation konnte nicht gestartet werden. Nutze bei Bedarf die Installationsoption deines Browsers.',
      )
      setInstallPrompt(null)
    } finally {
      setInstalling(false)
    }
  }

  function applyUpdate() {
    if (!updateWorker || updating || [...dirtyForms.current].some((form) => form.isConnected))
      return
    if (updateActivated.current) {
      window.location.reload()
      return
    }
    activationRequested.current = true
    setUpdating(true)
    try {
      updateWorker.postMessage({ type: 'SKIP_WAITING' })
    } catch {
      activationRequested.current = false
      setUpdating(false)
      setUpdateError('Das Update konnte nicht gestartet werden. Lade die Seite später erneut.')
    }
  }

  const offlineMessage = offlineContentMessage(isOnline)
  if (
    !offlineMessage &&
    !installPrompt &&
    !updateWorker &&
    !showIosHelp &&
    !installError &&
    !downloadingUpdate &&
    !updateError
  )
    return null

  return (
    <aside className="pwa-status" aria-label="PWA-Status">
      {offlineMessage && (
        <p className="pwa-status__message" role="status">
          {offlineMessage}
        </p>
      )}
      {installError && (
        <p className="pwa-status__message" role="alert">
          {installError}
        </p>
      )}
      {installPrompt && (
        <div className="pwa-status__action">
          <p>Installiere die Welli@Home-App auf deinem Gerät.</p>
          <button
            className="button button--primary pwa-status__install-button"
            type="button"
            onClick={() => void promptInstall()}
            disabled={installing}
          >
            {installing ? 'Installationsdialog wird geöffnet …' : 'APP installieren'}
          </button>
        </div>
      )}
      {showIosHelp && (
        <details className="pwa-status__ios">
          <summary>Welli@Home zum Home-Bildschirm hinzufügen</summary>
          <ol>
            <li>Welli@Home in Safari öffnen.</li>
            <li>Teilen-Menü öffnen.</li>
            <li>„Zum Home-Bildschirm“ auswählen.</li>
            <li>Installation bestätigen.</li>
          </ol>
        </details>
      )}
      {downloadingUpdate && !updateWorker && (
        <div className="pwa-status__message" role="status">
          <p>App-Update wird vorbereitet …</p>
          <ActivityProgress label="App-Update wird vorbereitet" />
        </div>
      )}
      {updateError && !updateWorker && (
        <p className="pwa-status__message" role="alert">
          {updateError}
        </p>
      )}
      {updateWorker && (
        <div className="pwa-status__action" role="status">
          <div>
            <p>
              {updating
                ? 'App-Update wird aktiviert …'
                : 'Eine neue Version von Welli@Home ist bereit.'}
            </p>
            {updating && <ActivityProgress label="App-Update wird aktiviert" />}
          </div>
          {hasUnsavedForm && (
            <p className="pwa-status__warning">
              Speichere oder verwerfe zuerst deine Formulareingaben, bevor du aktualisierst.
            </p>
          )}
          {updateError && <p role="alert">{updateError}</p>}
          <button
            className="button button--primary pwa-status__update-button"
            type="button"
            onClick={applyUpdate}
            disabled={updating || hasUnsavedForm}
          >
            {updating ? 'Aktualisierung wird gestartet …' : 'Jetzt aktualisieren'}
          </button>
        </div>
      )}
    </aside>
  )
}
