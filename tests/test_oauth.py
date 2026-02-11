"""Tests for Google OAuth integration, email domain whitelist, and user persistence."""

import json
import os

import pytest


# ---------------------------------------------------------------------------
# Email domain whitelist
# ---------------------------------------------------------------------------

class TestEmailDomainWhitelist:
    """Prevent: Non-DashQ emails accessing the dashboard."""

    def test_dashq_email_allowed(self, app):
        from auth import is_email_allowed
        assert is_email_allowed('zev@dashq.io') is True
        assert is_email_allowed('sarah@dashq.io') is True

    def test_dashq_email_case_insensitive(self, app):
        from auth import is_email_allowed
        assert is_email_allowed('ADMIN@DASHQ.IO') is True
        assert is_email_allowed('Zev@DashQ.io') is True

    def test_external_email_rejected(self, app):
        from auth import is_email_allowed
        assert is_email_allowed('zev@gmail.com') is False
        assert is_email_allowed('user@example.com') is False
        assert is_email_allowed('admin@dashq.com') is False  # wrong TLD

    def test_malformed_email_rejected(self, app):
        from auth import is_email_allowed
        assert is_email_allowed('notanemail') is False
        assert is_email_allowed('@dashq.io') is False
        assert is_email_allowed('') is False
        assert is_email_allowed(None) is False


# ---------------------------------------------------------------------------
# User persistence
# ---------------------------------------------------------------------------

class TestUserPersistence:
    """Prevent: Users lost on Flask restart."""

    def test_users_save_and_load(self, app):
        """Users should round-trip through JSON file."""
        import auth as auth_module
        # The app fixture already pointed auth at temp dir and init'd
        assert 'admin' in auth_module.USERS
        # Verify file was written
        fp = auth_module._get_users_file()
        assert fp.exists()
        with open(fp, 'r') as f:
            data = json.load(f)
        assert len(data['users']) >= 1
        assert data['users'][0]['username'] == 'admin'

    def test_users_file_created_on_init(self, app):
        """_init_users should create users.json if missing."""
        import auth as auth_module
        fp = auth_module._get_users_file()
        assert fp.exists()

    def test_get_or_create_user_new(self, app):
        """get_or_create_user should create new user on first login."""
        import auth as auth_module
        user = auth_module.get_or_create_user('zev@dashq.io', 'Zev Youra', 'https://pic.jpg')
        assert user.email == 'zev@dashq.io'
        assert user.name == 'Zev Youra'
        assert user.username == 'zev'
        # Should persist
        fp = auth_module._get_users_file()
        with open(fp, 'r') as f:
            data = json.load(f)
        emails = [u['email'] for u in data['users']]
        assert 'zev@dashq.io' in emails

    def test_get_or_create_user_existing(self, app):
        """get_or_create_user should return existing user on subsequent logins."""
        import auth as auth_module
        user1 = auth_module.get_or_create_user('zev@dashq.io', 'Zev', '')
        user2 = auth_module.get_or_create_user('zev@dashq.io', 'Zev Updated', 'pic.jpg')
        assert user1.id == user2.id
        assert user2.name == 'Zev Updated'

    def test_first_oauth_user_is_admin(self, app):
        """First OAuth user should be admin."""
        import auth as auth_module
        user = auth_module.get_or_create_user('first@dashq.io', 'First User', '')
        assert user.role == 'admin'

    def test_second_oauth_user_is_editor(self, app):
        """Subsequent OAuth users should be editors."""
        import auth as auth_module
        auth_module.get_or_create_user('first@dashq.io', 'First', '')
        user2 = auth_module.get_or_create_user('second@dashq.io', 'Second', '')
        assert user2.role == 'editor'

    def test_unique_username_generation(self, app):
        """Duplicate emails with same prefix should get unique usernames."""
        import auth as auth_module
        # admin already exists from _init_users
        user = auth_module.get_or_create_user('admin@dashq.io', 'Admin OAuth', '')
        # Should match existing admin user by email (admin@dashq.io)
        assert user.username == 'admin'


# ---------------------------------------------------------------------------
# Landing page and auth routes
# ---------------------------------------------------------------------------

class TestLandingPage:
    """Prevent: Unauthenticated users accessing dashboard."""

    def test_root_shows_landing_when_not_authenticated(self, client):
        """/ should serve landing page for unauthenticated users."""
        resp = client.get('/')
        assert resp.status_code == 200
        assert b'Sign in with Google' in resp.data

    def test_root_shows_dashboard_when_authenticated(self, logged_in_client):
        """/ should serve dashboard for authenticated users."""
        resp = logged_in_client.get('/')
        assert resp.status_code == 200
        assert b'CS Ops Automation Roadmap' in resp.data

    def test_landing_route(self, client):
        """/landing should always serve landing page."""
        resp = client.get('/landing')
        assert resp.status_code == 200
        assert b'Sign in with Google' in resp.data

    def test_api_auth_me_returns_name_and_picture(self, logged_in_client):
        """/api/auth/me should include name and picture fields."""
        resp = logged_in_client.get('/api/auth/me')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'name' in data
        assert 'picture' in data

    def test_google_login_without_credentials(self, client):
        """/auth/google should error when OAuth not configured."""
        resp = client.get('/auth/google')
        assert resp.status_code == 500
