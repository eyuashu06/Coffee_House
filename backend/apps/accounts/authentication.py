from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class JWTCookieAuthentication(JWTAuthentication):
    """
    Custom DRF SimpleJWT Authentication class that extracts the access token
    either from the HTTP Authorization header or from an httpOnly cookie named 'access_token'.
    """

    def authenticate(self, request):
        # First try standard Authorization header
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        # Fallback to httpOnly cookie 'access_token'
        raw_token = request.COOKIES.get('access_token')
        if raw_token:
            try:
                validated_token = self.get_validated_token(raw_token)
            except InvalidToken:
                # An expired (or otherwise unusable) access cookie must not abort
                # the request outright. Authentication runs before permission
                # checks, so raising here would make *every* endpoint return 401
                # -- including AllowAny ones such as /auth/me/ and /auth/refresh/,
                # which is precisely what the client needs in order to recover.
                #
                # Degrading to anonymous lets the permission classes do their job:
                # protected views still answer 401, while public views and the
                # refresh endpoint stay reachable. The cookie is stale, not the
                # request, so the honest status for those is "who is this?" (401),
                # not "your token is bad" -- and the frontend can then call
                # /auth/refresh/ and retry transparently.
                return None
            return self.get_user(validated_token), validated_token

        return None