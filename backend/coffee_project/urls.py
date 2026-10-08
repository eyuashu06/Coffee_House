from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

v1_patterns = [
    path('', include('apps.accounts.urls')),
    path('', include('apps.orders.urls')),
    path('', include('apps.payments.urls')),
    path('', include('apps.menu.urls')),
    path('', include('apps.assistant.urls')),
    path('', include('apps.cart.urls')),
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

# Menu photos live in MEDIA_ROOT but nothing ever served them: every item pointed at a
# /media/... URL that 404'd, and the frontend rewrite proxied the 404 back to the browser.
#
# `static()` is a no-op when DEBUG is off, so the media route is declared explicitly.
# A real deployment should put nginx in front of this, but silently dropping every menu
# photo is not a fix.
urlpatterns += [
    re_path(
        r'^media/(?P<path>.*)$',
        serve,
        {'document_root': settings.MEDIA_ROOT},
    ),
]
