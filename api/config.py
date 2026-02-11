import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
    N8N_API_URL = os.getenv('N8N_API_URL')
    N8N_API_KEY = os.getenv('N8N_API_KEY')
    ROADMAP_API_KEY = os.getenv('ROADMAP_API_KEY')
    DATA_DIR = os.getenv('DATA_DIR', os.path.join(os.path.dirname(__file__), '..', 'data'))
    ROADMAP_FILE = os.path.join(DATA_DIR, 'roadmap.json')
    GIT_AUTO_COMMIT = os.getenv('GIT_AUTO_COMMIT', 'true').lower() == 'true'
    DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    PORT = int(os.getenv('PORT', 5000))

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
    ALLOWED_EMAIL_DOMAINS = [d.strip().lower() for d in os.getenv('ALLOWED_EMAIL_DOMAINS', 'dashq.io').split(',')]

    # User persistence
    USERS_FILE = os.path.join(DATA_DIR, 'users.json')
