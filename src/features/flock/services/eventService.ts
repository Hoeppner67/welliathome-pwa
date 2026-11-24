import type { HealthEvent, Observation, VetAppointment } from '../../../models'
import { appDatabase } from '../../../data/database/appDatabase'
import {
  healthEventRepository,
  observationRepository,
  vetAppointmentRepository,
} from '../../../data/repositories'

export type EventKind = 'observation' | 'problem' | 'vet'

export type EventInput =
  | { kind: 'observation'; date: string; title?: string; description: string }
  | { kind: 'problem'; date: string; title: string; description: string; notes?: string }
  | { kind: 'vet'; date: string; title: string; diagnosis?: string; notes?: string }

export type FlockEvent =
  | { kind: 'observation'; record: Observation }
  | { kind: 'problem'; record: HealthEvent }
  | { kind: 'vet'; record: VetAppointment }

export class EventNotFoundError extends Error {
  constructor() {
    super('Das Ereignis wurde nicht gefunden oder gehört zu einem anderen Vogel.')
    this.name = 'EventNotFoundError'
  }
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function assertBird(record: { birdId?: string } | undefined, birdId: string): void {
  if (!record || record.birdId !== birdId) throw new EventNotFoundError()
}

function sortEvents(events: FlockEvent[]): FlockEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        b.event.record.date.localeCompare(a.event.record.date) ||
        b.event.record.createdAt.localeCompare(a.event.record.createdAt) ||
        a.event.record.id.localeCompare(b.event.record.id) ||
        a.event.kind.localeCompare(b.event.kind) ||
        a.index - b.index,
    )
    .map((item) => item.event)
}

export const eventService = {
  async listByBirdId(birdId: string): Promise<FlockEvent[]> {
    const [observations, problems, appointments] = await Promise.all([
      observationRepository.listByBirdId(birdId),
      healthEventRepository.listByBirdId(birdId),
      vetAppointmentRepository.listByBirdId(birdId),
    ])
    return sortEvents([
      ...observations.map((record) => ({ kind: 'observation' as const, record })),
      ...problems.map((record) => ({ kind: 'problem' as const, record })),
      ...appointments.map((record) => ({ kind: 'vet' as const, record })),
    ])
  },

  create(birdId: string, input: EventInput): Promise<Observation | HealthEvent | VetAppointment> {
    switch (input.kind) {
      case 'observation':
        return observationRepository.create({
          birdId,
          date: input.date,
          description: input.description.trim(),
          ...(optionalText(input.title) && { title: optionalText(input.title) }),
        })
      case 'problem':
        return healthEventRepository.create({
          birdId,
          date: input.date,
          title: input.title.trim(),
          description: input.description.trim(),
          ...(optionalText(input.notes) && { notes: optionalText(input.notes) }),
        })
      case 'vet':
        return vetAppointmentRepository.create({
          birdId,
          date: input.date,
          title: input.title.trim(),
          ...(optionalText(input.diagnosis) && { diagnosis: optionalText(input.diagnosis) }),
          ...(optionalText(input.notes) && { notes: optionalText(input.notes) }),
        })
    }
  },

  async update(birdId: string, event: FlockEvent, input: EventInput): Promise<void> {
    return appDatabase.transaction(
      'rw',
      [
        appDatabase.birds,
        appDatabase.observations,
        appDatabase.healthEvents,
        appDatabase.vetAppointments,
        appDatabase.deviceOperations,
        appDatabase.appMetadata,
      ],
      async () => {
        switch (event.kind) {
          case 'observation': {
            if (input.kind !== 'observation')
              throw new Error('Die Ereignisart kann nach dem Anlegen nicht geändert werden.')
            const current = await observationRepository.getById(event.record.id)
            assertBird(current, birdId)
            const saved = await observationRepository.update(event.record.id, {
              date: input.date,
              description: input.description.trim(),
              title: optionalText(input.title),
            })
            assertBird(saved, birdId)
            return
          }
          case 'problem': {
            if (input.kind !== 'problem')
              throw new Error('Die Ereignisart kann nach dem Anlegen nicht geändert werden.')
            const current = await healthEventRepository.getById(event.record.id)
            assertBird(current, birdId)
            const saved = await healthEventRepository.update(event.record.id, {
              date: input.date,
              title: input.title.trim(),
              description: input.description.trim(),
              notes: optionalText(input.notes),
            })
            assertBird(saved, birdId)
            return
          }
          case 'vet': {
            if (input.kind !== 'vet')
              throw new Error('Die Ereignisart kann nach dem Anlegen nicht geändert werden.')
            const current = await vetAppointmentRepository.getById(event.record.id)
            assertBird(current, birdId)
            const saved = await vetAppointmentRepository.update(event.record.id, {
              date: input.date,
              title: input.title.trim(),
              diagnosis: optionalText(input.diagnosis),
              notes: optionalText(input.notes),
            })
            assertBird(saved, birdId)
            return
          }
        }
      },
    )
  },

  async delete(birdId: string, event: FlockEvent): Promise<void> {
    return appDatabase.transaction(
      'rw',
      [
        appDatabase.birds,
        appDatabase.observations,
        appDatabase.healthEvents,
        appDatabase.vetAppointments,
        appDatabase.deviceOperations,
        appDatabase.appMetadata,
      ],
      async () => {
        switch (event.kind) {
          case 'observation': {
            const current = await observationRepository.getById(event.record.id)
            assertBird(current, birdId)
            if (!(await observationRepository.delete(event.record.id)))
              throw new EventNotFoundError()
            return
          }
          case 'problem': {
            const current = await healthEventRepository.getById(event.record.id)
            assertBird(current, birdId)
            if (!(await healthEventRepository.delete(event.record.id)))
              throw new EventNotFoundError()
            return
          }
          case 'vet': {
            const current = await vetAppointmentRepository.getById(event.record.id)
            assertBird(current, birdId)
            if (!(await vetAppointmentRepository.delete(event.record.id)))
              throw new EventNotFoundError()
            return
          }
        }
      },
    )
  },
}
