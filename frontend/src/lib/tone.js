// Maps ticket priority/status to a color pair (text + soft background) used
// to drive pill badges from one shared source of truth.
export const PRIORITY_TONE = { Low: 'slate', Medium: 'blue', High: 'orange', Urgent: 'red' }
export const STATUS_TONE = { Open: 'blue', 'In Progress': 'amber', Resolved: 'green', Escalated: 'red' }

export function toneStyle(map, key) {
  const tone = map[key] ?? 'slate'
  return { '--tone': `var(--${tone})`, '--tone-bg': `var(--${tone}-bg)` }
}
