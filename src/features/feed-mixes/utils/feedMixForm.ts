import type { FeedMix, NewEntity } from '../../../models'

export interface FeedMixFormValues {
  name: string
  provider: string
  ingredientsText: string
  productUrl: string
  notes: string
}

export type FeedMixFormField = keyof FeedMixFormValues
export type FeedMixFormErrors = Partial<Record<FeedMixFormField, string>>

export const emptyFeedMixForm: FeedMixFormValues = {
  name: '',
  provider: '',
  ingredientsText: '',
  productUrl: '',
  notes: '',
}

export function feedMixToFormValues(mix?: FeedMix): FeedMixFormValues {
  if (!mix) return { ...emptyFeedMixForm }
  return {
    name: mix.name,
    provider: mix.provider ?? '',
    ingredientsText: mix.ingredients.join('\n'),
    productUrl: mix.productUrl ?? '',
    notes: mix.notes ?? '',
  }
}

export function parseIngredients(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function validateFeedMixForm(values: FeedMixFormValues): FeedMixFormErrors {
  const errors: FeedMixFormErrors = {}
  if (!values.name.trim()) errors.name = 'Bitte gib einen Namen ein.'
  if (values.name.length > 120) errors.name = 'Bitte höchstens 120 Zeichen eingeben.'
  if (values.provider.length > 120) errors.provider = 'Bitte höchstens 120 Zeichen eingeben.'
  if (values.productUrl.trim() && !isHttpUrl(values.productUrl)) {
    errors.productUrl = 'Bitte gib eine gültige HTTP- oder HTTPS-Adresse ein.'
  }
  return errors
}

export function toNewFeedMix(values: FeedMixFormValues): NewEntity<FeedMix> {
  return {
    name: values.name.trim(),
    provider: values.provider.trim() || undefined,
    ingredients: parseIngredients(values.ingredientsText),
    productUrl: values.productUrl.trim() || undefined,
    notes: values.notes.trim() || undefined,
  }
}

export function toFeedMixUpdate(values: FeedMixFormValues): NewEntity<FeedMix> {
  return toNewFeedMix(values)
}

export function normalizeFeedMixSearch(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function matchesFeedMix(mix: FeedMix, query: string): boolean {
  const normalizedQuery = normalizeFeedMixSearch(query.trim())
  if (!normalizedQuery) return true
  const searchable = [mix.name, mix.provider ?? '', ...mix.ingredients]
    .map(normalizeFeedMixSearch)
    .join(' ')
  return searchable.includes(normalizedQuery)
}
