import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export default function NewTicketPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    requester_name: '',
    requester_email: '',
    category: '',
    priority: 'Medium',
  })

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {})
  }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const ticket = await api.post('/tickets', form)
      navigate(`/tickets/${ticket.id}`)
    } catch {
      setError('Could not create ticket. Check the fields and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>New Ticket</h1>
      <form className="card form" onSubmit={handleSubmit}>
        {error && <p className="error-text">{error}</p>}

        <label>
          Title
          <input value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </label>

        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            required
          />
        </label>

        <label>
          Requester name
          <input
            value={form.requester_name}
            onChange={(e) => update('requester_name', e.target.value)}
            required
          />
        </label>

        <label>
          Requester email
          <input
            type="email"
            value={form.requester_email}
            onChange={(e) => update('requester_email', e.target.value)}
            required
          />
        </label>

        <label>
          Category
          <select
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
            required
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Priority
          <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Ticket'}
        </button>
      </form>
    </div>
  )
}
