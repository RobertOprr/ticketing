from django.urls import path

from . import views

urlpatterns = [
    path('categories', views.CategoryListView.as_view(), name='category-list'),
    path('canned-responses', views.CannedResponseListCreateView.as_view(), name='canned-response-list-create'),
    path('portal/lookup', views.PortalTicketLookupView.as_view(), name='portal-ticket-lookup'),
    path('tickets', views.TicketListCreateView.as_view(), name='ticket-list-create'),
    path('tickets/export', views.TicketExportView.as_view(), name='ticket-export'),
    path('tickets/<int:pk>', views.TicketDetailView.as_view(), name='ticket-detail'),
    path('tickets/<int:pk>/comments', views.CommentCreateView.as_view(), name='ticket-comments'),
    path('tickets/<int:pk>/escalate', views.EscalateTicketView.as_view(), name='ticket-escalate'),
    path('stats', views.StatsView.as_view(), name='stats'),
]
