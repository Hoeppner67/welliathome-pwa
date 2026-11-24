import type { TimelineItem } from '../services/timelineService'

export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        b.item.date.localeCompare(a.item.date) ||
        b.item.createdAt.localeCompare(a.item.createdAt) ||
        a.item.key.localeCompare(b.item.key) ||
        a.index - b.index,
    )
    .map(({ item }) => item)
}
