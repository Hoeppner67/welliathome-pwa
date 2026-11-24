import type { PlantArticle, WikiArticle, WikiCategory } from '../../models'
import { plainTextFromHtml } from './htmlContent'

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}
export function articleTitle(title: string): string {
  return title.replace(/^Wiki:\s*/i, '').trim()
}
export function matchesWiki(article: WikiArticle, query: string): boolean {
  const q = normalizeSearch(query)
  return (
    !q ||
    normalizeSearch(
      `${articleTitle(article.title)} ${article.searchText ?? plainTextFromHtml(`${article.excerptHtml} ${article.contentHtml}`)}`,
    ).includes(q)
  )
}
export function matchesPlant(article: PlantArticle, query: string): boolean {
  const q = normalizeSearch(query)
  return (
    !q ||
    normalizeSearch(
      `${article.title} ${article.scientificName ?? ''} ${article.searchText} ${article.groupNames.join(' ')} ${article.foodParts.join(' ')}`,
    ).includes(q)
  )
}

export function mainWikiCategoryIds(categoryIds: string[], categories: WikiCategory[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const roots = new Set<string>()
  for (const categoryId of categoryIds) {
    let current = byId.get(categoryId)
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      if (current.parentId === 0) {
        roots.add(current.id)
        break
      }
      if (current.parentId === undefined) break
      current = byId.get(String(current.parentId))
    }
  }
  return [...roots]
}

export function wikiSummary(article: WikiArticle, maxLength = 220): string {
  const stripSearchPrefix = (value: string) =>
    value
      .replace(
        /^\s*(?:(?:search\s+for\s*:\s*)?(?:search\s+button\s*)?zusammenfassung\b\s*:?\s*)+/i,
        '',
      )
      .trim()
  let summary = stripSearchPrefix(plainTextFromHtml(article.excerptHtml))
  if (!summary || /^search\s+for\b/i.test(summary)) {
    const withoutSearchForm = article.contentHtml.replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, '')
    summary = stripSearchPrefix(plainTextFromHtml(withoutSearchForm))
  }
  if (!summary) return ''
  const incompleteMarker = /(?:…|\.{3}|\[\s*\.\.\.\s*\])\s*$/.test(summary)
  if (summary.length <= maxLength && !incompleteMarker) return summary
  const withoutMarker = summary.replace(/(?:…|\.{3}|\[\s*\.\.\.\s*])\s*$/, '').trimEnd()
  const shortened =
    withoutMarker.length > maxLength ? withoutMarker.slice(0, maxLength).trimEnd() : withoutMarker
  return `${shortened}...`
}
