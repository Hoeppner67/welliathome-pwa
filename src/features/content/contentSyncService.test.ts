// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appDatabase, initializeDatabase } from '../../data/database/appDatabase'
import { editorialRepository } from '../../data/repositories/editorialRepository'
import { syncEditorial, syncPlants, syncWelliPedia } from './contentSyncService'
import { CONTENT_FAVORITE_PLANT, favoriteIds, toggleFavorite } from './favoriteService'

const stamp = '2026-11-20T10:00:00.000Z'
const wpPost = {
  id: 42,
  date: stamp,
  modified: stamp,
  slug: 'test-wiki',
  link: 'https://welliathome.de/wiki/test-wiki/',
  title: { rendered: 'Wiki: Testartikel' },
  content: { rendered: '<h2>Überschrift</h2><p>Inhalt</p>' },
  excerpt: { rendered: 'Kurztext' },
  wiki_cats: [3],
}
function response(data: unknown, total = data instanceof Array ? data.length : 1, totalPages = 1) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Total': String(total),
      'X-WP-TotalPages': String(totalPages),
    },
  })
}
function endpoint(url: string) {
  return new URL(url).pathname + new URL(url).search
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('WordPress-Inhaltssynchronisierung', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })
  it('importiert Artikel und Kategorien vollständig mit stabiler WordPress-ID', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = endpoint(url)
      if (path.includes('/types/yada_wiki?'))
        return response({
          rest_base: 'yada_wiki',
          rest_namespace: 'wp/v2',
          taxonomies: ['wiki_cats', 'wiki_tags'],
        })
      if (path.includes('/taxonomies/wiki_cats?'))
        return response({ rest_base: 'wiki_cats', rest_namespace: 'wp/v2' })
      if (path.includes('/yada_wiki?')) return response([wpPost])
      if (path.includes('/wiki_cats?'))
        return response([{ id: 3, modified: stamp, slug: 'haltung', name: 'Haltung', parent: 0 }])
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await syncWelliPedia()).toBe(1)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/wp/v2/yada_wiki?'))).toBe(
      true,
    )
    const stored = await editorialRepository.getWikiArticle('42')
    expect(stored?.title).toBe('Wiki: Testartikel')
    expect(stored?.categoryIds).toEqual(['3'])
    expect((await editorialRepository.listWikiCategories())[0].name).toBe('Haltung')
  })

  it('kühlt automatische Sync-Fehler ab und erlaubt einen manuellen Retry', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string) => {
      const path = endpoint(url)
      if (path.includes('/types/yada_wiki?'))
        return response({
          rest_base: 'yada_wiki',
          rest_namespace: 'wp/v2',
          taxonomies: ['wiki_cats'],
        })
      if (path.includes('/taxonomies/wiki_cats?'))
        return response({ rest_base: 'wiki_cats', rest_namespace: 'wp/v2' })
      if (path.includes('/yada_wiki?')) throw new TypeError('offline')
      if (path.includes('/wiki_cats?')) return response([])
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = syncEditorial('wellipedia', { manual: false })
    const firstFailure = expect(first).rejects.toThrow('Keine lesbare Verbindung')
    await vi.runAllTimersAsync()
    await firstFailure
    const articleRequests = () =>
      fetchMock.mock.calls.filter(([url]) => endpoint(url).includes('/yada_wiki?')).length
    expect(articleRequests()).toBe(3)

    await expect(syncEditorial('wellipedia', { manual: false })).rejects.toThrow(
      'automatische Aktualisierung wartet',
    )
    expect(articleRequests()).toBe(3)

    const manual = syncEditorial('wellipedia', { manual: true })
    const manualFailure = expect(manual).rejects.toThrow('Keine lesbare Verbindung')
    await vi.runAllTimersAsync()
    await manualFailure
    expect(articleRequests()).toBe(6)
  })
  it('erhält einen vollständigen Offline-Bestand bei HTTP-401', async () => {
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '9',
          wpId: 9,
          slug: 'alt',
          title: 'Offline',
          permalink: 'https://welliathome.de/wiki/alt/',
          contentHtml: '<p>Alt</p>',
          excerptHtml: '',
          categoryIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      stamp,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    await expect(syncWelliPedia()).rejects.toThrow('HTTP 401/403')
    expect((await editorialRepository.getWikiArticle('9'))?.title).toBe('Offline')
  })
  it('ordnet Pflanzen zu den echten WordPress-Pflanzengruppen und speichert lokal', async () => {
    const index = {
      id: 54853,
      modified: stamp,
      slug: 'futterpflanzen',
      link: 'https://welliathome.de/info/futterpflanzen/',
      title: { rendered: 'Futterpflanzen' },
      content: {
        rendered:
          '<div class="gb-tabs__menu-item">Krautige Pflanzen</div><div class="gb-tabs__item" role="tabpanel"><a data-id="81" href="https://welliathome.de/gaensebluemchen/">Gänseblümchen</a></div>',
      },
    }
    const plant = {
      id: 81,
      date: stamp,
      modified: stamp,
      slug: 'gaensebluemchen',
      link: 'https://welliathome.de/gaensebluemchen/',
      title: { rendered: 'Futterpflanzen: Gänseblümchen' },
      _embedded: {
        'wp:featuredmedia': [
          { source_url: 'https://welliathome.de/featured.jpg', alt_text: 'Featured' },
        ],
      },
      content: {
        rendered:
          '<details><summary>Zusammenfassung</summary><p class="summary">Zusammenfassungstext</p></details><div class="gb-element-intro"><img src="https://welliathome.de/intro.jpg"></div><p>Gänseblümchen sind eine geeignete Futterpflanze.</p><p><i>Bellis perennis</i></p><div class="gb-element-card"><img src="https://welliathome.de/karte.jpg" alt="Gänseblümchen auf der Futterkarte"><h2>Futterteile</h2><p>Blüte, Blätter</p></div><h3>Erntezeit</h3><p>Frühling</p><img src="https://welliathome.de/nachernte.jpg"><p>Weitere Inhalte</p>',
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        endpoint(url).includes('slug=futterpflanzen') ? response([index]) : response([plant]),
      ),
    )
    expect(await syncPlants()).toBe(1)
    const stored = await editorialRepository.getPlant('81')
    expect(stored?.title).toBe('Gänseblümchen')
    expect(stored?.groupNames).toEqual(['Krautige Pflanzen'])
    expect(stored?.scientificName).toBe('Bellis perennis')
    expect(stored?.introText).toBe('Gänseblümchen sind eine geeignete Futterpflanze.')
    expect(stored?.summary).toBeUndefined()
    expect(stored?.imageUrl).toBe('https://welliathome.de/karte.jpg')
    expect(stored?.imageAlt).toBe('Gänseblümchen auf der Futterkarte')
    expect(stored?.contentHtml).toContain('Gänseblümchen sind eine geeignete Futterpflanze.')
    expect(stored?.contentHtml).not.toContain('Zusammenfassung')
    expect(stored?.contentHtml).not.toContain('intro.jpg')
    expect(stored?.contentHtml).not.toContain('karte.jpg')
    expect(stored?.contentHtml).not.toContain('Erntezeit')
    expect(stored?.contentHtml).not.toContain('nachernte.jpg')
    expect(stored?.harvestNotes).toBeUndefined()
    expect(stored?.effectNotes).toBeUndefined()
  })
  it('verarbeitet Futterpflanzen ohne Tab-ARIA und löst Porträt-Links ohne data-id auf', async () => {
    const index = {
      id: 54853,
      modified: stamp,
      slug: 'futterpflanzen',
      link: 'https://welliathome.de/info/ernaehrung/frischfutter/futterpflanzen/',
      title: { rendered: 'Futterpflanzen von A bis Z' },
      content: {
        rendered:
          '<div class="gb-tabs__menu-item">Krautige Pflanzen</div><div class="gb-tabs__item"><a href="https://welliathome.de/portraits/gaensebluemchen/">Gänseblümchen</a></div>',
      },
    }
    const metadata = {
      id: 81,
      slug: 'gaensebluemchen',
      link: 'https://welliathome.de/portraits/gaensebluemchen/',
    }
    const plant = {
      id: 81,
      date: stamp,
      modified: stamp,
      slug: 'gaensebluemchen',
      link: metadata.link,
      title: { rendered: 'Futterpflanzen: Gänseblümchen' },
      content: { rendered: '<p><i>Bellis perennis</i></p>' },
    }
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.searchParams.get('slug') === 'futterpflanzen') return response([index])
      if (parsed.searchParams.get('_fields') === 'id,slug,link') return response([metadata])
      if (parsed.searchParams.get('include') === '81') return response([plant])
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await syncPlants()).toBe(1)
    const stored = await editorialRepository.getPlant('81')
    expect(stored?.groupNames).toEqual(['Krautige Pflanzen'])
    expect(
      fetchMock.mock.calls.some(
        ([url]) => new URL(String(url)).searchParams.get('_fields') === 'id,slug,link',
      ),
    ).toBe(true)
  })
  it('ordnet verschachtelte Pflanzen-Tabs lokal den vier Hauptgruppen zu und überspringt Fremdlinks', async () => {
    const tabs =
      '<div class="gb-tabs"><div class="gb-tabs__menu"><div class="gb-tabs__menu-item">Krautige Pflanzen</div><div class="gb-tabs__menu-item">Süßgräser</div><div class="gb-tabs__menu-item">Bäume &amp; Sträucher</div><div class="gb-tabs__menu-item">Gemüse, Salat &amp; Obst</div></div><div class="gb-tabs__items"><div class="gb-tabs__item"><a href="https://welliathome.de/ginkgo/">Ginkgo</a></div><div class="gb-tabs__item"><a href="https://welliathome.de/hafer/">Hafer</a></div><div class="gb-tabs__item"><a href="https://welliathome.de/hasel/">Hasel</a></div><div class="gb-tabs__item"><a href="https://welliathome.de/karotte/">Karotte</a><a href="https://welliathome.de/zuckergehalt-in-gemuese/">Zucker in Gemüse</a></div></div></div><div class="gb-tabs"><div class="gb-tabs__menu-item">Vogelfutterpflanzen</div><div class="gb-tabs__item"><a href="https://welliathome.de/ignore/">Ignorieren</a></div></div>'
    const index = {
      id: 54853,
      modified: stamp,
      slug: 'futterpflanzen',
      link: 'https://welliathome.de/info/ernaehrung/frischfutter/futterpflanzen/',
      title: { rendered: 'Futterpflanzen' },
      content: { rendered: tabs },
    }
    const meta = [
      { id: 81, slug: 'ginkgo', link: 'https://welliathome.de/ginkgo/' },
      { id: 82, slug: 'hafer', link: 'https://welliathome.de/hafer/' },
      { id: 83, slug: 'hasel', link: 'https://welliathome.de/hasel/' },
      { id: 84, slug: 'karotte', link: 'https://welliathome.de/karotte/' },
    ]
    const plants = meta.map((item) => ({
      id: item.id,
      date: stamp,
      modified: stamp,
      slug: item.slug,
      link: item.link,
      title: { rendered: `Futterpflanzen: ${item.slug}` },
      content: { rendered: '<p>Porträt</p>' },
    }))
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.searchParams.get('slug') === 'futterpflanzen') return response([index])
      if (parsed.searchParams.get('_fields') === 'id,slug,link') return response(meta, meta.length)
      if (parsed.searchParams.has('include')) return response(plants, plants.length)
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await syncPlants()).toBe(4)
    expect((await editorialRepository.getPlant('81'))?.groupNames).toEqual(['Krautige Pflanzen'])
    expect((await editorialRepository.getPlant('82'))?.groupNames).toEqual(['Süßgräser'])
    expect((await editorialRepository.getPlant('83'))?.groupNames).toEqual(['Bäume & Sträucher'])
    expect((await editorialRepository.getPlant('84'))?.groupNames).toEqual(['Gemüse, Salat & Obst'])
    expect(await editorialRepository.getPlant('ignore')).toBeUndefined()
  })
  it('gleicht Wiki-Löschungen ab, speichert Suchtext und behält die alte Fassung eines fehlerhaften Artikels', async () => {
    const removed = { ...wpPost, id: 43, slug: 'removed' }
    const valid = { ...wpPost, id: 44, slug: 'valid' }
    let incremental = false
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/types/yada_wiki'))
        return response({
          rest_base: 'yada_wiki',
          rest_namespace: 'wp/v2',
          taxonomies: ['wiki_cats'],
        })
      if (parsed.pathname.endsWith('/taxonomies/wiki_cats'))
        return response({ rest_base: 'wiki_cats', rest_namespace: 'wp/v2' })
      if (parsed.pathname.endsWith('/wiki_cats'))
        return response([{ id: 3, slug: 'haltung', name: 'Haltung', parent: 0 }])
      if (!incremental) return response([wpPost, removed])
      if (parsed.searchParams.get('_fields') === 'id') return response([{ id: 42 }, { id: 44 }])
      expect(parsed.searchParams.has('modified_after')).toBe(true)
      return response([{ ...wpPost, title: '' }, valid])
    })
    vi.stubGlobal('fetch', fetchMock)
    await syncWelliPedia()
    expect((await editorialRepository.getWikiArticle('42'))?.searchText).toContain('Inhalt')
    const oldCursor = (await editorialRepository.getSyncStatus('wellipedia'))?.syncCursor
    incremental = true
    expect(await syncWelliPedia()).toBe(2)
    expect(await editorialRepository.getWikiArticle('43')).toBeUndefined()
    expect((await editorialRepository.getWikiArticle('42'))?.title).toBe(wpPost.title.rendered)
    expect(await editorialRepository.getWikiArticle('44')).toBeTruthy()
    expect(await editorialRepository.getSyncStatus('wellipedia')).toMatchObject({
      syncCursor: oldCursor,
      skippedCount: 1,
    })
    expect(
      fetchMock.mock.calls.filter(([url]) => url.includes('/types/yada_wiki')).length,
    ).toBeLessThanOrEqual(1)
  })

  it('behält bei Verbindungsabbruch und ungültigem JSON lokale Pflanzen und Favoriten bis zum erfolgreichen Retry', async () => {
    const plant = { ...wpPost, id: 81, title: { rendered: 'Futterpflanzen: Vogelmiere' } }
    const index = {
      content: {
        rendered:
          '<div role="tabpanel"><h2>Krautige Pflanzen</h2><a data-id="81" href="https://welliathome.de/vogelmiere/">Vogelmiere</a></div>',
      },
    }
    let failure: 'network' | 'json' | undefined
    let title = plant.title.rendered
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const params = new URL(url).searchParams
        if (params.has('slug')) return response([index])
        if (params.get('_fields') === 'id') return response([{ id: 81 }])
        if (failure === 'network') throw new TypeError('offline')
        if (failure === 'json') return new Response('<html>Fehler</html>')
        return response([{ ...plant, title: { rendered: title } }])
      }),
    )
    await syncEditorial('plants')
    await toggleFavorite(CONTENT_FAVORITE_PLANT, '81', 'Vogelmiere', false)
    const before = await editorialRepository.getSyncStatus('plants')

    for (const [mode, error] of [
      ['network', 'Keine lesbare Verbindung'],
      ['json', 'ungültige oder leere JSON-Antwort'],
    ] as const) {
      failure = mode
      await expect(syncEditorial('plants')).rejects.toThrow(error)
      expect(await editorialRepository.getSyncStatus('plants')).toEqual(before)
      expect((await editorialRepository.getPlant('81'))?.title).toBe('Vogelmiere')
      expect(await favoriteIds(CONTENT_FAVORITE_PLANT)).toEqual(new Set(['81']))
    }

    failure = undefined
    title = 'Futterpflanzen: Gewöhnliche Vogelmiere'
    await expect(syncEditorial('plants')).resolves.toBe(1)
    expect((await editorialRepository.getPlant('81'))?.title).toBe('Gewöhnliche Vogelmiere')
    expect(await favoriteIds(CONTENT_FAVORITE_PLANT)).toEqual(new Set(['81']))
  })

  it('behält Offline-Pflanzen bei widersprüchlichen Seitenzahlen des ID-Abgleichs', async () => {
    const plant = { ...wpPost, id: 81, title: { rendered: 'Futterpflanzen: Vogelmiere' } }
    const index = {
      content: {
        rendered:
          '<div role="tabpanel"><h2>Krautige Pflanzen</h2><a data-id="81" href="https://welliathome.de/vogelmiere/">Vogelmiere</a></div>',
      },
    }
    let inconsistent = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const params = new URL(url).searchParams
        if (params.has('slug')) return response([index])
        if (inconsistent && params.get('_fields') === 'id') {
          const page = params.get('page') === '1' ? 1 : 2
          return new Response(JSON.stringify([{ id: 81 + page - 1 }]), {
            headers: { 'X-WP-TotalPages': page === 1 ? '2' : '3' },
          })
        }
        return response([plant])
      }),
    )
    expect(await syncPlants()).toBe(1)
    const before = await editorialRepository.getSyncStatus('plants')
    inconsistent = true
    await expect(syncPlants()).rejects.toThrow(/Paginierungsdaten/)
    expect((await editorialRepository.getPlant('81'))?.title).toBe('Vogelmiere')
    expect(await editorialRepository.getSyncStatus('plants')).toEqual(before)
  })

  it('aktualisiert Pflanzen inkrementell und entfernt im ID-Abgleich gelöschte Porträts', async () => {
    let incremental = false
    const post = (id: number) => ({ ...wpPost, id, slug: 'pflanze-' + id })
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams
      if (params.has('slug')) {
        const links = [81, 82, ...(incremental ? [83] : [])]
          .map(
            (id) => `<a data-id="${id}" href="https://welliathome.de/pflanze-${id}/">Pflanze</a>`,
          )
          .join('')
        return response([
          {
            ...post(99),
            content: { rendered: `<div role="tabpanel"><h2>Krautige Pflanzen</h2>${links}</div>` },
          },
        ])
      }
      if (!incremental) return response([post(81), post(82)])
      if (params.get('_fields') === 'id') return response([{ id: 81 }, { id: 83 }])
      expect(params.has('modified_after')).toBe(true)
      return response([post(83)])
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await syncPlants()).toBe(2)
    incremental = true
    expect(await syncPlants()).toBe(2)
    expect((await editorialRepository.listPlants()).map((plant) => plant.wpId).sort()).toEqual([
      81, 83,
    ])
  })
})
