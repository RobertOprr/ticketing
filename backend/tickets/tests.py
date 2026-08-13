import pytest

from tickets.models import Category, Ticket


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
