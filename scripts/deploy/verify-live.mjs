const origin = 'https://app.welliathome.de'
const routePaths = ['/', '/schwarm/neu', '/einstellungen', '/koernermischungen', '/wellipedia']

async function fetchOk(path, expectedType) {
  const url = new URL(path, origin)
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (new URL(response.url).origin !== origin) {
    throw new Error(`${path} wurde auf eine unerwartete Origin umgeleitet.`)
  }
  if (!response.ok) throw new Error(`${path} lieferte HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? ''
  if (expectedType && !expectedType.test(contentType)) {
    throw new Error(`${path} lieferte einen unerwarteten Content-Type: ${contentType}`)
  }
  return { response, body: await response.text() }
}

async function verify() {
  const { body: html } = await fetchOk('/', /text\/html/i)
  if (!html.includes('<div id="root">')) throw new Error('/ lieferte nicht die App-Shell.')

  const { body: manifestText } = await fetchOk(
    '/manifest.webmanifest',
    /manifest\+json|application\/json/i,
  )
  const manifest = JSON.parse(manifestText)
  if (
    !manifest.name ||
    !manifest.start_url ||
    !Array.isArray(manifest.icons) ||
    !manifest.icons.length
  ) {
    throw new Error('Das PWA-Manifest ist unvollständig.')
  }

  const { body: worker } = await fetchOk('/sw.js', /javascript|ecmascript/i)
  if (!worker.includes('self.addEventListener'))
    throw new Error('/sw.js enthält keinen Service Worker.')

  const assetPaths = new Set(
    [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)].map(
      (match) => new URL(match[1], origin).pathname,
    ),
  )
  if (!assetPaths.size) throw new Error('In der App-Shell wurden keine Build-Assets gefunden.')
  for (const asset of assetPaths) {
    const type = asset.endsWith('.js')
      ? /javascript|ecmascript/i
      : asset.endsWith('.css')
        ? /text\/css/i
        : undefined
    await fetchOk(asset, type)
  }

  const icons = [
    ...manifest.icons,
    ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
  ]
  for (const icon of icons) {
    const iconPath = new URL(icon.src, origin).pathname
    await fetchOk(iconPath, /image\//i)
  }
  for (const path of routePaths) {
    const { body } = await fetchOk(path, /text\/html/i)
    if (!body.includes('<div id="root">')) throw new Error(`${path} lieferte nicht die App-Shell.`)
  }
  console.log(
    `HTTPS/PWA-Prüfung erfolgreich: Manifest, Worker, ${assetPaths.size} Assets, ${routePaths.length} Routen.`,
  )
}

verify().catch((error) => {
  console.error(`[verify-live] ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
