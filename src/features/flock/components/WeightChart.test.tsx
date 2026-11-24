// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WeightEntry } from '../../../models'
import { WeightChart } from './WeightChart'

afterEach(cleanup)

const entry = (id: string, date: string, weight: number): WeightEntry => ({
  id,
  birdId: 'bird-1',
  date,
  weight,
  createdAt: `2026-05-10T00:00:0${id.length}.000Z`,
  updatedAt: `2026-05-10T00:00:0${id.length}.000Z`,
})

describe('Gewichtsdiagramm', () => {
  it('zeigt einen verständlichen leeren Zustand ohne Werte', () => {
    render(<WeightChart entries={[]} birdName="Pico" />)
    expect(screen.getByText('Noch keine Gewichtseinträge vorhanden.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('zeigt bei einer Messung einen Punkt und keine künstliche Verbindung', () => {
    render(<WeightChart entries={[entry('one', '2026-05-10', 36.5)]} birdName="Pico" />)
    expect(screen.getByRole('img', { name: /Gewichtsverlauf von Pico/ })).toBeTruthy()
    expect(document.querySelectorAll('.weight-chart__point')).toHaveLength(1)
    expect(document.querySelector('.weight-chart__line')).toBeNull()
  })

  it('zeigt alle Messpunkte inklusive gleicher Tage chronologisch', () => {
    render(
      <WeightChart
        entries={[
          entry('later', '2026-05-10', 36.5),
          entry('earlier', '2026-05-09', 35.5),
          entry('same-day', '2026-05-10', 36.8),
        ]}
        birdName="Pico"
      />,
    )
    expect(document.querySelectorAll('.weight-chart__point')).toHaveLength(3)
    expect(document.querySelector('.weight-chart__line')).toBeTruthy()
    expect(document.querySelectorAll('.weight-chart__point title')[0]?.textContent).toContain(
      '09.05.2026',
    )
  })
  it('hält mehrere Messungen an Randtagen innerhalb der Zeitachse und in Reihenfolge', () => {
    const entries = [
      ...Array.from({ length: 10 }, (_, index) =>
        entry(`a${index}`, '2026-05-01', 35 + index / 10),
      ),
      entry('middle', '2026-05-02', 37),
      ...Array.from({ length: 10 }, (_, index) =>
        entry(`z${index}`, '2026-05-03', 38 + index / 10),
      ),
    ]
    render(<WeightChart entries={entries} birdName="Pico" />)
    const positions = [...document.querySelectorAll('.weight-chart__point')].map((point) =>
      Number(point.getAttribute('cx')),
    )
    expect(positions.every((x) => x >= 58 && x <= 622)).toBe(true)
    expect(positions.every((x, index) => index === 0 || positions[index - 1] <= x)).toBe(true)
  })
  it('überschneidet auch bei eng benachbarten Tagen keine Messgruppen', () => {
    const entries = [
      entry('early', '2020-01-01', 35),
      ...Array.from({ length: 20 }, (_, index) => entry(`a${index}`, '2026-05-01', 36)),
      ...Array.from({ length: 20 }, (_, index) => entry(`b${index}`, '2026-05-02', 37)),
      entry('late', '2030-01-01', 38),
    ]
    render(<WeightChart entries={entries} birdName="Pico" />)
    const positions = [...document.querySelectorAll('.weight-chart__point')].map((point) =>
      Number(point.getAttribute('cx')),
    )
    expect(positions.every((x, index) => index === 0 || positions[index - 1] <= x)).toBe(true)
  })
  it('verwendet eigene Label-IDs für jedes Diagramm', () => {
    const entries = [entry('one', '2026-05-10', 36.5)]
    render(
      <>
        <WeightChart entries={entries} birdName="Pico" />
        <WeightChart entries={entries} birdName="Luna" />
      </>,
    )
    const charts = screen.getAllByRole('img')
    const ids = charts.flatMap((node) => node.getAttribute('aria-labelledby')?.split(' ') ?? [])
    expect(new Set(ids).size).toBe(4)
    expect(screen.getByRole('img', { name: /Gewichtsverlauf von Luna/ })).toBeTruthy()
  })
})
