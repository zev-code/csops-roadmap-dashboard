"""Browser tests — prevent JS errors, CSP violations, broken functionality.

These tests require a running Flask server and Playwright.
Mark: @pytest.mark.browser
"""

import os
import re
import subprocess
import sys
import time
import signal

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Only import playwright if available
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

pytestmark = pytest.mark.browser


def _wait_for_server(url, timeout=10):
    """Poll until the server responds or timeout."""
    import urllib.request
    import urllib.error
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.5)
    return False


@pytest.fixture(scope='module')
def flask_server():
    """Start a Flask dev server for browser tests."""
    env = os.environ.copy()
    env['GIT_AUTO_COMMIT'] = 'false'
    env['FLASK_SECRET_KEY'] = 'test-secret'

    proc = subprocess.Popen(
        [sys.executable, '-m', 'flask', 'run', '--port', '5099', '--no-reload'],
        cwd=os.path.join(PROJECT_ROOT, 'api'),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if not _wait_for_server('http://127.0.0.1:5099/api/health'):
        proc.terminate()
        pytest.fail("Flask server did not start in time")
    yield 'http://127.0.0.1:5099'
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope='module')
def browser_page(flask_server):
    """Launch a Playwright browser and navigate to the app."""
    if not HAS_PLAYWRIGHT:
        pytest.skip("playwright not installed")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Collect console errors
        errors = []
        page.on('console', lambda msg: errors.append(msg) if msg.type == 'error' else None)

        # Collect page errors (uncaught exceptions)
        page_errors = []
        page.on('pageerror', lambda err: page_errors.append(str(err)))

        page.goto(flask_server, wait_until='networkidle')
        page._test_console_errors = errors
        page._test_page_errors = page_errors
        page._test_base_url = flask_server

        yield page
        browser.close()


# ---------------------------------------------------------------------------
# Console errors
# ---------------------------------------------------------------------------

class TestNoConsoleErrors:
    """Prevent: JavaScript errors break functionality."""

    def test_no_js_errors(self, browser_page):
        assert len(browser_page._test_page_errors) == 0, (
            f"Page errors:\n" + "\n".join(browser_page._test_page_errors)
        )

    def test_no_console_errors(self, browser_page):
        real_errors = [
            e for e in browser_page._test_console_errors
            if 'favicon' not in e.text.lower()
        ]
        assert len(real_errors) == 0, (
            f"Console errors:\n" +
            "\n".join(e.text for e in real_errors)
        )


# ---------------------------------------------------------------------------
# CSP violations
# ---------------------------------------------------------------------------

class TestNoCSPViolations:
    """Prevent: CSP blocking resources (today's bug!)."""

    def test_no_csp_errors_in_console(self, browser_page):
        csp_errors = [
            e for e in browser_page._test_console_errors
            if 'content security policy' in e.text.lower()
            or "refused to" in e.text.lower()
        ]
        assert len(csp_errors) == 0, (
            f"CSP violations detected:\n" +
            "\n".join(e.text for e in csp_errors)
        )


# ---------------------------------------------------------------------------
# Resource loading
# ---------------------------------------------------------------------------

class TestResourceLoading:
    """Prevent: Font/script loading failures."""

    def test_confetti_script_loaded(self, browser_page):
        has_confetti = browser_page.evaluate('typeof window.confetti === "function"')
        assert has_confetti, "confetti.min.js did not load — window.confetti not a function"

    def test_app_js_loaded(self, browser_page):
        # app.js defines the roadmapData variable
        result = browser_page.evaluate('typeof fetchRoadmap === "function"')
        assert result, "app.js did not load properly"


# ---------------------------------------------------------------------------
# Kanban columns render
# ---------------------------------------------------------------------------

class TestKanbanRenders:
    """Prevent: Layout / rendering broken."""

    def test_kanban_has_columns(self, browser_page):
        columns = browser_page.query_selector_all('.kanban__column')
        assert len(columns) == 5, f"Expected 5 kanban columns, got {len(columns)}"

    def test_kanban_has_cards(self, browser_page):
        cards = browser_page.query_selector_all('.card')
        assert len(cards) > 0, "No cards rendered on the kanban board"

    def test_column_headers_correct(self, browser_page):
        headers = browser_page.query_selector_all('.kanban__column-title')
        header_texts = [h.inner_text().strip() for h in headers]
        expected = ['Backlog', 'Planned', 'Next', 'In Progress', 'Done']
        for exp in expected:
            assert any(exp.lower() in h.lower() for h in header_texts), (
                f"Missing column header: {exp}"
            )


# ---------------------------------------------------------------------------
# Modal functionality
# ---------------------------------------------------------------------------

class TestModalFunctionality:
    """Prevent: Can't view/edit items (modal broken)."""

    def test_card_click_opens_detail_modal(self, browser_page):
        card = browser_page.query_selector('.card')
        if card:
            card.click()
            browser_page.wait_for_selector('#detailModal.active', timeout=3000)
            modal = browser_page.query_selector('#detailModal.active')
            assert modal is not None, "Detail modal did not open on card click"
            # Close modal
            close_btn = browser_page.query_selector('#detailClose')
            if close_btn:
                close_btn.click()
                time.sleep(0.3)

    def test_add_button_opens_add_modal(self, browser_page):
        add_btn = browser_page.query_selector('#addItemBtn')
        assert add_btn is not None, "Add button not found"
        add_btn.click()
        browser_page.wait_for_selector('#addModal.active', timeout=3000)
        modal = browser_page.query_selector('#addModal.active')
        assert modal is not None, "Add modal did not open"
        # Close modal
        cancel = browser_page.query_selector('#addCancel')
        if cancel:
            cancel.click()
            time.sleep(0.3)


# ---------------------------------------------------------------------------
# Page performance
# ---------------------------------------------------------------------------

class TestPagePerformance:
    """Prevent: Site too slow (>5s load)."""

    def test_page_loads_under_5_seconds(self, flask_server):
        if not HAS_PLAYWRIGHT:
            pytest.skip("playwright not installed")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            start = time.time()
            page.goto(flask_server, wait_until='networkidle')
            load_time = time.time() - start
            browser.close()
        assert load_time < 5.0, f"Page load took {load_time:.1f}s (limit: 5s)"

    def test_api_responds_under_2_seconds(self, flask_server):
        import urllib.request
        start = time.time()
        urllib.request.urlopen(f"{flask_server}/api/roadmap", timeout=5)
        elapsed = time.time() - start
        assert elapsed < 2.0, f"API response took {elapsed:.1f}s (limit: 2s)"
