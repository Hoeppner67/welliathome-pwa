import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUploadArchive } from './packageArchive.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const archive = resolve(root, 'WelliAtHome-Upload.zip')

await writeFile(archive, await createUploadArchive(dist))
console.log(`Upload-Paket erstellt: ${archive}`)
