import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import PriorityBadge from '../components/PriorityBadge'
import { initials } from '../lib/initials'
import { formatDuration } from '../lib/sla'
import { PRIORITY_TONE, STATUS_TONE, toneStyle } from '../lib/tone'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated']
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const POLL_INTERVAL_MS = 45000
const TICK_INTERVAL_MS = 5000
// Render's free tier can take 30-50s+ to wake a spun-down backend, so a
// single failed request there isn't a real error — it's a cold start.
// Retry a few times before giving up.
const STATS_RETRY_LIMIT = 8
const STATS_RETRY_DELAY_MS = 5000

function Sparkbars({ data }) {
  const max = Math.max(...data, 1)
  return (
    <div className="sparkbars">
      {data.map((value, i) => (
        <div
          key={i}
          className="sparkbar"
          style={{ height: `${(value / max) * 100}%` }}
          title={`${value} ticket${value === 1 ? '' : 's'}`}
        />
      ))}
    </div>
  )
}

function SlaBar({ fraction }) {
  const pct = Math.min(fraction, 1) * 100
  const tone = fraction >= 1 ? '--red' : fraction >= 0.7 ? '--amber' : '--blue'
  return (
    <div className="sla-bar">
      <div className="sla-bar-fill" style={{ width: `${pct}%`, background: `var(${tone})` }} />
    </div>
  )
}

function refreshedLabel(secondsAgo) {
  if (secondsAgo == null) return null
  if (secondsAgo < 60) return `queue refreshed ${secondsAgo}s ago`
  return `queue refreshed ${Math.round(secondsAgo / 60)}m ago`
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let hasLoadedOnce = false
    let retryId

    function attempt(retriesLeft) {
      api
        .get('/stats')
        .then((data) => {
          if (cancelled) return
          hasLoadedOnce = true
          setStats(data)
          setError(null)
          setLastFetchedAt(Date.now())
        })
        .catch((err) => {
          if (cancelled) return
          if (retriesLeft > 0) {
            retryId = setTimeout(() => attempt(retriesLeft - 1), STATS_RETRY_DELAY_MS)
            return
          }
          // Only surface an error if we have nothing to show yet — a stale
          // dashboard beats a scary error page when a background poll fails.
          if (!hasLoadedOnce) setError(`Could not load dashboard stats: ${err.message}`)
        })
    }

    attempt(STATS_RETRY_LIMIT)
    const pollId = setInterval(() => attempt(STATS_RETRY_LIMIT), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(pollId)
      clearTimeout(retryId)
    }
  }, [])

  // Forces a re-render every few seconds so "refreshed Xs ago" stays live
  // between polls, without refetching data.
  useEffect(() => {
    const tickId = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS)
    return () => clearInterval(tickId)
  }, [])

  if (error) return <p className="error-text">{error}</p>
  if (!stats) return <p>Loading...</p>

  const secondsAgo = lastFetchedAt ? Math.round((Date.now() - lastFetchedAt) / 1000) : null
  const refreshed = refreshedLabel(secondsAgo)
  const worst = stats.needs_attention[0]
  const isBreached = worst && worst.sla_fraction >= 1
  const hasRecentActivity = stats.tickets_per_hour.some((count) => count > 0)

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="hint-text">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {refreshed && ` · ${refreshed}`}
      </p>

      {isBreached && (
        <Link to="/tickets?overdue=true" className="card overdue-callout">
          <span className="overdue">
            {stats.overdue_count} ticket{stats.overdue_count === 1 ? '' : 's'} breached SLA
          </span>
          <span className="hint-text">
            #{worst.id} {worst.title} · {formatDuration(worst.hours_over_sla)} over — view queue →
          </span>
        </Link>
      )}

      <section>
        <h2>By status</h2>
        <div className="cards">
          {STATUSES.map((status) => (
            <Link
              className="card stat-card"
              style={toneStyle(STATUS_TONE, status)}
              to={`/tickets?status=${encodeURIComponent(status)}`}
              key={status}
            >
              <div className="stat-count">{stats.by_status[status]}</div>
              <div className="stat-label">{status}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>By priority</h2>
        <div className="cards">
          {PRIORITIES.map((priority) => (
            <Link
              className="card stat-card"
              style={toneStyle(PRIORITY_TONE, priority)}
              to={`/tickets?priority=${encodeURIComponent(priority)}`}
              key={priority}
            >
              <div className="stat-count">{stats.by_priority[priority]}</div>
              <div className="stat-label">{priority}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Performance</h2>
        <div className="cards">
          <div className="card stat-card">
            <div className="stat-count">
              {stats.avg_resolution_hours != null ? (
                formatDuration(stats.avg_resolution_hours)
              ) : (
                <span className="stat-empty">No resolved tickets yet</span>
              )}
            </div>
            <div className="stat-label">Avg. resolution time</div>
          </div>
          <div className="card stat-card">
            <div className="stat-count">
              {stats.sla_achievement_rate != null ? (
                `${stats.sla_achievement_rate}%`
              ) : (
                <span className="stat-empty">No resolved tickets yet</span>
              )}
            </div>
            <div className="stat-label">SLA achievement rate</div>
          </div>
          <div className="card stat-card stat-card-wide">
            {hasRecentActivity ? (
              <Sparkbars data={stats.tickets_per_hour} />
            ) : (
              <span className="stat-empty">Not enough recent activity to chart yet</span>
            )}
            <div className="stat-label">Tickets created (last 8h)</div>
          </div>
        </div>
      </section>

      <div className="dashboard-split">
        <div>
          {stats.needs_attention.length > 0 && (
            <section>
              <h2>Needs attention</h2>
              <p className="hint-text">
                Top {stats.needs_attention.length} of {stats.total_open} open —{' '}
                <Link to="/tickets">view all tickets →</Link>
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Priority</th>
                      <th>Requester</th>
                      <th>Age</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.needs_attention.map((t) => (
                      <tr key={t.id} style={toneStyle(PRIORITY_TONE, t.priority)}>
                        <td>
                          <Link to={`/tickets/${t.id}`}>{t.title}</Link>
                        </td>
                        <td>
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td>{t.requester_name}</td>
                        <td className="mono">{formatDuration(t.age_hours)}</td>
                        <td>
                          <SlaBar fraction={t.sla_fraction} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="dashboard-sidebar">
          {(stats.agent_load.length > 0 || stats.unassigned_open_count > 0) && (
            <section>
              <h2>Agent load</h2>
              <div className="agent-load-list">
                {stats.agent_load.map((row) => (
                  <Link
                    className="agent-load-row"
                    to={`/tickets?assigned_to=${row.agent_id}`}
                    key={row.agent_id}
                  >
                    <span className="avatar">{initials(row.agent_name)}</span>
                    <span className="value">{row.agent_name}</span>
                    <span className="hint-text">{row.open_count} open</span>
                  </Link>
                ))}
                {stats.unassigned_open_count > 0 && (
                  <Link className="agent-load-row" to="/tickets?assigned_to=none">
                    <span className="value">Unassigned</span>
                    <span className="overdue">{stats.unassigned_open_count} open</span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {stats.tickets_by_agent.length > 0 && (
            <section>
              <h2>Resolved by agent</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tickets_by_agent.map((row) => (
                      <tr key={row.agent_id}>
                        <td>
                          <Link to={`/tickets?assigned_to=${row.agent_id}&status=Resolved`}>
                            {row.agent_name}
                          </Link>
                        </td>
                        <td>{row.resolved_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
