from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import Address

User = get_user_model()

class AuthAndProfileAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_data = {
            'username': 'testcustomer',
            'email': 'customer@example.com',
            'phone': '+251911223344',
            'password': 'Password123!',
            'first_name': 'Test',
            'last_name': 'Customer'
        }
        self.user = User.objects.create_user(
            username='existinguser',
            email='existing@example.com',
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
        invalid_data['email'] = 'invalidphone@example.com'
        invalid_data['phone'] = '12345'
        res = self.client.post('/api/v1/auth/register/', invalid_data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone', res.data)

    def test_register_duplicate_email(self):
        duplicate_data = self.user_data.copy()
        duplicate_data['username'] = 'differentuser'
        duplicate_data['email'] = 'existing@example.com'
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
            'username_or_email': 'existing@example.com',
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
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

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

    def test_password_reset_flow(self):
        req_res = self.client.post('/api/v1/auth/password-reset/', {
            'email': 'existing@example.com'
        })
        self.assertEqual(req_res.status_code, status.HTTP_200_OK)
        uidb64 = req_res.data['uidb64']
        token = req_res.data['token']

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
