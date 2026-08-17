import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import PortalPage from './PortalPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <PortalPage />
    </MemoryRouter>
  )
}

describe('PortalPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('shows the matched ticket after a successful lookup', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({
      id: 7,
      title: 'Printer jam',
      description: 'Paper stuck in tray 2',
      status: 'Open',
      priority: 'Medium',
      category_name: 'Hardware',
      comments: [],
    })
    renderPage()

    await user.type(screen.getByLabelText('Ticket ID'), '7')
    await user.type(screen.getByLabelText(/Email you used/), 'jane@example.com')
    await user.click(screen.getByRole('button', { name: /check status/i }))

    expect(await screen.findByText(/Printer jam/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/portal/lookup', { id: '7', email: 'jane@example.com' })
  })

  it('shows an error when no ticket matches', async () => {
    const user = userEvent.setup()
    api.get.mockRejectedValue(new Error('Request failed: 404'))
    renderPage()

    await user.type(screen.getByLabelText('Ticket ID'), '99')
    await user.type(screen.getByLabelText(/Email you used/), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /check status/i }))

    expect(await screen.findByText(/No ticket found/)).toBeInTheDocument()
  })

  it('lets the requester rate a resolved, unrated ticket', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({
      id: 7,
      title: 'Printer jam',
      description: 'Paper stuck in tray 2',
      status: 'Resolved',
      priority: 'Medium',
      category_name: 'Hardware',
      comments: [],
      satisfaction_rating: null,
    })
    api.post.mockResolvedValue({
      id: 7,
      title: 'Printer jam',
      description: 'Paper stuck in tray 2',
      status: 'Resolved',
      priority: 'Medium',
      category_name: 'Hardware',
      comments: [],
      satisfaction_rating: 4,
    })
    renderPage()

    await user.type(screen.getByLabelText('Ticket ID'), '7')
    await user.type(screen.getByLabelText(/Email you used/), 'jane@example.com')
    await user.click(screen.getByRole('button', { name: /check status/i }))
    await screen.findByText(/How did we do/)

    await user.click(screen.getByRole('button', { name: '4 stars' }))

    expect(api.post).toHaveBeenCalledWith('/portal/rate', { id: 7, email: 'jane@example.com', rating: 4 })
    expect(await screen.findByText(/Your rating/)).toBeInTheDocument()
  })
})
