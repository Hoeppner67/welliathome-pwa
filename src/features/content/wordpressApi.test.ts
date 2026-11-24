import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAllPages, getJson, WordPressApiError } from './wordpressApi'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('WordPress REST client', () => {
  it('liest alle Seiten anhand der Pagination-Header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'X-WP-Total': '2', 'X-WP-TotalPages': '2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 2 }]), {
          status: 200,
          headers: { 'X-WP-Total': '2', 'X-WP-TotalPages': '2' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAllPages<{ id: number }>('yada_wiki', 1, 'id')).resolves.toEqual([
      { id: 1 },
      { id: 2 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', mode: 'cors' })
  })
  it('setzt ein 15-Sekunden-Timeout und wiederholt einen abgebrochenen Request', async () => {
    vi.useFakeTimers()
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      expect(milliseconds).toBe(15000)
      return timeout.signal
    })
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (fetchMock.mock.calls.length > 1)
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }))
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason ?? new DOMException('timeout', 'TimeoutError')),
          { once: true },
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = getJson<{ ok: boolean }>('yada_wiki')
    timeout.abort(new DOMException('timeout', 'TimeoutError'))
    await vi.advanceTimersByTimeAsync(500)

    await expect(result).resolves.toMatchObject({ data: { ok: true } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('wiederholt Netzfehler mit Backoff', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = getJson<{ ok: boolean }>('yada_wiki')

    await vi.advanceTimersByTimeAsync(500)
    await expect(result).resolves.toMatchObject({ data: { ok: true } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('berichtet 401 ohne Authentifizierungsversuch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getJson('yada_wiki')).rejects.toBeInstanceOf(WordPressApiError)
    await expect(getJson('yada_wiki')).rejects.toThrow('öffentlichen Lesezugriff')
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('Authorization')
  })
  it('lehnt einen unvollständigen Seitensatz ab', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'X-WP-Total': '2', 'X-WP-TotalPages': '2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'X-WP-Total': '2', 'X-WP-TotalPages': '2' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAllPages('yada_wiki', 1, 'id')).rejects.toThrow('Seite 2 fehlt')
  })
  it('lehnt widersprüchliche Seitenzahlen auch ohne sichtbaren Gesamtzähler ab', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('[{"id":1}]', { headers: { 'X-WP-TotalPages': '2' } }))
        .mockResolvedValueOnce(new Response('[{"id":2}]', { headers: { 'X-WP-TotalPages': '3' } })),
    )
    await expect(getAllPages('yada_wiki', 1, 'id')).rejects.toThrow(/Paginierungsdaten/)
  })
  it('lehnt widersprüchliche Gesamtzahlen und Null Seiten mit Inhalt ab', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('[{"id":1}]', { headers: { 'X-WP-Total': '2', 'X-WP-TotalPages': '2' } }),
        )
        .mockResolvedValueOnce(
          new Response('[{"id":2}]', { headers: { 'X-WP-Total': '3', 'X-WP-TotalPages': '2' } }),
        ),
    )
    await expect(getAllPages('yada_wiki', 1, 'id')).rejects.toThrow(/Paginierungsdaten/)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('[{"id":1}]', { headers: { 'X-WP-TotalPages': '0' } })),
    )
    await expect(getAllPages('yada_wiki', 1, 'id')).rejects.toThrow(/Paginierungsdaten/)
  })
  it('nutzt Body-Seitengröße, wenn CORS die Paginierungsheader nicht freigibt', async () => {
    const pageOne = Array.from({ length: 100 }, (_, id) => ({ id }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pageOne), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 100 }, { id: 101 }]), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAllPages<{ id: number }>('yada_wiki', 100, 'id', false)).resolves.toHaveLength(
      102,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('meldet 403, 404, Netzwerkfehler und leere Antworten verständlich', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 403 }))
        .mockResolvedValueOnce(new Response('{}', { status: 404 })),
    )
    await expect(getJson('yada_wiki')).rejects.toThrow('HTTP 401/403')
    await expect(getJson('yada_wiki')).rejects.toThrow('HTTP 404')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getJson('yada_wiki')).rejects.toThrow('Netzwerk und CORS')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(getJson('yada_wiki')).rejects.toThrow('ungültige oder leere JSON-Antwort')
  })
})
