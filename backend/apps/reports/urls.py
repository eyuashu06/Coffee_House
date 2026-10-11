from django.urls import path

from .views import LostOrdersView, OrdersCsvExportView, RevenueReportView

urlpatterns = [
    path('reports/', RevenueReportView.as_view(), name='reports'),
    path('reports', RevenueReportView.as_view(), name='reports-noslash'),
    path('reports/lost/', LostOrdersView.as_view(), name='reports-lost'),
    path('reports/export.csv', OrdersCsvExportView.as_view(), name='reports-export-csv'),
]