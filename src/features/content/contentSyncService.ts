import type { ContentSyncSource, PlantArticle, WikiCategory } from '../../models'
import { editorialRepository } from '../../data/repositories/editorialRepository'
import {
  getAllPages,
  getJson,
  wordpressApiBase,
  wordpressRestRoot,
  type WpRecord,
  WordPressApiError,
} from './wordpressApi'
import {
  appendGroup,
  entity,
  normalizePagePath,
  parsePlantIndex,
  plantModel,
  rendered,
  text,
  type WpPost,
  wikiArticle,
} from './contentParser'

interface DiscoveredRoutes {
  articles: string
  categories: string[]
}
const MAX_PARALLEL_BATCHES = 3
const SYNC_FAILURE_COOLDOWN_MS = 60000
const syncCooldowns = new Map<ContentSyncSource, number>()

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++
        results[index] = await mapper(values[index])
      }
    }),
  )
  return results
}
const validRestPath = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_/-]+$/.test(value)
async function fetchWelliPediaRoutes(signal?: AbortSignal): Promise<DiscoveredRoutes> {
  const typeResult = await getJson<WpRecord>(
    `${wordpressApiBase}/types/yada_wiki?_fields=rest_base,rest_namespace,taxonomies`,
    signal,
  )
  const type = typeResult.data
  if (
    !validRestPath(type.rest_base) ||
    !validRestPath(type.rest_namespace) ||
    !Array.isArray(type.taxonomies) ||
    !type.taxonomies.includes('wiki_cats')
  ) {
    throw new WordPressApiError(
      'Der Post Type yada_wiki oder seine wiki_cats-Taxonomie ist nicht öffentlich korrekt registriert.',
    )
  }
  const taxonomyResult = await getJson<WpRecord>(
    `${wordpressRestRoot}/${type.rest_namespace}/taxonomies/wiki_cats?_fields=rest_base,rest_namespace`,
    signal,
  )
  const taxonomy = taxonomyResult.data
  if (!validRestPath(taxonomy.rest_base) || !validRestPath(taxonomy.rest_namespace)) {
    throw new WordPressApiError('Der REST-Pfad der Wiki-Kategorien ist nicht öffentlich verfügbar.')
  }
  return {
    articles: `${wordpressRestRoot}/${type.rest_namespace}/${type.rest_base}`,
    categories: [`${wordpressRestRoot}/${taxonomy.rest_namespace}/${taxonomy.rest_base}`],
  }
}
let routesCache: { expires: number; routes: Promise<DiscoveredRoutes> } | undefined

export function discoverWelliPediaRoutes(signal?: AbortSignal): Promise<DiscoveredRoutes> {
  if (!signal && routesCache && routesCache.expires > Date.now()) return routesCache.routes
  const routes = fetchWelliPediaRoutes(signal)
  if (!signal) {
    routes.catch(() => {
      if (routesCache?.routes === routes) routesCache = undefined
    })
    routesCache = { expires: Date.now() + 3600000, routes }
  }
  return routes
}

async function getCategories(endpoint: string, signal?: AbortSignal): Promise<WikiCategory[]> {
  const raw = await getAllPages<WpRecord>(
    endpoint,
    100,
    'id,modified,slug,name,parent',
    false,
    undefined,
    undefined,
    signal,
  )
  return raw.map((item) => {
    const id = Number(item.id)
    if (!Number.isInteger(id) || !text(item.slug) || !text(item.name))
      throw new WordPressApiError('Die WordPress-Kategorien sind unvollständig.')
    const parentId = Number(item.parent)
    if (!Number.isInteger(parentId) || parentId < 0)
      throw new WordPressApiError('Eine Wiki-Kategorie hat keine gültige Elternkategorie.')
    return entity(id, text(item.modified) || new Date().toISOString(), {
      wpId: id,
      slug: text(item.slug),
      name: text(item.name),
      parentId,
    })
  })
}
function verifiedIds(rows: WpRecord[]): Set<number> {
  const ids = new Set<number>()
  for (const row of rows) {
    const id = Number(row?.id)
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) {
      throw new WordPressApiError('WordPress lieferte eine ungültige oder doppelte Artikel-ID.')
    }
    ids.add(id)
  }
  return ids
}

export async function syncWelliPedia(signal?: AbortSignal): Promise<number> {
  const startedAt = new Date().toISOString()
  const routes = await discoverWelliPediaRoutes(signal)
  const [existing, status] = await Promise.all([
    editorialRepository.listWikiArticles(),
    editorialRepository.getSyncStatus('wellipedia'),
  ])
  const cursor = status?.syncCursor
  const [rawPosts, categories, remoteIds] = await Promise.all([
    getAllPages<WpPost>(routes.articles, undefined, undefined, true, cursor, undefined, signal),
    getCategories(routes.categories[0], signal),
    cursor
      ? getAllPages<WpRecord>(routes.articles, 100, 'id', false, undefined, undefined, signal).then(
          verifiedIds,
        )
      : undefined,
  ])
  if (remoteIds?.size === 0 || (!remoteIds && rawPosts.length === 0)) {
    throw new WordPressApiError(
      'WordPress lieferte keine Wiki-Artikel. Der lokale Bestand bleibt erhalten.',
    )
  }
  const updatedIds = cursor ? verifiedIds(rawPosts) : new Set<number>()
  if (remoteIds && [...updatedIds].some((id) => !remoteIds.has(id))) {
    throw new WordPressApiError(
      'Die WordPress-Artikellisten widersprechen sich. Du kannst die Synchronisierung erneut starten.',
    )
  }
  if (remoteIds) {
    const knownIds = new Set(existing.map((article) => article.wpId))
    const missing = [...remoteIds].filter((id) => !knownIds.has(id) && !updatedIds.has(id))
    const batches = Array.from({ length: Math.ceil(missing.length / 40) }, (_, index) =>
      missing.slice(index * 40, index * 40 + 40),
    )
    const fetchedBatches = await mapWithConcurrency(
      batches,
      MAX_PARALLEL_BATCHES,
      async (batch) => ({
        batch,
        posts: await getAllPages<WpPost>(
          routes.articles,
          100,
          undefined,
          true,
          undefined,
          batch,
          signal,
        ),
      }),
    )
    for (const { batch, posts } of fetchedBatches) {
      const received = verifiedIds(posts)
      if (
        received.size !== batch.length ||
        batch.some((id) => !received.has(id)) ||
        [...received].some((id) => !remoteIds.has(id))
      ) {
        throw new WordPressApiError(
          'Ein neuer Wiki-Artikel konnte nicht vollständig geladen werden.',
        )
      }
      rawPosts.push(...posts)
    }
  }
  const categoryIds = new Set(categories.map((category) => category.wpId))
  const articles = new Map(
    existing.filter((item) => remoteIds?.has(item.wpId)).map((item) => [item.wpId, item]),
  )
  const previous = new Map(existing.map((item) => [item.wpId, item]))
  const seenIds = new Set<number>()
  let skipped = 0
  for (const post of rawPosts) {
    const id = Number(post?.id)
    if (seenIds.has(id)) throw new WordPressApiError('WordPress lieferte doppelte Artikel-IDs.')
    if (Number.isSafeInteger(id) && id > 0) seenIds.add(id)
    try {
      const article = wikiArticle(post, categoryIds)
      articles.set(id, article)
    } catch (error) {
      if (!(error instanceof WordPressApiError)) throw error
      skipped++
      const old = previous.get(id)
      if (old) articles.set(id, old)
    }
  }
  if (!articles.size || (rawPosts.length > 0 && skipped === rawPosts.length)) {
    throw new WordPressApiError(
      'Kein geladener Wiki-Artikel war gültig. Der lokale Bestand bleibt erhalten.',
    )
  }
  await editorialRepository.replaceWikiContent([...articles.values()], categories, startedAt, {
    syncCursor: skipped ? cursor : startedAt,
    skippedCount: skipped,
  })
  return articles.size
}

export async function syncPlants(signal?: AbortSignal): Promise<number> {
  const index = await getJson<WpPost[]>(
    'pages?slug=futterpflanzen&_fields=id,modified,slug,link,title,content',
    signal,
  )
  if (!Array.isArray(index.data) || index.data.length !== 1)
    throw new WordPressApiError('Der öffentliche Pflanzenindex wurde nicht eindeutig gefunden.')
  const parsedIndex = parsePlantIndex(rendered(index.data[0].content))
  const groupById = new Map(parsedIndex.groupsById)
  if (parsedIndex.groupsByPath.size) {
    const pageIndex = await getAllPages<WpPost>(
      'pages',
      100,
      'id,slug,link',
      false,
      undefined,
      undefined,
      signal,
    )
    const pagesByPath = new Map(
      pageIndex.flatMap((page) => {
        const path = normalizePagePath(page.link)
        return path ? [[path, Number(page.id)] as const] : []
      }),
    )
    for (const [path, groups] of parsedIndex.groupsByPath) {
      const matchingId = pagesByPath.get(path)
      // The index also contains an occasional cross-reference to a regular
      // article. Only public WordPress pages are plant portraits for this import.
      if (!Number.isInteger(matchingId)) continue
      for (const group of groups) appendGroup(groupById, matchingId!, group)
    }
  }
  const startedAt = new Date().toISOString()
  const [existing, status] = await Promise.all([
    editorialRepository.listPlants(),
    editorialRepository.getSyncStatus('plants'),
  ])
  const cursor = status?.syncCursor
  const requested = [...groupById.keys()]
  if (!requested.length)
    throw new WordPressApiError('Der Futterpflanzenindex enthält keine Pflanzenprofile.')
  const old = new Map(existing.map((item) => [item.wpId, item]))
  const plants = new Map<number, PlantArticle>()
  let skipped = 0
  let processed = 0
  const batches = Array.from({ length: Math.ceil(requested.length / 40) }, (_, index) =>
    requested.slice(index * 40, index * 40 + 40),
  )
  const fetchedBatches = await mapWithConcurrency(batches, MAX_PARALLEL_BATCHES, async (batch) => {
    const remoteIds = cursor
      ? verifiedIds(await getAllPages<WpPost>('pages', 100, 'id', false, undefined, batch, signal))
      : new Set(batch)
    if ([...remoteIds].some((id) => !batch.includes(id)))
      throw new WordPressApiError('Der Pflanzenabruf enthielt unerwartete IDs.')
    const ids = [...remoteIds]
    if (!ids.length) return { ids, remoteIds, fetched: [] as WpPost[] }
    const fetched = await getAllPages<WpPost>('pages', 100, undefined, true, cursor, ids, signal)
    const fetchedIds = verifiedIds(fetched)
    const missing = ids.filter((id) => !fetchedIds.has(id) && (!cursor || !old.has(id)))
    if (cursor && missing.length) {
      fetched.push(
        ...(await getAllPages<WpPost>('pages', 100, undefined, true, undefined, missing, signal)),
      )
    }
    const received = verifiedIds(fetched)
    if ([...received].some((id) => !remoteIds.has(id)) || missing.some((id) => !received.has(id))) {
      throw new WordPressApiError(
        'Der Pflanzenabruf war unvollständig. Der lokale Bestand bleibt erhalten.',
      )
    }
    return { ids, remoteIds, fetched }
  })

  for (const { ids, fetched } of fetchedBatches) {
    if (cursor) {
      for (const id of ids) {
        const previous = old.get(id)
        if (previous) plants.set(id, { ...previous, groupNames: groupById.get(id)! })
      }
    }
    for (const post of fetched) {
      processed++
      const id = Number(post.id)
      try {
        plants.set(id, plantModel(post, groupById.get(id)!))
      } catch (error) {
        if (!(error instanceof WordPressApiError)) throw error
        skipped++
        const previous = old.get(id)
        if (previous) plants.set(id, { ...previous, groupNames: groupById.get(id)! })
      }
    }
  }
  if (!plants.size || (processed > 0 && skipped === processed)) {
    throw new WordPressApiError(
      'Kein geladenes Pflanzenprofil war gültig. Der lokale Bestand bleibt erhalten.',
    )
  }
  await editorialRepository.replacePlants([...plants.values()], startedAt, {
    syncCursor: skipped ? cursor : startedAt,
    skippedCount: skipped,
  })
  return plants.size
}
const runningSyncs = new Map<ContentSyncSource, Promise<number>>()

interface SyncOptions {
  signal?: AbortSignal
  manual?: boolean
}

export function syncEditorial(
  source: ContentSyncSource,
  { signal, manual = true }: SyncOptions = {},
): Promise<number> {
  const retryAfter = syncCooldowns.get(source)
  if (!manual && retryAfter !== undefined && retryAfter > Date.now()) {
    return Promise.reject(
      new Error(
        'Die automatische Aktualisierung wartet nach einem Fehler kurz. Versuche es manuell erneut.',
      ),
    )
  }
  const active = runningSyncs.get(source)
  if (active) return active
  const run = (source === 'wellipedia' ? syncWelliPedia(signal) : syncPlants(signal))
    .then((count) => {
      syncCooldowns.delete(source)
      return count
    })
    .catch((error) => {
      if (!signal?.aborted) syncCooldowns.set(source, Date.now() + SYNC_FAILURE_COOLDOWN_MS)
      throw error
    })
    .finally(() => runningSyncs.delete(source))
  runningSyncs.set(source, run)
  return run
}
