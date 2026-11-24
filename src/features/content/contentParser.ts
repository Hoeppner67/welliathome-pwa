import type { Entity, PlantArticle, WikiArticle } from '../../models'
import { WordPressApiError, type WpRecord } from './wordpressApi'
import {
  firstImage,
  plainTextFromHtml,
  plantCardImage,
  plantIntroduction,
  preparePlantArticleHtml,
  prepareWikiArticleHtml,
  removePlantIntroductionParagraph,
  sanitizeWordPressHtml,
} from './htmlContent'

export type WpPost = WpRecord & {
  id: number | string
  date?: string
  modified?: string
  slug: string
  link: string
  title: { rendered?: string } | string
  content?: { rendered?: string } | string
  excerpt?: { rendered?: string } | string
  wiki_cats?: Array<number | string>
}
const stamp = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString()
export const text = (value: unknown) => (typeof value === 'string' ? value : '')
export const rendered = (value: unknown) =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'rendered' in value
      ? text((value as { rendered?: unknown }).rendered)
      : ''

export function entity<T extends object>(wpId: number, modified: string, fields: T): T & Entity {
  const updatedAt = stamp(modified)
  return { ...fields, id: String(wpId), createdAt: updatedAt, updatedAt } as T & Entity
}
function embeddedImage(post: WpPost): { url: string; alt: string; caption?: string } | undefined {
  const embedded = post._embedded as
    | {
        'wp:featuredmedia'?: Array<{
          source_url?: string
          alt_text?: string
          caption?: { rendered?: string }
        }>
      }
    | undefined
  const media = embedded?.['wp:featuredmedia']?.[0]
  if (!media?.source_url) return undefined
  try {
    const url = new URL(media.source_url)
    if (url.origin !== 'https://welliathome.de') return undefined
    return {
      url: url.href,
      alt: media.alt_text ?? '',
      ...(media.caption?.rendered ? { caption: plainTextFromHtml(media.caption.rendered) } : {}),
    }
  } catch {
    return undefined
  }
}
function validatePost(post: WpPost): void {
  if (
    !post ||
    !Number.isSafeInteger(Number(post.id)) ||
    Number(post.id) <= 0 ||
    !text(post.slug) ||
    !text(post.link) ||
    !rendered(post.title).trim()
  ) {
    throw new WordPressApiError(
      'Ein Artikel hat keine gültige WordPress-ID, Route oder Überschrift; der lokale Bestand bleibt unverändert.',
    )
  }
}
export function wikiArticle(post: WpPost, categoryIds: Set<number>): WikiArticle {
  validatePost(post)
  const wpId = Number(post.id)
  const cats = Array.isArray(post.wiki_cats) ? post.wiki_cats.map(Number) : []
  if (cats.some((id) => !Number.isInteger(id) || !categoryIds.has(id))) {
    throw new WordPressApiError('Ein Wiki-Artikel verweist auf eine nicht verfügbare Kategorie.')
  }
  const contentHtml = rendered(post.content)
  const excerptHtml = rendered(post.excerpt)
  const image = embeddedImage(post) ?? firstImage(contentHtml)
  const displayHtml = sanitizeWordPressHtml(prepareWikiArticleHtml(contentHtml, image?.url))
  return entity(wpId, text(post.modified), {
    wpId,
    slug: post.slug,
    title: rendered(post.title),
    permalink: post.link,
    contentHtml,
    displayHtml,
    excerptHtml,
    categoryIds: cats.map(String),
    searchText: plainTextFromHtml(`${excerptHtml} ${displayHtml}`),
    ...(image
      ? {
          featuredImageUrl: image.url,
          featuredImageAlt: image.alt,
          ...('caption' in image && image.caption ? { featuredImageCaption: image.caption } : {}),
        }
      : {}),
  }) as WikiArticle
}

interface ParsedPlantIndex {
  groupsById: Map<number, string[]>
  groupsByPath: Map<string, string[]>
}
export function appendGroup(
  groups: Map<number | string, string[]>,
  key: number | string,
  group: string,
): void {
  groups.set(
    key,
    [...(groups.get(key) ?? []), group].filter((name, index, all) => all.indexOf(name) === index),
  )
}
export function normalizePagePath(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://welliathome.de')
    if (
      url.protocol !== 'https:' ||
      !['welliathome.de', 'www.welliathome.de'].includes(url.hostname)
    )
      return undefined
    return url.pathname.replace(/\/+$/, '') || '/'
  } catch {
    return undefined
  }
}
export function parsePlantIndex(html: string): ParsedPlantIndex {
  if (typeof DOMParser === 'undefined')
    throw new WordPressApiError('Dieser Browser kann den Pflanzenindex nicht verarbeiten.')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const groupsById = new Map<number, string[]>()
  const groupsByPath = new Map<string, string[]>()
  const canonicalGroups = [
    'Krautige Pflanzen',
    'Süßgräser',
    'Bäume & Sträucher',
    'Gemüse, Salat & Obst',
  ]
  const normalizeGroup = (value: string) =>
    value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE')
  let foundCanonicalTabs = false

  // Pair menus and panels within each GenerateBlocks tab widget. The live page
  // contains nested widgets, so document-wide selectors mix unrelated panels.
  for (const tabGroup of Array.from(doc.querySelectorAll('.gb-tabs'))) {
    const menus = Array.from(tabGroup.querySelectorAll('.gb-tabs__menu-item')).filter(
      (menu) => menu.closest('.gb-tabs') === tabGroup,
    )
    const panels = Array.from(tabGroup.querySelectorAll('.gb-tabs__item')).filter(
      (panel) => panel.closest('.gb-tabs') === tabGroup,
    )
    menus.forEach((menu, index) => {
      const group = canonicalGroups.find(
        (name) => normalizeGroup(name) === normalizeGroup(menu.textContent ?? ''),
      )
      if (!group) return
      foundCanonicalTabs = true
      const panel = panels[index]
      if (!panel)
        throw new WordPressApiError(
          `Die Pflanzengruppe „${group}“ hat kein zugeordnetes Inhaltsfeld.`,
        )
      const links = Array.from(panel.querySelectorAll('a[href]'))
      if (!links.length)
        throw new WordPressApiError(
          `Die Pflanzengruppe „${group}“ enthält keine auslesbaren Pflanzen.`,
        )
      for (const link of links) {
        const path = normalizePagePath(link.getAttribute('href') ?? '')
        if (
          !path ||
          path ===
            normalizePagePath('https://welliathome.de/info/ernaehrung/frischfutter/futterpflanzen/')
        )
          continue
        const idValue = link.getAttribute('data-id')
        const id = idValue && /^\d+$/.test(idValue) ? Number(idValue) : undefined
        if (id !== undefined) appendGroup(groupsById, id, group)
        else appendGroup(groupsByPath, path, group)
      }
    })
  }

  // Preserve support for simplified and older WordPress index markup.
  if (!foundCanonicalTabs) {
    const panels = Array.from(doc.querySelectorAll('.gb-tabs__item, [role="tabpanel"]'))
    const menus = Array.from(doc.querySelectorAll('.gb-tabs__menu-item, [role="tab"]'))
    if (!panels.length)
      throw new WordPressApiError(
        'Der öffentliche Futterpflanzenindex enthält keine auslesbaren Pflanzengruppen.',
      )
    panels.forEach((panel, index) => {
      const labelledBy = panel.getAttribute('aria-labelledby')
      const labelledElement = labelledBy ? doc.getElementById(labelledBy) : null
      const heading = panel.querySelector('h1,h2,h3,h4,h5,h6')
      const rawGroup = (
        menus[index]?.textContent ??
        labelledElement?.textContent ??
        panel.getAttribute('aria-label') ??
        heading?.textContent ??
        'Futterpflanzen'
      )
        .replace(/\s+/g, ' ')
        .trim()
      const group =
        canonicalGroups.find((name) => normalizeGroup(name) === normalizeGroup(rawGroup)) ??
        rawGroup
      const links = Array.from(panel.querySelectorAll('a[href]'))
      if (!links.length)
        throw new WordPressApiError(
          `Die Pflanzengruppe „${group}“ enthält keine auslesbaren Pflanzen.`,
        )
      for (const link of links) {
        const path = normalizePagePath(link.getAttribute('href') ?? '')
        if (!path) continue
        const idValue = link.getAttribute('data-id')
        const id = idValue && /^\d+$/.test(idValue) ? Number(idValue) : undefined
        if (id !== undefined) appendGroup(groupsById, id, group)
        else appendGroup(groupsByPath, path, group)
      }
    })
  }
  if (!groupsById.size && !groupsByPath.size)
    throw new WordPressApiError('Der Pflanzenindex enthält keine gültigen Porträt-Links.')
  return { groupsById, groupsByPath }
}
function sectionText(html: string, heading: RegExp): string | undefined {
  if (typeof DOMParser === 'undefined') return undefined
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const headers = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
  const header = headers.find((item) => heading.test(item.textContent ?? ''))
  if (!header) return undefined
  const parts: string[] = []
  for (
    let node = header.nextElementSibling;
    node && !/^H[1-6]$/.test(node.tagName);
    node = node.nextElementSibling
  ) {
    const value = node.textContent?.replace(/\s+/g, ' ').trim()
    if (value) parts.push(value)
  }
  return parts.length ? parts.join(' ') : undefined
}
export function plantModel(post: WpPost, groups: string[]): PlantArticle {
  validatePost(post)
  const rawHtml = rendered(post.content)
  const contentHtml = preparePlantArticleHtml(rawHtml)
  const wpId = Number(post.id)
  const title = rendered(post.title)
    .replace(/^(?:Futterpflanzen|Gräser):\s*/i, '')
    .trim()
  const scientificName =
    typeof DOMParser !== 'undefined'
      ? new DOMParser()
          .parseFromString(contentHtml, 'text/html')
          .querySelector('em,i')
          ?.textContent?.trim()
      : undefined
  const image = plantCardImage(rawHtml)
  const introText = plantIntroduction(contentHtml)
  const foodText = sectionText(contentHtml, /futterteile/i)
  const foodParts = foodText
    ? foodText
        .split(/[;,•\n]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    : []
  const warning = sectionText(contentHtml, /giftig|doppelgänger|verwechslung|achtung|warnhinweis/i)
  return entity(wpId, text(post.modified), {
    wpId,
    slug: post.slug,
    title,
    permalink: post.link,
    contentHtml,
    displayHtml: sanitizeWordPressHtml(removePlantIntroductionParagraph(contentHtml)),
    groupNames: groups,
    ...(scientificName ? { scientificName } : {}),
    foodParts,
    ...(introText ? { introText } : {}),
    warningNotes: warning ? [warning] : [],
    ...(image ? { imageUrl: image.url, imageAlt: image.alt } : {}),
    searchText: plainTextFromHtml(contentHtml),
  }) as PlantArticle
}
