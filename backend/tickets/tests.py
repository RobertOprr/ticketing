from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle

from tickets.models import CannedResponse, Category, Ticket, User


def create_ticket(auth_client, category, **overrides):
    payload = {
        'title': 'Printer not working',
        'description': 'Nothing prints',
        'requester_name': 'Jane Doe',
        'requester_email': 'jane@example.com',
        'category': category.id,
        'priority': 'Medium',
        **overrides,
    }
    res = auth_client.post('/api/tickets', payload, format='json')
    assert res.status_code == 201, res.data
    return res.data


@pytest.mark.django_db
def test_login_returns_token_and_user(api_client, agent):
    res = api_client.post(
        '/api/auth/login', {'username': 'agent1', 'password': 'pass12345'}, format='json'
    )
    assert res.status_code == 200
    assert res.data['token']
    assert res.data['user']['name'] == 'Agent One'


@pytest.mark.django_db
def test_endpoints_require_auth(api_client):
    assert api_client.get('/api/tickets').status_code == 401
    assert api_client.get('/api/categories').status_code == 401
    assert api_client.get('/api/stats').status_code == 401


@pytest.mark.django_db
def test_create_and_list_ticket(auth_client, category):
    created = create_ticket(auth_client, category)
    assert created['status'] == 'Open'
    assert created['priority'] == 'Medium'

    res = auth_client.get('/api/tickets')
    assert res.status_code == 200
    assert res.data['count'] == 1
    assert res.data['results'][0]['id'] == created['id']


@pytest.mark.django_db
def test_ticket_creation_round_robins_across_least_loaded_agents(auth_client, category, agent):
    agent_two = User.objects.create_user(
        username='agent2', password='pass12345', email='agent2@example.com', name='Agent Two'
    )
    first = create_ticket(auth_client, category, title='First')
    second = create_ticket(auth_client, category, title='Second')

    assert {first['assigned_to'], second['assigned_to']} == {agent.id, agent_two.id}


@pytest.mark.django_db
def test_explicit_assignment_on_create_is_not_overridden_by_round_robin(auth_client, category, l2_agent):
    created = create_ticket(auth_client, category, assigned_to=l2_agent.id)
    assert created['assigned_to'] == l2_agent.id


@pytest.mark.django_db
def test_ticket_creation_stays_unassigned_when_no_agents_exist(l2_client, category):
    created = create_ticket(l2_client, category)
    assert created['assigned_to'] is None


@pytest.mark.django_db
def test_ticket_filters(auth_client, category):
    other_category = Category.objects.create(name='Software')
    create_ticket(auth_client, category, title='Broken monitor', priority='Low')
    create_ticket(auth_client, other_category, title='App crash', priority='Urgent')

    res = auth_client.get('/api/tickets', {'priority': 'Urgent'})
    assert [t['title'] for t in res.data['results']] == ['App crash']

    res = auth_client.get('/api/tickets', {'category': category.id})
    assert [t['title'] for t in res.data['results']] == ['Broken monitor']

    res = auth_client.get('/api/tickets', {'search': 'monitor'})
    assert [t['title'] for t in res.data['results']] == ['Broken monitor']


@pytest.mark.django_db
def test_ticket_list_filters_by_unassigned(auth_client, category, agent):
    assigned = create_ticket(auth_client, category, title='Assigned one')
    unassigned = create_ticket(auth_client, category, title='Unassigned one')
    auth_client.patch(f'/api/tickets/{assigned["id"]}', {'assigned_to': agent.id}, format='json')
    # Round robin auto-assigns on create — explicitly unassign to test the filter itself.
    auth_client.patch(f'/api/tickets/{unassigned["id"]}', {'assigned_to': None}, format='json')

    res = auth_client.get('/api/tickets', {'assigned_to': 'none'})
    assert [t['title'] for t in res.data['results']] == ['Unassigned one']


@pytest.mark.django_db
def test_ticket_ordering_by_priority_uses_urgency_not_alphabetical(auth_client, category):
    create_ticket(auth_client, category, title='Low one', priority='Low')
    create_ticket(auth_client, category, title='Urgent one', priority='Urgent')
    create_ticket(auth_client, category, title='Medium one', priority='Medium')
    create_ticket(auth_client, category, title='High one', priority='High')

    res = auth_client.get('/api/tickets', {'ordering': 'priority'})
    assert [t['title'] for t in res.data['results']] == [
        'Low one', 'Medium one', 'High one', 'Urgent one'
    ]

    res = auth_client.get('/api/tickets', {'ordering': '-priority'})
    assert [t['title'] for t in res.data['results']] == [
        'Urgent one', 'High one', 'Medium one', 'Low one'
    ]


@pytest.mark.django_db
def test_ticket_list_is_paginated(auth_client, category):
    for i in range(25):
        create_ticket(auth_client, category, title=f'Ticket {i}')

    res = auth_client.get('/api/tickets', {'page_size': 20})
    assert res.status_code == 200
    assert res.data['count'] == 25
    assert len(res.data['results']) == 20
    assert res.data['next'] is not None

    res = auth_client.get('/api/tickets', {'page_size': 20, 'page': 2})
    assert len(res.data['results']) == 5
    assert res.data['next'] is None


@pytest.mark.django_db
def test_patch_ticket_sets_and_clears_resolved_at(auth_client, category):
    created = create_ticket(auth_client, category)
    ticket_id = created['id']

    res = auth_client.patch(f'/api/tickets/{ticket_id}', {'status': 'Resolved'}, format='json')
    assert res.status_code == 200
    assert res.data['resolved_at'] is not None

    res = auth_client.patch(f'/api/tickets/{ticket_id}', {'status': 'Open'}, format='json')
    assert res.status_code == 200
    assert res.data['resolved_at'] is None


@pytest.mark.django_db
def test_escalate_sets_status_escalated(auth_client, category):
    created = create_ticket(auth_client, category)
    res = auth_client.post(f'/api/tickets/{created["id"]}/escalate')
    assert res.status_code == 200
    assert res.data['status'] == 'Escalated'


@pytest.mark.django_db
def test_ticket_detail_includes_creation_activity(auth_client, category):
    created = create_ticket(auth_client, category)
    res = auth_client.get(f'/api/tickets/{created["id"]}')
    assert 'Ticket created' in [a['description'] for a in res.data['activity']]


@pytest.mark.django_db
def test_status_change_is_logged_as_activity(auth_client, category):
    created = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{created["id"]}', {'status': 'In Progress'}, format='json')

    res = auth_client.get(f'/api/tickets/{created["id"]}')
    assert 'Status changed to In Progress' in [a['description'] for a in res.data['activity']]


@pytest.mark.django_db
def test_escalation_is_logged_as_activity(auth_client, category):
    created = create_ticket(auth_client, category)
    auth_client.post(f'/api/tickets/{created["id"]}/escalate')

    res = auth_client.get(f'/api/tickets/{created["id"]}')
    assert 'Escalated to L2' in [a['description'] for a in res.data['activity']]


@pytest.mark.django_db
def test_agent_cannot_change_status_of_escalated_ticket(auth_client, category):
    created = create_ticket(auth_client, category)
    auth_client.post(f'/api/tickets/{created["id"]}/escalate')

    res = auth_client.patch(f'/api/tickets/{created["id"]}', {'status': 'Resolved'}, format='json')
    assert res.status_code == 403

    # Non-status fields (e.g. priority) are still fine for an agent to edit.
    res = auth_client.patch(f'/api/tickets/{created["id"]}', {'priority': 'Urgent'}, format='json')
    assert res.status_code == 200


@pytest.mark.django_db
def test_l2_can_change_status_of_escalated_ticket(auth_client, l2_client, category):
    created = create_ticket(auth_client, category)
    auth_client.post(f'/api/tickets/{created["id"]}/escalate')

    res = l2_client.patch(f'/api/tickets/{created["id"]}', {'status': 'Resolved'}, format='json')
    assert res.status_code == 200
    assert res.data['status'] == 'Resolved'


@pytest.mark.django_db
def test_add_comment_ignores_client_supplied_ticket_and_author(auth_client, category, agent):
    created = create_ticket(auth_client, category)
    other_ticket = create_ticket(auth_client, category, title='Second ticket')

    # Regression test: CommentSerializer used to require 'ticket' as a
    # writable field, which broke the real POST /comments payload
    # ({body} only). It must also ignore any spoofed ticket/author.
    res = auth_client.post(
        f'/api/tickets/{created["id"]}/comments',
        {'body': 'Looking into it', 'ticket': other_ticket['id'], 'author': 999},
        format='json',
    )
    assert res.status_code == 201, res.data
    assert res.data['ticket'] == created['id']
    assert res.data['author_name'] == 'Agent One'

    detail = auth_client.get(f'/api/tickets/{created["id"]}')
    assert len(detail.data['comments']) == 1
    other_detail = auth_client.get(f'/api/tickets/{other_ticket["id"]}')
    assert len(other_detail.data['comments']) == 0


@pytest.mark.django_db
def test_stats_zero_fills_all_statuses_and_priorities(auth_client, category):
    create_ticket(auth_client, category, priority='High')

    res = auth_client.get('/api/stats')
    assert res.status_code == 200
    assert res.data['by_status'] == {'Open': 1, 'In Progress': 0, 'Resolved': 0, 'Escalated': 0}
    assert res.data['by_priority'] == {'Low': 0, 'Medium': 0, 'High': 1, 'Urgent': 0}


def _backdate(ticket_id, hours):
    Ticket.objects.filter(id=ticket_id).update(created_at=timezone.now() - timedelta(hours=hours))


@pytest.mark.django_db
def test_stats_includes_overdue_count(auth_client, category):
    create_ticket(auth_client, category, priority='Urgent', title='Fresh urgent')
    stale = create_ticket(auth_client, category, priority='Urgent', title='Stale urgent')
    _backdate(stale['id'], hours=5)  # past the 4h Urgent threshold

    res = auth_client.get('/api/stats')
    assert res.data['overdue_count'] == 1


@pytest.mark.django_db
def test_ticket_detail_includes_related_tickets_from_same_requester(auth_client, category):
    first = create_ticket(auth_client, category, title='Printer jam')
    second = create_ticket(auth_client, category, title='Printer offline again')
    create_ticket(auth_client, category, title='Unrelated', requester_email='someone.else@example.com')

    res = auth_client.get(f'/api/tickets/{first["id"]}')
    related_ids = [t['id'] for t in res.data['related_tickets']]
    assert related_ids == [second['id']]


@pytest.mark.django_db
def test_ticket_list_filters_by_overdue(auth_client, category):
    create_ticket(auth_client, category, priority='Low', title='Fresh low')
    stale = create_ticket(auth_client, category, priority='Urgent', title='Stale urgent')
    _backdate(stale['id'], hours=5)  # past the 4h Urgent threshold

    res = auth_client.get('/api/tickets', {'overdue': 'true'})
    assert [t['title'] for t in res.data['results']] == ['Stale urgent']


@pytest.mark.django_db
def test_ticket_export_returns_csv_of_filtered_tickets(auth_client, category):
    create_ticket(auth_client, category, title='Low prio', priority='Low')
    create_ticket(auth_client, category, title='Urgent prio', priority='Urgent')

    res = auth_client.get('/api/tickets/export', {'priority': 'Urgent'})
    assert res.status_code == 200
    assert res['Content-Type'] == 'text/csv'
    body = res.content.decode()
    assert 'Urgent prio' in body
    assert 'Low prio' not in body


@pytest.mark.django_db
def test_ticket_export_neutralizes_formula_injection(auth_client, category):
    create_ticket(
        auth_client, category,
        title='=cmd|"/C calc"!A1',
        requester_name='+SUM(1+1)',
        requester_email='-2+3@example.com',
    )

    res = auth_client.get('/api/tickets/export')
    body = res.content.decode()
    assert "'=cmd|" in body
    assert "'+SUM(1+1)" in body
    assert "'-2+3@example.com" in body


@pytest.mark.django_db
def test_canned_responses_requires_auth(api_client):
    assert api_client.get('/api/canned-responses').status_code == 401


@pytest.mark.django_db
def test_canned_responses_list_ordered_by_title(auth_client):
    CannedResponse.objects.create(title='Resolved', body='All set.')
    CannedResponse.objects.create(title='Acknowledgement', body='Received.')

    res = auth_client.get('/api/canned-responses')
    assert res.status_code == 200
    assert [r['title'] for r in res.data] == ['Acknowledgement', 'Resolved']


@pytest.mark.django_db
def test_canned_responses_create(auth_client):
    res = auth_client.post(
        '/api/canned-responses', {'title': 'Escalated to L2', 'body': "We've escalated this."}, format='json'
    )
    assert res.status_code == 201
    assert CannedResponse.objects.filter(title='Escalated to L2').exists()


@pytest.mark.django_db
def test_portal_lookup_requires_no_auth_but_rejects_missing_params(api_client):
    res = api_client.get('/api/portal/lookup')
    assert res.status_code == 400  # missing params, not 401 — confirms no auth is required


@pytest.mark.django_db
def test_portal_lookup_returns_ticket_for_matching_email(auth_client, api_client, category):
    created = create_ticket(auth_client, category, title='Printer down')

    res = api_client.get('/api/portal/lookup', {'id': created['id'], 'email': 'jane@example.com'})
    assert res.status_code == 200
    assert res.data['title'] == 'Printer down'
    assert 'assigned_to' not in res.data


@pytest.mark.django_db
def test_portal_lookup_rejects_mismatched_email(auth_client, api_client, category):
    created = create_ticket(auth_client, category)

    res = api_client.get('/api/portal/lookup', {'id': created['id'], 'email': 'someone-else@example.com'})
    assert res.status_code == 404


@pytest.mark.django_db
def test_portal_rate_rejects_unresolved_ticket(auth_client, api_client, category):
    created = create_ticket(auth_client, category)

    res = api_client.post(
        '/api/portal/rate', {'id': created['id'], 'email': 'jane@example.com', 'rating': 5}, format='json'
    )
    assert res.status_code == 400


@pytest.mark.django_db
def test_portal_rate_rejects_out_of_range_rating(auth_client, api_client, category):
    created = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{created["id"]}', {'status': 'Resolved'}, format='json')

    res = api_client.post(
        '/api/portal/rate', {'id': created['id'], 'email': 'jane@example.com', 'rating': 7}, format='json'
    )
    assert res.status_code == 400


@pytest.mark.django_db
def test_portal_rate_succeeds_once_then_rejects_a_second_rating(auth_client, api_client, category):
    created = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{created["id"]}', {'status': 'Resolved'}, format='json')

    res = api_client.post(
        '/api/portal/rate', {'id': created['id'], 'email': 'jane@example.com', 'rating': 4}, format='json'
    )
    assert res.status_code == 200
    assert res.data['satisfaction_rating'] == 4

    res_again = api_client.post(
        '/api/portal/rate', {'id': created['id'], 'email': 'jane@example.com', 'rating': 5}, format='json'
    )
    assert res_again.status_code == 400


@pytest.mark.django_db
def test_stats_includes_avg_satisfaction_rating(auth_client, api_client, category):
    first = create_ticket(auth_client, category)
    second = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{first["id"]}', {'status': 'Resolved'}, format='json')
    auth_client.patch(f'/api/tickets/{second["id"]}', {'status': 'Resolved'}, format='json')
    api_client.post('/api/portal/rate', {'id': first['id'], 'email': 'jane@example.com', 'rating': 4}, format='json')
    api_client.post('/api/portal/rate', {'id': second['id'], 'email': 'jane@example.com', 'rating': 2}, format='json')

    res = auth_client.get('/api/stats')
    assert res.data['avg_satisfaction_rating'] == 3.0


@pytest.mark.django_db
def test_login_is_rate_limited(api_client, agent, monkeypatch):
    # SimpleRateThrottle.THROTTLE_RATES is a class attribute snapshotted from
    # api_settings at import time — override_settings doesn't reach it, so
    # the rate has to be patched directly for the test to run fast.
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, 'login', '2/min')
    cache.clear()
    for _ in range(2):
        api_client.post('/api/auth/login', {'username': 'agent1', 'password': 'wrong'}, format='json')

    res = api_client.post('/api/auth/login', {'username': 'agent1', 'password': 'wrong'}, format='json')
    assert res.status_code == 429


def _set_times(ticket_id, created_hours_ago, resolved_hours_ago):
    now = timezone.now()
    Ticket.objects.filter(id=ticket_id).update(
        created_at=now - timedelta(hours=created_hours_ago),
        resolved_at=now - timedelta(hours=resolved_hours_ago),
    )


@pytest.mark.django_db
def test_stats_computes_average_resolution_hours(auth_client, category):
    fast = create_ticket(auth_client, category)
    slow = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{fast["id"]}', {'status': 'Resolved'}, format='json')
    auth_client.patch(f'/api/tickets/{slow["id"]}', {'status': 'Resolved'}, format='json')
    _set_times(fast['id'], created_hours_ago=10, resolved_hours_ago=8)  # took 2h
    _set_times(slow['id'], created_hours_ago=10, resolved_hours_ago=4)  # took 6h

    res = auth_client.get('/api/stats')
    assert res.data['avg_resolution_hours'] == 4.0


@pytest.mark.django_db
def test_stats_computes_sla_achievement_rate(auth_client, category):
    within_sla = create_ticket(auth_client, category, priority='Urgent')  # 4h threshold
    breached_sla = create_ticket(auth_client, category, priority='Urgent')
    auth_client.patch(f'/api/tickets/{within_sla["id"]}', {'status': 'Resolved'}, format='json')
    auth_client.patch(f'/api/tickets/{breached_sla["id"]}', {'status': 'Resolved'}, format='json')
    _set_times(within_sla['id'], created_hours_ago=10, resolved_hours_ago=8)  # resolved in 2h
    _set_times(breached_sla['id'], created_hours_ago=10, resolved_hours_ago=2)  # resolved in 8h

    res = auth_client.get('/api/stats')
    assert res.data['sla_achievement_rate'] == 50.0


@pytest.mark.django_db
def test_stats_includes_tickets_resolved_by_agent(auth_client, l2_client, category, agent, l2_agent):
    agent_ticket = create_ticket(auth_client, category)
    l2_ticket = create_ticket(auth_client, category)
    auth_client.patch(
        f'/api/tickets/{agent_ticket["id"]}', {'assigned_to': agent.id, 'status': 'Resolved'}, format='json'
    )
    l2_client.patch(
        f'/api/tickets/{l2_ticket["id"]}', {'assigned_to': l2_agent.id, 'status': 'Resolved'}, format='json'
    )

    res = auth_client.get('/api/stats')
    by_agent = {row['agent_id']: row['resolved_count'] for row in res.data['tickets_by_agent']}
    assert by_agent[agent.id] == 1
    assert by_agent[l2_agent.id] == 1


@pytest.mark.django_db
def test_stats_includes_tickets_per_hour(auth_client, category):
    create_ticket(auth_client, category, title='Just now')
    older = create_ticket(auth_client, category, title='A few hours ago')
    Ticket.objects.filter(id=older['id']).update(created_at=timezone.now() - timedelta(hours=3, minutes=30))

    res = auth_client.get('/api/stats')
    buckets = res.data['tickets_per_hour']
    assert len(buckets) == 8
    assert buckets[-1] == 1  # "Just now" falls in the most recent 1h window
    assert sum(buckets) == 2


@pytest.mark.django_db
def test_stats_needs_attention_ranks_by_sla_urgency(auth_client, category):
    safe = create_ticket(auth_client, category, priority='Low', title='Safe one')  # 72h threshold
    breached = create_ticket(auth_client, category, priority='Urgent', title='Breached one')  # 4h threshold
    Ticket.objects.filter(id=safe['id']).update(created_at=timezone.now() - timedelta(hours=1))
    Ticket.objects.filter(id=breached['id']).update(created_at=timezone.now() - timedelta(hours=6))

    res = auth_client.get('/api/stats')
    titles = [row['title'] for row in res.data['needs_attention']]
    assert titles[0] == 'Breached one'
    assert res.data['total_open'] == 2
    assert res.data['needs_attention'][0]['sla_fraction'] > 1


@pytest.mark.django_db
def test_stats_excludes_resolved_from_needs_attention(auth_client, category):
    resolved = create_ticket(auth_client, category, priority='Urgent')
    auth_client.patch(f'/api/tickets/{resolved["id"]}', {'status': 'Resolved'}, format='json')

    res = auth_client.get('/api/stats')
    assert res.data['needs_attention'] == []
    assert res.data['total_open'] == 0


@pytest.mark.django_db
def test_stats_includes_agent_load(auth_client, l2_client, category, agent, l2_agent):
    agent_ticket = create_ticket(auth_client, category)
    l2_ticket = create_ticket(auth_client, category)
    unassigned_ticket = create_ticket(auth_client, category)
    auth_client.patch(f'/api/tickets/{agent_ticket["id"]}', {'assigned_to': agent.id}, format='json')
    l2_client.patch(f'/api/tickets/{l2_ticket["id"]}', {'assigned_to': l2_agent.id}, format='json')
    # Round robin auto-assigns on create — explicitly unassign to test the unassigned count itself.
    auth_client.patch(f'/api/tickets/{unassigned_ticket["id"]}', {'assigned_to': None}, format='json')

    res = auth_client.get('/api/stats')
    by_agent = {row['agent_id']: row['open_count'] for row in res.data['agent_load']}
    assert by_agent[agent.id] == 1
    assert by_agent[l2_agent.id] == 1
    assert res.data['unassigned_open_count'] == 1


@pytest.mark.django_db
def test_seed_production_is_a_noop_without_superuser_env_vars(monkeypatch):
    monkeypatch.delenv('DJANGO_SUPERUSER_USERNAME', raising=False)
    monkeypatch.delenv('DJANGO_SUPERUSER_PASSWORD', raising=False)

    call_command('seed_production')

    assert set(Category.objects.values_list('name', flat=True)) == {
        'Hardware', 'Software', 'Network', 'Account'
    }
    assert CannedResponse.objects.count() == 4
    assert not User.objects.exists()


@pytest.mark.django_db
def test_seed_production_canned_responses_are_idempotent():
    call_command('seed_production')
    call_command('seed_production')

    assert CannedResponse.objects.count() == 4


@pytest.mark.django_db
def test_seed_production_creates_superuser_once(monkeypatch):
    monkeypatch.setenv('DJANGO_SUPERUSER_USERNAME', 'admin')
    monkeypatch.setenv('DJANGO_SUPERUSER_PASSWORD', 'a-real-password')
    monkeypatch.setenv('DJANGO_SUPERUSER_NAME', 'Admin Agent')

    call_command('seed_production')
    call_command('seed_production')  # idempotent — must not error or duplicate

    assert User.objects.filter(username='admin').count() == 1
    user = User.objects.get(username='admin')
    assert user.is_superuser
    assert user.name == 'Admin Agent'
    assert user.check_password('a-real-password')
