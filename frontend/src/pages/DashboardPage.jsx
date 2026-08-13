import { useEffect, useState } from 'react'
import { api } from '../api/client'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/stats').then(setStats).catch((err) => setError(`Could not load dashboard stats: ${err.message}`))
  }, [])

  if (error) return <p className="error-text">{error}</p>
  if (!stats) return <p>Loading...</p>

  return (
    <div>
      <h1>Dashboard</h1>

      <section>
        <h2>By status</h2>
        <div className="cards">
          {STATUSES.map((status) => (
            <div className="card stat-card" key={status}>
              <div className="stat-count">{stats.by_status[status]}</div>
              <div className="stat-label">{status}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>By priority</h2>
        <div className="cards">
          {PRIORITIES.map((priority) => (
            <div className="card stat-card" key={priority}>
              <div className="stat-count">{stats.by_priority[priority]}</div>
              <div className="stat-label">{priority}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
