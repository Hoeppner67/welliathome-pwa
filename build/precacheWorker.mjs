import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function shouldPrecache(path) {
  return (
    path !== 'sw.js' &&
    path !== '.htaccess' &&
    !path.endsWith('.map') &&
    !path.includes('-italic.') &&
    !/^welli-icons\/(?:AppIcon-1024\.png|app\/)/.test(path) &&
    !/^assets\/(?:html2canvas\.esm|index\.es|birdPdf-)[^/]*\.js$/.test(path)
  )
}

export function precacheWorker() {
  let outputDirectory
  return {
    name: 'welliathome-precache',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    writeBundle: {
      order: 'post',
      async handler() {
        const workerPath = resolve(outputDirectory, 'sw.js')
        const worker = await readFile(workerPath, 'utf8')
        const entries = await readdir(outputDirectory, { recursive: true, withFileTypes: true })
        const files = entries
          .filter((entry) => entry.isFile())
          .map((entry) => resolve(entry.parentPath, entry.name))
          .map((path) => path.slice(outputDirectory.length + 1).replaceAll('\\', '/'))
          .filter(shouldPrecache)
          .sort()
        const hash = createHash('sha256').update(worker)
        for (const file of files) {
          hash.update(JSON.stringify(file)).update(await readFile(resolve(outputDirectory, file)))
        }
        const urls = files.map((file) => '/' + file.split('/').map(encodeURIComponent).join('/'))
        await writeFile(
          workerPath,
          worker
            .replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 16))
            .replace('/* __PRECACHE__ */ []', JSON.stringify(urls)),
        )
      },
    },
  }
}
