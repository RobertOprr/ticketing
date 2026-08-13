import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import DashboardPage from './DashboardPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn() },
}))

const mockStats = {
  by_status: { Open: 2, 'In Progress': 0, Resolved: 1, Escalated: 0 },
  by_priority: { Low: 0, Medium: 1, High: 0, Urgent: 1 },
  overdue_count: 1,
  avg_resolution_hours: 4.5,
  sla_achievement_rate: 80,
  tickets_by_agent: [{ agent_id: 1, agent_name: 'Agent One', resolved_count: 1 }],
  tickets_per_hour: [0, 0, 1, 0, 2, 0, 1, 3],
  needs_attention: [
    {
      id: 5,
      title: 'Breached ticket',
      priority: 'Urgent',
      status: 'Open',
      requester_name: 'Jane',
      age_hours: 6,
      sla_fraction: 1.5,
      hours_over_sla: 2,
    },
  ],
  total_open: 3,
  agent_load: [{ agent_id: 1, agent_name: 'Agent One', open_count: 2 }],
  unassigned_open_count: 1,
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockResolvedValue(mockStats)
  })

  it('renders status counts from the API', async () => {
    renderDashboard()
    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('shows the SLA breach banner naming the worst offender', async () => {
    renderDashboard()
    expect(await screen.findByText(/breached SLA/i)).toBeInTheDocument()
    expect(screen.getByText(/#5 Breached ticket/)).toBeInTheDocument()
  })

  it('renders per-agent open ticket load', async () => {
    renderDashboard()
    expect(await screen.findByText('2 open')).toBeInTheDocument()
    expect(screen.getAllByText('Agent One')).toHaveLength(2) // agent load + resolved-by-agent
  })
})
