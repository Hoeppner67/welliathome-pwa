import { strToU8, zipSync } from 'fflate'
import type { PendingPackage } from './importFullExport'

/** Export both retained versions, including binary data and the source package. */
export async function createConflictArchive(pending: PendingPackage): Promise<File> {
  const files: Record<string, Uint8Array> = {
    'source.zip': new Uint8Array(await pending.archive.arrayBuffer()),
  }
  const conflicts = []
  for (const [index, conflict] of pending.conflicts.entries()) {
    const versions = []
    for (const [name, row] of [
      ['local', conflict.local],
      ['incoming', conflict.incoming],
    ] as const) {
      if (!row) {
        versions.push(null)
        continue
      }
      const { blob, ...fields } = row
      if (blob !== undefined && !(blob instanceof Blob))
        throw new Error('Eine archivierte Mediendatei ist ungültig.')
      if (blob instanceof Blob) {
        const path = `media/${index}-${name}`
        files[path] = new Uint8Array(await blob.arrayBuffer())
        versions.push({ ...fields, mediaPath: path, mediaType: blob.type })
      } else versions.push(fields)
    }
    conflicts.push({
      table: conflict.table,
      recordId: conflict.recordId,
      local: versions[0],
      incoming: versions[1],
    })
  }
  files['conflicts.json'] = strToU8(
    JSON.stringify({
      format: 'welliathome-conflict-archive',
      version: 1,
      packageId: pending.packageId,
      createdAt: pending.createdAt,
      resolvedAt: pending.resolvedAt ?? null,
      conflicts,
    }),
  )
  const checksums: Record<string, string> = {}
  for (const [name, bytes] of Object.entries(files)) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
    checksums[name] = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  }
  files['checksums.json'] = strToU8(JSON.stringify(checksums))
  const zip = zipSync(files, { level: 6 })
  return new File(
    [zip as Uint8Array<ArrayBuffer>],
    `welliathome-konflikte-${pending.packageId}.zip`,
    { type: 'application/zip' },
  )
}
