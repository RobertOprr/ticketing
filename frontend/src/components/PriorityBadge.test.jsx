import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PriorityBadge from './PriorityBadge'

describe('PriorityBadge', () => {
  it('renders the priority text with a matching color class', () => {
    render(<PriorityBadge priority="Urgent" />)
    const badge = screen.getByText('Urgent')
    expect(badge).toHaveClass('badge-urgent')
  })
})
