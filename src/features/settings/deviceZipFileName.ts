const issuedNames = new Map<string, number>()

export function deviceZipFileName(createdAt: string, kind: 'daten' | 'update'): string {
  const timestamp = new Date(createdAt)
    .toISOString()
    .slice(0, 19)
    .replace('T', '_')
    .replace(/:/g, '-')
  const base = `wah_${kind}_${timestamp}`
  const count = (issuedNames.get(base) ?? 0) + 1
  issuedNames.set(base, count)
  return `${base}${count === 1 ? '' : `-${count}`}.zip`
}
