// Per-priority SLA thresholds, in hours, from the spec.
export const SLA_THRESHOLD_HOURS = {
  Urgent: 4,
  High: 8,
  Medium: 24,
  Low: 72,
}

export function hoursOpen(ticket) {
  return (Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60)
}

export function isOverdue(ticket) {
  return hoursOpen(ticket) > SLA_THRESHOLD_HOURS[ticket.priority]
}

export function formatDuration(hours) {
  if (hours < 1) return '<1h'
  const wholeHours = Math.floor(hours)
  if (wholeHours < 24) return `${wholeHours}h`
  const days = Math.floor(wholeHours / 24)
  const remainingHours = wholeHours % 24
  return `${days}d ${remainingHours}h`
}
