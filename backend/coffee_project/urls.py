from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

v1_patterns = [
    path('', include('apps.accounts.urls')),
    path('', include('apps.orders.urls')),
    path('', include('apps.payments.urls')),
    path('', include('api.urls')),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    # Versioned API routes
    path('api/v1/', include((v1_patterns, 'v1'))),
    path('api/', include(v1_patterns)),  # Alias without version prefix
    # OpenAPI Schema & Docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
