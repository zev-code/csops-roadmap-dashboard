import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
    N8N_API_URL = os.getenv('N8N_API_URL')
    N8N_API_KEY = os.getenv('N8N_API_KEY')
