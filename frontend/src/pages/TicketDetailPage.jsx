import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import PriorityBadge from '../components/PriorityBadge'
import { formatDuration, hoursOpen, isOverdue } from '../lib/sla'
import { PRIORITY_TONE, STATUS_TONE, toneStyle } from '../lib/tone'
import { useToast } from '../toast/ToastContext'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export default function TicketDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const showToast = useToast()
  const [ticket, setTicket] = useState(null)
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(null)
  const [commentBody, setCommentBody] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  function loadTicket() {
    return api.get(`/tickets/${id}`).then(setTicket)
  }

  useEffect(() => {
    loadTicket().catch(() => setError('Could not load this ticket.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {})
  }, [])

  async function updateTicket(patch, successMessage) {
    try {
      const updated = await api.patch(`/tickets/${id}`, patch)
      setTicket((t) => ({ ...t, ...updated }))
      if (successMessage) showToast(successMessage)
    } catch {
      setError('Could not update the ticket.')
    }
  }

  async function handleEscalate() {
    try {
      const updated = await api.post(`/tickets/${id}/escalate`, {})
      setTicket((t) => ({ ...t, ...updated }))
      showToast('Escalated to L2')
    } catch {
      setError('Could not escalate the ticket.')
    }
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentBody.trim()) return
    setPostingComment(true)
    try {
      await api.post(`/tickets/${id}/comments`, { body: commentBody })
      setCommentBody('')
      await loadTicket()
      showToast('Comment posted')
    } catch {
      setError('Could not add comment.')
    } finally {
      setPostingComment(false)
    }
  }

  if (error) return <p className="error-text">{error}</p>
  if (!ticket) return <p>Loading...</p>

  const canChangeStatus = ticket.status !== 'Escalated' || user.role === 'l2'
  const categoryName = categories.find((c) => c.id === ticket.category)?.name ?? ticket.category

  return (
    <div>
      <h1>
        #{ticket.id} {ticket.title}
      </h1>

      <div className="ticket-layout">
        <aside className="ticket-properties">
          <div className="property">
            <label className="property-label" htmlFor="ticket-status">Status</label>
            <select
              id="ticket-status"
              value={ticket.status}
              disabled={!canChangeStatus}
              onChange={(e) => updateTicket({ status: e.target.value }, `Status changed to ${e.target.value}`)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!canChangeStatus && (
              <p className="hint-text">Only L2 can change an escalated ticket's status.</p>
            )}
          </div>

          <div className="property">
            <label className="property-label" htmlFor="ticket-priority">Priority</label>
            <select
              id="ticket-priority"
              value={ticket.priority}
              onChange={(e) => updateTicket({ priority: e.target.value }, `Priority changed to ${e.target.value}`)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="property">
            <span className="property-label">Category</span>
            <p className="value">{categoryName}</p>
          </div>

          <div className="property">
            <span className="property-label">Assigned to</span>
            <p className="value">{ticket.assigned_to ? `Agent #${ticket.assigned_to}` : 'Unassigned'}</p>
            <button type="button" onClick={() => updateTicket({ assigned_to: user.id }, 'Assigned to you')}>
              Assign to me
            </button>
          </div>

          <div className="property">
            <span className="property-label">Requester</span>
            <p className="value">{ticket.requester_name}</p>
            <p className="value">{ticket.requester_email}</p>
          </div>

          <div className="property">
            <span className="property-label">Created</span>
            <p className="value">{new Date(ticket.created_at).toLocaleString()}</p>
          </div>

          {ticket.updated_at !== ticket.created_at && (
            <div className="property">
              <span className="property-label">Last updated</span>
              <p className="value">{new Date(ticket.updated_at).toLocaleString()}</p>
            </div>
          )}

          <div className="property">
            <span className="property-label">Open for</span>
            <p className={`value ${isOverdue(ticket) ? 'overdue' : ''}`}>
              {formatDuration(hoursOpen(ticket))}
              {isOverdue(ticket) && ' — SLA breached'}
            </p>
          </div>

          {ticket.resolved_at && (
            <div className="property">
              <span className="property-label">Resolved</span>
              <p className="value">{new Date(ticket.resolved_at).toLocaleString()}</p>
            </div>
          )}

          <button type="button" onClick={handleEscalate} disabled={ticket.status === 'Escalated'}>
            Escalate to L2
          </button>
        </aside>

        <div className="ticket-main">
          <div className="card">
            <p>{ticket.description}</p>
          </div>

          <h2>Comments</h2>
          <div className="comments">
            {ticket.comments.map((comment) => (
              <div className="card comment" key={comment.id}>
                <strong>{comment.author_name}</strong>
                <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
                <p>{comment.body}</p>
              </div>
            ))}
            {ticket.comments.length === 0 && <p>No comments yet.</p>}
          </div>

          <form className="card form" onSubmit={handleAddComment}>
            <label>
              Add a comment
              <textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} required />
            </label>
            <button type="submit" disabled={postingComment}>
              {postingComment ? 'Posting...' : 'Post Comment'}
            </button>
          </form>

          {ticket.related_tickets.length > 0 && (
            <>
              <h2>Other tickets from {ticket.requester_name}</h2>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {ticket.related_tickets.map((related) => (
                      <tr key={related.id} style={toneStyle(PRIORITY_TONE, related.priority)}>
                        <td>
                          <Link to={`/tickets/${related.id}`}>{related.title}</Link>
                        </td>
                        <td>
                          <span className="status-pill" style={toneStyle(STATUS_TONE, related.status)}>
                            {related.status}
                          </span>
                        </td>
                        <td>
                          <PriorityBadge priority={related.priority} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
