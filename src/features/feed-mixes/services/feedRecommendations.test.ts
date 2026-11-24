import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { feedMixRepository } from '../../../data/repositories'
import { FEED_RECOMMENDATIONS_INITIALIZATION_ID } from '../../../models/appMetadata'
import { initializeFeedRecommendations } from './feedRecommendations'

describe('Futterempfehlungen initialisieren', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('legt alle vier Standardmischungen samt Zutaten, Links und Claus-Notiz genau einmal an', async () => {
    await initializeFeedRecommendations()
    await initializeFeedRecommendations()
    const mixes = await feedMixRepository.list()
    expect(mixes).toHaveLength(4)
    expect(mixes.map((mix) => mix.name).sort()).toEqual([
      'Primus Basis',
      'Wellensittich Light',
      'Welli-Fit',
      'Welli-Topfit',
    ])
    const primus = mixes.find((mix) => mix.name === 'Primus Basis')
    expect(primus?.provider).toBe('Claus')
    expect(primus?.notes).toBe('10 % Rabatt mit dem Code Welli@Home10')
    expect(primus?.productUrl).toBe(
      'https://claus-futter.de/collections/wellensittichfutter/products/primus-basis',
    )
    expect((await appDatabase.appMetadata.get(FEED_RECOMMENDATIONS_INITIALIZATION_ID))?.value).toBe(
      'completed',
    )
  })

  it('bewahrt vorhandene Mischungen, vermeidet Namensduplikate und ist nach erneutem Öffnen idempotent', async () => {
    const existing = await feedMixRepository.create({
      name: 'Welli-Fit',
      provider: 'Mr. Crumble',
      ingredients: ['Benutzerdefinierte Hirse'],
      notes: 'Eigene Notiz bleibt bestehen',
    })
    await initializeFeedRecommendations()
    appDatabase.close()
    await initializeDatabase()
    await initializeFeedRecommendations()

    const mixes = await feedMixRepository.list()
    expect(mixes).toHaveLength(4)
    const preserved = await feedMixRepository.getById(existing.id)
    expect(preserved?.ingredients).toEqual(['Benutzerdefinierte Hirse'])
    expect(preserved?.notes).toBe('Eigene Notiz bleibt bestehen')
    expect(
      mixes.filter((mix) => mix.name === 'Welli-Fit' && mix.provider === 'Mr. Crumble'),
    ).toHaveLength(1)
  })

  it('bewahrt die bearbeitete Claus-Notiz nach Neustart', async () => {
    await initializeFeedRecommendations()
    const primus = (await feedMixRepository.list()).find((mix) => mix.provider === 'Claus')!
    const notes = '10 % Rabatt mit dem Code Welli@Home10. Persönlicher Zusatz.'
    await feedMixRepository.update(primus.id, { notes })

    appDatabase.close()
    await initializeDatabase()
    await initializeFeedRecommendations()

    expect(await feedMixRepository.getById(primus.id)).toMatchObject({ notes })
    expect(await feedMixRepository.list()).toHaveLength(4)
  })

  it('legt bewusst gelöschte Empfehlungen nach Neustart nicht erneut an', async () => {
    await initializeFeedRecommendations()
    const primus = (await feedMixRepository.list()).find((mix) => mix.name === 'Primus Basis')
    if (!primus) throw new Error('Primus Basis fehlt')
    await feedMixRepository.delete(primus.id)

    appDatabase.close()
    await initializeDatabase()
    await initializeFeedRecommendations()

    const mixes = await feedMixRepository.list()
    expect(mixes).toHaveLength(3)
    expect(mixes.some((mix) => mix.name === 'Primus Basis')).toBe(false)
  })
})
