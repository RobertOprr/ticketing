import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { ToastProvider } from '../toast/ToastContext'
import TicketDetailPage from './TicketDetailPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const mockTicket = {
  id: 5,
  title: 'Printer jam',
  description: 'Paper stuck',
  status: 'Open',
  priority: 'Medium',
  category: 1,
  assigned_to: null,
  requester_name: 'Jane Doe',
  requester_email: 'jane@example.com',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  resolved_at: null,
  comments: [],
  related_tickets: [],
}

function renderPage() {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Agent One', email: 'a@example.com', role: 'agent' }))
  return render(
    <MemoryRouter initialEntries={['/tickets/5']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('TicketDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
    api.get.mockReset()
    api.patch.mockReset()
    api.post.mockReset()
    api.get.mockImplementation((path) => {
      if (path === '/categories') return Promise.resolve([{ id: 1, name: 'Hardware' }])
      if (path === '/tickets/5') return Promise.resolve(mockTicket)
      return Promise.resolve([])
    })
  })

  it('renders ticket details from the API', async () => {
    renderPage()
    expect(await screen.findByText(/Printer jam/)).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('shows a toast after posting a comment', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    renderPage()
    await screen.findByText(/Printer jam/)

    await user.type(screen.getByLabelText('Add a comment'), 'Looking into it')
    await user.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByText('Comment posted')).toBeInTheDocument()
  })

  it('updates status via the properties panel', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({ ...mockTicket, status: 'In Progress' })
    renderPage()
    await screen.findByText(/Printer jam/)

    await user.selectOptions(screen.getByLabelText('Status'), 'In Progress')

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/tickets/5', { status: 'In Progress' })
    })
  })
})
