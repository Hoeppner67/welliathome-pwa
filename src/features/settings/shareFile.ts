/** Share only after a user gesture; report whether a download fallback is needed. */
export async function shareFile(file: File): Promise<'shared' | 'download' | 'cancelled'> {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function')
    return 'download'
  try {
    if (!navigator.canShare({ files: [file] })) return 'download'
    await navigator.share({ files: [file], title: 'Welli@Home Datenbestand' })
    return 'shared'
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    return 'download'
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = file.name
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
