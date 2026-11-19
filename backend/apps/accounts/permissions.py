from rest_framework import permissions

class IsCustomer(permissions.BasePermission):
    """
    Permission allowing access to authenticated customers.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

class IsManager(permissions.BasePermission):
    """
    Permission allowing access only to users with role 'MANAGER', 'ADMIN', staff, or superuser.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        role = getattr(user, 'role', '')
        if isinstance(role, str) and role.upper() in ['MANAGER', 'ADMIN']:
            return True
        return bool(
            getattr(user, 'is_staff', False) or
            getattr(user, 'is_superuser', False)
        )

class IsAdminUser(permissions.BasePermission):
    """
    Permission allowing access only to users with role 'ADMIN' or superuser.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role == 'ADMIN' or request.user.is_superuser)
        )

class IsOwnerOrManager(permissions.BasePermission):
    """
    Object-level permission allowing owners or managers to edit/view.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_manager_or_admin():
            return True
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return False
