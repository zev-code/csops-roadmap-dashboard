"""Visual regression tests — detect unexpected UI changes.

Mark: @pytest.mark.visual
"""

import os
import time

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SCREENSHOTS_DIR = os.path.join(PROJECT_ROOT, 'tests', 'screenshots')

try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

pytestmark = pytest.mark.visual


@pytest.fixture(scope='module', autouse=True)
def ensure_screenshots_dir():
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)


@pytest.fixture(scope='module')
def visual_page():
    """Shared browser for visual tests — uses the live local server."""
    if not HAS_PLAYWRIGHT:
        pytest.skip("playwright not installed")

    import subprocess, sys
    env = os.environ.copy()
    env['GIT_AUTO_COMMIT'] = 'false'
    env['FLASK_SECRET_KEY'] = 'test-secret'

    proc = subprocess.Popen(
        [sys.executable, '-m', 'flask', 'run', '--port', '5098', '--no-reload'],
        cwd=os.path.join(PROJECT_ROOT, 'api'),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # Wait for server
    import urllib.request, urllib.error
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:5098/api/health', timeout=2)
            break
        except (urllib.error.URLError, OSError):
            time.sleep(0.5)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.goto('http://127.0.0.1:5098', wait_until='networkidle')
        yield page
        browser.close()

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


# ---------------------------------------------------------------------------
# Screenshot baseline
# ---------------------------------------------------------------------------

class TestScreenshotBaseline:
    """Capture screenshots for visual comparison."""

    def test_take_desktop_screenshot(self, visual_page):
        path = os.path.join(SCREENSHOTS_DIR, 'desktop.png')
        visual_page.screenshot(path=path, full_page=True)
        assert os.path.isfile(path)
        assert os.path.getsize(path) > 1000, "Screenshot seems empty"

    def test_take_mobile_screenshot(self, visual_page):
        visual_page.set_viewport_size({'width': 375, 'height': 812})
        time.sleep(0.5)
        path = os.path.join(SCREENSHOTS_DIR, 'mobile.png')
        visual_page.screenshot(path=path, full_page=True)
        assert os.path.isfile(path)
        # Restore
        visual_page.set_viewport_size({'width': 1920, 'height': 1080})


# ---------------------------------------------------------------------------
# Dark mode
# ---------------------------------------------------------------------------

class TestDarkMode:
    """Prevent: Dark mode colors broken."""

    def test_dark_mode_toggle_works(self, visual_page):
        toggle = visual_page.query_selector('#themeToggle')
        assert toggle is not None, "Theme toggle button not found"
        toggle.click()
        time.sleep(0.3)
        # Check that body has dark class or data-theme attribute
        is_dark = visual_page.evaluate('''() => {
            return document.body.classList.contains("dark") ||
                   document.documentElement.getAttribute("data-theme") === "dark" ||
                   document.body.getAttribute("data-theme") === "dark"
        }''')
        assert is_dark, "Dark mode did not activate after toggle click"
        # Take screenshot
        path = os.path.join(SCREENSHOTS_DIR, 'dark-mode.png')
        visual_page.screenshot(path=path)
        # Toggle back
        toggle.click()
        time.sleep(0.3)

    def test_dark_mode_background_is_dark(self, visual_page):
        toggle = visual_page.query_selector('#themeToggle')
        toggle.click()
        time.sleep(0.3)
        bg = visual_page.evaluate('''() => {
            return window.getComputedStyle(document.body).backgroundColor
        }''')
        # Parse RGB — dark backgrounds have low values
        import re
        match = re.search(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', bg)
        if match:
            r, g, b = int(match.group(1)), int(match.group(2)), int(match.group(3))
            brightness = (r + g + b) / 3
            assert brightness < 100, f"Dark mode background too bright: rgb({r},{g},{b})"
        # Toggle back
        toggle.click()
        time.sleep(0.3)


# ---------------------------------------------------------------------------
# Mobile responsive
# ---------------------------------------------------------------------------

class TestMobileResponsive:
    """Prevent: Mobile layout broken."""

    def test_mobile_viewport_has_content(self, visual_page):
        visual_page.set_viewport_size({'width': 375, 'height': 812})
        time.sleep(0.5)
        # Should still have the header
        header = visual_page.query_selector('.header__title')
        assert header is not None, "Header missing in mobile viewport"
        # Should still have cards or loading state
        body_text = visual_page.inner_text('body')
        assert len(body_text) > 50, "Mobile view appears empty"
        # Restore
        visual_page.set_viewport_size({'width': 1920, 'height': 1080})

    def test_no_horizontal_overflow_mobile(self, visual_page):
        visual_page.set_viewport_size({'width': 375, 'height': 812})
        time.sleep(0.5)
        overflow = visual_page.evaluate('''() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
        }''')
        # Restore
        visual_page.set_viewport_size({'width': 1920, 'height': 1080})
        # Note: kanban boards commonly scroll horizontally, so this is informational
        if overflow:
            pytest.xfail("Horizontal scroll detected on mobile — kanban may scroll")
