from rest_framework_simplejwt.authentication import JWTAuthentication

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
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token

        return None
