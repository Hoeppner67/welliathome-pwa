import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsPDF } from 'jspdf'
import { unzlibSync } from 'fflate'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { birdPdfSections, createBirdPdf, loadBirdPdfData, weightChartData } from './birdPdf'
import type { WeightEntry } from '../../../models'

const stamp = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

function extractPdfText(output: string): string {
  return [...output.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      const bytes = Uint8Array.from(match[1], (character) => character.charCodeAt(0))
      try {
        return new TextDecoder('latin1').decode(unzlibSync(bytes))
      } catch {
        return match[1]
      }
    })
    .join('\n')
}

describe('Vogelprofil-PDF', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('gibt unvollständige Datumsangaben unverändert aus', async () => {
    await appDatabase.birds.add({
      ...stamp,
      id: 'partial',
      name: 'Pico',
      species: 'Wellensittich',
      hatchDate: 'Juli 2020',
      arrivalDate: '03/23',
    })
    const data = await loadBirdPdfData('partial')
    expect(birdPdfSections(data)[0].entries[0]).toContain('Schlupfdatum: Juli 2020')
    expect(birdPdfSections(data)[0].entries[0]).toContain('Einzugsdatum: 03/23')
    const pdf = extractPdfText(createBirdPdf(data).output())
    expect(pdf).toContain('Juli 2020')
    expect(pdf).toContain('03/23')
  })
  it('erhält von der PDF-Standardschrift unterstützte Satzzeichen und das Eurozeichen', async () => {
    await appDatabase.birds.add({
      ...stamp,
      id: 'zeichen',
      name: 'Pico – „Luna“',
      species: 'Wellensittich',
      notes: 'Gebühr: 12 €',
    })
    const output = extractPdfText(createBirdPdf(await loadBirdPdfData('zeichen')).output())
    expect(output).toContain('Pico – „Luna“')
    expect(output).toContain('Gebühr: 12 €')
  })

  it('verhindert einen PDF-Export mit stillschweigend entfernten Zeichen', async () => {
    await appDatabase.birds.add({
      ...stamp,
      id: 'unicode',
      name: 'Pico',
      species: 'Wellensittich',
      notes: 'Medikation für 小鳥',
    })
    const data = await loadBirdPdfData('unicode')
    expect(() => createBirdPdf(data)).toThrowError(/einige Zeichen nicht darstellen/)
    expect((await appDatabase.birds.get('unicode'))?.notes).toBe('Medikation für 小鳥')
  })

  it('exportiert ausschließlich zugehörige Daten unverändert und chronologisch', async () => {
    await appDatabase.birds.bulkAdd([
      {
        ...stamp,
        id: 'a',
        name: 'Mäx',
        species: 'Wellensittich',
        gender: 'male',
        color: 'Grün',
        notes: 'Notiz',
        imageId: 'photo-a',
      },
      { ...stamp, id: 'b', name: 'Anderer Vogel', species: 'Wellensittich' },
    ])
    await appDatabase.mediaAssets.add({
      ...stamp,
      id: 'photo-a',
      fileName: 'foto.webp',
      mimeType: 'image/webp',
      fileSize: 4,
      blob: new Blob(['bild'], { type: 'image/webp' }),
      relatedId: 'a',
      relatedType: 'bird-profile',
    })
    await appDatabase.medications.bulkAdd([
      {
        ...stamp,
        id: 'm1',
        birdId: 'a',
        name: 'Tropfen',
        startDate: '2026-02-01',
        dosage: '2 Tropfen',
      },
      { ...stamp, id: 'm2', birdId: 'b', name: 'Fremd', startDate: '2026-02-01' },
    ])
    await appDatabase.weights.bulkAdd([
      { ...stamp, id: 'w1', birdId: 'a', date: '2026-02-02', weight: 40 },
      { ...stamp, id: 'w2', birdId: 'a', date: '2026-01-01', weight: 39 },
    ])
    await appDatabase.observations.add({
      ...stamp,
      id: 'o',
      birdId: 'a',
      date: '2026-01-03',
      description: 'Gefieder geprüft',
    })
    await appDatabase.healthEvents.add({
      ...stamp,
      id: 'h',
      birdId: 'a',
      date: '2026-01-04',
      title: 'Verletzung',
      description: 'Flügel',
      resolved: false,
    })
    await appDatabase.vetAppointments.add({
      ...stamp,
      id: 'v',
      birdId: 'a',
      date: '2026-01-05',
      title: 'Untersuchung',
      veterinarian: 'Praxis',
      diagnosis: 'Besserung',
    })
    const before = await appDatabase.birds.toArray()
    const data = await loadBirdPdfData('a')
    const text = JSON.stringify(birdPdfSections(data))
    expect(data.photo?.id).toBe('photo-a')
    expect(birdPdfSections(data)[0].title).toBe('Mäx')
    expect(text).toContain('Geschlecht: Hahn')
    expect(text).toContain('Farbschlag: Grün')
    expect(text).not.toContain('Art:')
    for (const expected of [
      'Mäx',
      'Grün',
      'Tropfen',
      'Gefieder geprüft',
      'Flügel',
      'Praxis',
      'Besserung',
    ])
      expect(text).toContain(expected)
    expect(text).not.toContain('Fremd')
    expect(data.weights.map((entry) => entry.weight).sort()).toEqual([39, 40])
    expect(await appDatabase.birds.toArray()).toEqual(before)
    const pdf = createBirdPdf(data)
    const output = extractPdfText(pdf.output())
    expect(output).toContain('Dokumentation für den Tierarzt')
    expect(output).toContain('Mäx')
    expect(output).toContain('Gewichtsverlauf')
    expect(output).toContain('(Letztes Gewicht:) Tj')
    expect(output).toContain('( 40 g \\(02.02.2026\\)) Tj')
    expect(output).toMatch(
      /\/F2 10 Tf[\s\S]*?\(Letztes Gewicht:\) Tj[\s\S]*?\/F1 10 Tf[\s\S]*?\( 40 g/,
    )
    expect(output).toContain('01.01.2026 - 39 g')
    expect(output).toContain('Medikament: AKTUELL: Tropfen')
    expect(output).not.toContain('Art:')
    expect(pdf.output()).toContain('/FlateDecode')
  })

  it('stellt null, eine oder mehrere Messungen passend dar', async () => {
    await appDatabase.birds.add({ ...stamp, id: 'a', name: 'Claus', species: 'Wellensittich' })
    let data = await loadBirdPdfData('a')
    expect(createBirdPdf(data).output()).not.toContain('Gewichtsverlauf')
    await appDatabase.weights.add({
      ...stamp,
      id: 'w',
      birdId: 'a',
      date: '2026-02-10',
      weight: 40.25,
    })
    data = await loadBirdPdfData('a')
    const pdf = extractPdfText(createBirdPdf(data).output())
    expect(pdf).toContain('Gewichtsverlauf')
    expect(pdf).toContain('10.02.2026: 40,25 g')
    expect(pdf).not.toContain('Letztes Gewicht')
  })

  it('berechnet echte Zeitabstände, sortiert und erhält Messungen am selben Tag', () => {
    const entry = (
      id: string,
      date: string,
      weight: number,
      createdAt = stamp.createdAt,
    ): WeightEntry => ({ ...stamp, id, birdId: 'a', date, weight, createdAt })
    const chart = weightChartData([
      entry('c', '2026-01-11', 40.02),
      entry('b', '2026-01-03', 40.01),
      entry('d', '2026-01-03', 40.03, '2026-01-01T01:00:00.000Z'),
      entry('a', '2026-01-01', 40),
      entry('bad', '2026-01-04', Number.NaN),
    ])!
    expect(chart.ordered.map((item) => item.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(chart.points.map((point) => point.x)).toEqual([0, 0.2, 0.2, 1])
    expect(chart.sameDay).toBe(true)
    expect(chart.low).toBeLessThan(40)
    expect(chart.high).toBeGreaterThan(40.03)
    expect(chart.points[0].y).not.toBe(chart.points[1].y)
    const same = weightChartData([entry('a', '2026-01-01', 40), entry('b', '2026-01-01', 40)])!
    expect(same.points.map((point) => point.x)).toEqual([0.5, 0.5])
    expect(same.low).toBeLessThan(40)
    expect(same.high).toBeGreaterThan(40)
  })

  it('hält viele Messungen vollständig und platziert das Diagramm auf einer neuen Seite', async () => {
    await appDatabase.birds.add({
      ...stamp,
      id: 'a',
      name: 'Claus',
      species: 'Wellensittich',
      notes: 'Text '.repeat(1600),
    })
    const data = await loadBirdPdfData('a')
    data.weights = Array.from({ length: 200 }, (_, i) => ({
      ...stamp,
      id: String(i),
      birdId: 'a',
      date: new Date(Date.UTC(2020, 0, 1 + i * 10)).toISOString().slice(0, 10),
      weight: 40 + i / 100,
    }))
    expect(weightChartData(data.weights)?.points).toHaveLength(200)
    const pdf = createBirdPdf(data)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    const output = extractPdfText(pdf.output())
    expect(output).toContain('Gewichtsverlauf')
    expect(output).toContain('( 41,99 g')
    expect(output).not.toContain('Messungen am selben Tag')
    expect(output).toContain('41,99 g')
    expect(output).toContain(' l\nS')
  })

  it('platziert ein Foto proportional rechts oben', async () => {
    await appDatabase.birds.add({ ...stamp, id: 'a', name: 'Claus', species: 'Wellensittich' })
    const api = jsPDF.API as unknown as { addImage: (...args: unknown[]) => void }
    const addImage = vi.spyOn(api, 'addImage').mockImplementation(() => undefined)
    try {
      createBirdPdf(await loadBirdPdfData('a'), {
        dataUrl: 'data:image/jpeg;base64,AA==',
        width: 800,
        height: 400,
      })
      expect(addImage).toHaveBeenCalledWith(expect.any(String), 'JPEG', 150, 25.5, 42, 21)
    } finally {
      addImage.mockRestore()
    }
  })

  it('erzeugt bei langen Einträgen mehrere PDF-Seiten', async () => {
    await appDatabase.birds.add({
      ...stamp,
      id: 'a',
      name: 'Mäx',
      species: 'Wellensittich',
      notes: 'Langer Text '.repeat(2000),
    })
    const pdf = createBirdPdf(await loadBirdPdfData('a'))
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    expect(pdf.output().startsWith('%PDF-')).toBe(true)
  })
})
