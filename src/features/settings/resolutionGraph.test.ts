import { describe, expect, it } from 'vitest'
import { isValidResolutionGraph, type ResolutionGraphNode } from './resolutionGraph'

const node = (id: string, parents?: readonly [string, string]): ResolutionGraphNode => ({
  id,
  table: 'birds',
  recordId: 'pico',
  ...(parents && { parents }),
})

describe('Strukturprüfung von Entscheidungsvorgängern', () => {
  it('erlaubt zwei Vorgänger und wiederholte Entscheidungen mit gemeinsamem Vorgänger', () => {
    expect(
      isValidResolutionGraph([
        node('a'),
        node('b'),
        node('first', ['a', 'b']),
        node('c'),
        node('second', ['first', 'c']),
      ]),
    ).toBe(true)
    expect(
      isValidResolutionGraph([
        node('a'),
        node('b'),
        node('c'),
        node('one', ['a', 'b']),
        node('two', ['a', 'c']),
      ]),
    ).toBe(true)
  })
  it('verwirft doppelte, fehlende und selbstreferenzierte Kennungen', () => {
    expect(isValidResolutionGraph([node('a'), node('a')])).toBe(false)
    expect(isValidResolutionGraph([node('a'), node('r', ['a', 'missing'])])).toBe(false)
    expect(isValidResolutionGraph([node('a'), node('r', ['a', 'a'])])).toBe(false)
    expect(isValidResolutionGraph([node('a'), node('r', ['a', 'r'])])).toBe(false)
  })
  it('verwirft Vorgänger anderer Tabellen oder Datensätze und zyklische Entscheidungen', () => {
    expect(
      isValidResolutionGraph([
        node('a'),
        { ...node('b'), recordId: 'luna' },
        node('r', ['a', 'b']),
      ]),
    ).toBe(false)
    expect(
      isValidResolutionGraph([
        node('a'),
        { ...node('b'), table: 'weights' },
        node('r', ['a', 'b']),
      ]),
    ).toBe(false)
    expect(
      isValidResolutionGraph([node('a'), node('r1', ['a', 'r2']), node('r2', ['a', 'r1'])]),
    ).toBe(false)
  })
})
