import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

async function exists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function verify() {
  const maxEntryBytes = 480 * 1024
  // Keep the offline shell bounded while allowing the device import preview.
  const maxPrecacheBytes = 1072 * 1024
  const required = [
    'index.html',
    'offline.html',
    'offline.css',
    'sw.js',
    'manifest.webmanifest',
    '.htaccess',
  ]
  for (const file of required) {
    if (!(await exists(join(dist, file)))) throw new Error(`dist/${file} fehlt.`)
  }

  const worker = await readFile(join(dist, 'sw.js'), 'utf8')
  const version = worker.match(/const VERSION = '([^']+)'/)?.[1]
  if (!version || version === '__BUILD_VERSION__')
    throw new Error('Die Build-Version in dist/sw.js wurde nicht eingesetzt.')

  const shellText = worker.match(/const APP_SHELL = (\[[\s\S]*?\])/m)?.[1]
  if (!shellText) throw new Error('Die Precache-Liste in dist/sw.js fehlt.')
  const shell = JSON.parse(shellText)
  if (!Array.isArray(shell) || shell.length === 0)
    throw new Error('Die Precache-Liste in dist/sw.js ist leer oder ungültig.')

  const manifest = JSON.parse(await readFile(join(dist, 'manifest.webmanifest'), 'utf8'))
  for (const icon of manifest.icons ?? []) {
    const iconPath = decodeURIComponent(new URL(icon.src, 'https://welli.test').pathname).slice(1)
    if (!(await exists(join(dist, iconPath))))
      throw new Error(`Manifest-Icon dist/${iconPath} fehlt.`)
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    for (const icon of shortcut.icons ?? []) {
      const iconPath = decodeURIComponent(new URL(icon.src, 'https://welli.test').pathname).slice(1)
      if (!(await exists(join(dist, iconPath))))
        throw new Error(`Shortcut-Icon dist/${iconPath} fehlt.`)
    }
  }
  for (const file of ['offline.html', 'offline.css']) {
    const url = '/' + file
    if (!shell.includes(url)) throw new Error(`Die Offline-Ressource ${url} fehlt im Precache.`)
  }

  for (const url of shell) {
    if (url.includes('\\') || /%5c/i.test(url))
      throw new Error(`Die Precache-URL enthält einen Backslash: ${url}`)
    const path = decodeURIComponent(new URL(url, 'https://welli.test').pathname).slice(1)
    if (!(await exists(join(dist, path)))) throw new Error(`Precache-Datei dist/${path} fehlt.`)
  }

  const entries = await readdir(dist, { recursive: true, withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile())
  for (const entry of files) {
    const path = relative(dist, join(entry.parentPath, entry.name))
    if (path.split(sep).some((part) => part.includes('\\')))
      throw new Error(`Ungültiger Backslash im dist-Dateipfad: ${path}`)
  }

  const precacheBytes = await Promise.all(
    shell.map(
      async (url) =>
        (
          await stat(
            join(dist, decodeURIComponent(new URL(url, 'https://welli.test').pathname).slice(1)),
          )
        ).size,
    ),
  ).then((sizes) => sizes.reduce((sum, size) => sum + size, 0))
  const distBytes = await Promise.all(
    files.map((entry) => stat(join(entry.parentPath, entry.name))),
  ).then((sizes) => sizes.reduce((sum, item) => sum + item.size, 0))
  const entryFile = files.find((entry) =>
    /^assets\/index-[^/]+\.js$/.test(
      relative(dist, join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    ),
  )
  if (!entryFile) throw new Error('Das Entry-Bundle unter assets/index-*.js fehlt.')
  const entryBytes = (await stat(join(entryFile.parentPath, entryFile.name))).size
  if (entryBytes > maxEntryBytes) {
    throw new Error(
      `Das Entry-Bundle überschreitet das Größenbudget von ${maxEntryBytes} Bytes (${entryBytes} Bytes).`,
    )
  }
  if (precacheBytes > maxPrecacheBytes) {
    throw new Error(
      `Der Precache überschreitet das Größenbudget von ${maxPrecacheBytes} Bytes (${precacheBytes} Bytes).`,
    )
  }

  console.log(
    `dist geprüft: ${files.length} Dateien, ${(distBytes / 1024 / 1024).toFixed(2)} MB; ` +
      `${shell.length} Precache-Einträge, ${(precacheBytes / 1024 / 1024).toFixed(2)} MB; ` +
      `Entry-Bundle ${(entryBytes / 1024).toFixed(2)} KB.`,
  )
}

verify().catch((error) => {
  console.error(`[verify-dist] ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
