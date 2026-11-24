// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SyncStatus } from './ContentControls'

afterEach(cleanup)

it('zeigt während der Synchronisierung einen unbestimmten Fortschritt', () => {
  const props = {
    syncAt: '',
    skipped: 0,
    syncing: true,
    error: '',
    onUpdate: vi.fn(),
    count: 0,
    label: 'Pflanzen',
    syncingLabel: 'Pflanzen werden synchronisiert …',
  }
  const view = render(<SyncStatus {...props} />)
  const progress = screen.getByRole('progressbar', { name: 'Synchronisierung läuft' })
  expect(progress.hasAttribute('value')).toBe(false)
  expect(
    (screen.getByRole('button', { name: 'Wird synchronisiert …' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  view.rerender(<SyncStatus {...props} syncing={false} />)
  expect(screen.queryByRole('progressbar')).toBeNull()
})
