import type { HealthEvent, Medication, Observation, VetAppointment } from '../../../models'
import {
  healthEventRepository,
  medicationRepository,
  observationRepository,
  vetAppointmentRepository,
} from '../../../data/repositories'
import { sortTimeline } from '../utils/timelineSorting'
import { isIsoDate, localIsoDate } from '../../../utils/date'

export type TimelineFilter = 'all' | 'observation' | 'problem' | 'vet' | 'medication'

export interface TimelineItem {
  key: string
  sourceType: Exclude<TimelineFilter, 'all'>
  sourceId: string
  birdId: string
  date: string
  title: string
  description?: string
  details?: string
  createdAt: string
  iconType: 'note' | 'health' | 'stethoscope' | 'capsule'
  isFuture: boolean
}

function eventItem(
  sourceType: Exclude<TimelineFilter, 'all'>,
  record: Observation | HealthEvent | VetAppointment,
  title: string,
  description: string | undefined,
  details: string | undefined,
  iconType: TimelineItem['iconType'],
): TimelineItem {
  return {
    key: `${sourceType}:${record.id}`,
    sourceType,
    sourceId: record.id,
    birdId: record.birdId ?? '',
    date: record.date,
    title,
    ...(description && { description }),
    ...(details && { details }),
    createdAt: record.createdAt,
    iconType,
    isFuture: sourceType === 'vet' && record.date > localIsoDate(),
  }
}

function medicationItem(record: Medication, date: string, end: boolean): TimelineItem {
  const formattedStartDate = isIsoDate(record.startDate)
    ? new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${record.startDate}T00:00:00.000Z`))
    : undefined
  const description = end
    ? 'Behandlung beendet'
    : [formattedStartDate && `ab ${formattedStartDate}`, record.dosage].filter(Boolean).join(' · ')

  return {
    key: `medication:${record.id}:${end ? 'end' : 'start'}`,
    sourceType: 'medication',
    sourceId: record.id,
    birdId: record.birdId,
    date,
    title: end ? record.name : record.name,
    ...(description && { description }),
    ...(record.notes && { details: record.notes }),
    createdAt: record.createdAt,
    iconType: 'capsule',
    isFuture: date > localIsoDate(),
  }
}

export function filterTimeline(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  return filter === 'all' ? items : items.filter((item) => item.sourceType === filter)
}

export function buildTimeline(
  observations: Observation[],
  problems: HealthEvent[],
  appointments: VetAppointment[],
  medications: Medication[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...observations.map((record) =>
      eventItem(
        'observation',
        record,
        record.title?.trim() || 'Beobachtung',
        record.description,
        undefined,
        'note',
      ),
    ),
    ...problems.map((record) =>
      eventItem('problem', record, record.title, record.description, record.notes, 'health'),
    ),
    ...appointments.map((record) => {
      const detail = record.diagnosis
        ? `Diagnose: ${record.diagnosis}`
        : record.reason
          ? `Anlass: ${record.reason}`
          : undefined
      return eventItem('vet', record, record.title, detail, record.notes, 'stethoscope')
    }),
    ...medications.flatMap((record) => [
      medicationItem(record, record.startDate, false),
      ...(record.endDate ? [medicationItem(record, record.endDate, true)] : []),
    ]),
  ]
  return sortTimeline(items)
}

export const timelineService = {
  async listByBirdId(birdId: string): Promise<TimelineItem[]> {
    const [observations, problems, appointments, medications] = await Promise.all([
      observationRepository.listByBirdId(birdId),
      healthEventRepository.listByBirdId(birdId),
      vetAppointmentRepository.listByBirdId(birdId),
      medicationRepository.listByBirdId(birdId),
    ])
    return buildTimeline(observations, problems, appointments, medications)
  },
}
