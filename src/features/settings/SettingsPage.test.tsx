// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Header } from '../../shared/components/Header'
import { SettingsPage } from './SettingsPage'
import * as changesExport from './changesExport'
import * as fullExport from './fullExport'
import * as fileActions from './shareFile'
import * as changesImport from './importChangesExport'
import * as preferredFolder from './preferredFolder'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('zeigt Änderungen standardmäßig offen, öffnet jeweils nur ein Akkordeon und stellt Änderungen beim Neuladen wieder her', () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  const view = render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const folder = document.getElementById('preferred-folder-settings')!
  const changes = screen.getByText('Änderungen').closest('details')!
  const all = screen.getByText('Alle Daten').closest('details')!
  expect(changes.open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  expect(folder.hidden).toBe(false)
  expect(changes.open).toBe(true)
  fireEvent.click(screen.getByText('Änderungen'))
  expect(folder.hidden).toBe(false)
  expect(changes.open).toBe(false)
  fireEvent.click(screen.getByText('Alle Daten'))
  expect(changes.open).toBe(false)
  expect(all.open).toBe(true)
  view.unmount()
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('Alle Daten').closest('details')?.open).toBe(true)
  expect(screen.getByText('Änderungen').closest('details')?.open).toBe(false)
})

it('zeigt den neu ausgewählten Ordner auch bei verspäteter gespeicherter Ordnerabfrage', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  let finishRead!: (value: string | undefined) => void
  vi.spyOn(preferredFolder, 'preferredFolderName').mockReturnValue(
    new Promise((resolve) => {
      finishRead = resolve
    }),
  )
  vi.spyOn(preferredFolder, 'choosePreferredFolder').mockResolvedValue('Gemeinsam')
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ordner auswählen' }))
  expect(await screen.findByText('Ausgewählter Ordner: Gemeinsam')).toBeTruthy()
  finishRead(undefined)
  await waitFor(() => expect(screen.getByText('Ausgewählter Ordner: Gemeinsam')).toBeTruthy())
})

it('zeigt einen bereits lokal gespeicherten Ordnernamen in dunkelgrün', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-name', 'Gemeinsam')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  vi.spyOn(preferredFolder, 'preferredFolderName').mockResolvedValue('Gemeinsam')
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  const folderName = await screen.findByText('Ausgewählter Ordner: Gemeinsam')
  expect(folderName.className).toBe('settings-folder-name')
  expect(screen.queryByText(/Für diese Browseradresse ist kein Ordner gespeichert/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Ordner ändern ✓' }).className).toContain(
    'settings-folder-select--selected',
  )
})

it('lässt die Einstellung für den bevorzugten Speicherordner deaktivieren und wieder aktivieren', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-enabled', 'false')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  vi.spyOn(preferredFolder, 'preferredFolderName').mockResolvedValue('Gemeinsam')
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  const checkbox = (await screen.findByRole('checkbox', {
    name: 'Bevorzugten Speicherordner verwenden',
  })) as HTMLInputElement
  expect(checkbox.checked).toBe(false)
  fireEvent.click(checkbox)
  await waitFor(() => expect(checkbox.checked).toBe(true))
  fireEvent.click(checkbox)
  await waitFor(() => expect(checkbox.checked).toBe(false))
})

it('aktiviert die bevorzugte Ordnernutzung erst durch die Checkbox', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  vi.spyOn(preferredFolder, 'preferredFolderName').mockResolvedValue(undefined)
  vi.spyOn(preferredFolder, 'choosePreferredFolder').mockResolvedValue('Gemeinsam')
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  const checkbox = screen.getByRole('checkbox', {
    name: 'Bevorzugten Speicherordner verwenden',
  }) as HTMLInputElement
  expect(checkbox.checked).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Ordner auswählen' }))
  await screen.findByText('Ausgewählter Ordner: Gemeinsam')
  expect(checkbox.checked).toBe(false)
  expect(localStorage.getItem('welliathome-preferred-folder-enabled')).toBeNull()
  fireEvent.click(checkbox)
  expect(checkbox.checked).toBe(true)
  expect(localStorage.getItem('welliathome-preferred-folder-enabled')).toBe('true')
})

it('speichert erstellte Änderungspakete und vollständige Daten automatisch im bevorzugten Ordner', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  vi.spyOn(preferredFolder, 'preferredFolderName').mockResolvedValue('Gemeinsam')
  vi.spyOn(preferredFolder, 'saveInPreferredFolder')
    .mockResolvedValueOnce('aenderungen.zip')
    .mockResolvedValueOnce('daten.zip')
  vi.spyOn(changesExport, 'createChangesExport').mockResolvedValue(
    new File(['changes'], 'changes.zip'),
  )
  vi.spyOn(fullExport, 'createFullExport').mockResolvedValue(new File(['full'], 'full.zip'))

  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  await screen.findByText(/Ausgewählter Ordner: Gemeinsam/)
  fireEvent.click(screen.getByRole('button', { name: 'Speicherordner' }))
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Bevorzugten Speicherordner verwenden',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true)
  fireEvent.click(screen.getAllByRole('button', { name: 'Erstellen' })[0])
  expect(
    await screen.findByText(/Änderungspaket wurde im bevorzugten Ordner gespeichert/),
  ).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Erstellen' })[1])
  expect(
    await screen.findByText(/vollständige Datenbestand wurde im bevorzugten Ordner gespeichert/),
  ).toBeTruthy()
})

it('sperrt Änderungspakete bis zur ausdrücklich gewählten Initialisierung', () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-device-sync-initialized', 'required')
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('Initialisierung erforderlich')).toBeTruthy()
  expect(screen.getByText('Alle Daten').closest('details')?.open).toBe(true)
  expect(screen.getByText('Änderungen').closest('details')?.open).toBe(false)
  expect(screen.getByLabelText('Änderungen importieren').closest('fieldset')?.disabled).toBe(true)
  expect(
    (screen.getByLabelText('Vollständigen Datenbestand importieren') as HTMLInputElement).disabled,
  ).toBe(false)
})

it('zeigt eine Vorschau und übernimmt Änderungen erst nach Bestätigung', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  const preview = vi
    .spyOn(changesImport, 'previewChangesExports')
    .mockResolvedValue({ applied: 2, alreadyKnown: 1 })
  const apply = vi
    .spyOn(changesImport, 'importChangesExports')
    .mockResolvedValue({ applied: 2, alreadyKnown: 1 })
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const file = new File(['zip'], 'paket.zip', { type: 'application/zip' })
  fireEvent.change(screen.getByLabelText('Änderungen importieren'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen prüfen' }))
  expect(await screen.findByText('2 neue Änderungen, 1 bereits vorhanden.')).toBeTruthy()
  expect(preview).toHaveBeenCalledWith([file])
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen übernehmen' }))
  await waitFor(() => expect(apply).toHaveBeenCalledWith([file]))
})

it('öffnet die Synchronisation über das Synchronisationssymbol ohne Zurück-Link', () => {
  render(
    <MemoryRouter initialEntries={['/schwarm?ansicht=liste#test']}>
      <Header />
      <Routes>
        <Route path="/schwarm" element={<h1>Schwarm</h1>} />
        <Route path="/synchronisation" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const link = screen.getByRole('link', { name: 'Synchronisation' })
  expect(link.getAttribute('title')).toBe('Synchronisation')
  expect(link.querySelector('img')?.getAttribute('src')).toBe('/welli-icons/Synchronisation.svg')
  fireEvent.click(link)
  expect(screen.getByRole('heading', { name: 'Synchronisation' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Synchronisation' })).toBeNull()
  expect(screen.queryByRole('link', { name: /Zurück/ })).toBeNull()
})

it('öffnet und schließt Speicherordner über das Zahnradsymbol', () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: 'Speicherordner' })
  const folder = document.getElementById('preferred-folder-settings')!
  expect(folder.hidden).toBe(true)
  fireEvent.click(button)
  expect(folder.hidden).toBe(false)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(button)
  expect(folder.hidden).toBe(true)
})

it('speichert die Einstellung ausschließlich lokal und stellt sie nach erneutem Öffnen wieder her', async () => {
  localStorage.clear()
  const view = render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const toggle = screen.getByRole('switch', {
    name: 'Geräteabgleich aktivieren',
  }) as HTMLInputElement
  expect(toggle.checked).toBe(false)
  expect(screen.queryByRole('heading', { name: 'Manueller Geräteabgleich' })).toBeNull()
  fireEvent.click(toggle)
  expect(await screen.findByRole('heading', { name: 'Manueller Geräteabgleich' })).toBeTruthy()
  view.unmount()
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(
    (screen.getByRole('switch', { name: 'Geräteabgleich aktivieren' }) as HTMLInputElement).checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('switch', { name: 'Geräteabgleich aktivieren' }))
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: 'Manueller Geräteabgleich' })).toBeNull(),
  )
  localStorage.clear()
})

it('zeigt die Funktionen zum Teilen und Importieren nur bei aktiviertem Geräteabgleich', async () => {
  localStorage.clear()
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('button', { name: 'Änderungen teilen' })).toBeNull()
  expect(screen.queryByLabelText('Änderungen importieren')).toBeNull()
  fireEvent.click(screen.getByRole('switch', { name: 'Geräteabgleich aktivieren' }))
  expect(await screen.findByRole('button', { name: 'Änderungen teilen' })).toBeTruthy()
  expect(screen.getByText('Änderungen')).toBeTruthy()
  expect(screen.getByText('Alle Daten')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Erstellen' })).toHaveLength(2)
  expect(
    (screen.getByRole('button', { name: 'Änderungen herunterladen' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Änderungen teilen' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Alle Daten herunterladen' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Alle Daten teilen' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(screen.getByRole('button', { name: 'Alle Daten teilen' })).toBeTruthy()
  expect(
    screen.getByText('Änderungen anderen Geräten zum Abgleich zur Verfügung stellen.'),
  ).toBeTruthy()
  const info = screen.getByRole('button', { name: 'Informationen zum Geräteabgleich' })
  expect(info.getAttribute('aria-expanded')).toBe('false')
  expect(info.querySelector('img')?.getAttribute('src')).toBe('/welli-icons/Info.svg')
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('true')
  expect(
    screen.getByText(/Beim Geräteabgleich werden neue Einträge automatisch hinzugefügt/)
      .parentElement?.hidden,
  ).toBe(false)
  fireEvent.click(info)
  expect(info.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByLabelText('Änderungen importieren')).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Änderungen prüfen' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('switch', { name: 'Geräteabgleich aktivieren' }))
  await waitFor(() => expect(screen.queryByLabelText('Änderungen importieren')).toBeNull())
  localStorage.clear()
})

it('erfasst nach erneutem Aktivieren lokale Änderungen und Löschungen aus der ausgeschalteten Zeit', async () => {
  const { appDatabase } = await import('../../data/database/appDatabase')
  const { feedMixRepository } = await import('../../data/repositories/feedMixRepository')
  await appDatabase.delete()
  await appDatabase.open()
  localStorage.clear()
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const toggle = screen.getByRole('switch', {
    name: 'Geräteabgleich aktivieren',
  }) as HTMLInputElement
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle.checked).toBe(true))
  await feedMixRepository.create({ id: 'mix', name: 'Vorher', ingredients: [] })
  await feedMixRepository.create({ id: 'removed', name: 'Nur lokal', ingredients: [] })
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle.checked).toBe(false))
  const countBefore = await appDatabase.deviceOperations.count()
  await feedMixRepository.update('mix', { name: 'Während ausgeschaltet' })
  await feedMixRepository.update('mix', { name: 'Vorher' })
  await feedMixRepository.delete('removed')
  expect(await appDatabase.deviceOperations.count()).toBe(countBefore)
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle.checked).toBe(true))
  const operations = await appDatabase.deviceOperations.toArray()
  expect(operations.some((op) => op.recordId === 'mix' && op.after?.name === 'Vorher')).toBe(true)
  expect(
    operations.some(
      (op) =>
        op.recordId === 'removed' && op.action === 'delete' && op.before?.name === 'Nur lokal',
    ),
  ).toBe(true)
  localStorage.clear()
})

it('aktiviert Download und Teilen getrennt nach Erstellung und verwendet die erstellte Datei', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  const changes = new File(['changes'], 'changes.zip', { type: 'application/zip' })
  const full = new File(['full'], 'full.zip', { type: 'application/zip' })
  vi.spyOn(changesExport, 'createChangesExport').mockResolvedValue(changes)
  vi.spyOn(fullExport, 'createFullExport').mockResolvedValue(full)
  const download = vi.spyOn(fileActions, 'downloadFile').mockImplementation(() => {})
  const share = vi.spyOn(fileActions, 'shareFile').mockResolvedValue('shared')
  const view = render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  const changesDownload = screen.getByRole('button', {
    name: 'Änderungen herunterladen',
  }) as HTMLButtonElement
  const changesShare = screen.getByRole('button', {
    name: 'Änderungen teilen',
  }) as HTMLButtonElement
  const fullDownload = screen.getByRole('button', {
    name: 'Alle Daten herunterladen',
  }) as HTMLButtonElement
  const fullShare = screen.getByRole('button', { name: 'Alle Daten teilen' }) as HTMLButtonElement
  expect(
    changesDownload.disabled &&
      changesShare.disabled &&
      fullDownload.disabled &&
      fullShare.disabled,
  ).toBe(true)
  fireEvent.click(screen.getAllByRole('button', { name: 'Erstellen' })[0])
  await waitFor(() => expect(changesDownload.disabled).toBe(false))
  expect(
    (screen.getAllByRole('button', { name: 'Erstellen' })[0] as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(changesShare.disabled).toBe(false)
  expect(fullDownload.disabled && fullShare.disabled).toBe(true)
  fireEvent.click(changesDownload)
  expect(download).toHaveBeenCalledWith(changes)
  fireEvent.click(changesShare)
  await waitFor(() => expect(share).toHaveBeenCalledWith(changes))
  await waitFor(() => expect(fullDownload.disabled).toBe(true))
  fireEvent.click(screen.getAllByRole('button', { name: 'Erstellen' })[1])
  await waitFor(() => expect(fullDownload.disabled).toBe(false))
  expect(
    (screen.getAllByRole('button', { name: 'Erstellen' })[1] as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(fullDownload)
  expect(download).toHaveBeenCalledWith(full)
  fireEvent.click(fullShare)
  await waitFor(() => expect(share).toHaveBeenCalledWith(full))
  view.unmount()
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  expect(
    screen
      .getAllByRole('button', { name: 'Erstellen' })
      .every((button) => !(button as HTMLButtonElement).disabled),
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Änderungen herunterladen' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Alle Daten teilen' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('verwendet den bevorzugten Ordner für Download und Import', async () => {
  localStorage.setItem('welliathome-device-sync-enabled', 'true')
  localStorage.setItem('welliathome-preferred-folder-enabled', 'true')
  vi.spyOn(preferredFolder, 'supportsPreferredFolder').mockReturnValue(true)
  vi.spyOn(preferredFolder, 'preferredFolderName').mockResolvedValue('Gemeinsam')
  const save = vi.spyOn(preferredFolder, 'saveInPreferredFolder').mockResolvedValue('paket.zip')
  const list = vi.spyOn(preferredFolder, 'listPreferredFolderZips').mockResolvedValue([])
  const download = vi.spyOn(fileActions, 'downloadFile').mockImplementation(() => {})
  vi.spyOn(changesExport, 'createChangesExport').mockResolvedValue(new File(['zip'], 'paket.zip'))
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  await screen.findByText('Ausgewählter Ordner: Gemeinsam')
  fireEvent.click(screen.getAllByRole('button', { name: 'Erstellen' })[0])
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Änderungen herunterladen' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen herunterladen' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(download).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Änderungen importieren' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen importieren' }))
  await waitFor(() => expect(list).toHaveBeenCalled())
  expect(screen.getByLabelText('ZIP-Dateien manuell auswählen')).toBeTruthy()
})
