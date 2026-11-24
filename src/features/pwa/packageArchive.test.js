import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { createUploadArchive } from '../../../scripts/packageArchive.mjs'

let temporaryDirectory = ''

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true })
    temporaryDirectory = ''
  }
})

describe('Upload-Paket', () => {
  it('enthält dist-Dateien mit POSIX-Pfaden einschließlich .htaccess, aber keine Entwicklungsdateien', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'welliathome-package-'))
    const dist = join(temporaryDirectory, 'dist')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await mkdir(join(dist, 'node_modules', 'example'), { recursive: true })
    await mkdir(join(dist, '.idea'), { recursive: true })
    await writeFile(join(dist, 'index.html'), 'app')
    await writeFile(join(dist, 'sw.js'), 'worker')
    await writeFile(join(dist, '.htaccess'), 'apache')
    await writeFile(join(dist, 'assets', 'app.js'), 'bundle')
    await writeFile(join(dist, 'nested.zip'), 'archive')
    await writeFile(join(dist, 'node_modules', 'example', 'index.js'), 'dependency')
    await writeFile(join(dist, '.idea', 'workspace.xml'), 'workspace')

    const archive = unzipSync(await createUploadArchive(dist))
    const names = Object.keys(archive).sort()

    expect(names).toEqual(['.htaccess', 'assets/app.js', 'index.html', 'sw.js'])
    expect(names.every((name) => !name.includes('\\'))).toBe(true)
    expect(new TextDecoder().decode(archive['.htaccess'])).toBe('apache')
  })

  it('lehnt ein nicht vollständiges dist-Verzeichnis ab', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'welliathome-package-'))
    await writeFile(join(temporaryDirectory, 'index.html'), 'app')

    await expect(createUploadArchive(temporaryDirectory)).rejects.toThrow('index.html und sw.js')
  })
})
