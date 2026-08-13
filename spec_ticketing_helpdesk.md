# Spec — Help Desk Ticketing App

> Personal portfolio project for a Technical Support / IT Help Desk (L1) CV.
> Goal: demonstrate understanding of the ticket lifecycle — creation, prioritization,
> status flow, assignment, escalation to L2, comments, and basic SLA tracking.

## Tech stack
- **Backend:** Python, Django, Django REST Framework (DRF)
- **Frontend:** React + Vite
- **Database:** MySQL 8
- **Auth:** token-based login for agents (DRF token or simple JWT)

## Data models

### User / Agent
- `id`
- `name`
- `email` (unique)
- `role` — enum: `agent`, `l2`
- password (Django auth user)

### Category
- `id`
- `name` — e.g. Hardware, Software, Network, Account

### Ticket
- `id`
- `title`
- `description`
- `requester_name`
- `requester_email`
- `category` — FK -> Category
- `priority` — enum: `Low`, `Medium`, `High`, `Urgent` (default `Medium`)
- `status` — enum: `Open`, `In Progress`, `Resolved`, `Escalated` (default `Open`)
- `assigned_to` — FK -> User, nullable
- `created_at`, `updated_at`, `resolved_at` (nullable)

### Comment
- `id`
- `ticket` — FK -> Ticket
- `author` — FK -> User
- `body`
- `created_at`

## API endpoints (DRF)
- `POST /api/auth/login` — agent login, returns token
- `POST /api/tickets` — create a ticket
- `GET  /api/tickets` — list, with filters: `?status=&priority=&category=&assigned_to=&search=`
- `GET  /api/tickets/{id}` — ticket detail (with comments)
- `PATCH /api/tickets/{id}` — update status / priority / assigned_to
- `POST /api/tickets/{id}/escalate` — set status = `Escalated`, flag for L2
- `POST /api/tickets/{id}/comments` — add a comment
- `GET  /api/categories` — list categories
- `GET  /api/stats` — counts grouped by status and by priority (for the dashboard)

## Frontend screens (React)
1. **Login** — agent authentication
2. **Dashboard** — cards with ticket counts per status (Open / In Progress / Resolved / Escalated) and per priority
3. **Ticket list** — table with filters (status, priority, category), sortable by priority and date, plus a search box
4. **Ticket detail** — all fields + comment thread + action buttons: change status, assign, **Escalate to L2**
5. **New ticket** — creation form

## SLA / time-open logic (nice-to-have, impresses at interview)
- Show how long each ticket has been open (`now - created_at`).
- Mark a ticket red if it exceeds a per-priority threshold, e.g.:
  - Urgent > 4h, High > 8h, Medium > 24h, Low > 72h
- Show a colored priority badge on the list and detail views.

## Definition of done
- Can log in as an agent.
- Can create, list, filter, and open tickets.
- Can change status/priority, assign to an agent, and escalate to L2.
- Can add comments and see the full thread on a ticket.
- Dashboard shows live counts by status and priority.
- SLA/time-open indicator works for at least the list view.

## Suggested build order (for Claude Code)
1. Django project + app, MySQL settings, models + migrations.
2. DRF serializers + viewsets + routes for Category and Ticket (CRUD + filters).
3. Auth (login endpoint + token) and permissions (only logged-in agents).
4. Comments endpoint + escalate action + `/api/stats`.
5. React app (Vite): auth flow + API client.
6. Screens in order: Login -> Ticket list -> Ticket detail -> New ticket -> Dashboard.
7. SLA/time-open indicator + priority badges + search/filter polish.

## CV line (after it's built)
**Help Desk Ticketing App** | Python, Django, DRF, React, MySQL — Personal Project
- Built a full-stack ticketing system with priority levels, status workflow (Open/In Progress/Resolved/Escalated), assignment and escalation to L2
- Added a dashboard with live counts and an SLA/time-open indicator per priority

## Honesty note
- If AI-assisted, read the code afterwards until you can explain every part.
- Label it a **Personal Project**. It proves you understand ticketing *workflows* — it does NOT imply experience with ServiceNow/Jira.
