// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { DATABASE_SCHEMA_V3 } from '../database/schema'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from '../database/appDatabase'
import { editorialRepository } from './editorialRepository'

const now = '2026-11-20T10:00:00.000Z'
const article = {
  id: '456',
  wpId: 456,
  slug: 'gras',
  title: 'Gras',
  permalink: 'https://welliathome.de/wiki/gras/',
  contentHtml: '<p>Text</p>',
  excerptHtml: '',
  categoryIds: ['2'],
  createdAt: now,
  updatedAt: now,
}
describe('Editorial repository', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })
  it('speichert Wissensinhalte atomar getrennt von persönlichen Tabellen', async () => {
    await editorialRepository.replaceWikiContent([article], [], now)
    expect((await editorialRepository.listWikiArticles()).map((row) => row.id)).toEqual(['456'])
    expect((await editorialRepository.getSyncStatus('wellipedia'))?.itemCount).toBe(1)
    await appDatabase.birds.add({
      id: 'bird1',
      name: 'Pico',
      species: 'Wellensittich',
      createdAt: now,
      updatedAt: now,
    })
    await editorialRepository.replaceWikiContent([{ ...article, title: 'Neuer Titel' }], [], now)
    expect((await editorialRepository.getWikiArticle('456'))?.title).toBe('Neuer Titel')
    expect(await appDatabase.birds.get('bird1')).toBeTruthy()
  })
  it('migriert einen echten v3-Bestand auf das aktuelle Schema und befüllt den Wiki-Suchtext', async () => {
    await appDatabase.delete()
    const oldDb = new Dexie(appDatabase.name)
    oldDb.version(3).stores(DATABASE_SCHEMA_V3)
    await oldDb.table('wikiArticles').add({ ...article, contentHtml: '<p>Text</p><p>Futter</p>' })
    await oldDb
      .table('birds')
      .add({ id: 'bird2', name: 'Luna', species: 'Wellensittich', createdAt: now, updatedAt: now })
    oldDb.close()
    await initializeDatabase()
    expect(await appDatabase.wikiArticles.get(article.id)).toMatchObject({
      searchText: 'Text Futter',
    })
    expect((await appDatabase.birds.get('bird2'))?.name).toBe('Luna')
    expect(appDatabase.verno).toBe(9)
  })
})
