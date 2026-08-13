from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny

from tickets.views import LoginView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/login', LoginView.as_view(), name='login'),
    path('api/', include('tickets.urls')),
    path('api/schema', SpectacularAPIView.as_view(permission_classes=[AllowAny]), name='schema'),
    path(
        'api/docs',
        SpectacularSwaggerView.as_view(url_name='schema', permission_classes=[AllowAny]),
        name='docs',
    ),
]
