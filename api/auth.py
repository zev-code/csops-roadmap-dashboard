"""Authentication module — Flask-Login + Google OAuth + user persistence."""

import json
import os
from datetime import datetime
from pathlib import Path

from authlib.integrations.flask_client import OAuth
from flask_login import LoginManager, UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

login_manager = LoginManager()
oauth = OAuth()

# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------

class User(UserMixin):
    def __init__(self, id, username, email, role='editor', name='', picture=''):
        self.id = id
        self.username = username
        self.email = email
        self.role = role
        self.name = name or username
        self.picture = picture

    def can_edit(self):
        return self.role in ['admin', 'editor']

    def can_delete(self):
        return self.role == 'admin'

    def is_admin(self):
        return self.role == 'admin'


# ---------------------------------------------------------------------------
# User persistence (JSON file)
# ---------------------------------------------------------------------------

# Resolved lazily via _get_users_file(); tests can override via _users_file_override
_users_file_override = None
USERS = {}


def _get_users_file():
    """Get users file path — allows test override."""
    if _users_file_override:
        return Path(_users_file_override)
    from config import Config
    return Path(Config.USERS_FILE)


def load_users():
    """Load users from JSON file."""
    fp = _get_users_file()
    if fp.exists():
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return {u['username']: u for u in data.get('users', [])}
        except Exception:
            return {}
    return {}


def save_users():
    """Save current USERS dict to JSON file."""
    fp = _get_users_file()
    try:
        fp.parent.mkdir(parents=True, exist_ok=True)
        users_list = list(USERS.values())
        with open(fp, 'w', encoding='utf-8') as f:
            json.dump({'users': users_list}, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving users: {e}")


def _init_users():
    """Load users from disk; create default admin if empty."""
    global USERS
    USERS = load_users()
    if not USERS:
        admin_pw = os.getenv('ADMIN_PASSWORD', 'admin')
        USERS['admin'] = {
            'id': 1,
            'username': 'admin',
            'email': os.getenv('ADMIN_EMAIL', 'admin@dashq.io'),
            'name': 'Admin',
            'picture': '',
            'password_hash': generate_password_hash(admin_pw),
            'role': 'admin',
            'created_at': datetime.now().isoformat(),
        }
        save_users()


# Initialize on module load
_init_users()


# ---------------------------------------------------------------------------
# Flask-Login loader
# ---------------------------------------------------------------------------

@login_manager.user_loader
def load_user(user_id):
    for _username, data in USERS.items():
        if str(data['id']) == str(user_id):
            return User(
                data['id'], data['username'], data['email'],
                data['role'], data.get('name', ''), data.get('picture', ''),
            )
    return None


# ---------------------------------------------------------------------------
# OAuth initialization
# ---------------------------------------------------------------------------

def init_oauth(app):
    """Initialize Google OAuth with Flask app."""
    oauth.init_app(app)
    if app.config.get('GOOGLE_CLIENT_ID'):
        oauth.register(
            name='google',
            client_id=app.config['GOOGLE_CLIENT_ID'],
            client_secret=app.config['GOOGLE_CLIENT_SECRET'],
            server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
            client_kwargs={'scope': 'openid email profile'},
        )


# ---------------------------------------------------------------------------
# Email domain whitelist
# ---------------------------------------------------------------------------

def is_email_allowed(email):
    """Check if email domain is in the whitelist."""
    from config import Config
    if not email or '@' not in email:
        return False
    parts = email.split('@')
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return False
    domain = parts[1].lower()
    return domain in Config.ALLOWED_EMAIL_DOMAINS


# ---------------------------------------------------------------------------
# User creation / lookup for OAuth
# ---------------------------------------------------------------------------

def get_or_create_user(email, name, picture):
    """Get existing user by email or create a new one. Persists to disk."""
    # Find existing user by email
    for _uname, data in USERS.items():
        if data['email'].lower() == email.lower():
            data['name'] = name
            data['picture'] = picture
            data['last_login'] = datetime.now().isoformat()
            save_users()
            return User(
                data['id'], data['username'], data['email'],
                data['role'], name, picture,
            )

    # Create new user
    new_id = max((d['id'] for d in USERS.values()), default=0) + 1
    username = email.split('@')[0].lower()

    # Make username unique
    base = username
    counter = 1
    while username in USERS:
        username = f"{base}{counter}"
        counter += 1

    # First real OAuth user (beyond default admin) becomes admin
    oauth_users = [u for u in USERS.values() if u.get('password_hash') is None]
    role = 'admin' if len(oauth_users) == 0 else 'editor'

    new_user = {
        'id': new_id,
        'username': username,
        'email': email,
        'name': name,
        'picture': picture,
        'password_hash': None,
        'role': role,
        'created_at': datetime.now().isoformat(),
        'last_login': datetime.now().isoformat(),
    }
    USERS[username] = new_user
    save_users()
    return User(new_id, username, email, role, name, picture)


# ---------------------------------------------------------------------------
# Password auth (fallback / tests)
# ---------------------------------------------------------------------------

def authenticate(username, password):
    """Validate credentials and return User or None."""
    user_data = USERS.get(username)
    if user_data and user_data.get('password_hash') and check_password_hash(user_data['password_hash'], password):
        return User(
            user_data['id'], user_data['username'],
            user_data['email'], user_data['role'],
            user_data.get('name', ''), user_data.get('picture', ''),
        )
    return None
