from rest_framework.permissions import SAFE_METHODS, BasePermission


class CatalogWritePermission(BasePermission):
    """
    Allows read for authenticated users and write for staff or catalog managers.
    """

    message = "You do not have permission to modify catalog data."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.groups.filter(name="catalog_manager").exists())
        )
