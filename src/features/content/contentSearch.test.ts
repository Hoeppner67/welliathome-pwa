import { describe, expect, it } from 'vitest'
import {
  articleTitle,
  mainWikiCategoryIds,
  matchesPlant,
  matchesWiki,
  normalizeSearch,
  wikiSummary,
} from './contentSearch'
import type { PlantArticle, WikiArticle, WikiCategory } from '../../models'

const stamp = '2026-11-20T10:00:00.000Z'
const wiki: WikiArticle = {
  id: '1',
  wpId: 1,
  slug: 'futter',
  title: 'Wiki: Fütterung',
  permalink: 'https://welliathome.de/wiki/futter/',
  contentHtml: 'Körner und Saaten',
  excerptHtml: '',
  categoryIds: ['4'],
  createdAt: stamp,
  updatedAt: stamp,
}
const plant: PlantArticle = {
  id: '2',
  wpId: 2,
  slug: 'gaensebluemchen',
  title: 'Gänseblümchen',
  permalink: 'https://welliathome.de/gaensebluemchen/',
  contentHtml: 'Bellis perennis',
  groupNames: ['Krautige Pflanzen'],
  foodParts: ['Blüte'],
  warningNotes: [],
  searchText: 'Bellis perennis',
  createdAt: stamp,
  updatedAt: stamp,
}
const categories: WikiCategory[] = [
  {
    id: '1',
    wpId: 1,
    slug: 'wissen',
    name: 'Wissen',
    parentId: 0,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: '4',
    wpId: 4,
    slug: 'haltung',
    name: 'Haltung',
    parentId: 1,
    createdAt: stamp,
    updatedAt: stamp,
  },
]

describe('Editorial search', () => {
  it('normalisiert deutsche Sonderzeichen und Wiki-Präfixe', () => {
    expect(normalizeSearch('ÄÖÜ ß')).toBe('aeoeue ss')
    expect(articleTitle(wiki.title)).toBe('Fütterung')
    expect(matchesWiki(wiki, 'fuetterung')).toBe(true)
    expect(matchesWiki(wiki, 'KÖRNER')).toBe(true)
  })
  it('findet Pflanzen über Namen, wissenschaftliche Bezeichnung und Gruppenfilterdaten', () => {
    expect(matchesPlant(plant, 'gänse')).toBe(true)
    expect(matchesPlant(plant, 'Bellis')).toBe(true)
    expect(matchesPlant(plant, 'Krautige')).toBe(true)
  })
  it('ordnet Unterkategorien beim Themenfilter ihrer Hauptkategorie zu', () => {
    expect(mainWikiCategoryIds(['4'], categories)).toEqual(['1'])
  })
  it('entfernt Suchformular und Zusammenfassungslabel und kennzeichnet gekürzte Vorschauen', () => {
    const noisy = {
      ...wiki,
      contentHtml:
        '<form><span>Search for:</span><button>Search Button</button></form><h2>Zusammenfassung</h2><p>Dies ist eine saubere Zusammenfassung für den Artikel.</p>',
    }
    expect(wikiSummary(noisy)).toBe('Dies ist eine saubere Zusammenfassung für den Artikel.')
    expect(
      wikiSummary({
        ...noisy,
        contentHtml: '<h2>Zusammenfassung</h2><p>' + 'Langer Text '.repeat(30) + '</p>',
      }),
    ).toMatch(/\.\.\.$/)
  })
})
