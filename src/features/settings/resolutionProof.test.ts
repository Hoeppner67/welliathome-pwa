import { describe, expect, it } from 'vitest'
import type { DeviceOperation } from './changeJournal'
import { matchesDirectResolutionPrerequisites } from './resolutionProof'

const row = (name: string) => ({ id: 'bird', name })
const operation = (
  id: string,
  before: DeviceOperation['before'],
  after: DeviceOperation['after'],
): DeviceOperation => ({
  operationId: id,
  deviceId: `device-${id}`,
  sequence: 1,
  tableName: 'birds',
  recordId: 'bird',
  action: after ? 'put' : 'delete',
  before,
  after,
  createdAt: '2026-01-01T00:00:00.000Z',
})
const equal = async (a: DeviceOperation['before'], b: DeviceOperation['before']) =>
  JSON.stringify(a) === JSON.stringify(b)
const base = row('Pico'),
  a = row('A'),
  b = row('B')
const local = operation('a', base, a),
  incoming = operation('b', base, b)

describe('konservative Prüfung einer Konfliktentscheidung', () => {
  it('erkennt beide Entscheidungen bei nachgewiesenem lokalem Zweig', async () => {
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        incoming,
        operation('d', b, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(true)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        incoming,
        operation('d', a, b),
        'incoming',
        ['b'],
        b,
        equal,
      ),
    ).toBe(true)
  })
  it('lehnt unbekannte, mehrdeutige oder weiterbearbeitete lokale Zweige ab', async () => {
    const decision = operation('d', b, a)
    for (const heads of [[], ['unknown'], ['a', 'b']]) {
      expect(
        await matchesDirectResolutionPrerequisites(
          local,
          incoming,
          decision,
          'local',
          heads,
          a,
          equal,
        ),
      ).toBe(false)
    }
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        incoming,
        decision,
        'local',
        ['a'],
        row('weiter'),
        equal,
      ),
    ).toBe(false)
  })
  it('lehnt manipulierte Eltern und Entscheidungen sowie gleiche Zweige ab', async () => {
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        { ...incoming, recordId: 'other' },
        operation('d', b, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(false)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        { ...incoming, before: row('anderer Ursprung') },
        operation('d', b, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(false)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        incoming,
        operation('d', a, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(false)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        { ...incoming, after: a },
        operation('d', a, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(false)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        incoming,
        operation('a', b, a),
        'local',
        ['a'],
        a,
        equal,
      ),
    ).toBe(false)
  })
  it('prüft auch eine Entscheidung für und gegen eine Löschung', async () => {
    const deleted = operation('deleted', base, null)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        deleted,
        operation('d', null, a),
        'local',
        ['deleted'],
        null,
        equal,
      ),
    ).toBe(true)
    expect(
      await matchesDirectResolutionPrerequisites(
        local,
        deleted,
        operation('d', a, null),
        'incoming',
        ['a'],
        a,
        equal,
      ),
    ).toBe(true)
  })
})
