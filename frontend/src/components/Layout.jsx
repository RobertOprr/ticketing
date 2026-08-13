import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div>
      <header className="navbar">
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/tickets">Tickets</Link>
          <Link to="/tickets/new">New Ticket</Link>
          {user?.role === 'l2' && <Link to="/tickets?status=Escalated">Escalated Queue</Link>}
        </nav>
        <div className="navbar-user">
          <span>{user?.name}</span>
          <button type="button" onClick={logout}>
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
