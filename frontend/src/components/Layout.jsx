import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../lib/initials'
import { useTheme } from '../theme/ThemeContext'

const OVERDUE_POLL_MS = 45000

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 20 20">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" />
    </svg>
  ),
  // A ticket stub: rounded body with a perforated centerline, so the glyph
  // reads as "ticket" rather than a generic list/document icon.
  tickets: (
    <svg viewBox="0 0 20 20">
      <rect x="2" y="4.5" width="16" height="11" rx="2.5" />
      <line x1="10" y1="5" x2="10" y2="15" strokeDasharray="1.6 2.1" />
    </svg>
  ),
  mine: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="6.75" r="3.25" />
      <path d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </svg>
  ),
  newTicket: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="10" y1="6.75" x2="10" y2="13.25" />
      <line x1="6.75" y1="10" x2="13.25" y2="10" />
    </svg>
  ),
  escalated: (
    <svg viewBox="0 0 20 20">
      <line x1="5" y1="17.5" x2="5" y2="3" />
      <path d="M5 3.5h9.5l-2.6 3.6 2.6 3.6H5" strokeLinejoin="round" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="10" y1="16" x2="10" y2="18" />
      <line x1="2" y1="10" x2="4" y2="10" />
      <line x1="16" y1="10" x2="18" y2="10" />
      <line x1="4.5" y1="4.5" x2="5.9" y2="5.9" />
      <line x1="14.1" y1="14.1" x2="15.5" y2="15.5" />
      <line x1="4.5" y1="15.5" x2="5.9" y2="14.1" />
      <line x1="14.1" y1="5.9" x2="15.5" y2="4.5" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 20 20">
      <path d="M15.5 12.3A6.5 6.5 0 1 1 7.7 4.5a5.2 5.2 0 0 0 7.8 7.8Z" strokeLinejoin="round" />
    </svg>
  ),
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [overdueCount, setOverdueCount] = useState(0)

  // NavLink only matches on pathname, but "Tickets", "My Tickets", and
  // "Escalated Queue" all point at /tickets with different query strings —
  // without this they'd all light up together whenever any one is active.
  const params = new URLSearchParams(location.search)
  const onTickets = location.pathname === '/tickets'
  const isTickets = onTickets && !params.has('status') && !params.has('assigned_to') && !params.has('overdue')
  const isMyTickets = onTickets && params.get('assigned_to') === String(user?.id)
  const isEscalatedQueue = onTickets && params.get('status') === 'Escalated'

  useEffect(() => {
    function load() {
      api.get('/stats').then((data) => setOverdueCount(data.overdue_count)).catch(() => {})
    }
    load()
    const pollId = setInterval(load, OVERDUE_POLL_MS)
    return () => clearInterval(pollId)
  }, [])

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main navigation">
        <NavLink to="/" end className="rail-brand" aria-label="Help Desk home">
          HD
        </NavLink>

        <div className="rail-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`}
            data-label="Dashboard"
          >
            {ICONS.dashboard}
            <span className="sr-only">Dashboard</span>
          </NavLink>

          <NavLink
            to="/tickets"
            className={`rail-link${isTickets ? ' active' : ''}`}
            data-label="Tickets"
          >
            {ICONS.tickets}
            <span className="sr-only">Tickets</span>
            {overdueCount > 0 && (
              <span className="rail-badge" aria-hidden="true">
                {overdueCount > 99 ? '99+' : overdueCount}
              </span>
            )}
          </NavLink>

          {user && (
            <NavLink
              to={`/tickets?assigned_to=${user.id}`}
              className={`rail-link${isMyTickets ? ' active' : ''}`}
              data-label="My Tickets"
            >
              {ICONS.mine}
              <span className="sr-only">My Tickets</span>
            </NavLink>
          )}

          <NavLink
            to="/tickets/new"
            className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`}
            data-label="New Ticket"
          >
            {ICONS.newTicket}
            <span className="sr-only">New Ticket</span>
          </NavLink>

          {user?.role === 'l2' && (
            <NavLink
              to="/tickets?status=Escalated"
              className={`rail-link${isEscalatedQueue ? ' active' : ''}`}
              data-label="Escalated Queue"
            >
              {ICONS.escalated}
              <span className="sr-only">Escalated Queue</span>
            </NavLink>
          )}
        </div>

        <div className="rail-bottom">
          <button
            type="button"
            className="rail-link"
            data-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? ICONS.sun : ICONS.moon}
            <span className="sr-only">{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</span>
          </button>

          <details className="rail-account">
            <summary aria-label={`Account: ${user?.name ?? ''}`}>{initials(user?.name)}</summary>
            <div className="rail-account-menu">
              <p className="rail-account-name">{user?.name}</p>
              <button type="button" className="button-subtle" onClick={logout}>
                Log out
              </button>
            </div>
          </details>
        </div>
      </nav>

      <div className="shell-main">
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
