import { describe, expect, it } from 'vitest'
import type { Reminder } from '../../../models'
import { createReminderCalendarFile, reminderCalendarFileName } from './reminderCalendar'

const reminder: Reminder = {
  id: 'reminder-1',
  title: 'Käfig, reinigen',
  description: 'Frisches Wasser\nKontrollieren; täglich',
  dueDate: '2026-11-21',
  completed: false,
  reminderType: 'Pflege',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
}

describe('reminder calendar export', () => {
  it('creates an all-day calendar event with escaped reminder details', async () => {
    const file = createReminderCalendarFile(reminder, 'Pico', new Date('2026-11-20T10:00:00.000Z'))
    const content = await file.text()
    const unfoldedContent = content.replace(/\r\n[ \t]/g, '')

    expect(file.type).toBe('text/calendar;charset=utf-8')
    expect(content).toContain('DTSTART;VALUE=DATE:20261121')
    expect(content).toContain('DTEND;VALUE=DATE:20261122')
    expect(unfoldedContent).toContain('SUMMARY:Käfig\\, reinigen')
    expect(unfoldedContent).toContain(
      'DESCRIPTION:Frisches Wasser\\nKontrollieren\\; täglich\\nKategorie: Pflege\\nWellensittich: Pico',
    )
    expect(unfoldedContent).toContain(
      'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Käfig\\, reinigen\r\nTRIGGER:-PT15M\r\nEND:VALARM',
    )
    expect(content).toContain('END:VCALENDAR\r\n')
  })

  it('uses a safe descriptive filename', () => {
    expect(reminderCalendarFileName(reminder)).toBe(
      'welliathome-erinnerung-2026-11-21-kafig-reinigen.ics',
    )
  })
})
