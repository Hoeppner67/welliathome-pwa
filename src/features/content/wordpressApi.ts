export interface WpRecord {
  [key: string]: unknown
}
const DEFAULT_BASE = 'https://welliathome.de/wp-json/wp/v2'
export const wordpressApiBase = (import.meta.env.VITE_WP_API_BASE_URL || DEFAULT_BASE).replace(
  /\/$/,
  '',
)
export const wordpressRestRoot = wordpressApiBase.replace(/\/wp\/v2\/?$/, '')
export class WordPressApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message)
    this.name = 'WordPressApiError'
  }
}
export interface WordPressPageResponse<T> {
  data: T
  totalPages?: number
  total?: number
  nextPage?: number
}
const REQUEST_TIMEOUT_MS = 15000
const RETRY_DELAYS_MS = [500, 1500] as const
function positiveHeader(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}
function pageFromLink(value: string | null): number | undefined {
  if (!value) return undefined
  for (const part of value.split(',')) {
    if (!/rel="?next"?/i.test(part)) continue
    const url = part.match(/<([^>]+)>/)?.[1]
    if (!url) continue
    const page = Number(new URL(url, wordpressApiBase).searchParams.get('page'))
    if (Number.isInteger(page) && page > 0) return page
  }
  return undefined
}
function retryDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Abgebrochen', 'AbortError'))
    }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<WordPressPageResponse<T>> {
  const url = path.startsWith('http') ? path : `${wordpressApiBase}/${path.replace(/^\//, '')}`
  let response: Response | undefined
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      if (attempt === RETRY_DELAYS_MS.length) {
        const origin = typeof location === 'undefined' ? '' : ` (App-Origin: ${location.origin})`
        throw new WordPressApiError(
          `Keine lesbare Verbindung zur öffentlichen WordPress-API. Prüfe Netzwerk und CORS-Freigabe${origin}.`,
          undefined,
          url,
        )
      }
      await retryDelay(RETRY_DELAYS_MS[attempt], signal)
      continue
    }
    if (response.ok) break
    if (response.status < 500 || attempt === RETRY_DELAYS_MS.length) {
      const reason =
        response.status === 401 || response.status === 403
          ? 'WordPress verweigert den öffentlichen Lesezugriff (HTTP 401/403).'
          : response.status === 404
            ? 'Der angeforderte öffentliche WordPress-REST-Endpunkt wurde nicht gefunden (HTTP 404).'
            : `WordPress antwortet mit HTTP ${response.status}.`
      throw new WordPressApiError(reason, response.status, url)
    }
    await retryDelay(RETRY_DELAYS_MS[attempt], signal)
  }
  if (!response?.ok)
    throw new WordPressApiError(
      'Die WordPress-Anfrage konnte nicht abgeschlossen werden.',
      undefined,
      url,
    )
  let data: T
  try {
    data = (await response.json()) as T
  } catch (error) {
    throw new WordPressApiError(
      'WordPress hat eine ungültige oder leere JSON-Antwort geliefert.',
      response.status,
      url,
    )
  }
  return {
    data,
    total: positiveHeader(response.headers.get('X-WP-Total')),
    totalPages: positiveHeader(response.headers.get('X-WP-TotalPages')),
    nextPage: pageFromLink(response.headers.get('Link')),
  }
}
export async function getAllPages<T>(
  endpoint: string,
  perPage = 100,
  fields = 'id,date,modified,slug,link,title,excerpt,content,featured_media,wiki_cats,_embedded',
  embedFeaturedMedia = true,
  modifiedAfter?: string,
  include?: number[],
  signal?: AbortSignal,
): Promise<T[]> {
  const params = (page: number) => {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      _fields: fields,
    })
    if (embedFeaturedMedia) query.set('_embed', 'wp:featuredmedia')
    if (modifiedAfter) query.set('modified_after', modifiedAfter)
    if (include) query.set('include', include.join(','))
    return `${endpoint}?${query.toString()}`
  }
  const first = await getJson<T[]>(params(1), signal)
  if (!Array.isArray(first.data))
    throw new WordPressApiError('Die WordPress-Antwort enthält keine Artikelliste.')
  if (first.totalPages === 0 && first.data.length > 0)
    throw new WordPressApiError('WordPress liefert widersprüchliche Paginierungsdaten.')
  const pages: T[][] = [first.data]
  let count = first.data.length
  let page = 1
  let pageCount = first.totalPages
  while (true) {
    if (pageCount !== undefined && page >= pageCount) break
    const hasNext =
      first.totalPages !== undefined
        ? page < first.totalPages
        : first.nextPage !== undefined
          ? page < first.nextPage || pages[page - 1].length >= perPage
          : pages[page - 1].length >= perPage
    if (!hasNext) break
    if (page >= 500)
      throw new WordPressApiError(
        'Die WordPress-Paginierung überschreitet das sichere Seitenlimit.',
      )
    page += 1
    const result = await getJson<T[]>(params(page), signal)
    if (!Array.isArray(result.data))
      throw new WordPressApiError(`WordPress-Seite ${page} enthält keine Artikelliste.`)
    if (
      (pageCount !== undefined &&
        result.totalPages !== undefined &&
        pageCount !== result.totalPages) ||
      (first.total !== undefined && result.total !== undefined && first.total !== result.total)
    )
      throw new WordPressApiError('WordPress liefert widersprüchliche Paginierungsdaten.')
    if (result.data.length === 0) {
      if (pageCount !== undefined || result.nextPage !== undefined)
        throw new WordPressApiError(
          `WordPress-Seite ${page} fehlt; die lokale Kopie bleibt unverändert.`,
        )
      break
    }
    pages.push(result.data)
    count += result.data.length
    pageCount ??= result.totalPages
    if (result.totalPages !== undefined && result.totalPages < page)
      throw new WordPressApiError(`WordPress-Seite ${page} widerspricht den Paginierungsdaten.`)
    if (first.total !== undefined && count > first.total)
      throw new WordPressApiError(
        'Die WordPress-Paginierung enthält mehr Datensätze als angekündigt.',
      )
  }
  const all = pages.flat()
  if (first.total !== undefined && all.length !== first.total)
    throw new WordPressApiError(
      `WordPress lieferte ${all.length} von ${first.total} angekündigten Datensätzen; der lokale Bestand bleibt unverändert.`,
    )
  return all
}
