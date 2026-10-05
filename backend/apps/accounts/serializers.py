from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_decode
from django.utils.encoding import force_str
from .models import Address, validate_ethiopian_phone
from .validators import validate_deliverable_email

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone', 'role', 'first_name', 'last_name', 'date_joined')
        read_only_fields = ('id', 'date_joined', 'role')

    def validate_email(self, value):
        value = (value or '').strip()
        if not value:
            return value
        validate_deliverable_email(value)
        qs = User.objects.filter(email__iexact=value.lower())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A user with this email address already exists.')
        return value.lower()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone', 'password', 'first_name', 'last_name')

    def validate_email(self, value):
        value = (value or '').strip()
        # Must be an address the customer really owns — we send receipts there and
        # the payment gateway rejects non-deliverable domains.
        validate_deliverable_email(value)

        normalized = value.lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email address already exists.')
        return normalized

    def validate_phone(self, value):
        if not value:
            return ''
        from .models import normalize_ethiopian_phone, validate_ethiopian_phone
        norm = normalize_ethiopian_phone(value)
        validate_ethiopian_phone(norm)
        return norm

    def validate_username(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        if len(value) < 3:
            raise serializers.ValidationError('Username must be at least 3 characters long.')
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is already taken. Please choose another.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        email = validated_data.pop('email', '')
        user = User.objects.create_user(
            password=password,
            role='CUSTOMER',
            email=email,
            **validated_data
        )
        return user


class LoginSerializer(serializers.Serializer):
    username_or_email = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username_or_email = data.get('username_or_email', '').strip()
        password = data.get('password', '')

        if not username_or_email or not password:
            raise serializers.ValidationError('Both username/email and password are required.')

        user = None
        # Check if login identifier is an email
        if '@' in username_or_email:
            found_user = User.objects.filter(email__iexact=username_or_email).first()
            if not found_user:
                raise serializers.ValidationError(
                    f"No account is registered with '{username_or_email}'. "
                    'Check the address, or sign up to create an account.'
                )
            user = authenticate(username=found_user.username, password=password)
            if user is None:
                raise serializers.ValidationError(
                    f'The password for {username_or_email} is not correct. Please try again.'
                )
        else:
            user = authenticate(username=username_or_email, password=password)
            if user is None and User.objects.filter(username__iexact=username_or_email).exists():
                raise serializers.ValidationError('That password is not correct. Please try again.')

        if not user:
            raise serializers.ValidationError('Invalid login credentials.')
        if not user.is_active:
            raise serializers.ValidationError('This user account is disabled.')

        data['user'] = user
        return data

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ('id', 'user', 'street_address', 'city', 'subcity_or_zone', 'is_default', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')

    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['user'] = request.user
        if validated_data.get('is_default', False):
            Address.objects.filter(user=request.user, is_default=True).update(is_default=False)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if validated_data.get('is_default', False):
            Address.objects.filter(user=request.user, is_default=True).exclude(pk=instance.pk).update(is_default=False)
        return super().update(instance, validated_data)

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        if not User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('No active user account found with this email address.')
        return value

class PasswordResetConfirmSerializer(serializers.Serializer):
    uidb64 = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=6, write_only=True)

    def validate(self, data):
        try:
            uid = force_str(urlsafe_base64_decode(data['uidb64']))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError('Invalid reset link user ID.')

        token_generator = PasswordResetTokenGenerator()
        if not token_generator.check_token(user, data['token']):
            raise serializers.ValidationError('Invalid or expired reset token.')

        data['user'] = user
        return data

class NotificationSerializer(serializers.ModelSerializer):
    from .models import Notification
    
    class Meta:
        from .models import Notification
        model = Notification
        fields = ['id', 'title', 'message', 'link', 'is_read', 'created_at']
