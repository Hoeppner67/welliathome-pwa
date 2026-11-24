import { describe, expect, it } from 'vitest'
import { causalHeads, type CausalOperation } from './causalHeads'

const op = (operationId: string, predecessors?: string[]): CausalOperation => ({
  operationId,
  tableName: 'birds',
  recordId: 'bird',
  predecessors,
})

describe('Ermittlung von Zweigspitzen aus ausdrücklicher Vorgeschichte', () => {
  it('findet mehrere Zweige und ihre spätere Zusammenführung', () => {
    expect(causalHeads([op('root', []), op('a', ['root']), op('b', ['root'])])).toEqual(['a', 'b'])
    expect(
      causalHeads([op('root', []), op('a', ['root']), op('b', ['root']), op('merge', ['a', 'b'])]),
    ).toEqual(['merge'])
  })
  it('behandelt alte Operationen ohne Vorgängerinformationen als unbekannt', () => {
    expect(causalHeads([])).toBeUndefined()
    expect(causalHeads([op('legacy')])).toBeUndefined()
    expect(causalHeads([op('legacy'), op('new', ['legacy'])])).toBeUndefined()
    expect(causalHeads([op('new', ['missing'])])).toBeUndefined()
  })
  it('lehnt doppelte Kennungen, doppelte Vorgänger, fremde Datensätze und Zyklen ab', () => {
    expect(causalHeads([op('a', []), op('a', [])])).toBeUndefined()
    expect(causalHeads([op('a', []), op('b', ['a', 'a'])])).toBeUndefined()
    expect(causalHeads([{ ...op('a', []), recordId: 'other' }, op('b', ['a'])])).toBeUndefined()
    expect(causalHeads([{ ...op('a', []), recordId: 'other' }, op('b', [])])).toBeUndefined()
    expect(causalHeads([op('a', ['b']), op('b', ['a'])])).toBeUndefined()
  })
})
