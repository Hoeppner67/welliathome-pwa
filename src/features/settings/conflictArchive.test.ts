import { expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createConflictArchive } from './conflictArchive'

it('exportiert beide Versionen einschließlich Medien und ursprünglichem Paket mit Prüfsummen', async () => {
  const localBlob = new Blob(['lokal'], { type: 'image/png' })
  const remoteBlob = new Blob(['paket'], { type: 'image/png' })
  const file = await createConflictArchive({
    packageId: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-02T00:00:00.000Z',
    archive: new Blob(['original']),
    conflicts: [
      {
        table: 'mediaAssets',
        recordId: 'image',
        local: { id: 'image', blob: localBlob },
        incoming: { id: 'image', blob: remoteBlob },
      },
    ],
  })
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const data = JSON.parse(strFromU8(zip['conflicts.json']))
  const checksums = JSON.parse(strFromU8(zip['checksums.json']))
  expect(strFromU8(zip['source.zip'])).toBe('original')
  expect(strFromU8(zip[data.conflicts[0].local.mediaPath])).toBe('lokal')
  expect(strFromU8(zip[data.conflicts[0].incoming.mediaPath])).toBe('paket')
  for (const [path, expected] of Object.entries(checksums)) {
    const digest = await crypto.subtle.digest('SHA-256', zip[path] as Uint8Array<ArrayBuffer>)
    expect(
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    ).toBe(expected)
  }
})
