import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import PriorityBadge from '../components/PriorityBadge'
import { initials } from '../lib/initials'
import { getPageNumbers } from '../lib/pagination'
import { formatDuration, hoursOpen, isOverdue } from '../lib/sla'
import { PRIORITY_TONE, STATUS_TONE, toneStyle } from '../lib/tone'
import { useToast } from '../toast/ToastContext'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const PAGE_SIZE = 20

export default function TicketListPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const showToast = useToast()
  const searchInputRef = useRef(null)

  const [tickets, setTickets] = useState([])
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [priority, setPriority] = useState(searchParams.get('priority') || '')
  const [category, setCategory] = useState('')
  const [assignedTo, setAssignedTo] = useState(searchParams.get('assigned_to') || '')
  const [overdue, setOverdue] = useState(searchParams.get('overdue') === 'true')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [suggestions, setSuggestions] = useState([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)

  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {})
  }, [])

  // Re-sync when the URL's filter params change (e.g. clicking a dashboard
  // stat card or a nav shortcut like "My Tickets" while already here).
  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    setPriority(searchParams.get('priority') || '')
    setAssignedTo(searchParams.get('assigned_to') || '')
    setOverdue(searchParams.get('overdue') === 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Shorter, separate debounce for the autocomplete dropdown — feels
  // instant while still not firing a request on every keystroke.
  useEffect(() => {
    if (!searchInput.trim()) {
      setSuggestions([])
      return
    }
    const id = setTimeout(() => {
      api
        .get('/tickets', { search: searchInput, page_size: 6, ordering: '-created_at' })
        .then((data) => {
          setSuggestions(data.results)
          setActiveSuggestion(-1)
        })
        .catch(() => {})
    }, 150)
    return () => clearTimeout(id)
  }, [searchInput])

  // "/" jumps focus to search, unless the user is already typing somewhere.
  useEffect(() => {
    function handleGlobalKeydown(e) {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleGlobalKeydown)
    return () => document.removeEventListener('keydown', handleGlobalKeydown)
  }, [])

  // Any change to filters/sort invalidates the current page.
  useEffect(() => {
    setPage(1)
  }, [status, priority, category, assignedTo, overdue, search, sortBy, sortDir])

  useEffect(() => {
    const orderingField = sortBy === 'priority' ? 'priority' : 'created_at'
    const ordering = sortDir === 'asc' ? orderingField : `-${orderingField}`

    setLoading(true)
    setError(null)
    api
      .get('/tickets', {
        status,
        priority,
        category,
        assigned_to: assignedTo,
        overdue: overdue ? 'true' : '',
        search,
        ordering,
        page,
      })
      .then((data) => {
        setTickets(data.results)
        setCount(data.count)
        setHasNext(Boolean(data.next))
      })
      .catch(() => setError('Could not load tickets.'))
      .finally(() => setLoading(false))
  }, [status, priority, category, assignedTo, overdue, search, sortBy, sortDir, page])

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
    setAssignedTo('')
    setOverdue(false)
    setSearchInput('')
  }

  function toggleAssignedToMe() {
    setAssignedTo((current) => (current === String(user.id) ? '' : String(user.id)))
  }

  function selectSuggestion(ticketId) {
    setSuggestionsOpen(false)
    navigate(`/tickets/${ticketId}`)
  }

  function handleSearchKeyDown(e) {
    if (!suggestionsOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeSuggestion].id)
    } else if (e.key === 'Escape') {
      setSuggestionsOpen(false)
    }
  }

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name ?? id
  }

  async function handleExport() {
    try {
      const blob = await api.getBlob('/tickets/export', {
        status,
        priority,
        category,
        assigned_to: assignedTo,
        overdue: overdue ? 'true' : '',
        search,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'tickets.csv'
      link.click()
      URL.revokeObjectURL(url)
      showToast('Exported tickets.csv')
    } catch {
      setError('Could not export tickets.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tickets</h1>
        <div className="page-header-actions">
          <button type="button" className="button-ghost" onClick={handleExport}>
            Export CSV
          </button>
          <Link className="button" to="/tickets/new">
            New Ticket
          </Link>
        </div>
      </div>

      <div className="filters-header">
        <div className="filters">
          <div className="search-wrap">
            <input
              ref={searchInputRef}
              role="combobox"
              aria-expanded={suggestionsOpen && suggestions.length > 0}
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              onKeyDown={handleSearchKeyDown}
            />
            {!searchInput && !suggestionsOpen && <kbd className="kbd-hint">/</kbd>}
            {suggestionsOpen && suggestions.length > 0 && (
              <ul className="suggestions" id="search-suggestions" role="listbox">
                {suggestions.map((ticket, index) => (
                  <li
                    key={ticket.id}
                    role="option"
                    aria-selected={index === activeSuggestion}
                    className={index === activeSuggestion ? 'active' : ''}
                    onMouseDown={() => selectSuggestion(ticket.id)}
                  >
                    <span className="suggestion-title">{ticket.title}</span>
                    <PriorityBadge priority={ticket.priority} />
                  </li>
                ))}
              </ul>
            )}
          </div>
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
          <button
            type="button"
            className={assignedTo === String(user.id) ? 'button' : 'button button-ghost'}
            onClick={toggleAssignedToMe}
          >
            Assigned to me
          </button>
        </div>
        <button type="button" className="link-button" onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      {overdue && (
        <p className="hint-text">
          Showing overdue tickets only. <button type="button" className="link-button" onClick={() => setOverdue(false)}>Clear</button>
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && !error && (
        <>
          <div className="table-wrap">
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
                  <tr key={ticket.id} style={toneStyle(PRIORITY_TONE, ticket.priority)}>
                    <td>
                      <div className="ticket-title-cell">
                        <span className="avatar avatar-sm">{initials(ticket.requester_name)}</span>
                        <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                      </div>
                    </td>
                    <td>
                      <span className="status-pill" style={toneStyle(STATUS_TONE, ticket.status)}>
                        {ticket.status}
                      </span>
                    </td>
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
          </div>

          <div className="pagination">
            <button
              type="button"
              className="button-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <div className="page-numbers">
              {getPageNumbers(page, Math.max(1, Math.ceil(count / PAGE_SIZE))).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="page-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={p === page ? 'page-number active' : 'page-number'}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                )
              )}
            </div>
            <span>
              {count} ticket{count === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="button-ghost"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
