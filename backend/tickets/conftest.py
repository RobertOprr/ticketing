import pytest
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from tickets.models import Category, User


@pytest.fixture
def agent(db):
    return User.objects.create_user(
        username='agent1', password='pass12345', email='agent1@example.com', name='Agent One'
    )


@pytest.fixture
def l2_agent(db):
    return User.objects.create_user(
        username='l2agent', password='pass12345', email='l2agent@example.com',
        name='L2 Agent', role=User.Role.L2,
    )


@pytest.fixture
def category(db):
    return Category.objects.create(name='Hardware')


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(agent):
    token, _ = Token.objects.get_or_create(user=agent)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return client


@pytest.fixture
def l2_client(l2_agent):
    token, _ = Token.objects.get_or_create(user=l2_agent)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return client
