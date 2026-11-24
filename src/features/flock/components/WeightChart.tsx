import { useId } from 'react'
import type { WeightEntry } from '../../../models'
import { sortWeightEntries } from '../utils/weightSorting'
import { formatIsoDate } from '../utils/weightValidation'

const width = 640
const height = 270
const left = 58
const right = 18
const top = 22
const bottom = 54
const plotWidth = width - left - right
const plotHeight = height - top - bottom

export function WeightChart({ entries, birdName }: { entries: WeightEntry[]; birdName: string }) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  if (entries.length === 0) {
    return <p className="documentation-empty">Noch keine Gewichtseinträge vorhanden.</p>
  }

  const ordered = sortWeightEntries(entries, 'asc')
  const weights = ordered.map((entry) => entry.weight)
  const minimum = Math.min(...weights)
  const maximum = Math.max(...weights)
  const padding = maximum === minimum ? Math.max(1, maximum * 0.08) : (maximum - minimum) * 0.12
  const domainMin = Math.max(0, minimum - padding)
  const domainMax = maximum + padding
  const range = domainMax - domainMin || 1
  const uniqueDates = [...new Set(ordered.map((entry) => entry.date))]
  const sameDayOnly = uniqueDates.length === 1
  const timestamps = ordered.map((entry) => Date.parse(`${entry.date}T00:00:00Z`))
  const minDate = Math.min(...timestamps)
  const maxDate = Math.max(...timestamps)
  const groups = new Map<string, number[]>()
  ordered.forEach((entry, index) => {
    const group = groups.get(entry.date) ?? []
    group.push(index)
    groups.set(entry.date, group)
  })
  const xByIndex = new Map<number, number>()
  if (!sameDayOnly) {
    const centers = uniqueDates.map(
      (date) =>
        left + ((Date.parse(`${date}T00:00:00Z`) - minDate) / (maxDate - minDate)) * plotWidth,
    )
    uniqueDates.forEach((date, dateIndex) => {
      const indices = groups.get(date)!
      const center = centers[dateIndex]
      const previous = dateIndex === 0 ? left : (centers[dateIndex - 1] + center) / 2
      const next =
        dateIndex === centers.length - 1 ? left + plotWidth : (center + centers[dateIndex + 1]) / 2
      const halfWidth = (indices.length - 1) * 2.5
      let start = Math.max(previous, center - halfWidth)
      let end = Math.min(next, center + halfWidth)
      if (dateIndex === 0) end = Math.min(next, center + halfWidth * 2)
      if (dateIndex === centers.length - 1) start = Math.max(previous, center - halfWidth * 2)
      indices.forEach((index, position) =>
        xByIndex.set(
          index,
          indices.length === 1 ? center : start + ((end - start) * position) / (indices.length - 1),
        ),
      )
    })
  }

  const points = ordered.map((entry, index) => {
    let x: number
    if (ordered.length === 1) x = left + plotWidth / 2
    else if (sameDayOnly) x = left + (index / (ordered.length - 1)) * plotWidth
    else {
      x = xByIndex.get(index)!
    }
    const y = top + ((domainMax - entry.weight) / range) * plotHeight
    return { entry, x, y }
  })

  const yTicks = [domainMin, domainMin + range / 2, domainMax]
  const labelIndices =
    uniqueDates.length === 1
      ? [0]
      : [...new Set([0, Math.floor((uniqueDates.length - 1) / 2), uniqueDates.length - 1])]
  const xLabels = labelIndices.map((index) => {
    const date = uniqueDates[index]
    const timestamp = Date.parse(`${date}T00:00:00Z`)
    const normalized = maxDate === minDate ? 0.5 : (timestamp - minDate) / (maxDate - minDate)
    return { date, x: left + normalized * plotWidth }
  })

  return (
    <div className="weight-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>Gewichtsverlauf von {birdName}</title>
        <desc id={descriptionId}>
          Messwerte in Gramm über die Zeit. Die Grafik bewertet das Gewicht nicht medizinisch.
        </desc>
        {yTicks.map((tick, index) => {
          const y = top + ((domainMax - tick) / range) * plotHeight
          return (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="weight-chart__grid-line"
              />
              <text x={left - 8} y={y + 4} textAnchor="end" className="weight-chart__axis-label">
                {formatWeight(tick)}
              </text>
            </g>
          )
        })}
        {xLabels.map(({ date, x }) => (
          <text
            key={date}
            x={x}
            y={height - 14}
            textAnchor="middle"
            className="weight-chart__axis-label"
          >
            {formatIsoDate(date)}
          </text>
        ))}
        {points.length > 1 && (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            className="weight-chart__line"
          />
        )}
        {points.map(({ entry, x, y }) => (
          <circle key={entry.id} cx={x} cy={y} r="5" className="weight-chart__point">
            <title>
              {formatIsoDate(entry.date)}: {formatWeight(entry.weight)} g
            </title>
          </circle>
        ))}
      </svg>
      <p className="weight-chart__caption">Gewichtsverlauf ohne medizinische Bewertung.</p>
    </div>
  )
}

function formatWeight(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
}
