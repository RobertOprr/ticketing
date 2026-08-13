import { describe, expect, it } from 'vitest'
import { formatDuration, hoursOpen, isOverdue, SLA_THRESHOLD_HOURS } from './sla'

describe('sla', () => {
  it('flags a ticket overdue once it passes its priority threshold', () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString()

    expect(isOverdue({ priority: 'Urgent', created_at: hoursAgo(5) })).toBe(true)
    expect(isOverdue({ priority: 'Urgent', created_at: hoursAgo(1) })).toBe(false)
    expect(isOverdue({ priority: 'Low', created_at: hoursAgo(5) })).toBe(false)
  })

  it('computes hours open from created_at', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const hours = hoursOpen({ created_at: twoHoursAgo })
    expect(hours).toBeGreaterThan(1.9)
    expect(hours).toBeLessThan(2.1)
  })

  it('formats duration as hours or days+hours', () => {
    expect(formatDuration(0.5)).toBe('<1h')
    expect(formatDuration(5)).toBe('5h')
    expect(formatDuration(26)).toBe('1d 2h')
  })

  it('has a threshold for every priority the spec lists', () => {
    expect(Object.keys(SLA_THRESHOLD_HOURS).sort()).toEqual(
      ['High', 'Low', 'Medium', 'Urgent'].sort()
    )
  })
})
