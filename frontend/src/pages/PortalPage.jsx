import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import PriorityBadge from '../components/PriorityBadge'
import { initials } from '../lib/initials'
import { STATUS_TONE, toneStyle } from '../lib/tone'

export default function PortalPage() {
  const [ticketId, setTicketId] = useState('')
  const [email, setEmail] = useState('')
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await api.get('/portal/lookup', { id: ticketId, email })
      setTicket(result)
    } catch {
      setTicket(null)
      setError('No ticket found with that ID and email. Double-check both and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="centered-page">
      <div className="portal-page">
        <form className="card form" onSubmit={handleSubmit}>
          <p className="eyebrow">Support Portal</p>
          <h1>Check your ticket status</h1>
          <label>
            Ticket ID
            <input value={ticketId} onChange={(e) => setTicketId(e.target.value)} required />
          </label>
          <label>
            Email you used when submitting it
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Looking up…' : 'Check status'}
          </button>
          <p className="hint-text">
            <Link to="/login">Agent? Log in here</Link>
          </p>
        </form>

        {ticket && (
          <div className="card portal-result">
            <div className="page-header">
              <h2>
                <span className="mono">#{ticket.id}</span> {ticket.title}
              </h2>
              <span className="status-pill" style={toneStyle(STATUS_TONE, ticket.status)}>
                {ticket.status}
              </span>
            </div>
            <div className="portal-result-meta">
              <PriorityBadge priority={ticket.priority} />
              <span className="hint-text">{ticket.category_name}</span>
            </div>
            <p>{ticket.description}</p>

            {ticket.comments.length > 0 && (
              <>
                <h2>Updates</h2>
                <div className="comments">
                  {ticket.comments.map((comment) => (
                    <div className="comment" key={comment.id}>
                      <span className="avatar">{initials(comment.author_name)}</span>
                      <div className="comment-body">
                        <div className="comment-head">
                          <strong>{comment.author_name}</strong>
                          <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                        <p>{comment.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
