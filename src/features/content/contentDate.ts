export function dateLabel(value?: string) {
  if (!value) return 'Noch keine Synchronisierung'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value))
}
