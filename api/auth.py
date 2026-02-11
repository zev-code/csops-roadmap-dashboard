"""Authentication module — Flask-Login integration with role-based access."""

import os
from flask_login import LoginManager, UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

login_manager = LoginManager()


class User(UserMixin):
    def __init__(self, id, username, email, role='editor'):
        self.id = id
        self.username = username
        self.email = email
        self.role = role  # admin, editor, viewer

    def can_edit(self):
        return self.role in ['admin', 'editor']

    def can_delete(self):
        return self.role == 'admin'


def _build_users():
    """Build user store from environment. Passwords hashed at startup."""
    admin_pw = os.getenv('ADMIN_PASSWORD', 'admin')
    return {
        'admin': {
            'id': 1,
            'username': 'admin',
            'email': os.getenv('ADMIN_EMAIL', 'admin@dashq.com'),
            'password_hash': generate_password_hash(admin_pw),
            'role': 'admin',
        },
    }


USERS = _build_users()


@login_manager.user_loader
def load_user(user_id):
    for _username, data in USERS.items():
        if str(data['id']) == str(user_id):
            return User(data['id'], data['username'], data['email'], data['role'])
    return None


def authenticate(username, password):
    """Validate credentials and return User or None."""
    user_data = USERS.get(username)
    if user_data and check_password_hash(user_data['password_hash'], password):
        return User(
            user_data['id'], user_data['username'],
            user_data['email'], user_data['role'],
        )
    return None
