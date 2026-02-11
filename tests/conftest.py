"""Shared fixtures for the csops-roadmap-dashboard test suite."""

import json
import os
import sys
import tempfile
import shutil

import pytest

# Add parent dir so `api` package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
STATIC_DIR = os.path.join(PROJECT_ROOT, 'static')
ROADMAP_FILE = os.path.join(DATA_DIR, 'roadmap.json')


# ---------------------------------------------------------------------------
# Minimal valid roadmap for isolated tests
# ---------------------------------------------------------------------------

MINIMAL_ROADMAP = {
    "version": "1.0",
    "last_updated": "2026-01-01T00:00:00Z",
    "items": [
        {
            "id": 1,
            "name": "Test Item Alpha",
            "category": "DevOps",
            "description": "A test item",
            "business_impact": "Testing",
            "outcome": "TBD",
            "success_metric": "TBD",
            "impact_score": 7.0,
            "ease_score": 8.0,
            "priority_score": 7.5,
            "build_time": "1 hr",
            "phase": "Week 1",
            "expected_delivery": None,
            "status": "BACKLOG",
            "start_date": None,
            "completed_date": None,
            "dependencies": "",
            "votes": [],
            "vote_count": 0,
            "n8n_workflows": [],
            "owner": "Zev",
            "added_date": "2026-01-01",
            "edit_history": [],
        },
        {
            "id": 2,
            "name": "Test Item Beta",
            "category": "Reliability",
            "description": "Another test item",
            "business_impact": "Quality",
            "outcome": "TBD",
            "success_metric": "TBD",
            "impact_score": 5.0,
            "ease_score": 6.0,
            "priority_score": 5.5,
            "build_time": "2 hrs",
            "phase": "Week 2",
            "expected_delivery": "2026-03-01",
            "status": "IN_PROGRESS",
            "start_date": "2026-02-01",
            "completed_date": None,
            "dependencies": "Test Item Alpha (#1)",
            "votes": [],
            "vote_count": 0,
            "n8n_workflows": [],
            "owner": "Zev",
            "added_date": "2026-01-15",
            "edit_history": [],
        },
    ],
    "backlog": [],
    "metadata": {
        "total_items": 2,
        "categories": ["DevOps", "Reliability"],
        "statuses": ["BACKLOG", "PLANNED", "NEXT", "IN_PROGRESS", "DONE"],
    },
}


@pytest.fixture()
def tmp_roadmap(tmp_path):
    """Write a minimal roadmap.json into a temp directory and return its path."""
    fp = tmp_path / "roadmap.json"
    fp.write_text(json.dumps(MINIMAL_ROADMAP, indent=2), encoding="utf-8")
    return str(fp)


@pytest.fixture()
def app(tmp_roadmap, monkeypatch):
    """Create a Flask test app backed by a temporary roadmap file."""
    # Disable git auto-commit during tests
    monkeypatch.setenv('GIT_AUTO_COMMIT', 'false')
    monkeypatch.setenv('FLASK_SECRET_KEY', 'test-secret')
    monkeypatch.setenv('ADMIN_PASSWORD', 'admin')

    import importlib
    import config as cfg

    # Patch Config class attributes (ROADMAP_FILE lives on the class)
    monkeypatch.setattr(cfg.Config, 'ROADMAP_FILE', tmp_roadmap)
    monkeypatch.setattr(cfg.Config, 'DATA_DIR', os.path.dirname(tmp_roadmap))
    monkeypatch.setattr(cfg.Config, 'GIT_AUTO_COMMIT', False)
    monkeypatch.setattr(cfg.Config, 'ROADMAP_API_KEY', 'test-api-key-12345')

    # Reload the app module so it picks up the patched Config
    import app as app_module
    importlib.reload(app_module)
    # Also patch the module-level ROADMAP_FILE that was copied at import time
    monkeypatch.setattr(app_module, 'ROADMAP_FILE', tmp_roadmap)

    app_module.app.config['TESTING'] = True
    return app_module.app


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture()
def logged_in_client(app):
    """Flask test client with an authenticated admin session."""
    client = app.test_client()
    client.post('/api/auth/login', json={
        'username': 'admin',
        'password': 'admin',
    })
    return client


@pytest.fixture()
def live_roadmap():
    """Return the path to the real roadmap.json (read-only tests only)."""
    return ROADMAP_FILE


@pytest.fixture()
def roadmap_data(live_roadmap):
    """Load and return the real roadmap data."""
    with open(live_roadmap, 'r', encoding='utf-8') as f:
        return json.load(f)
