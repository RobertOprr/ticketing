import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { ToastProvider } from '../toast/ToastContext'
import TicketListPage from './TicketListPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), getBlob: vi.fn() },
}))

const mockTicket = {
  id: 1,
  title: 'Printer broken',
  status: 'Open',
  priority: 'High',
  category: 1,
  created_at: new Date().toISOString(),
}

function renderPage() {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Agent One', email: 'a@example.com', role: 'agent' }))
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <TicketListPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('TicketListPage', () => {
  beforeEach(() => {
    localStorage.clear()
    api.get.mockReset()
    api.getBlob.mockReset()
    api.get.mockImplementation((path) => {
      if (path === '/categories') return Promise.resolve([{ id: 1, name: 'Hardware' }])
      if (path === '/tickets') return Promise.resolve({ results: [mockTicket], count: 1, next: null })
      return Promise.resolve([])
    })
  })

  it('renders tickets returned by the API', async () => {
    renderPage()
    expect(await screen.findByText('Printer broken')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Hardware' })).toBeInTheDocument()
  })

  it('refetches with the selected status filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Printer broken')

    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'Open')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/tickets', expect.objectContaining({ status: 'Open' }))
    })
  })

  it('toggles the "Assigned to me" filter to the current user', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Printer broken')

    await user.click(screen.getByRole('button', { name: 'Assigned to me' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/tickets', expect.objectContaining({ assigned_to: '1' }))
    })
  })

  it('exports the current filters as CSV', async () => {
    const user = userEvent.setup()
    api.getBlob.mockResolvedValue(new Blob(['id,title\n'], { type: 'text/csv' }))
    global.URL.createObjectURL = vi.fn(() => 'blob:mock')
    global.URL.revokeObjectURL = vi.fn()

    renderPage()
    await screen.findByText('Printer broken')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      expect(api.getBlob).toHaveBeenCalledWith('/tickets/export', expect.any(Object))
    })
  })
})
