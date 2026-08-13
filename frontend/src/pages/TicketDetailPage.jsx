import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import PriorityBadge from '../components/PriorityBadge'
import { formatDuration, hoursOpen, isOverdue } from '../lib/sla'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export default function TicketDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [ticket, setTicket] = useState(null)
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

  async function updateTicket(patch) {
    try {
      const updated = await api.patch(`/tickets/${id}`, patch)
      setTicket((t) => ({ ...t, ...updated }))
    } catch {
      setError('Could not update the ticket.')
    }
  }

  async function handleEscalate() {
    try {
      const updated = await api.post(`/tickets/${id}/escalate`, {})
      setTicket((t) => ({ ...t, ...updated }))
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
    } catch {
      setError('Could not add comment.')
    } finally {
      setPostingComment(false)
    }
  }

  if (error) return <p className="error-text">{error}</p>
  if (!ticket) return <p>Loading...</p>

  return (
    <div>
      <h1>
        #{ticket.id} {ticket.title} <PriorityBadge priority={ticket.priority} />
      </h1>

      <div className="card">
        <p>{ticket.description}</p>
        <p>
          Requester: {ticket.requester_name} ({ticket.requester_email})
        </p>
        <p>Created: {new Date(ticket.created_at).toLocaleString()}</p>
        <p className={isOverdue(ticket) ? 'overdue' : ''}>
          Open for: {formatDuration(hoursOpen(ticket))}
          {isOverdue(ticket) && ' — SLA breached'}
        </p>
        {ticket.resolved_at && (
          <p>Resolved: {new Date(ticket.resolved_at).toLocaleString()}</p>
        )}

        <div className="ticket-actions">
          <label>
            Status
            <select value={ticket.status} onChange={(e) => updateTicket({ status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            Priority
            <select
              value={ticket.priority}
              onChange={(e) => updateTicket({ priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <span>
            Assigned to: {ticket.assigned_to ? `Agent #${ticket.assigned_to}` : 'Unassigned'}
          </span>
          <button type="button" onClick={() => updateTicket({ assigned_to: user.id })}>
            Assign to me
          </button>

          <button type="button" onClick={handleEscalate} disabled={ticket.status === 'Escalated'}>
            Escalate to L2
          </button>
        </div>
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
    </div>
  )
}
