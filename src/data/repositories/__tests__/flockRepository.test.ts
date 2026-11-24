import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { appDatabase, initializeDatabase } from '../../database/appDatabase'
import {
  birdRepository,
  medicationRepository,
  mediaRepository,
  BirdDeletePreviewChangedError,
  DependentBirdDataError,
  RepositoryError,
} from '../index'

const profile = (name = 'Pico') => ({ name, species: 'Wellensittich' })
const image = (id?: string) => ({
  ...(id ? { id } : {}),
  fileName: 'profil.webp',
  mimeType: 'image/webp',
  fileSize: 4,
  blob: new Blob(['bird'], { type: 'image/webp' }),
})

describe('Mein Schwarm – Repository', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('liefert eine leere Schwarmübersicht und sortiert Namen deutschsprachig', async () => {
    expect(await birdRepository.list()).toEqual([])
    await birdRepository.create(profile('Zora'))
    await birdRepository.create(profile('Änne'))
    await birdRepository.create(profile('Alf'))
    expect((await birdRepository.list()).map((bird) => bird.name)).toEqual(['Alf', 'Änne', 'Zora'])
  })

  it('behält ID und createdAt beim Bearbeiten und aktualisiert updatedAt', async () => {
    const bird = await birdRepository.create(profile())
    await new Promise((resolve) => setTimeout(resolve, 3))
    const updated = await birdRepository.update(bird.id, { name: 'Pico neu' })
    expect(updated?.id).toBe(bird.id)
    expect(updated?.createdAt).toBe(bird.createdAt)
    expect(updated?.updatedAt).not.toBe(bird.updatedAt)
    expect((await birdRepository.getById(bird.id))?.name).toBe('Pico neu')
  })

  it('verhindert Löschen, solange Dokumentationen verknüpft sind', async () => {
    const bird = await birdRepository.create(profile())
    await medicationRepository.create({ birdId: bird.id, name: 'Pflege', startDate: '2026-05-01' })
    await expect(birdRepository.delete(bird.id)).rejects.toBeInstanceOf(DependentBirdDataError)
    expect(await birdRepository.getById(bird.id)).toBeDefined()
    expect(await birdRepository.getDependentRecordCount(bird.id)).toBe(1)
  })

  it('löscht zugehörige Daten atomar nach einer unveränderten Vorschau', async () => {
    const bird = await birdRepository.createWithImage(profile(), image())
    await medicationRepository.create({ birdId: bird.id, name: 'Pflege', startDate: '2026-05-01' })
    const preview = await birdRepository.getDependentRecordCounts(bird.id)
    await medicationRepository.create({ birdId: bird.id, name: 'Tropfen', startDate: '2026-05-02' })

    await expect(birdRepository.deleteWithRelatedData(bird.id, preview)).rejects.toBeInstanceOf(
      BirdDeletePreviewChangedError,
    )
    expect(await birdRepository.getById(bird.id)).toBeDefined()

    const updatedPreview = await birdRepository.getDependentRecordCounts(bird.id)
    await expect(birdRepository.deleteWithRelatedData(bird.id, updatedPreview)).resolves.toBe(true)
    expect(await birdRepository.getById(bird.id)).toBeUndefined()
    expect(await medicationRepository.listByBirdId(bird.id)).toHaveLength(0)
    expect(await mediaRepository.getById(bird.imageId!)).toBeUndefined()
  })

  it('löscht ein unverbundenes Profil und dessen nicht mehr verwendetes Bild', async () => {
    const bird = await birdRepository.createWithImage(profile(), image())
    expect(await mediaRepository.getById(bird.imageId!)).toBeDefined()
    await expect(birdRepository.delete(bird.id)).resolves.toBe(true)
    expect(await mediaRepository.getById(bird.imageId!)).toBeUndefined()
  })

  it('speichert Bild und Profil zusammen und ersetzt oder entfernt Bilder ohne verwaiste Medien', async () => {
    const bird = await birdRepository.createWithImage(profile(), image())
    const firstImageId = bird.imageId!
    const replaced = await birdRepository.updateWithImage(bird.id, { color: 'blau' }, image())
    expect(replaced?.id).toBe(bird.id)
    expect(replaced?.imageId).not.toBe(firstImageId)
    expect(await mediaRepository.getById(firstImageId)).toBeUndefined()
    const currentImageId = replaced!.imageId!
    const withoutImage = await birdRepository.updateWithImage(bird.id, {}, null)
    expect(withoutImage?.imageId).toBeUndefined()
    expect(await mediaRepository.getById(currentImageId)).toBeUndefined()
  })

  it('meldet ein unbekanntes Profil als nicht vorhanden', async () => {
    await expect(birdRepository.getById('unknown-bird')).resolves.toBeUndefined()
    await expect(birdRepository.delete('unknown-bird')).resolves.toBe(false)
  })

  it('gibt fehlgeschlagene Datenbankzugriffe sichtbar als RepositoryError weiter', async () => {
    const add = vi
      .spyOn(appDatabase.birds, 'add')
      .mockRejectedValue(new Error('storage unavailable'))
    await expect(birdRepository.create(profile())).rejects.toBeInstanceOf(RepositoryError)
    add.mockRestore()
  })
})
