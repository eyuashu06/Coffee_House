from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import Address

User = get_user_model()

#: Signup deliberately rejects undeliverable domains, so the fixtures use a real-looking
#: address and MX lookups are switched off (CI runs offline and example.com is banned).
TEST_EMAIL = 'testcustomer@coffeereceipts.com'
TEST_EMAIL_ALT = 'testcustomer2@coffeereceipts.com'
EXISTING_EMAIL = 'existinguser@coffeereceipts.com'


@override_settings(REQUIRE_EMAIL_MX=False)
class AuthAndProfileAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_data = {
            'username': 'testcustomer',
            'email': TEST_EMAIL,
            'phone': '+251911223344',
            'password': 'Password123!',
            'first_name': 'Test',
            'last_name': 'Customer'
        }
        self.user = User.objects.create_user(
            username='existinguser',
            email=EXISTING_EMAIL,
            phone='0911000000',
            password='Password123!',
            role='CUSTOMER'
        )

    def test_register_success(self):
        res = self.client.post('/api/v1/auth/register/', self.user_data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', res.data)
        self.assertEqual(res.data['user']['username'], 'testcustomer')
        self.assertIn('access_token', res.cookies)
        self.assertIn('refresh_token', res.cookies)

    def test_register_invalid_ethiopian_phone(self):
        invalid_data = self.user_data.copy()
        invalid_data['username'] = 'invalidphoneuser'
        invalid_data['email'] = TEST_EMAIL_ALT
        invalid_data['phone'] = '12345'
        res = self.client.post('/api/v1/auth/register/', invalid_data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone', res.data)

    def test_register_duplicate_email(self):
        duplicate_data = self.user_data.copy()
        duplicate_data['username'] = 'differentuser'
        duplicate_data['email'] = EXISTING_EMAIL
        res = self.client.post('/api/v1/auth/register/', duplicate_data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', res.data)

    def test_login_with_username_success(self):
        login_data = {
            'username_or_email': 'existinguser',
            'password': 'Password123!'
        }
        res = self.client.post('/api/v1/auth/login/', login_data)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', res.cookies)
        self.assertIn('refresh_token', res.cookies)
        self.assertEqual(res.data['user']['username'], 'existinguser')

    def test_login_with_email_success(self):
        login_data = {
            'username_or_email': EXISTING_EMAIL,
            'password': 'Password123!'
        }
        res = self.client.post('/api/v1/auth/login/', login_data)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', res.cookies)

    def test_login_invalid_credentials(self):
        login_data = {
            'username_or_email': 'existinguser',
            'password': 'WrongPassword'
        }
        res = self.client.post('/api/v1/auth/login/', login_data)
        # A recognised identifier with the wrong password is an authentication failure.
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_fields_is_bad_request(self):
        res = self.client.post('/api/v1/auth/login/', {'username_or_email': 'existinguser'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_undeliverable_email_domain(self):
        rejected = self.user_data.copy()
        rejected['username'] = 'exampledomainuser'
        rejected['email'] = 'someone@example.com'
        res = self.client.post('/api/v1/auth/register/', rejected)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', res.data)

    def test_user_profile_get_and_patch_via_cookie(self):
        # First login to obtain cookies
        login_res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'existinguser',
            'password': 'Password123!'
        })
        # Set cookies on client
        self.client.cookies['access_token'] = login_res.cookies['access_token'].value

        profile_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(profile_res.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_res.data['username'], 'existinguser')

        # Patch profile
        patch_res = self.client.patch('/api/v1/auth/me/', {'first_name': 'UpdatedName'})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['first_name'], 'UpdatedName')

    def test_token_refresh_via_cookie(self):
        login_res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'existinguser',
            'password': 'Password123!'
        })
        self.client.cookies['refresh_token'] = login_res.cookies['refresh_token'].value

        refresh_res = self.client.post('/api/v1/auth/refresh/')
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', refresh_res.cookies)

    def test_logout_clears_cookies(self):
        login_res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'existinguser',
            'password': 'Password123!'
        })
        self.client.cookies['access_token'] = login_res.cookies['access_token'].value
        self.client.cookies['refresh_token'] = login_res.cookies['refresh_token'].value

        logout_res = self.client.post('/api/v1/auth/logout/')
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)
        # Verify access_token cookie is deleted/cleared
        self.assertEqual(logout_res.cookies['access_token'].value, '')

    def test_address_crud(self):
        login_res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'existinguser',
            'password': 'Password123!'
        })
        self.client.cookies['access_token'] = login_res.cookies['access_token'].value

        # Create address
        addr_res = self.client.post('/api/v1/addresses/', {
            'street_address': 'Bole Atlas, House 123',
            'city': 'Addis Ababa',
            'subcity_or_zone': 'Bole',
            'is_default': True
        })
        self.assertEqual(addr_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(addr_res.data['subcity_or_zone'], 'Bole')
        self.assertTrue(addr_res.data['is_default'])

        # List addresses
        list_res = self.client.get('/api/v1/addresses/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data['results']), 1)

    @staticmethod
    def _link_params(email_body):
        """Pull uid and token out of the reset link in the email body."""
        from urllib.parse import parse_qs, urlparse

        start = email_body.index('http')
        end = email_body.index('\n', start)
        query = parse_qs(urlparse(email_body[start:end].strip()).query)
        return query['uid'][0], query['token'][0]

    def test_password_reset_flow(self):
        """
        The reset link a customer receives has to actually work.

        Driven from the emailed URL rather than the response body: the endpoint used
        to hand back a working token in its JSON, which let anyone reset anyone's
        password without touching their mailbox, and it no longer does.
        """
        from django.core import mail

        with self.settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            req_res = self.client.post('/api/v1/auth/password-reset/', {
                'email': EXISTING_EMAIL
            })
            self.assertEqual(req_res.status_code, status.HTTP_200_OK)
            self.assertEqual(len(mail.outbox), 1)

            body = mail.outbox[0].body
            self.assertNotIn('uidb64', req_res.data)
            uidb64, token = self._link_params(body)

        confirm_res = self.client.post('/api/v1/auth/password-reset/confirm/', {
            'uidb64': uidb64,
            'token': token,
            'new_password': 'NewPassword123!'
        })
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        # Login with new password
        login_res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'existinguser',
            'password': 'NewPassword123!'
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)


@override_settings(REQUIRE_EMAIL_MX=False)
class ExpiredAccessCookieTests(TestCase):
    """
    An hour-old access cookie with a live refresh cookie is the normal case.

    JWTCookieAuthentication deliberately degrades an unusable access token to
    anonymous instead of raising, so that public endpoints stay reachable and the
    client has a chance to recover. That left /auth/me/ unable to tell "nobody is
    signed in" from "your access cookie expired", and it answered 200 to both. The
    frontend only attempts a refresh on a 401, so the session bootstrap never
    recovered and every customer was silently signed out once their access token
    ran out - with a perfectly valid refresh cookie still in the jar.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='sessioncustomer',
            email='sessioncustomer@coffeereceipts.com',
            phone='+251911000042',
            password='Password123!',
            role='CUSTOMER',
        )

    def _expire_access_cookie(self):
        """Sign a real, already-expired access token and keep the refresh one live."""
        from datetime import timedelta

        from django.utils import timezone
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        refresh['role'] = self.user.role
        refresh['username'] = self.user.username
        access = refresh.access_token
        access.set_exp(from_time=timezone.now() - timedelta(hours=2),
                       lifetime=timedelta(seconds=1))

        self.client.cookies['access_token'] = str(access)
        self.client.cookies['refresh_token'] = str(refresh)

    def test_a_stale_access_cookie_asks_the_client_to_refresh(self):
        self._expire_access_cookie()
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_the_refresh_then_serves_the_profile(self):
        """401 must be recoverable: the whole point is that it drives a refresh."""
        self._expire_access_cookie()

        refresh_res = self.client.post('/api/v1/auth/refresh/')
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)

        # Replay of the original request, exactly as the frontend does it.
        me_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data['username'], 'sessioncustomer')

    def test_a_visitor_with_no_cookies_is_not_chased_to_refresh(self):
        """200, not 401 - a first-time visitor has no refresh token to retry with."""
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, {'authenticated': False})

    def test_a_protected_endpoint_agrees_with_the_profile(self):
        """
        Both have to say 401 for the refresh path to trigger.

        A protected endpoint answering 401 while /auth/me/ answered 200 was the
        inconsistency that let the session die quietly.
        """
        self._expire_access_cookie()
        self.assertEqual(self.client.get('/api/v1/orders/').status_code,
                         status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code,
                         status.HTTP_401_UNAUTHORIZED)

    def test_patching_the_profile_with_a_stale_cookie_also_asks_for_a_refresh(self):
        self._expire_access_cookie()
        res = self.client.patch('/api/v1/auth/me/', {'first_name': 'Still'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.first_name, 'Still')


class AuthCookieSecureFlagTests(TestCase):
    """
    `Secure` is a statement about the transport, so SECURE_SSL decides it.

    It used to be `not DEBUG`, which is a statement about the deployment instead,
    and that is wrong in both directions: an HTTPS deployment still running
    DEBUG=1 sent the auth cookies with no Secure flag at all, and a DEBUG=0
    deployment behind a plain-HTTP load balancer had its cookies dropped by the
    browser, so sign-in appeared to succeed while nothing was stored.
    """

    def setUp(self):
        self.client = APIClient()
        User.objects.create_user(
            username='cookiecustomer', email='cookiecustomer@coffeereceipts.com',
            phone='+251911000043', password='Password123!', role='CUSTOMER',
        )

    def _login(self):
        res = self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'cookiecustomer', 'password': 'Password123!',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res

    @staticmethod
    def _has_secure_flag(response, cookie_name):
        header = response.cookies[cookie_name].OutputString()
        return 'secure' in header.lower()

    @override_settings(DEBUG=True, SECURE_SSL=True)
    def test_https_deployment_marks_the_cookies_secure_even_in_debug(self):
        for cookie in ('access_token', 'refresh_token'):
            self.assertTrue(
                self._has_secure_flag(self._login(), cookie),
                f'{cookie} must carry the Secure flag when SECURE_SSL is on',
            )

    @override_settings(DEBUG=False, SECURE_SSL=False)
    def test_plain_http_deployment_does_not_mark_the_cookies_secure(self):
        for cookie in ('access_token', 'refresh_token'):
            self.assertFalse(
                self._has_secure_flag(self._login(), cookie),
                f'{cookie} must not carry Secure when the site is not on HTTPS, '
                'or the browser drops it and sign-in silently stops working',
            )

    @override_settings(DEBUG=False, SECURE_SSL=True)
    def test_a_refreshed_cookie_uses_the_same_rules_as_a_signin_cookie(self):
        """The refresh endpoint used to build its own dict, so the two could drift."""
        login = self._login()
        self.client.cookies['refresh_token'] = login.cookies['refresh_token'].value

        res = self.client.post('/api/v1/auth/refresh/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(self._has_secure_flag(res, 'access_token'))

    @override_settings(DEBUG=True, SECURE_SSL=False)
    def test_a_refreshed_cookie_is_not_secure_on_plain_http(self):
        login = self._login()
        self.client.cookies['refresh_token'] = login.cookies['refresh_token'].value

        res = self.client.post('/api/v1/auth/refresh/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(self._has_secure_flag(res, 'access_token'))
