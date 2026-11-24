import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContentSyncSource, PlantArticle, WikiArticle, WikiCategory } from '../../models'
import { editorialRepository } from '../../data/repositories/editorialRepository'
import { syncEditorial } from './contentSyncService'
import { CONTENT_FAVORITE_PLANT, CONTENT_FAVORITE_WIKI, favoriteIds } from './favoriteService'

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine

export function useContent(source: ContentSyncSource) {
  const [articles, setArticles] = useState<WikiArticle[]>([])
  const [plants, setPlants] = useState<PlantArticle[]>([])
  const [categories, setCategories] = useState<WikiCategory[]>([])
  const [needsCategoryRefresh, setNeedsCategoryRefresh] = useState(false)
  const [skipped, setSkipped] = useState(0)
  const [syncAt, setSyncAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const activeSync = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    if (source === 'wellipedia') {
      const [rows, cats, status, favs] = await Promise.all([
        editorialRepository.listWikiArticles(),
        editorialRepository.listWikiCategories(),
        editorialRepository.getSyncStatus(source),
        favoriteIds(CONTENT_FAVORITE_WIKI),
      ])
      setArticles(rows)
      setCategories(cats)
      setNeedsCategoryRefresh(cats.some((category) => category.parentId === undefined))
      setSyncAt(status?.lastSuccessfulAt ?? '')
      setSkipped(status?.skippedCount ?? 0)
      setFavorites(favs)
      return {
        count: rows.length,
        syncAt: status?.lastSuccessfulAt,
        needsCategoryRefresh: cats.some((category) => category.parentId === undefined),
      }
    }
    const [rows, status, favs] = await Promise.all([
      editorialRepository.listPlants(),
      editorialRepository.getSyncStatus(source),
      favoriteIds(CONTENT_FAVORITE_PLANT),
    ])
    setPlants(rows)
    setNeedsCategoryRefresh(false)
    setSyncAt(status?.lastSuccessfulAt ?? '')
    setSkipped(status?.skippedCount ?? 0)
    setFavorites(favs)
    return { count: rows.length, syncAt: status?.lastSuccessfulAt, needsCategoryRefresh: false }
  }, [source])
  const update = useCallback(
    async (manual = true) => {
      activeSync.current?.abort()
      const controller = new AbortController()
      activeSync.current = controller
      setSyncing(true)
      setError('')
      try {
        await syncEditorial(source, { signal: controller.signal, manual })
        if (!controller.signal.aborted) await load()
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Die Inhalte konnten nicht aktualisiert werden.',
          )
      } finally {
        if (activeSync.current === controller) {
          activeSync.current = null
          setSyncing(false)
        }
      }
    },
    [load, source],
  )
  useEffect(() => {
    let alive = true
    void load()
      .then((result) => {
        if (
          alive &&
          (result.count === 0 ||
            result.needsCategoryRefresh ||
            (result.syncAt && Date.now() - Date.parse(result.syncAt) > 7 * 86400000)) &&
          isOnline()
        )
          void update(false)
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : 'Lokale Inhalte konnten nicht geladen werden.',
          )
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
      activeSync.current?.abort()
    }
  }, [load, update])
  return {
    articles,
    plants,
    categories,
    needsCategoryRefresh,
    syncAt,
    skipped,
    loading,
    syncing,
    error,
    favorites,
    load,
    update,
  }
}
