// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaStatus } from './PwaStatus'
import { captureInstallPrompt, clearInstallPrompt } from './installPrompt'

const originalOnLine = navigator.onLine
const originalUserAgent = navigator.userAgent

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
  clearInstallPrompt()
  vi.restoreAllMocks()
})

describe('PwaStatus', () => {
  it('zeigt einen verständlichen Offline-Hinweis', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<PwaStatus />)
    expect(screen.getByRole('status').textContent).toContain('Du bist offline')
    expect(screen.getByRole('status').textContent).toContain('Backup')
  })

  it('zeigt Installieren erst, wenn der Browser die Installation anbietet', async () => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'accepted' }>
    }
    event.prompt = vi.fn().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    captureInstallPrompt(event)
    render(<PwaStatus />)
    const button = await screen.findByRole('button', { name: 'APP installieren' })
    fireEvent.click(button)
    expect(event.prompt).toHaveBeenCalledOnce()
  })

  it('zeigt die iOS-Anleitung nur für Safari und blendet sie nach appinstalled aus', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1',
    })
    render(<PwaStatus />)
    expect(screen.getByText('Welli@Home in Safari öffnen.')).toBeTruthy()
    window.dispatchEvent(new Event('appinstalled'))
    await waitFor(() => expect(screen.queryByText('Welli@Home in Safari öffnen.')).toBeNull())
  })

  it('meldet ein wartendes Update und sendet SKIP_WAITING erst auf ausdrücklichen Klick', async () => {
    const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker
    const registration = Object.assign(new EventTarget(), {
      waiting: waitingWorker,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
    const view = render(
      <>
        <PwaStatus />
        <form data-guard-unsaved>
          <input aria-label="Vogelname" />
        </form>
      </>,
    )
    window.dispatchEvent(new Event('load'))
    const button = await screen.findByRole('button', { name: 'Jetzt aktualisieren' })
    const input = screen.getByRole('textbox', { name: 'Vogelname' })
    fireEvent.input(input, { target: { value: 'Entwurf' } })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(waitingWorker.postMessage).not.toHaveBeenCalled()
    view.rerender(<PwaStatus />)
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(screen.getByRole('progressbar', { name: 'App-Update wird aktiviert' })).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('ignoriert Suchformulare und prüft beim Sichtbarwerden auf App-Updates', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update,
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
    render(
      <>
        <PwaStatus />
        <form>
          <input aria-label="Suche" />
        </form>
      </>,
    )
    window.dispatchEvent(new Event('load'))
    fireEvent.input(screen.getByRole('textbox', { name: 'Suche' }), {
      target: { value: 'Körner' },
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(screen.queryByText(/Speichere oder verwerfe/)).toBeNull()
  })

  it('überspringt Updateprüfungen offline und führt sie nach dem Wiederverbinden aus', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const update = vi.fn().mockResolvedValue(undefined)
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update,
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })

    render(<PwaStatus />)
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
  })

  it('führt gleichzeitige Sichtbarkeits- und Ladeprüfungen nur einmal aus', async () => {
    let finishUpdate!: () => void
    const update = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve
        }),
    )
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update,
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })

    render(<PwaStatus />)
    window.dispatchEvent(new Event('load'))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledOnce()

    finishUpdate()
  })

  it('bietet nach einer Aktivierung in einem anderen Tab einen geschützten Neustart an', async () => {
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
    render(
      <>
        <PwaStatus />
        <form data-guard-unsaved>
          <input aria-label="Entwurf" />
        </form>
      </>,
    )
    window.dispatchEvent(new Event('load'))
    fireEvent.input(screen.getByRole('textbox', { name: 'Entwurf' }), { target: { value: 'Pico' } })
    act(() => {
      serviceWorker.dispatchEvent(new Event('controllerchange'))
    })
    const button = await screen.findByRole('button', { name: 'Jetzt aktualisieren' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Speichere oder verwerfe/)).toBeTruthy()
    fireEvent.reset(screen.getByRole('textbox', { name: 'Entwurf' }).closest('form')!)
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  })
  it('zeigt bei der ersten Übernahme durch einen Service Worker kein Update an', async () => {
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: null as ServiceWorker | null,
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
    render(<PwaStatus />)
    serviceWorker.controller = {} as ServiceWorker
    act(() => {
      serviceWorker.dispatchEvent(new Event('controllerchange'))
    })
    expect(screen.queryByRole('button', { name: 'Jetzt aktualisieren' })).toBeNull()
  })

  it('zeigt während der Vorbereitung eines neuen Service Workers Fortschritt', async () => {
    const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
    const registration = Object.assign(new EventTarget(), {
      waiting: null as typeof worker | null,
      installing: worker,
      update: vi.fn().mockResolvedValue(undefined),
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
    render(<PwaStatus />)
    window.dispatchEvent(new Event('load'))
    expect(
      await screen.findByRole('progressbar', { name: 'App-Update wird vorbereitet' }),
    ).toBeTruthy()
    registration.waiting = worker
    worker.state = 'installed'
    act(() => {
      worker.dispatchEvent(new Event('statechange'))
    })
    expect(await screen.findByRole('button', { name: 'Jetzt aktualisieren' })).toBeTruthy()
    expect(screen.queryByRole('progressbar', { name: 'App-Update wird vorbereitet' })).toBeNull()
  })
})
