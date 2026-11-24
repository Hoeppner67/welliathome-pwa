// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConflictPackages } from './ConflictPackages'
import type { PendingPackage } from './importFullExport'

afterEach(cleanup)

it('zeigt offene Konflikte und reicht lokale sowie eingehende Entscheidungen weiter', () => {
  const pending: PendingPackage = {
    packageId: 'package-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    archive: new Blob(['test']),
    conflicts: [
      {
        table: 'birds',
        recordId: 'bird-1',
        local: { id: 'bird-1', name: 'Pico' },
        incoming: { id: 'bird-1', name: 'Luna' },
      },
    ],
  }
  const onResolve = vi.fn()

  render(
    <ConflictPackages
      pendingPackages={[pending]}
      busy={false}
      onResolve={onResolve}
      onExportArchive={vi.fn()}
    />,
  )

  expect(screen.getByText('Konflikte im Paket package-1')).toBeTruthy()
  expect(screen.getByText('birds: bird-1')).toBeTruthy()
  expect(screen.getByText(/Pico/)).toBeTruthy()
  expect(screen.getByText(/Luna/)).toBeTruthy()

  fireEvent.click(
    screen.getByRole('button', { name: 'Lokale Versionen behalten und Import fortsetzen' }),
  )
  expect(onResolve).toHaveBeenCalledWith('package-1', 'local')
  fireEvent.click(
    screen.getByRole('button', { name: 'Paketversionen übernehmen und Import fortsetzen' }),
  )
  expect(onResolve).toHaveBeenCalledWith('package-1', 'incoming')
})

it('zeigt abgeschlossene Konfliktarchive mit deaktivierter Bedienung bei laufender Verarbeitung', () => {
  const pending: PendingPackage = {
    packageId: 'package-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    archive: new Blob(['test']),
    resolvedAt: '2026-01-02T00:00:00.000Z',
    resolvedChoice: 'incoming',
    conflicts: [],
  }
  const onExportArchive = vi.fn()

  render(
    <ConflictPackages
      pendingPackages={[pending]}
      busy={true}
      onResolve={vi.fn()}
      onExportArchive={onExportArchive}
    />,
  )

  expect(screen.getByText('Gespeicherte Konfliktarchive')).toBeTruthy()
  expect(screen.getByText(/package-2 – Abgeschlossen/)).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Konfliktarchiv herunterladen' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
})
