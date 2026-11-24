import DOMPurify from 'dompurify'
import { plainTextFromHtml as toPlainText } from './plainTextFromHtml'
import { classifyLink } from '../../shared/links/linkPolicy'

const allowedTags = new Set([
  'A',
  'P',
  'BR',
  'HR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TH',
  'TD',
  'CAPTION',
  'FIGURE',
  'FIGCAPTION',
  'IMG',
  'DIV',
  'SPAN',
  'SUP',
  'SUB',
  'DL',
  'DT',
  'DD',
  'CODE',
  'PRE',
])
const blockedTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'INPUT',
  'BUTTON',
  'VIDEO',
  'AUDIO',
  'SVG',
  'MATH',
  'TEMPLATE',
])
export interface WordPressHtmlOptions {
  omitImageUrl?: string
}

function safeUrl(value: string, image = false): boolean {
  try {
    const url = new URL(value, 'https://welliathome.de')
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      (!image || (url.protocol === 'https:' && url.origin === 'https://welliathome.de'))
    )
  } catch {
    return false
  }
}
/** Removes WordPress/theme chrome from Wiki entries while retaining the article body. */
export function prepareWikiArticleHtml(html: string, featuredImageUrl?: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const normalizedText = (element: Element) =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim()

  for (const details of Array.from(doc.querySelectorAll('details'))) {
    const summary = details.querySelector('summary')
    if (summary && /^zusammenfassung$/i.test(normalizedText(summary))) details.remove()
  }
  for (const summary of Array.from(doc.querySelectorAll('.summary'))) summary.remove()

  const byline = Array.from(doc.querySelectorAll('span,div,p,li')).find((element) =>
    /^thorsten\s+hoeppner\s*\|\s*welli@home$/i.test(normalizedText(element)),
  )
  if (byline) {
    const row =
      byline.parentElement && normalizedText(byline.parentElement) === normalizedText(byline)
        ? byline.parentElement
        : byline
    row.remove()
  }

  const updatedNotice = Array.from(doc.body.querySelectorAll('mark,span,div,p')).find((element) =>
    /^aktualisiert\s+am\b/i.test(normalizedText(element)),
  )
  if (updatedNotice) (updatedNotice.closest('[class*="gb-element-"]') ?? updatedNotice).remove()

  for (const list of Array.from(doc.querySelectorAll('[aria-label="List"]'))) {
    const links = Array.from(list.querySelectorAll('a[href]'))
    if (links.length > 0 && list.querySelector('svg')) list.remove()
  }

  for (const list of Array.from(doc.querySelectorAll('ul,ol'))) {
    const items = Array.from(list.children).filter((item) => item.tagName === 'LI')
    if (
      items.length &&
      items.every((item) => item.querySelector('a[href]')) &&
      !list.nextElementSibling
    )
      list.remove()
  }

  const sourceHeading = Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span')).find(
    (element) => /^quellen(?:nachweise|angaben)?$/i.test(normalizedText(element)),
  )
  if (sourceHeading) {
    let cutoff: Element = sourceHeading
    while (cutoff.parentElement && !cutoff.nextElementSibling) cutoff = cutoff.parentElement
    if (cutoff.parentElement) {
      for (let sibling: Element | null = cutoff; sibling;) {
        const nextSibling: Element | null = sibling.nextElementSibling
        sibling.remove()
        sibling = nextSibling
      }
    } else {
      sourceHeading.remove()
    }
  }

  if (featuredImageUrl) {
    try {
      const featured = new URL(featuredImageUrl, 'https://welliathome.de').href
      for (const image of Array.from(doc.querySelectorAll('img[src]'))) {
        const src = image.getAttribute('src')
        if (src && new URL(src, 'https://welliathome.de').href === featured) image.remove()
      }
    } catch {
      /* Keep article images if the featured image URL is invalid. */
    }
  }
  return doc.body.innerHTML
}

export function sanitizeWordPressHtml(html: string): string {
  if (!DOMPurify.isSupported) return ''
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: Array.from(allowedTags, (tag) => tag.toLowerCase()),
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'width', 'height', 'id'],
    ADD_FORBID_CONTENTS: Array.from(blockedTags, (tag) => tag.toLowerCase()),
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM: true,
  }) as HTMLElement
  const prefixedIds = new Map<string, string>()
  for (const element of body.querySelectorAll('[id]')) {
    const id = element.id
    const prefixedId = `wp-${id}`
    prefixedIds.set(id, prefixedId)
    element.id = prefixedId
  }
  for (const element of body.querySelectorAll('*')) {
    const allowed =
      element.tagName === 'A'
        ? ['href', 'title']
        : element.tagName === 'IMG'
          ? ['src', 'alt', 'width', 'height']
          : ['id']
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.includes(attribute.name)) element.removeAttribute(attribute.name)
    }
    if (element.tagName === 'A') {
      let href = element.getAttribute('href')
      if (href?.startsWith('#')) {
        const targetId = prefixedIds.get(href.slice(1))
        if (targetId) {
          href = `#${targetId}`
          element.setAttribute('href', href)
        } else {
          href = null
          element.removeAttribute('href')
        }
      }
      const link = href && classifyLink(href)
      if (!link) element.removeAttribute('href')
      else {
        element.setAttribute('href', link.href)
        if (link.external) {
          element.setAttribute('target', '_blank')
          element.setAttribute('rel', 'noopener noreferrer')
        }
      }
    }
    if (element.tagName === 'IMG') {
      const source = element.getAttribute('src')
      if (!source || !safeUrl(source, true)) element.remove()
      else {
        element.setAttribute('src', new URL(source, 'https://welliathome.de').href)
        element.setAttribute('loading', 'lazy')
        element.setAttribute('referrerpolicy', 'no-referrer')
      }
    }
  }
  return body.innerHTML
}
export { plainTextFromHtml } from './plainTextFromHtml'
export function firstImage(html: string): { url: string; alt: string } | undefined {
  if (typeof DOMParser === 'undefined') return undefined
  const image = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('img[src],img[data-src]')
  const url = image && preferredImageSource(image)
  return url && safeUrl(url, true)
    ? { url: new URL(url, 'https://welliathome.de').href, alt: image?.getAttribute('alt') ?? '' }
    : undefined
}

function preferredImageSource(image: Element): string | null {
  const candidates = (image.getAttribute('srcset') ?? image.getAttribute('data-srcset') ?? '')
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter((url) => url && safeUrl(url, true))
  return (
    candidates.find((url) => /\.(?:avif|webp)(?:[?#]|$)/i.test(url)) ??
    image.getAttribute('data-src') ??
    image.getAttribute('src')
  )
}

/** Extracts the first editorial intro paragraph after omitting the opening summary block. */
export function plantIntroduction(html: string): string | undefined {
  if (typeof DOMParser === 'undefined') {
    const withoutSummary = html
      .replace(
        /<details\b[^>]*>[\s\S]*?<summary[^>]*>\s*Zusammenfassung\s*<\/summary>[\s\S]*?<\/details\s*>/gi,
        '',
      )
      .replace(/<[^>]*class=(["'])[^"']*\bsummary\b[^"']*\1[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    const firstParagraph = withoutSummary.match(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/i)?.[1]
    const text = toPlainText(firstParagraph ?? '').trim()
    return text || undefined
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const details of Array.from(doc.querySelectorAll('details'))) {
    if (
      /^zusammenfassung$/i.test(
        details.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      )
    )
      details.remove()
  }
  for (const summary of Array.from(doc.querySelectorAll('.summary'))) summary.remove()
  const paragraph = Array.from(doc.querySelectorAll('p')).find((item) => item.textContent?.trim())
  const text = paragraph?.textContent?.replace(/\s+/g, ' ').trim()
  return text || undefined
}

function plantCardImageElement(doc: Document): HTMLImageElement | undefined {
  const heading = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6,div.gb-text,p.gb-text')).find(
    (item) => /^futterteile\s*:?$/i.test(item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )
  let container = heading?.parentElement
  while (container && container !== doc.body) {
    if (container.matches('[class*="gb-element-"]')) {
      const image = container.querySelector('img[src]')
      if (image instanceof HTMLImageElement) return image
    }
    container = container.parentElement
  }
  return undefined
}

/** Removes the already-rendered introduction paragraph from the remaining article body. */
export function removePlantIntroductionParagraph(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<p\b[^>]*>[\s\S]*?<\/p\s*>/i, '')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const paragraph = Array.from(doc.querySelectorAll('p')).find((item) => item.textContent?.trim())
  paragraph?.remove()
  return doc.body.innerHTML
}

/** Selects the largest available source for the plant card headed “Futterteile”. */
export function plantCardImage(html: string): { url: string; alt: string } | undefined {
  if (typeof DOMParser === 'undefined') return undefined
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const image = plantCardImageElement(doc)
  if (!image) return undefined
  const candidates = (image.getAttribute('srcset') ?? '')
    .split(',')
    .map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/)
      return { url, width: Number.parseInt(descriptor ?? '', 10) || 0 }
    })
    .filter((candidate) => candidate.url && safeUrl(candidate.url, true))
    .sort((a, b) => b.width - a.width)
  const src =
    candidates.find((candidate) => /\.(?:avif|webp)(?:[?#]|$)/i.test(candidate.url))?.url ??
    candidates[0]?.url ??
    preferredImageSource(image)
  return src && safeUrl(src, true)
    ? { url: new URL(src, 'https://welliathome.de').href, alt: image.getAttribute('alt') ?? '' }
    : undefined
}

/** The original thumbnail may already be cached even when the larger source is not. */
export function plantCardThumbnailUrl(html: string): string | undefined {
  if (typeof DOMParser === 'undefined') return undefined
  const image = plantCardImageElement(new DOMParser().parseFromString(html, 'text/html'))
  const src = image?.getAttribute('src')
  return src && safeUrl(src, true) ? new URL(src, 'https://welliathome.de').href : undefined
}

/** Removes the summary, lead-in images and all content from “Erntezeit” onward. */
export function preparePlantArticleHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(
        /<details\b[^>]*>[\s\S]*?<summary[^>]*>\s*Zusammenfassung\s*<\/summary>[\s\S]*?<\/details\s*>/gi,
        '',
      )
      .replace(/<[^>]*class=(["'])[^"']*\bsummary\b[^"']*\1[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption\s*>/gi, '')
      .replace(
        /<(button|a|div)\b(?=[^>]*class=(["'])[^"']*(?:button|btn)[^"']*\2)[^>]*>[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi, '')
      .replace(/<input\b(?=[^>]*type=(["']?)(?:button|submit)\1)[^>]*\/?>/gi, '')
      .replace(/<h[1-6]\b[^>]*>\s*Erntezeit\s*<\/h[1-6]\s*>[\s\S]*$/i, '')
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const details of Array.from(doc.querySelectorAll('details'))) {
    if (
      /^zusammenfassung$/i.test(
        details.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      )
    )
      details.remove()
  }
  for (const summary of Array.from(doc.querySelectorAll('.summary'))) summary.remove()
  for (const caption of Array.from(doc.querySelectorAll('figcaption'))) caption.remove()
  for (const element of Array.from(
    doc.querySelectorAll(
      'button, input[type="button"], input[type="submit"], [role="button"], [class]',
    ),
  )) {
    const className = element.getAttribute('class')?.toLowerCase() ?? ''
    if (
      element.matches('button, input[type="button"], input[type="submit"], [role="button"]') ||
      className.includes('button') ||
      className.includes('btn')
    )
      element.remove()
  }

  const intro = Array.from(doc.querySelectorAll('p')).find((item) => item.textContent?.trim())
  if (intro) {
    for (const image of Array.from(doc.querySelectorAll('img'))) {
      if (image.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING) image.remove()
    }
  }
  plantCardImageElement(doc)?.remove()
  for (const emptyBlock of Array.from(doc.querySelectorAll('[class*="gb-element-"]'))) {
    if (!emptyBlock.textContent?.trim() && !emptyBlock.querySelector('img,svg')) emptyBlock.remove()
  }

  const harvestHeading = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).find((item) =>
    /^erntezeit\b/i.test(item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )
  if (harvestHeading) {
    let branch: Element = harvestHeading
    while (branch.parentElement && branch.parentElement !== doc.body) {
      const parent = branch.parentElement
      let sibling = branch.nextElementSibling
      while (sibling) {
        const next = sibling.nextElementSibling
        sibling.remove()
        sibling = next
      }
      if (branch === harvestHeading) branch.remove()
      branch = parent
    }
    let sibling = branch.nextElementSibling
    while (sibling) {
      const next = sibling.nextElementSibling
      sibling.remove()
      sibling = next
    }
    if (branch === harvestHeading) branch.remove()
  }
  return doc.body.innerHTML
}
