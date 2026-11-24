import type { Reminder } from '../../../models'

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder()
  let folded = ''
  let byteLength = 0

  for (const character of line) {
    const characterLength = encoder.encode(character).length
    if (byteLength + characterLength > 75) {
      folded += '\r\n '
      byteLength = 1
    }
    folded += character
    byteLength += characterLength
  }

  return folded
}

function calendarDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function nextCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10).replace(/-/g, '')
}

function calendarTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

export function reminderCalendarFileName(reminder: Reminder): string {
  const title = reminder.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `welliathome-erinnerung-${reminder.dueDate}-${title || reminder.id}.ics`
}

export function createReminderCalendarFile(
  reminder: Reminder,
  birdName?: string,
  now = new Date(),
): Blob {
  const description = [
    reminder.description,
    `Kategorie: ${reminder.reminderType}`,
    birdName ? `Wellensittich: ${birdName}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Welli@Home//Erinnerung//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(reminder.id)}@welliathome.de`,
    `DTSTAMP:${calendarTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${calendarDate(reminder.dueDate)}`,
    `DTEND;VALUE=DATE:${nextCalendarDate(reminder.dueDate)}`,
    `SUMMARY:${escapeCalendarText(reminder.title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(reminder.title)}`,
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return new Blob([`${lines.map(foldCalendarLine).join('\r\n')}\r\n`], {
    type: 'text/calendar;charset=utf-8',
  })
}
