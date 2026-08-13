import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import PriorityBadge from '../components/PriorityBadge'
import { formatDuration, hoursOpen, isOverdue } from '../lib/sla'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export default function TicketListPage() {
  const [searchParams] = useSearchParams()

  const [tickets, setTickets] = useState([])
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {})
  }, [])

  // Re-sync when the URL's ?status= changes (e.g. clicking the L2 nav's
  // "Escalated Queue" link while already on this page).
  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Any change to filters/sort invalidates the current page.
  useEffect(() => {
    setPage(1)
  }, [status, priority, category, search, sortBy, sortDir])

  useEffect(() => {
    const orderingField = sortBy === 'priority' ? 'priority' : 'created_at'
    const ordering = sortDir === 'asc' ? orderingField : `-${orderingField}`

    setLoading(true)
    setError(null)
    api
      .get('/tickets', { status, priority, category, search, ordering, page })
      .then((data) => {
        setTickets(data.results)
        setCount(data.count)
        setHasNext(Boolean(data.next))
      })
      .catch(() => setError('Could not load tickets.'))
      .finally(() => setLoading(false))
  }, [status, priority, category, search, sortBy, sortDir, page])

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  function clearFilters() {
    setStatus('')
    setPriority('')
    setCategory('')
    setSearchInput('')
  }

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name ?? id
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tickets</h1>
        <Link className="button" to="/tickets/new">
          New Ticket
        </Link>
      </div>

      <div className="filters-header">
        <div className="filters">
          <input
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="link-button" onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && !error && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th onClick={() => toggleSort('priority')} className="sortable">
                  Priority {sortBy === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th>Category</th>
                <th onClick={() => toggleSort('date')} className="sortable">
                  Open for {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                  </td>
                  <td>{ticket.status}</td>
                  <td>
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td>{categoryName(ticket.category)}</td>
                  <td className={isOverdue(ticket) ? 'overdue' : ''}>
                    {formatDuration(hoursOpen(ticket))}
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={5}>No tickets match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} — {count} ticket{count === 1 ? '' : 's'}
            </span>
            <button type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
