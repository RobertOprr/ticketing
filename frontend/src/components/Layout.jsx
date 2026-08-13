import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../lib/initials'

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  // NavLink only matches on pathname, but "Tickets", "My Tickets", and
  // "Escalated Queue" all point at /tickets with different query strings —
  // without this they'd all light up together whenever any one is active.
  const params = new URLSearchParams(location.search)
  const onTickets = location.pathname === '/tickets'
  const isTickets = onTickets && !params.has('status') && !params.has('assigned_to') && !params.has('overdue')
  const isMyTickets = onTickets && params.get('assigned_to') === String(user?.id)
  const isEscalatedQueue = onTickets && params.get('status') === 'Escalated'

  return (
    <div>
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="brand">Helpdesk</span>
          <nav>
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/tickets" className={isTickets ? 'active' : undefined}>
              Tickets
            </NavLink>
            {user && (
              <NavLink to={`/tickets?assigned_to=${user.id}`} className={isMyTickets ? 'active' : undefined}>
                My Tickets
              </NavLink>
            )}
            <NavLink to="/tickets/new">New Ticket</NavLink>
            {user?.role === 'l2' && (
              <NavLink to="/tickets?status=Escalated" className={isEscalatedQueue ? 'active' : undefined}>
                Escalated Queue
              </NavLink>
            )}
          </nav>
        </div>
        <div className="navbar-user">
          <span className="avatar">{initials(user?.name)}</span>
          <span>{user?.name}</span>
          <button type="button" className="button-subtle" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
