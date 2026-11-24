import { describe, expect, it } from 'vitest'
import type { FeedMix } from '../../../models'
import {
  emptyFeedMixForm,
  feedMixToFormValues,
  isHttpUrl,
  matchesFeedMix,
  parseIngredients,
  toNewFeedMix,
  validateFeedMixForm,
} from './feedMixForm'

describe('FeedMix-Formularhilfen', () => {
  it('lehnt leere und nur aus Leerzeichen bestehende Namen ab', () => {
    expect(validateFeedMixForm({ ...emptyFeedMixForm, name: '' }).name).toBeTruthy()
    expect(validateFeedMixForm({ ...emptyFeedMixForm, name: '   ' }).name).toBeTruthy()
  })

  it('wandelt Zutaten zeilenweise um, entfernt Leerzeilen und erhält die Reihenfolge', () => {
    expect(parseIngredients(' Kanariensaat \n\n Silberhirse\r\nJapanhirse ')).toEqual([
      'Kanariensaat',
      'Silberhirse',
      'Japanhirse',
    ])
    expect(
      toNewFeedMix({
        ...emptyFeedMixForm,
        name: 'Mischung',
        ingredientsText: ' Hirse \n  \nHafer ',
      }).ingredients,
    ).toEqual(['Hirse', 'Hafer'])
    expect(toNewFeedMix({ ...emptyFeedMixForm, name: 'Mischung' }).ingredients).toEqual([])
  })

  it('akzeptiert nur HTTP- und HTTPS-Links und lässt optionale Felder leer', () => {
    expect(isHttpUrl('https://welliathome.de')).toBe(true)
    expect(isHttpUrl('http://example.org')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(validateFeedMixForm({ ...emptyFeedMixForm, name: 'Mischung' })).toEqual({})
    expect(toNewFeedMix({ ...emptyFeedMixForm, name: 'Mischung' })).toMatchObject({
      ingredients: [],
      provider: undefined,
      productUrl: undefined,
    })
  })

  it('lädt gespeicherte Werte zum Bearbeiten einschließlich Zutaten wieder in Zeilen', () => {
    const mix: FeedMix = {
      id: '1',
      name: 'Körnermix',
      ingredients: ['Hirse', 'Hafer'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(feedMixToFormValues(mix).ingredientsText).toBe('Hirse\nHafer')
  })

  it('sucht ohne Beachtung von Großschreibung und Umlaut-Diakritika in Name, Anbieter und Zutaten', () => {
    const mix: FeedMix = {
      id: '1',
      name: 'Körnermix',
      provider: 'Sämerei Müller',
      ingredients: ['Silberhirse'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(matchesFeedMix(mix, 'KÖRNER')).toBe(true)
    expect(matchesFeedMix(mix, 'muller')).toBe(true)
    expect(matchesFeedMix(mix, 'silberhirse')).toBe(true)
    expect(matchesFeedMix(mix, 'nicht da')).toBe(false)
  })
})
