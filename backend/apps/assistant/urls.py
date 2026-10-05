from django.urls import path

from .views import AssistantMessageView, AssistantQuickActionsView, AssistantResetView

urlpatterns = [
    path('assistant/message/', AssistantMessageView.as_view(), name='assistant-message'),
    path('assistant/message', AssistantMessageView.as_view(), name='assistant-message-noslash'),
    path('assistant/quick-actions/', AssistantQuickActionsView.as_view(), name='assistant-quick-actions'),
    path('assistant/quick-actions', AssistantQuickActionsView.as_view(), name='assistant-quick-actions-noslash'),
    path('assistant/reset/', AssistantResetView.as_view(), name='assistant-reset'),
    path('assistant/reset', AssistantResetView.as_view(), name='assistant-reset-noslash'),
]
