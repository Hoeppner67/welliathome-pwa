import { jsPDF } from 'jspdf'
import { appDatabase } from '../../../data/database/appDatabase'
import { genderLabel } from '../utils/genderLabel'
import { sortWeightEntries } from '../utils/weightSorting'
import { formatGermanDate, isIsoDate, localIsoDate } from '../../../utils/date'
import type { WeightEntry } from '../../../models'

export async function loadBirdPdfData(birdId: string) {
  return appDatabase.transaction(
    'r',
    [
      appDatabase.birds,
      appDatabase.mediaAssets,
      appDatabase.medications,
      appDatabase.weights,
      appDatabase.observations,
      appDatabase.healthEvents,
      appDatabase.vetAppointments,
    ],
    async () => {
      const [bird, medications, weights, observations, healthEvents, appointments] =
        await Promise.all([
          appDatabase.birds.get(birdId),
          appDatabase.medications.where('birdId').equals(birdId).toArray(),
          appDatabase.weights.where('birdId').equals(birdId).toArray(),
          appDatabase.observations.where('birdId').equals(birdId).toArray(),
          appDatabase.healthEvents.where('birdId').equals(birdId).toArray(),
          appDatabase.vetAppointments.where('birdId').equals(birdId).toArray(),
        ])
      if (!bird) throw new Error('Das Vogelprofil ist nicht mehr vorhanden.')
      const photo = bird.imageId ? await appDatabase.mediaAssets.get(bird.imageId) : undefined
      return { bird, photo, medications, weights, observations, healthEvents, appointments }
    },
  )
}

type PdfData = Awaited<ReturnType<typeof loadBirdPdfData>>
type PdfSection = { title: string; entries: string[] }
const field = (label: string, value: string | number | boolean | undefined) =>
  value === undefined || value === '' ? '' : `${label}: ${value}`
const date = (value?: string) => (value ? formatGermanDate(value) : '')
const join = (...values: string[]) => values.filter(Boolean).join('\n')

export function birdPdfSections(data: PdfData): PdfSection[] {
  const { bird, medications, observations, healthEvents, appointments } = data
  const today = localIsoDate()
  const chronological = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)
  const events = [
    ...observations.map((item) => ({
      date: item.date,
      text: join(
        `Beobachtung: ${item.title || ''}`.trim(),
        field('Kategorie', item.category),
        item.description,
      ),
    })),
    ...healthEvents.map((item) => ({
      date: item.date,
      text: join(
        `Gesundheitsereignis: ${item.title}`,
        item.description,
        field('Schweregrad', item.severity),
        item.resolved === undefined ? '' : field('Abgeschlossen', item.resolved ? 'Ja' : 'Nein'),
        field('Notizen', item.notes),
      ),
    })),
    ...appointments.map((item) => ({
      date: item.date,
      text: join(
        `Tierarztbesuch: ${item.title}`,
        field('Tierarztpraxis', item.veterinarian),
        field('Grund', item.reason),
        field('Diagnose', item.diagnosis),
        field('Notizen', item.notes),
        item.completed === undefined ? '' : field('Abgeschlossen', item.completed ? 'Ja' : 'Nein'),
      ),
    })),
  ].sort(chronological)
  return [
    {
      title: bird.name,
      entries: [
        join(
          field('Rufname', bird.nickname),
          field('Geschlecht', bird.gender && genderLabel(bird.gender)),
          field('Schlupfdatum', date(bird.hatchDate)),
          field('Einzugsdatum', date(bird.arrivalDate)),
          field('Farbschlag', bird.color),
          field('Ringnummer', bird.ringNumber),
          field('Herkunft', bird.origin),
          field('Notizen', bird.notes),
        ),
      ],
    },
    {
      title: 'Medikamente',
      entries: [...medications]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((item) => {
          const current = item.startDate <= today && (!item.endDate || item.endDate >= today)
          return join(
            field('Medikament', `${current ? 'AKTUELL: ' : ''}${item.name}`),
            field('Dosierung', item.dosage),
            field('Beginn', date(item.startDate)),
            field('Ende', date(item.endDate)),
            field('Notizen', item.notes),
          )
        }),
    },
    {
      title: 'Beobachtungen und Gesundheitsereignisse',
      entries: events.map((item) => `${date(item.date)} – ${item.text}`),
    },
  ]
}

export function weightChartData(entries: WeightEntry[]) {
  const ordered = sortWeightEntries(
    entries.filter(
      (entry) =>
        isIsoDate(entry.date) &&
        typeof entry.weight === 'number' &&
        Number.isFinite(entry.weight) &&
        entry.weight > 0,
    ),
  )
  if (!ordered.length) return undefined
  const times = ordered.map((entry) => Date.parse(`${entry.date}T00:00:00Z`))
  const minTime = times[0]
  const maxTime = times[times.length - 1]
  const weights = ordered.map((entry) => entry.weight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const padding = min === max ? Math.max(0.1, Math.abs(min) * 0.02) : (max - min) * 0.15
  const low = min - padding
  const high = max + padding
  const points = ordered.map((entry, index) => ({
    entry,
    x: maxTime === minTime ? 0.5 : (times[index] - minTime) / (maxTime - minTime),
    y: (high - entry.weight) / (high - low),
  }))
  return {
    ordered,
    points,
    low,
    high,
    sameDay: new Set(ordered.map((entry) => entry.date)).size < ordered.length,
  }
}

const weightLabel = (weight: number) => String(weight).replace('.', ',')

function drawWeightChart(
  pdf: jsPDF,
  chart: NonNullable<ReturnType<typeof weightChartData>>,
  top: number,
) {
  const left = 40,
    right = 184,
    plotTop = top + 6,
    height = 48
  const width = right - left
  pdf.setFillColor(255, 255, 255)
  pdf.rect(18, top, 174, 70, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(65, 65, 65)
  pdf.text('g', left - 12, plotTop - 1)
  for (let i = 0; i <= 4; i++) {
    const y = plotTop + (height * i) / 4
    const value = chart.high - ((chart.high - chart.low) * i) / 4
    pdf.setDrawColor(220, 220, 220)
    pdf.setLineWidth(0.15)
    pdf.line(left, y, right, y)
    pdf.text(
      new Intl.NumberFormat('de-DE', { maximumFractionDigits: 10 }).format(value),
      left - 3,
      y + 1,
      { align: 'right' },
    )
  }
  pdf.setDrawColor(90, 90, 90)
  pdf.setLineWidth(0.25)
  pdf.line(left, plotTop, left, plotTop + height)
  pdf.line(left, plotTop + height, right, plotTop + height)
  const dates = [...new Map(chart.points.map((point) => [point.entry.date, point.x])).entries()]
  const labels = dates.length === 1 ? [dates[0]] : [dates[0], dates[dates.length - 1]]
  if (dates.length > 2) {
    const middle = dates[Math.floor(dates.length / 2)]
    if (middle[1] * width >= 28 && (1 - middle[1]) * width >= 28) labels.splice(1, 0, middle)
  }
  for (const [value, x] of labels)
    pdf.text(date(value), left + x * width, plotTop + height + 6, { align: 'center' })
  pdf.setDrawColor(64, 126, 1)
  pdf.setFillColor(64, 126, 1)
  pdf.setLineWidth(0.65)
  chart.points.forEach((point, index) => {
    const x = left + point.x * width,
      y = plotTop + point.y * height
    if (index) {
      const previous = chart.points[index - 1]
      pdf.line(left + previous.x * width, plotTop + previous.y * height, x, y)
    }
    pdf.circle(x, y, 1.15, 'F')
  })
  if (chart.sameDay)
    pdf.text(
      'Messungen am selben Tag liegen auf derselben Datumsposition.',
      left,
      plotTop + height + 13,
    )
  pdf.setTextColor(65, 36, 2)
}

export interface PdfPhoto {
  dataUrl: string
  width: number
  height: number
}

export class PdfUnsupportedCharactersError extends Error {
  constructor() {
    super(
      'Das PDF kann einige Zeichen nicht darstellen. Bitte prüfe die Texte; deine gespeicherten Daten bleiben unverändert.',
    )
    this.name = 'PdfUnsupportedCharactersError'
  }
}

export async function preparePdfPhoto(blob: Blob): Promise<PdfPhoto> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Das Profilfoto konnte nicht gelesen werden.'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    if (!canvas.width || !canvas.height) throw new Error('Das Profilfoto ist ungültig.')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Die Bildverarbeitung ist nicht verfügbar.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function createBirdPdf(data: PdfData, photo?: PdfPhoto): jsPDF {
  const pdf = new jsPDF({ compress: true })
  const left = 18
  const bottom = 280
  let y = 20
  const ensure = (height: number) => {
    if (y + height > bottom) {
      pdf.addPage()
      y = 20
    }
  }
  const line = (text: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(bold ? 12 : 10)
    // Helvetica's WinAnsi encoding also supports these characters outside Latin-1.
    if (
      /[^\t\n\r\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/.test(
        text,
      )
    )
      throw new PdfUnsupportedCharactersError()
    const lines = pdf.splitTextToSize(text, 174) as string[]
    for (const part of lines) {
      ensure(6)
      pdf.text(part, left, y)
      y += 6
    }
  }
  pdf.setTextColor(65, 36, 2)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  const titleLines = pdf.splitTextToSize(
    'Dokumentation für den Tierarzt',
    photo ? 112 : 174,
  ) as string[]
  for (const part of titleLines) {
    pdf.text(part, left, y)
    y += 8
  }
  line(`Erstellt am ${date(localIsoDate())}`)
  if (photo) {
    const scale = Math.min(42 / photo.width, 42 / photo.height)
    const width = photo.width * scale
    const height = photo.height * scale
    pdf.addImage(
      photo.dataUrl,
      'JPEG',
      150 + (42 - width) / 2,
      15 + (42 - height) / 2,
      width,
      height,
    )
    y = Math.max(y, 65)
  }
  y += 4
  for (const [sectionIndex, section] of birdPdfSections(data).entries()) {
    ensure(18)
    line(section.title, true)
    if (!section.entries.length) line('Keine Einträge vorhanden.')
    for (const entry of section.entries) {
      ensure(12)
      for (const part of entry.split('\n'))
        line(part, section.title === 'Medikamente' && part.startsWith('Medikament: AKTUELL:'))
      y += 3
    }
    y += 3
    if (sectionIndex === 1) {
      const chart = weightChartData(data.weights)
      if (chart) {
        ensure(chart.points.length > 1 ? 100 : 20)
        line('Gewichtsverlauf', true)
        const latest = chart.ordered[chart.ordered.length - 1]
        if (chart.points.length === 1) line(`${date(latest.date)}: ${weightLabel(latest.weight)} g`)
        else {
          ensure(6)
          pdf.setFontSize(10)
          pdf.setFont('helvetica', 'bold')
          const label = 'Letztes Gewicht:'
          pdf.text(label, left, y)
          const labelWidth = pdf.getTextWidth(label)
          pdf.setFont('helvetica', 'normal')
          pdf.text(` ${weightLabel(latest.weight)} g (${date(latest.date)})`, left + labelWidth, y)
          y += 6
          drawWeightChart(pdf, chart, y)
          y += 75
        }
        y += 3
        line('Messwerte', true)
        for (const entry of chart.ordered)
          line(`${date(entry.date)} - ${weightLabel(entry.weight)} g`)
      }
    }
  }
  return pdf
}

export async function exportBirdPdf(birdId: string): Promise<void> {
  const data = await loadBirdPdfData(birdId)
  const photo = data.photo ? await preparePdfPhoto(data.photo.blob) : undefined
  const safeName =
    data.bird.name
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'Vogel'
  createBirdPdf(data, photo).save(`WelliAtHome_${safeName}_${localIsoDate()}.pdf`)
}
