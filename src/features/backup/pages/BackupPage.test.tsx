// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import App from '../../../app/App'
import { birdRepository } from '../../../data/repositories'
import { BackupPage } from './BackupPage'
import * as backupService from '../backupService'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const timestamp = '2026-11-20T10:00:00.000Z'
const backupJson = JSON.stringify({
  format: 'welliathome-backup',
  formatVersion: 1,
  createdAt: timestamp,
  data: {
    birds: [
      {
        id: 'backup-bird',
        name: 'Backup-Pico',
        species: 'Wellensittich',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    medications: [],
    weights: [],
    observations: [],
    healthEvents: [],
    vetAppointments: [],
    reminders: [],
    feedMixes: [],
    favorites: [],
    mediaAssets: [],
  },
})

describe('BackupPage', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  async function chooseBackup() {
    const file = new File([backupJson], 'welliathome-backup.json', { type: 'application/json' })
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: async () => backupJson })
    }
    fireEvent.change(screen.getByLabelText('Backupdatei auswählen'), { target: { files: [file] } })
    expect(await screen.findByRole('heading', { name: 'Backup geprüft' })).toBeTruthy()
  }

  it('ist von der Startseite aus erreichbar', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Datensicherung' }))
    expect(await screen.findByRole('heading', { name: 'Datensicherung' })).toBeTruthy()
  })

  it('zeigt keinen Startseite-Link oben auf der Datensicherungsseite', async () => {
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Datensicherung' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Startseite/ })).toBeNull()
  })

  it('empfiehlt auf der Startseite ein Backup, wenn persönliche Daten noch nicht exportiert wurden', async () => {
    await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Datensicherung empfohlen' })).toBeTruthy()
    expect(screen.getByText(/noch kein Backup-Export gestartet/)).toBeTruthy()
    expect(screen.queryByText(/Ob die Datei tatsächlich gespeichert wurde/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Datensicherung öffnen' })).toBeNull()
    const backupButton = screen.getByRole('link', { name: /^Datensicherung$/ })
    expect(backupButton.classList.contains('backup-home-link__action--recommended')).toBe(true)
    expect(screen.getByRole('status').classList.contains('home-backup-status--warning')).toBe(true)
  })

  it('zeigt den Datensicherungsbutton dezent, wenn kein Backup mehr empfohlen wird', async () => {
    vi.spyOn(backupService, 'getBackupStatus').mockResolvedValue({
      lastBackup: timestamp,
      needsBackup: false,
    })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/^Letzte Sicherung:/)).toBeTruthy()
    expect(screen.queryByText(/Prüfe, ob die Datei noch verfügbar ist/)).toBeNull()
    const backupButton = screen.getByRole('link', { name: /^Datensicherung$/ })
    expect(backupButton.classList.contains('backup-home-link__action--quiet')).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Datensicherung empfohlen' })).toBeNull()
  })

  it('zeigt beim Backupstatusfehler keinen zusätzlichen Link zur Datensicherung', async () => {
    vi.spyOn(backupService, 'getBackupStatus').mockRejectedValue(new Error('Speicherfehler'))
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/Datensicherungsstatus konnte nicht geladen werden/),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Datensicherung öffnen' })).toBeNull()
    expect(screen.getByRole('link', { name: /^Datensicherung$/ })).toBeTruthy()
  })

  it('verändert beim Abbrechen nach der Vorschau keine vorhandenen Daten', async () => {
    const current = await birdRepository.create({ name: 'Vorhanden', species: 'Wellensittich' })
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    await chooseBackup()
    expect(
      screen.getByText(
        'Achtung: Die vorhandenen persönlichen Daten werden vollständig durch die Daten aus diesem Backup ersetzt.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(await birdRepository.getById(current.id)).toBeTruthy()
    expect(await birdRepository.getById('backup-bird')).toBeUndefined()
  })

  it('führt die Ersetzung erst nach ausdrücklichem Klick auf Wiederherstellen aus', async () => {
    const current = await birdRepository.create({ name: 'Vorhanden', species: 'Wellensittich' })
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    await chooseBackup()
    const createUrl = vi.fn().mockReturnValue('blob:backup')
    const priorUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
    const priorRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const restoreUrl = () => {
      if (priorUrl) Object.defineProperty(URL, 'createObjectURL', priorUrl)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (priorRevoke) Object.defineProperty(URL, 'revokeObjectURL', priorRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    expect(screen.queryByRole('button', { name: 'Wiederherstellen' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Daten zuerst sichern' }))
    const restore = await screen.findByRole('button', { name: 'Wiederherstellen' })
    await waitFor(() => expect((restore as HTMLButtonElement).disabled).toBe(false))
    expect(createUrl).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(await birdRepository.getById(current.id)).toBeTruthy()
    fireEvent.click(restore)
    expect(
      await screen.findByText('Die Daten aus dem Backup wurden wiederhergestellt.'),
    ).toBeTruthy()
    expect(await birdRepository.getById(current.id)).toBeUndefined()
    expect((await birdRepository.getById('backup-bird'))?.name).toBe('Backup-Pico')
    restoreUrl()
  })

  it('teilt eine vorbereitete Backupdatei über die Web Share API und speichert das Datum', async () => {
    const canShare = vi.fn().mockReturnValue(true)
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    try {
      render(
        <MemoryRouter>
          <BackupPage />
        </MemoryRouter>,
      )
      expect(await screen.findByText('Letzter Backup-Export angestoßen: noch keines.')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Backup teilen' }))
      expect(await screen.findByText('Backup an den Teilen-Dialog übergeben.')).toBeTruthy()
      expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] })
      const request = share.mock.calls[0][0] as ShareData
      expect(request.files?.[0].name).toMatch(/^welliathome-backup-.*\.json$/)
      await waitFor(() =>
        expect(screen.queryByText('Letzter Backup-Export angestoßen: noch keines.')).toBeNull(),
      )
    } finally {
      Reflect.deleteProperty(navigator, 'canShare')
      Reflect.deleteProperty(navigator, 'share')
    }
  })

  it('zeigt den entfernten Erklärungstext nicht mehr', () => {
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/Dauerhafter Browserspeicher verringert das Risiko/)).toBeNull()
  })

  it('zeigt das beschriftete Teilen-Icon direkt neben dem Download', () => {
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    const download = screen.getByRole('button', { name: 'Backup herunterladen' })
    const share = screen.getByRole('button', { name: 'Backup teilen' })
    expect(download.nextElementSibling).toBe(share)
    expect(share.textContent).toBe('')
    expect(share.getAttribute('title')).toBe('Backup teilen')
  })

  it('startet bei fehlender Datei-Sharing-Unterstützung den Backup-Download', async () => {
    const createUrl = vi.fn().mockReturnValue('blob:backup')
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        canShare: vi.fn().mockReturnValue(false),
        share: vi.fn(),
      }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }),
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const bird = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Backup teilen' }))
    expect(await screen.findByText('Backup-Download gestartet')).toBeTruthy()
    expect(click).toHaveBeenCalledOnce()
    const file = createUrl.mock.calls[0][0] as File
    expect(file.name).toMatch(/^welliathome-backup-.*\.json$/)
    expect(await birdRepository.getById(bird.id)).toBeTruthy()
  })

  it('bietet bei fehlender Benutzeraktivierung den vorbereiteten Download an', async () => {
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        canShare: vi.fn().mockReturnValue(true),
        share: vi.fn().mockRejectedValue(new DOMException('activation', 'NotAllowedError')),
      }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn().mockReturnValue('blob:backup'),
        revokeObjectURL: vi.fn(),
      }),
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Backup teilen' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vorbereitetes Backup herunterladen' }),
    )
    expect(await screen.findByText('Backup-Download gestartet')).toBeTruthy()
    expect(click).toHaveBeenCalledOnce()
  })

  it('zeigt beim Abbrechen des Teilen-Dialogs keinen Fehler', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), { canShare: vi.fn().mockReturnValue(true), share }),
    )
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Backup teilen' }))
    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Backup teilen' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    expect(screen.queryByText(/Teilen-Dialog konnte nicht geöffnet/)).toBeNull()
  })

  it('meldet Fehler bei der Backup-Erstellung', async () => {
    vi.spyOn(backupService, 'createBackupExport').mockRejectedValue(new Error('Speicherfehler'))
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Backup teilen' }))
    expect(await screen.findByText(/Backup konnte nicht erstellt/)).toBeTruthy()
  })

  it('zeigt Fehler beim Laden des Backupstatus', async () => {
    vi.spyOn(backupService, 'getBackupStatus').mockRejectedValue(new Error('Speicherfehler'))
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/Datensicherungsstatus konnte nicht geladen werden/),
    ).toBeTruthy()
  })

  it('zeigt einen Fehler, wenn der Exportzeitpunkt nicht gespeichert werden kann', async () => {
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        canShare: vi.fn().mockReturnValue(true),
        share: vi.fn().mockResolvedValue(undefined),
      }),
    )
    vi.spyOn(backupService, 'recordBackup').mockRejectedValue(new Error('Speicherfehler'))
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Backup teilen' }))
    expect(await screen.findByText(/Backup an den Teilen-Dialog übergeben/)).toBeTruthy()
    expect(await screen.findByText(/Export wurde gestartet, aber sein Zeitpunkt/)).toBeTruthy()
  })

  it('verhindert mehrere gleichzeitige Exporte', async () => {
    let finish!: (value: { json: string; invalidRecords: number }) => void
    const create = vi.spyOn(backupService, 'createBackupExport').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn().mockReturnValue('blob:backup'),
        revokeObjectURL: vi.fn(),
      }),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Backup teilen' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText('Backup wird vorbereitet …', { selector: '[role="status"]' }),
    ).toBeTruthy()
    expect(create).toHaveBeenCalledOnce()
    finish({ json: backupJson, invalidRecords: 0 })
    expect(await screen.findByText('Backup-Download gestartet')).toBeTruthy()
  })

  it('aktiviert dauerhaften Speicher und blendet den Button aus', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        storage: { persisted: vi.fn().mockResolvedValue(false), persist },
      }),
    )
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Dauerhaften Speicher anfordern' }))
    expect((await screen.findByText('Aktiv')).classList.contains('storage-status--active')).toBe(
      true,
    )
    expect(screen.getByText(/Dauerhafter Browserspeicher:/).textContent).toBe(
      'Dauerhafter Browserspeicher: Aktiv',
    )
    expect(screen.queryByRole('button', { name: 'Dauerhaften Speicher anfordern' })).toBeNull()
    expect(persist).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('zeigt nicht unterstützte APIs deaktiviert an', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage: undefined }))
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Dein Browser unterstützt diese Funktion nicht.')).toBeTruthy()
    expect(
      screen.getByText('Nicht unterstützt').classList.contains('storage-status--unsupported'),
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Dauerhaften Speicher anfordern' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    vi.unstubAllGlobals()
  })

  it('ermöglicht nach einem technischen Fehler einen erneuten Versuch', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('temporär')).mockResolvedValueOnce(true)
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        storage: { persisted: vi.fn().mockResolvedValue(false), persist },
      }),
    )
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    const button = await screen.findByRole('button', { name: 'Dauerhaften Speicher anfordern' })
    fireEvent.click(button)
    expect(await screen.findByText(/konnte nicht angefordert werden/)).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(await screen.findByText('Aktiv')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('meldet einen technischen Fehler bei der Statusprüfung', async () => {
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        storage: { persisted: vi.fn().mockRejectedValue(new Error('temporär')), persist: vi.fn() },
      }),
    )
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Speicherstatus konnte nicht geprüft werden/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Dauerhaften Speicher anfordern' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    vi.unstubAllGlobals()
  })

  it('merkt eine Ablehnung nur in der Sitzung und prüft den Status beim erneuten Öffnen', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    const persisted = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), { storage: { persisted, persist } }),
    )
    const view = render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Dauerhaften Speicher anfordern' }))
    expect(
      await screen.findByText('Der Browser hat die dauerhafte Speicherung nicht erlaubt.'),
    ).toBeTruthy()
    expect(screen.getByText('Inaktiv').classList.contains('storage-status--inactive')).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Dauerhaften Speicher anfordern' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    view.unmount()
    const reopened = render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('Der Browser hat die dauerhafte Speicherung nicht erlaubt.'),
    ).toBeTruthy()
    expect(persist).toHaveBeenCalledOnce()
    reopened.unmount()
    render(
      <MemoryRouter>
        <BackupPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Aktiv')).toBeTruthy()
    expect(persisted).toHaveBeenCalledTimes(3)
    vi.unstubAllGlobals()
  })
})
