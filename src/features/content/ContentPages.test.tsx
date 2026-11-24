// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { appDatabase, initializeDatabase } from '../../data/database/appDatabase'
import { editorialRepository } from '../../data/repositories/editorialRepository'
import { favoriteRepository } from '../../data/repositories/favoriteRepository'
import * as favoriteService from './favoriteService'
import { EditorialDetailPage, PlantsPage, WelliPediaPage } from './ContentPages'

const stamp = '2026-11-20T10:00:00.000Z'
const post = {
  id: 777,
  date: stamp,
  modified: stamp,
  slug: 'wiki-live-test',
  link: 'https://welliathome.de/wiki/wiki-live-test/',
  title: { rendered: 'Wiki: Echter Artikel' },
  excerpt: { rendered: '' },
  content: {
    rendered:
      '<form><span>Search for:</span><button>Search Button</button></form><h2>Zusammenfassung</h2><p>Der echte Artikeltext.</p>',
  },
  wiki_cats: [5],
}
function response(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-WP-Total': '1', 'X-WP-TotalPages': '1' },
  })
}
function endpoint(url: string) {
  return new URL(url).pathname
}
function successfulFetch(url: string) {
  const path = endpoint(url)
  if (path.endsWith('/types/yada_wiki'))
    return response({ rest_base: 'yada_wiki', rest_namespace: 'wp/v2', taxonomies: ['wiki_cats'] })
  if (path.endsWith('/taxonomies/wiki_cats'))
    return response({ rest_base: 'wiki_cats', rest_namespace: 'wp/v2' })
  if (path.endsWith('/yada_wiki')) return response([post])
  if (path.endsWith('/wiki_cats'))
    return response([{ id: 5, slug: 'wissen', name: 'Wissen', parent: 0 }])
  return new Response('{}', { status: 404 })
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('WelliPedia-Seite', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => successfulFetch(url)),
    )
  })
  afterAll(async () => {
    await appDatabase.delete()
  })
  it('synchronisiert beim leeren lokalen Bestand, zeigt den Dexie-Inhalt und öffnet den Artikel', async () => {
    render(
      <MemoryRouter initialEntries={['/wellipedia']}>
        <Routes>
          <Route path="/wellipedia" element={<WelliPediaPage />} />
          <Route
            path="/wellipedia/:contentId"
            element={<EditorialDetailPage source="wellipedia" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('1 Artikel verfügbar')).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Echter Artikel' })).toBeTruthy()
    expect(await editorialRepository.getWikiArticle('777')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Eintrag öffnen' }))
    expect(await screen.findByRole('heading', { name: 'Echter Artikel' })).toBeTruthy()
    expect(document.querySelector('.wordpress-content--boxed')).toBeTruthy()
    expect(screen.queryByText('← Zur Übersicht')).toBeNull()
    expect(await screen.findByText('Der echte Artikeltext.')).toBeTruthy()
  })
  it('bietet nach einem nicht verfügbaren Detailinhalt einen Link zurück zur Liste', async () => {
    render(
      <MemoryRouter initialEntries={['/wellipedia/missing']}>
        <Routes>
          <Route
            path="/wellipedia/:contentId"
            element={<EditorialDetailPage source="wellipedia" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zurück zur Liste' }).getAttribute('href')).toBe(
      '/wellipedia',
    )
  })
  it('verwirft Fehler und Inhalte beim Wechsel zwischen Detailartikeln', async () => {
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '102',
          wpId: 102,
          slug: 'wechsel',
          title: 'Wechselartikel',
          permalink: 'https://welliathome.de/wiki/wechsel/',
          contentHtml: '<p>Neuer Inhalt</p>',
          excerptHtml: '',
          searchText: 'Neuer Inhalt',
          featuredImageUrl: '',
          featuredImageAlt: '',
          categoryIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      stamp,
    )
    render(
      <MemoryRouter initialEntries={['/wellipedia/missing']}>
        <Link to="/wellipedia/102">Zum Artikel</Link>
        <Link to="/wellipedia/other">Zum fehlenden Artikel</Link>
        <Routes>
          <Route
            path="/wellipedia/:contentId"
            element={<EditorialDetailPage source="wellipedia" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Zum Artikel' }))
    expect(await screen.findByRole('heading', { name: 'Wechselartikel' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Zum fehlenden Artikel' }))
    expect(screen.queryByRole('heading', { name: 'Wechselartikel' })).toBeNull()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
  it('meldet einen fehlgeschlagenen Favoritenwechsel und lässt ihn erneut zu', async () => {
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '102',
          wpId: 102,
          slug: 'favorit-fehler',
          title: 'Favoritenfehler',
          permalink: 'https://welliathome.de/wiki/favorit-fehler/',
          contentHtml: '<p>Artikeltext</p>',
          excerptHtml: '',
          searchText: 'Artikeltext',
          featuredImageUrl: '',
          featuredImageAlt: '',
          categoryIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      stamp,
    )
    vi.spyOn(favoriteService, 'toggleFavorite').mockRejectedValue(new Error('Speicherfehler'))
    render(
      <MemoryRouter initialEntries={['/wellipedia/102']}>
        <Routes>
          <Route
            path="/wellipedia/:contentId"
            element={<EditorialDetailPage source="wellipedia" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: '☆ Als Favorit merken' }))
    expect(
      (await screen.findByRole('alert')).textContent?.includes(
        'Der Favorit konnte nicht gespeichert werden.',
      ),
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: '☆ Als Favorit merken' }).hasAttribute('disabled'),
    ).toBe(false)
  })
  it('wendet die Suche mit Verzögerung auf gespeicherten Klartext an', async () => {
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '100',
          wpId: 100,
          slug: 'trocken',
          title: 'Trocken',
          permalink: 'https://welliathome.de/wiki/trocken/',
          contentHtml: '<p>Futter</p>',
          excerptHtml: '',
          searchText: 'Körner',
          featuredImageUrl: 'https://welliathome.de/wiki-bild.jpg',
          featuredImageAlt: 'Wiki-Bild',
          categoryIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      new Date().toISOString(),
    )
    render(
      <MemoryRouter>
        <WelliPediaPage />
      </MemoryRouter>,
    )
    const row = await screen.findByRole('link', { name: 'Trocken' })
    expect(row.closest('.content-card')?.querySelector('img')).toBeNull()
    expect(row.getAttribute('href')).toBe('/wellipedia/100')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Futter' } })
    expect(row.isConnected).toBe(true)
    expect(await screen.findByText('Keine passenden Artikel gefunden.')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Koerner' } })
    expect(await screen.findByRole('link', { name: 'Trocken' })).toBeTruthy()
  })
  it('zeigt ein gespeichertes Wiki-Bild weiterhin in der Detailansicht', async () => {
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '101',
          wpId: 101,
          slug: 'bild',
          title: 'Bildartikel',
          permalink: 'https://welliathome.de/wiki/bild/',
          contentHtml:
            '<p>Artikeltext</p><img src="https://welliathome.de/innen.jpg" alt="Innenbild">',
          excerptHtml: '',
          searchText: 'Artikeltext',
          categoryIds: [],
          featuredImageUrl: 'https://welliathome.de/titel.jpg',
          featuredImageAlt: 'Titelbild',
          featuredImageCaption: 'Bildunterschrift',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      stamp,
    )
    render(
      <MemoryRouter initialEntries={['/wellipedia/101']}>
        <Routes>
          <Route
            path="/wellipedia/:contentId"
            element={<EditorialDetailPage source="wellipedia" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect((await screen.findByAltText('Titelbild')).getAttribute('src')).toBe(
      'https://welliathome.de/titel.jpg',
    )
    expect(screen.getByAltText('Innenbild').getAttribute('src')).toBe(
      'https://welliathome.de/innen.jpg',
    )
    expect(screen.getByText('Bildunterschrift')).toBeTruthy()
    const source = screen.getByRole('link', { name: 'Original-Webseite öffnen' })
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toBe('noopener noreferrer')
  })
  it('zeigt bei Pflanzen nur Einleitungstexte und keine Futterteil-Filter', async () => {
    await editorialRepository.replacePlants(
      [
        {
          id: '811',
          wpId: 811,
          slug: 'pflanzen-test',
          title: 'Pflanzen-Test',
          permalink: 'https://welliathome.de/pflanzen-test/',
          contentHtml:
            '<details><summary>Zusammenfassung</summary><p class="summary">Veraltete Zusammenfassung</p></details><div><img src="https://welliathome.de/vorschaubild.jpg"></div><p>Der Einleitungssatz bleibt sichtbar.</p>',
          groupNames: ['Krautige Pflanzen'],
          foodParts: ['Blüte'],
          imageUrl: 'https://welliathome.de/pflanze.jpg',
          imageAlt: 'Pflanzenbild',
          summary: 'Veraltete Zusammenfassung',
          warningNotes: [],
          searchText: 'Pflanzentest',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      stamp,
    )
    render(
      <MemoryRouter initialEntries={['/futterpflanzen']}>
        <Routes>
          <Route path="/futterpflanzen" element={<PlantsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Der Einleitungssatz bleibt sichtbar.')).toBeTruthy()
    expect(document.querySelector('.content-card--plant img')).toBeNull()
    expect(screen.getByRole('link', { name: 'Pflanzen-Test' }).getAttribute('href')).toBe(
      '/futterpflanzen/811',
    )
    expect((await editorialRepository.getPlant('811'))?.imageUrl).toBe(
      'https://welliathome.de/pflanze.jpg',
    )
    expect(screen.queryByText('Veraltete Zusammenfassung')).toBeNull()
    expect(screen.queryByLabelText('Futterteil')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Filter zurücksetzen' })).toBeNull()
    expect(document.querySelector('.content-card .content-groups')).toBeNull()
    expect(document.querySelector('.content-card--plant .button')).toBeTruthy()
  })
  it('zeigt das Pflanzenbild einmalig als Thumbnail und öffnet es im Popup', async () => {
    await editorialRepository.replacePlants(
      [
        {
          id: '812',
          wpId: 812,
          slug: 'pflanzen-test',
          title: 'Pflanzen-Test',
          permalink: 'https://welliathome.de/pflanzen-test/',
          contentHtml:
            '<details><summary>Zusammenfassung</summary><p class="summary">Kurzfassung</p></details><div><img src="https://welliathome.de/vorab.jpg"></div><p>Einleitungssatz.</p><div class="gb-element-card"><img src="https://welliathome.de/pflanzenkarte.jpg" alt="Pflanzenkarte"><h3>Futterteile</h3><p>Blätter</p></div><h3>Erntezeit</h3><p>Nach-Ernte-Text</p>',
          imageUrl: 'https://welliathome.de/pflanzenkarte.jpg',
          imageAlt: 'Pflanzenkarte',
          groupNames: ['Krautige Pflanzen'],
          foodParts: ['Blätter'],
          warningNotes: [],
          searchText: 'Pflanzen-Test',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      stamp,
    )
    render(
      <MemoryRouter initialEntries={['/futterpflanzen/812']}>
        <Routes>
          <Route
            path="/futterpflanzen/:contentId"
            element={<EditorialDetailPage source="plants" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Pflanzen-Test' })).toBeTruthy()
    const source = screen.getByRole('link', { name: 'Original-Webseite öffnen' })
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByText('← Zur Übersicht')).toBeNull()
    expect(screen.queryByText('Zusammenfassung')).toBeNull()
    expect(screen.queryByText('Nach-Ernte-Text')).toBeNull()
    const plantTitle = screen.getByRole('heading', { name: 'Pflanzen-Test' })
    const intro = screen.getByText('Einleitungssatz.')
    const foodPartsHeading = screen.getByRole('heading', { name: 'Futterteile' })
    expect(
      plantTitle.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      intro.compareDocumentPosition(foodPartsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getAllByText('Einleitungssatz.')).toHaveLength(1)
    expect(document.querySelectorAll('.content-detail__hero--plant')).toHaveLength(1)
    expect(document.querySelector('.wordpress-content')?.querySelectorAll('img')).toHaveLength(0)
    const trigger = screen.getByRole('button', {
      name: 'Bild von Pflanzen-Test in Originalgröße anzeigen',
    })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Pflanzenbild von Pflanzen-Test' })).toBeTruthy()
    expect(document.querySelectorAll('.content-lightbox img')).toHaveLength(1)
    const close = screen.getByRole('button', { name: 'Schließen' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('zeigt ein bereits gespeichertes Pflanzenkartenbild mit Futterteile-Textblock im Thumbnail', async () => {
    await editorialRepository.replacePlants(
      [
        {
          id: '54433',
          wpId: 54433,
          slug: 'acker-fuchsschwanz',
          title: 'Acker-Fuchsschwanz',
          permalink: 'https://welliathome.de/acker-fuchsschwanz/',
          contentHtml:
            '<p>Einleitung</p><div class="gb-element-card"><a href="/bild.jpg"><img src="https://welliathome.de/bild-400.jpg" srcset="https://welliathome.de/bild.jpg 800w" alt="Acker-Fuchsschwanz"></a><div class="gb-element-info"><div class="gb-text"><strong>Futterteile</strong></div><ul><li>Samen</li></ul></div></div>',
          groupNames: ['Gräser'],
          foodParts: [],
          warningNotes: [],
          searchText: 'Acker-Fuchsschwanz',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      stamp,
    )
    render(
      <MemoryRouter initialEntries={['/futterpflanzen/54433']}>
        <Routes>
          <Route
            path="/futterpflanzen/:contentId"
            element={<EditorialDetailPage source="plants" />}
          />
        </Routes>
      </MemoryRouter>,
    )
    const image = await screen.findByAltText('Acker-Fuchsschwanz')
    expect(image.getAttribute('src')).toBe('https://welliathome.de/bild.jpg')
    expect(image.classList.contains('content-detail__hero--plant')).toBe(true)
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe('https://welliathome.de/bild-400.jpg')
    expect(document.querySelector('.plant-entry-box .wordpress-content img')).toBeNull()
    expect(screen.getByText('Samen')).toBeTruthy()
  })
  it('filtert WelliPedia-Favoriten zusätzlich nach Suche und Thema und aktualisiert Änderungen sofort', async () => {
    const categories = [
      {
        id: '5',
        wpId: 5,
        slug: 'ernaehrung',
        name: 'Ernährung',
        parentId: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: '6',
        wpId: 6,
        slug: 'haltung',
        name: 'Haltung',
        parentId: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ]
    await editorialRepository.replaceWikiContent(
      [
        {
          id: '901',
          wpId: 901,
          slug: 'lieblingsfutter',
          title: 'Wiki: Lieblingsfutter',
          permalink: 'https://welliathome.de/wiki/lieblingsfutter/',
          contentHtml: '<h2>Futter</h2><p>Text</p>',
          excerptHtml: '',
          categoryIds: ['5'],
          createdAt: stamp,
          updatedAt: stamp,
        },
        {
          id: '902',
          wpId: 902,
          slug: 'haltung',
          title: 'Wiki: Haltung',
          permalink: 'https://welliathome.de/wiki/haltung/',
          contentHtml: '<h2>Haltung</h2><p>Text</p>',
          excerptHtml: '',
          categoryIds: ['6'],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      categories,
      stamp,
    )
    await favoriteRepository.create({
      itemType: 'wiki-article',
      itemId: '901',
      title: 'Lieblingsfutter',
    })
    render(
      <MemoryRouter initialEntries={['/wellipedia']}>
        <Routes>
          <Route path="/wellipedia" element={<WelliPediaPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Haltung' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nur Favoriten' }))
    fireEvent.change(screen.getByLabelText('Artikel durchsuchen'), {
      target: { value: 'Lieblings' },
    })
    fireEvent.change(screen.getByLabelText('Thema'), { target: { value: '5' } })
    expect(screen.getByRole('link', { name: 'Lieblingsfutter' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Haltung' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '★ Favorit' }))
    expect(await screen.findByText('Keine passenden Favoriten gefunden')).toBeTruthy()
  })
  it('filtert Futterpflanzenfavoriten mit Suche und Pflanzengruppe und aktualisiert Änderungen sofort', async () => {
    await editorialRepository.replacePlants(
      [
        {
          id: '911',
          wpId: 911,
          slug: 'loewenzahn',
          title: 'Löwenzahn',
          permalink: 'https://welliathome.de/loewenzahn/',
          contentHtml: '<p>Löwenzahn</p>',
          groupNames: ['Krautige Pflanzen'],
          foodParts: ['Blätter'],
          warningNotes: [],
          searchText: 'Löwenzahn',
          createdAt: stamp,
          updatedAt: stamp,
        },
        {
          id: '912',
          wpId: 912,
          slug: 'wiesenrispe',
          title: 'Wiesenrispe',
          permalink: 'https://welliathome.de/wiesenrispe/',
          contentHtml: '<p>Wiesenrispe</p>',
          groupNames: ['Süßgräser'],
          foodParts: ['Samen'],
          warningNotes: [],
          searchText: 'Wiesenrispe',
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      stamp,
    )
    await favoriteRepository.create({
      itemType: 'plant-article',
      itemId: '911',
      title: 'Löwenzahn',
    })
    render(
      <MemoryRouter initialEntries={['/futterpflanzen']}>
        <Routes>
          <Route path="/futterpflanzen" element={<PlantsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Wiesenrispe' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nur Favoriten' }))
    fireEvent.change(screen.getByLabelText('Pflanze suchen'), { target: { value: 'Löwenzahn' } })
    fireEvent.change(screen.getByLabelText('Pflanzengruppe'), {
      target: { value: 'Krautige Pflanzen' },
    })
    expect(screen.getByRole('link', { name: 'Löwenzahn' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Wiesenrispe' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '★ Favorit' }))
    expect(await screen.findByText('Keine passenden Favoriten gefunden')).toBeTruthy()
  })
  it('zeigt bei Synchronisierungsfehler einen Retry-Zustand', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    render(
      <MemoryRouter initialEntries={['/wellipedia']}>
        <WelliPediaPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Synchronisierung fehlgeschlagen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy()
    expect(screen.getAllByText('Noch keine Artikel vorhanden.').length).toBeGreaterThan(0)
  })

  it('startet online einen Hintergrundabruf bei einem älteren lokalen Bestand', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000)
    await editorialRepository.replaceWikiContent(
      [
        {
          id: 'old',
          wpId: 91,
          slug: 'alt',
          title: 'Alter Stand',
          permalink: 'https://welliathome.de/wiki/alt/',
          contentHtml: '<p>Alt</p>',
          excerptHtml: '',
          categoryIds: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
      [],
      '2020-01-01T00:00:00.000Z',
    )
    render(
      <MemoryRouter>
        <WelliPediaPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Echter Artikel' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Alter Stand' })).toBeNull()
  })
})
