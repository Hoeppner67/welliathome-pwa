import { describe, expect, it, vi } from 'vitest'
import workerSource from '../../../public/sw.js?raw'

type CacheLike = {
  addAll: (urls: Request[]) => Promise<void>
  put: (request: RequestInfo | URL, response: Response) => Promise<void>
  match: (request: RequestInfo | URL, options?: CacheQueryOptions) => Promise<Response | undefined>
  keys: () => Promise<Request[]>
  delete: (request: RequestInfo | URL) => Promise<boolean>
}
type Listener = (
  event: Record<string, unknown> & {
    waitUntil?: (promise: Promise<unknown>) => void
    respondWith?: (promise: Promise<Response>) => void
  },
) => void

function keyOf(request: RequestInfo | URL): string {
  const url =
    typeof request === 'string' || request instanceof URL
      ? new URL(request, 'https://welli.test')
      : new URL(request.url)
  return url.href
}

function createHarness(
  onFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const stores = new Map<string, Map<string, Response>>()
  const caches = {
    open: async (name: string): Promise<CacheLike> => {
      let store = stores.get(name)
      if (!store) {
        store = new Map()
        stores.set(name, store)
      }
      return {
        addAll: async (urls) => {
          for (const url of urls) {
            const response = await onFetch(url)
            if (!response.ok) throw new Error('precache failed')
            store!.set(keyOf(url), response.clone())
          }
        },
        put: async (request, response) => {
          store!.set(keyOf(request), response.clone())
        },
        match: async (request) => store!.get(keyOf(request))?.clone(),
        keys: async () =>
          [...store!.keys()].map((path) => new Request(new URL(path, 'https://welli.test'))),
        delete: async (request) => store!.delete(keyOf(request)),
      }
    },
    match: async (request: RequestInfo | URL) => {
      for (const store of stores.values()) {
        const response = store.get(keyOf(request))
        if (response) return response.clone()
      }
      return undefined
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const handlers: Record<string, Listener> = {}
  const self = {
    location: new URL('https://welli.test/sw.js'),
    addEventListener: (name: string, listener: Listener) => {
      handlers[name] = listener
    },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
  }
  const source = workerSource
    .replace('__BUILD_VERSION__', 'test')
    .replace(
      '/* __PRECACHE__ */ []',
      JSON.stringify([
        '/index.html',
        '/offline.html',
        '/manifest.webmanifest',
        '/assets/app.js',
        '/assets/index-AbCd1234.js',
        '/assets/app.css',
        '/apple-touch-icon.png',
        '/welli-icons/icon-192.png',
        '/welli-icons/icon-512.png',
        '/welli-icons/navigation/Schwarm.svg',
        '/fonts/winky-sans-latin-wght-normal.woff2',
        '/fonts/winky-sans-latin-ext-wght-normal.woff2',
      ]),
    )
  new Function('self', 'caches', 'fetch', 'Response', source)(self, caches, onFetch, Response)
  return { handlers, caches }
}

describe('Service Worker Offline-Cache', () => {
  it('liefert bereits gecachte alte Build-Assets nach einem Update weiter an offene Tabs', async () => {
    const { handlers, caches } = createHarness(async () => {
      throw new Error('offline')
    })
    const old = await caches.open('welliathome-shell-old')
    await old.put('/assets/old-AbCd1234.js', new Response('Alter Code'))
    await old.put('/index.html', new Response('Altes HTML'))
    const current = await caches.open('welliathome-shell-test')
    await current.put('/index.html', new Response('Neues HTML'))
    let activation!: Promise<unknown>
    handlers.activate({
      waitUntil: (promise) => {
        activation = promise
      },
    })
    await activation
    let asset!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/assets/old-AbCd1234.js',
        destination: 'script',
      },
      respondWith: (promise) => {
        asset = promise
      },
    })
    expect(await (await asset).text()).toBe('Alter Code')
    let navigation!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/schwarm',
        destination: 'document',
        mode: 'navigate',
      },
      respondWith: (promise) => {
        navigation = promise
      },
    })
    expect(await (await navigation).text()).toBe('Neues HTML')
  })
  it('behält bei einem Cache-Schreibfehler die alten Caches und liefert deren gehashte Assets', async () => {
    const { handlers, caches } = createHarness(async () => {
      throw new Error('offline')
    })
    const old = await caches.open('welliathome-shell-old')
    await old.put('/assets/old-AbCd1234.js', new Response('Alter Code'))
    const open = caches.open.bind(caches)
    vi.spyOn(caches, 'open').mockImplementation(async (name) => {
      const cache = await open(name)
      return name === 'welliathome-previous-assets-v1'
        ? {
            ...cache,
            put: async () => {
              throw new Error('Speicher voll')
            },
          }
        : cache
    })
    let activation!: Promise<unknown>
    handlers.activate({
      waitUntil: (promise) => {
        activation = promise
      },
    })
    await activation
    expect(await caches.keys()).toContain('welliathome-shell-old')
    let asset!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/assets/old-AbCd1234.js',
        destination: 'script',
      },
      respondWith: (promise) => {
        asset = promise
      },
    })
    expect(await (await asset).text()).toBe('Alter Code')
  })
  it('begrenzt den Kompatibilitätscache und übernimmt keine alten HTML-Dateien', async () => {
    const { handlers, caches } = createHarness(async () => new Response('Netzwerk'))
    const old = await caches.open('welliathome-shell-old')
    for (let index = 0; index <= 150; index++)
      await old.put(`/assets/item-${String(index).padStart(8, '0')}.js`, new Response('Code'))
    await old.put('/index.html', new Response('Altes HTML'))
    let activation!: Promise<unknown>
    handlers.activate({
      waitUntil: (promise) => {
        activation = promise
      },
    })
    await activation
    const compat = await caches.open('welliathome-previous-assets-v1')
    expect(await compat.keys()).toHaveLength(150)
    expect(await compat.match('/index.html')).toBeUndefined()
    expect(await caches.keys()).not.toContain('welliathome-shell-old')
  })
  it('bricht eine Installation bei einem fehlgeschlagenen Download ab und erhält den alten Cache', async () => {
    const { handlers, caches } = createHarness(async (request) => {
      if (keyOf(request).endsWith('/assets/app.js')) throw new Error('Download abgebrochen')
      return new Response('vorhanden')
    })
    const old = await caches.open('welliathome-shell-old')
    await old.put('/index.html', new Response('Alter Build'))
    let installed!: Promise<unknown>
    handlers.install({
      waitUntil: (promise) => {
        installed = promise
      },
    })
    await expect(installed).rejects.toThrow('Download abgebrochen')
    expect(await (await old.match('/index.html'))?.text()).toBe('Alter Build')
    expect(await caches.keys()).toContain('welliathome-shell-old')
  })
  it('legt App-Shell sowie aktuelle JavaScript- und CSS-Bundles vor Aktivierung in den Cache', async () => {
    const network = async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
        'https://welli.test',
      )
      const body =
        url.pathname === '/index.html'
          ? '<script type="module" crossorigin src="/assets/app.js"></script><link rel="stylesheet" crossorigin href="/assets/app.css">'
          : url.pathname
      return new Response(body, { status: 200 })
    }
    const { handlers, caches } = createHarness(network)
    let installed!: Promise<unknown>
    handlers.install({
      waitUntil: (promise) => {
        installed = promise
      },
    })
    await installed

    const shell = await caches.open('welliathome-shell-test')
    expect(await shell.match('/index.html')).toBeTruthy()
    expect(await shell.match('/assets/app.js')).toBeTruthy()
    expect(await shell.match('/assets/app.css')).toBeTruthy()
    expect(await shell.match('/welli-icons/navigation/Schwarm.svg')).toBeTruthy()
    expect(await shell.match('/fonts/winky-sans-latin-wght-normal.woff2')).toBeTruthy()
    expect(await shell.match('/fonts/winky-sans-latin-ext-wght-normal.woff2')).toBeTruthy()
  })
  it('ignoriert Vary nur für gehashte Build-Dateien im Precache', async () => {
    const { handlers, caches } = createHarness(async () => new Response('Netzwerk'))
    const open = caches.open.bind(caches)
    const options: Array<CacheQueryOptions | undefined> = []
    vi.spyOn(caches, 'open').mockImplementation(async (name) => {
      const cache = await open(name)
      if (name !== 'welliathome-shell-test') return cache
      return {
        ...cache,
        match: async (request, matchOptions) => {
          options.push(matchOptions)
          return cache.match(request, matchOptions)
        },
      }
    })
    const shell = await open('welliathome-shell-test')
    await shell.put('/assets/index-AbCd1234.js', new Response('Build'))
    await shell.put('/manifest.webmanifest', new Response('Manifest'))
    await shell.put('/assets/app.js', new Response('App'))
    let response!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/assets/index-AbCd1234.js',
        destination: 'script',
      },
      respondWith: (promise) => {
        response = promise
      },
    })
    await response
    expect(options[0]).toEqual({ ignoreVary: true })
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/manifest.webmanifest',
        destination: 'manifest',
      },
      respondWith: (promise) => {
        response = promise
      },
    })
    await response
    expect(options[1]).toBeUndefined()
  })
  it('findet alte gehashte Assets im Kompatibilitätscache unabhängig von Vary', async () => {
    const { handlers, caches } = createHarness(async () => {
      throw new Error('offline')
    })
    const open = caches.open.bind(caches)
    const compat = await open('welliathome-previous-assets-v1')
    await compat.put('/assets/old-AbCd1234.js', new Response('Alter Code'))
    const options: Array<CacheQueryOptions | undefined> = []
    vi.spyOn(caches, 'open').mockImplementation(async (name) => {
      const cache = await open(name)
      return name === 'welliathome-previous-assets-v1'
        ? {
            ...cache,
            match: async (request, matchOptions) => {
              options.push(matchOptions)
              return cache.match(request, matchOptions)
            },
          }
        : cache
    })
    let response!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/assets/old-AbCd1234.js',
        destination: 'script',
      },
      respondWith: (promise) => {
        response = promise
      },
    })
    expect(await (await response).text()).toBe('Alter Code')
    expect(options).toEqual([{ ignoreVary: true }])
  })

  it('ersetzt den alten App-Shell-Cache und liefert die neuen Icons offline', async () => {
    const paths = [
      '/apple-touch-icon.png',
      '/welli-icons/icon-192.png',
      '/welli-icons/icon-512.png',
    ]
    let online = true
    const { handlers, caches } = createHarness(async (request) => {
      if (!online) throw new Error('offline')
      return new Response(keyOf(request), { headers: { 'Content-Type': 'image/png' } })
    })
    const old = await caches.open('welliathome-shell-old')
    await old.put('/icons/app/icon-180.svg', new Response('Altes Icon'))

    for (const event of ['install', 'activate']) {
      let completed!: Promise<unknown>
      handlers[event]({
        waitUntil: (promise) => {
          completed = promise
        },
      })
      await completed
    }

    expect(await caches.keys()).not.toContain('welliathome-shell-old')
    online = false
    for (const path of paths) {
      const request = new Request('https://welli.test' + path)
      Object.defineProperty(request, 'destination', { value: 'image' })
      let result!: Promise<Response>
      handlers.fetch({
        request,
        respondWith: (promise) => {
          result = promise
        },
      })
      expect(await (await result).text()).toBe(request.url)
    }
  })

  it('liefert bei Netzausfall das gecachte Bundle und die App-Shell für Navigationen', async () => {
    let online = true
    const network = async (input: RequestInfo | URL) => {
      if (!online) throw new Error('offline')
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
        'https://welli.test',
      )
      const body =
        url.pathname === '/index.html'
          ? '<html>App Shell</html><script src="/assets/app.js"></script>'
          : 'bundle'
      return new Response(body, { status: 200 })
    }
    const { handlers, caches } = createHarness(network)
    let installed!: Promise<unknown>
    handlers.install({
      waitUntil: (promise) => {
        installed = promise
      },
    })

    await installed
    const shell = await caches.open('welliathome-shell-test')
    expect(await (await shell.match('/assets/app.js'))?.text()).toBe('bundle')
    online = false

    const assetRequest = new Request('https://welli.test/assets/app.js')
    Object.defineProperty(assetRequest, 'destination', { value: 'script' })
    let assetResponse!: Promise<Response>
    handlers.fetch({
      request: assetRequest,
      respondWith: (promise) => {
        assetResponse = promise
      },
    })
    expect(await (await assetResponse).text()).toBe('bundle')

    const navigationRequest = {
      method: 'GET',
      url: 'https://welli.test/schwarm',
      destination: 'document',
      mode: 'navigate',
    }
    let navigationResponse!: Promise<Response>
    handlers.fetch({
      request: navigationRequest,
      respondWith: (promise) => {
        navigationResponse = promise
      },
    })
    expect(await (await navigationResponse).text()).toBe(
      '<html>App Shell</html><script src="/assets/app.js"></script>',
    )
  })
  it('liefert die statische Offline-Seite, wenn die App-Shell fehlt und das Netz ausfällt', async () => {
    let online = true
    const { handlers, caches } = createHarness(async (input) => {
      if (!online) throw new Error('offline')
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
        'https://welli.test',
      )
      return new Response(url.pathname === '/offline.html' ? '<h1>Du bist offline</h1>' : 'shell')
    })
    let installed!: Promise<unknown>
    handlers.install({ waitUntil: (promise) => (installed = promise) })
    await installed
    const shell = await caches.open('welliathome-shell-test')
    await shell.delete('/index.html')
    online = false

    let navigationResponse!: Promise<Response>
    handlers.fetch({
      request: {
        method: 'GET',
        url: 'https://welli.test/schwarm',
        destination: 'document',
        mode: 'navigate',
      },
      respondWith: (promise) => (navigationResponse = promise),
    })
    expect(await (await navigationResponse).text()).toBe('<h1>Du bist offline</h1>')
  })
  it('liefert bis zur Aktivierung das HTML des aktiven Builds und sein Manifest', async () => {
    const network = vi.fn(async () => new Response('Neuer Build auf dem Server'))
    const { handlers, caches } = createHarness(network)
    const shell = await caches.open('welliathome-shell-test')
    await shell.put('/index.html', new Response('Aktiver Build'))
    await shell.put('/manifest.webmanifest', new Response('Aktuelles Manifest'))

    for (const [path, mode, destination, body] of [
      ['/schwarm', 'navigate', 'document', 'Aktiver Build'],
      ['/manifest.webmanifest', 'cors', 'manifest', 'Aktuelles Manifest'],
    ]) {
      let response!: Promise<Response>
      handlers.fetch({
        request: { method: 'GET', url: 'https://welli.test' + path, mode, destination },
        respondWith: (promise) => {
          response = promise
        },
      })
      expect(await (await response).text()).toBe(body)
    }
    expect(network).not.toHaveBeenCalled()
  })

  it('überlässt WordPress, Bestelllinks und direkt aufgerufene Assets dem Netzwerk', () => {
    const { handlers } = createHarness(async () => new Response('Netzwerk'))
    const respondWith = vi.fn()
    for (const request of [
      { url: 'https://welli.test/wp-json/wp/v2/pages', mode: 'cors' },
      { url: 'https://welli.test/wp-json/wp/v2/pages', mode: 'navigate' },
      { url: 'https://welli.test/assets/fehlt.js', mode: 'navigate' },
      { url: 'https://claus-futter.de/collections/wellensittichfutter', mode: 'navigate' },
    ]) {
      handlers.fetch({ request: { method: 'GET', ...request }, respondWith })
    }
    expect(respondWith).not.toHaveBeenCalled()
  })

  it('hält maximal 40 redaktionelle Bilder und lässt andere Bild-Hosts unangetastet', async () => {
    let online = true
    const { handlers } = createHarness(async () => {
      if (!online) throw new Error('offline')
      const response = new Response('Bild')
      Object.defineProperty(response, 'type', { value: 'cors' })
      return response
    })
    function image(url: string) {
      let response: Promise<Response> | undefined
      handlers.fetch({
        request: { method: 'GET', url, destination: 'image' },
        respondWith: (promise) => {
          response = promise
        },
      })
      return response
    }
    for (let i = 0; i <= 40; i++) {
      await image('https://welliathome.de/image-' + i + '.png')
    }
    online = false
    expect(await (await image('https://welliathome.de/image-40.png'))?.text()).toBe('Bild')
    expect((await image('https://welliathome.de/image-0.png'))?.type).toBe('error')
    expect(image('https://other.example/image.png')).toBeUndefined()
  })

  it('cached keine fehlerhaften oder opaken redaktionellen Bildantworten', async () => {
    let response: Response = new Response('Nicht gefunden', { status: 404 })
    const { handlers, caches } = createHarness(async () => response)
    const request = new Request('https://welliathome.de/fehlt.jpg')
    Object.defineProperty(request, 'destination', { value: 'image' })
    const fetchImage = async () => {
      let result!: Promise<Response>
      handlers.fetch({
        request,
        respondWith: (promise) => {
          result = promise
        },
      })
      return result
    }

    expect((await fetchImage()).status).toBe(404)
    const imageCache = await caches.open('welliathome-editorial-images-v1')
    expect(await imageCache.keys()).toHaveLength(0)

    response = new Response('Opaque response')
    Object.defineProperty(response, 'type', { value: 'opaque' })
    await fetchImage()
    expect(await imageCache.keys()).toHaveLength(0)
  })

  it('hält den Precache bei Überlauf des Runtime-Caches verfügbar', async () => {
    let online = true
    const { handlers, caches } = createHarness(async () => {
      if (!online) throw new Error('offline')
      return new Response('Datei')
    })
    let installed!: Promise<unknown>
    handlers.install({
      waitUntil: (promise) => {
        installed = promise
      },
    })
    await installed

    const requestAsset = (path: string) => {
      let response!: Promise<Response>
      handlers.fetch({
        request: { method: 'GET', url: 'https://welli.test' + path, destination: 'script' },
        respondWith: (promise) => {
          response = promise
        },
      })
      return response
    }
    for (let index = 0; index <= 100; index++) await requestAsset('/runtime-' + index + '.js')
    const runtime = await caches.open('welliathome-runtime-test')
    expect(await runtime.keys()).toHaveLength(100)
    online = false
    expect(await (await requestAsset('/assets/app.js')).text()).toBe('Datei')
  })

  it('cacht nicht vorab geladene App-Chunks zur Laufzeit für den Offline-Zugriff', async () => {
    let online = true
    const { handlers, caches } = createHarness(async () => {
      if (!online) throw new Error('offline')
      return new Response('PDF-Code')
    })
    const request = new Request('https://welli.test/assets/birdPdf-deferred.js')
    Object.defineProperty(request, 'destination', { value: 'script' })
    let response!: Promise<Response>
    handlers.fetch({
      request,
      respondWith: (promise) => {
        response = promise
      },
    })
    expect(await (await response).text()).toBe('PDF-Code')
    expect(await (await caches.open('welliathome-runtime-test')).match(request)).toBeTruthy()

    online = false
    let offlineResponse!: Promise<Response>
    handlers.fetch({
      request,
      respondWith: (promise) => {
        offlineResponse = promise
      },
    })
    expect(await (await offlineResponse).text()).toBe('PDF-Code')
  })
})
