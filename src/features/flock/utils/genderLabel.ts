export function genderLabel(value: string): string {
  if (value === 'male') return 'Hahn'
  if (value === 'female') return 'Henne'
  if (value === 'unknown') return 'Unbekannt'
  return value
}
