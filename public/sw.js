const VERSION = '__BUILD_VERSION__'
const APP_SHELL = /* __PRECACHE__ */ []
const CACHE_PREFIX = 'welliathome-'
const SHELL_CACHE = CACHE_PREFIX + 'shell-' + VERSION
const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION
const IMAGE_CACHE = CACHE_PREFIX + 'editorial-images-v1'
const COMPAT_CACHE = CACHE_PREFIX + 'previous-assets-v1'
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE, COMPAT_CACHE]
const PRECACHED_PATHS = new Set(APP_SHELL)
const MAX_RUNTIME_ENTRIES = 100
const MAX_IMAGE_ENTRIES = 40
const MAX_COMPAT_ENTRIES = 150
const isHashedAsset = (url) => {
  const parsed = new URL(url, self.location.origin)
  return (
    parsed.origin === self.location.origin &&
    !parsed.search &&
    /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(parsed.pathname)
  )
}

async function preserveOldAssets(keys) {
  const compat = await caches.open(COMPAT_CACHE)
  for (const key of keys) {
    if (
      key === SHELL_CACHE ||
      key === RUNTIME_CACHE ||
      !(key.startsWith(CACHE_PREFIX + 'shell-') || key.startsWith(CACHE_PREFIX + 'runtime-'))
    )
      continue
    const source = await caches.open(key)
    for (const request of await source.keys()) {
      if (!isHashedAsset(request.url)) continue
      const response = await source.match(request)
      if (response?.ok) await compat.put(request, response)
    }
  }
  const entries = await compat.keys()
  for (const request of entries.slice(0, Math.max(0, entries.length - MAX_COMPAT_ENTRIES)))
    await compat.delete(request)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll(
        APP_SHELL.map(
          (url) => new Request(new URL(url, self.location.origin), { cache: 'reload' }),
        ),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      let preserved = false
      try {
        await preserveOldAssets(keys)
        preserved = true
      } catch {
        // Keep old caches when storage pressure prevents copying their assets.
      }
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              !CURRENT_CACHES.includes(key) &&
              (preserved ||
                !(
                  key.startsWith(CACHE_PREFIX + 'shell-') ||
                  key.startsWith(CACHE_PREFIX + 'runtime-')
                )),
          )
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

async function navigate(request) {
  const shell = await caches.open(SHELL_CACHE)
  // Use HTML and bundles from the same build until the new worker is active.
  const appShell = await shell.match('/index.html')
  if (appShell) return appShell
  const offlinePage = await shell.match('/offline.html')
  try {
    return await fetch(request)
  } catch {
    return offlinePage || Response.error()
  }
}

const pendingWrites = new Map()

async function cacheResponse(name, cache, request, response, maxEntries) {
  const pending = (pendingWrites.get(name) ?? Promise.resolve()).then(async () => {
    await cache.put(request, response)
    const keys = await cache.keys()
    await Promise.all(
      keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)),
    )
  })
  pendingWrites.set(
    name,
    pending.catch(() => undefined),
  )
  await pending.catch(() => undefined)
}

async function cachedAsset(request, name, limit, editorialImage = false) {
  const cache = await caches.open(name)
  // Hashed same-origin build files are immutable; the preload request and a
  // module request may differ in Origin even though they need identical bytes.
  const cached = await cache.match(
    request,
    name === SHELL_CACHE && isHashedAsset(request.url) ? { ignoreVary: true } : undefined,
  )
  if (cached) return cached
  if (!editorialImage && isHashedAsset(request.url)) {
    for (const key of await caches.keys()) {
      if (
        key !== COMPAT_CACHE &&
        (key === SHELL_CACHE ||
          key === RUNTIME_CACHE ||
          !(key.startsWith(CACHE_PREFIX + 'shell-') || key.startsWith(CACHE_PREFIX + 'runtime-')))
      )
        continue
      const previous = await (await caches.open(key)).match(request, { ignoreVary: true })
      if (previous) return previous
    }
  }
  try {
    const response = await fetch(request)
    const safeEditorialResponse =
      !editorialImage ||
      (response.type === 'cors' &&
        (!response.url || new URL(response.url).origin === 'https://welliathome.de'))
    if (limit && response.ok && safeEditorialResponse) {
      await cacheResponse(name, cache, request, response.clone(), limit)
    }
    return response
  } catch {
    return Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === 'https://welliathome.de' && request.destination === 'image') {
    event.respondWith(cachedAsset(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES, true))
    return
  }
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    if (/^\/(?:assets|icons|welli-icons|fonts|wp-json)(?:\/|$)/.test(url.pathname)) return
    if (PRECACHED_PATHS.has(url.pathname) && url.pathname !== '/index.html') return
    event.respondWith(navigate(request))
    return
  }
  if (!['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return
  if (PRECACHED_PATHS.has(url.pathname + url.search)) {
    event.respondWith(cachedAsset(request, SHELL_CACHE, 0))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cachedAsset(request, RUNTIME_CACHE, MAX_RUNTIME_ENTRIES))
    return
  }
  event.respondWith(cachedAsset(request, RUNTIME_CACHE, MAX_RUNTIME_ENTRIES))
})
