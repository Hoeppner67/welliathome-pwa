import { readdir, readFile } from 'node:fs/promises'
import { relative, join, sep } from 'node:path'
import { zipSync } from 'fflate'

export async function createUploadArchive(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = {}
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const filePath = join(entry.parentPath, entry.name)
    const archivePath = relative(directory, filePath).split(sep).join('/')
    const parts = archivePath.split('/')
    if (
      parts.some((part) => part === 'node_modules' || part === '.idea' || part.endsWith('.zip'))
    )
      continue
    files[archivePath] = new Uint8Array(await readFile(filePath))
  }
  if (!files['index.html'] || !files['sw.js'])
    throw new Error('Das dist-Verzeichnis muss index.html und sw.js enthalten.')
  return zipSync(files, { level: 9 })
}
