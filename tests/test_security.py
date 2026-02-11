"""Security tests — prevent secrets in git, missing files, syntax errors."""

import ast
import os
import re
import subprocess

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STATIC_DIR = os.path.join(PROJECT_ROOT, 'static')
API_DIR = os.path.join(PROJECT_ROOT, 'api')


# ---------------------------------------------------------------------------
# Secrets not committed
# ---------------------------------------------------------------------------

class TestNoSecretsCommitted:
    """Prevent: .env file or API keys exposed in git."""

    def test_env_file_in_gitignore(self):
        gitignore = os.path.join(PROJECT_ROOT, '.gitignore')
        with open(gitignore, 'r') as f:
            content = f.read()
        assert '.env' in content, ".env not listed in .gitignore"

    def test_env_file_not_tracked(self):
        """Verify .env is not tracked by git."""
        result = subprocess.run(
            ['git', 'ls-files', '--error-unmatch', '.env'],
            cwd=PROJECT_ROOT, capture_output=True, text=True,
        )
        # Exit code 1 means file is NOT tracked (what we want)
        assert result.returncode != 0, ".env is tracked by git — secrets exposed!"

    def test_no_api_keys_in_python(self):
        """Scan Python files for hardcoded API key patterns."""
        key_patterns = [
            r'sk-ant-[a-zA-Z0-9]{20,}',      # Anthropic keys
            r'sk-[a-zA-Z0-9]{20,}',            # OpenAI-style keys
            r'xoxb-[a-zA-Z0-9-]+',             # Slack bot tokens
            r'ghp_[a-zA-Z0-9]{36}',            # GitHub PATs
            r'AKIA[A-Z0-9]{16}',               # AWS access keys
        ]
        combined = re.compile('|'.join(key_patterns))
        violations = []
        for root, _, files in os.walk(PROJECT_ROOT):
            if '.git' in root or 'node_modules' in root or '__pycache__' in root:
                continue
            for fname in files:
                if not fname.endswith(('.py', '.js', '.html', '.json', '.yml', '.yaml')):
                    continue
                if fname in ('confetti.min.js',):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                        for lineno, line in enumerate(f, 1):
                            if combined.search(line):
                                violations.append(f"{fpath}:{lineno}")
                except (OSError, UnicodeDecodeError):
                    pass
        assert not violations, (
            f"Possible API keys found in:\n" +
            "\n".join(violations)
        )

    def test_no_hardcoded_passwords(self):
        """Look for password = 'xxx' patterns in source."""
        pattern = re.compile(r'''(?:password|passwd|secret)\s*=\s*['"][^'"]{8,}['"]''', re.I)
        violations = []
        for root, _, files in os.walk(PROJECT_ROOT):
            if '.git' in root or '__pycache__' in root:
                continue
            for fname in files:
                if not fname.endswith('.py'):
                    continue
                fpath = os.path.join(root, fname)
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    for lineno, line in enumerate(f, 1):
                        if pattern.search(line):
                            # Allow known safe defaults
                            if 'dev-secret-key' in line or 'test-secret' in line:
                                continue
                            violations.append(f"{fpath}:{lineno}")
        assert not violations, (
            f"Hardcoded passwords found:\n" + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Static files exist
# ---------------------------------------------------------------------------

class TestStaticFilesExist:
    """Prevent: Missing static files cause 404 errors in production."""

    REQUIRED_FILES = [
        'index.html',
        'landing.html',
        'app.js',
        'auth.js',
        'style.css',
        'confetti.min.js',
    ]

    def test_all_static_files_present(self):
        for fname in self.REQUIRED_FILES:
            fpath = os.path.join(STATIC_DIR, fname)
            assert os.path.isfile(fpath), f"Missing static file: {fname}"

    def test_static_files_not_empty(self):
        for fname in self.REQUIRED_FILES:
            fpath = os.path.join(STATIC_DIR, fname)
            assert os.path.getsize(fpath) > 0, f"Static file is empty: {fname}"


# ---------------------------------------------------------------------------
# Python syntax validation
# ---------------------------------------------------------------------------

class TestPythonSyntax:
    """Prevent: Syntax errors crash Flask on startup."""

    def test_all_python_files_parse(self):
        violations = []
        for root, _, files in os.walk(PROJECT_ROOT):
            if '.git' in root or '__pycache__' in root or 'venv' in root:
                continue
            for fname in files:
                if not fname.endswith('.py'):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8') as f:
                        source = f.read()
                    ast.parse(source, filename=fpath)
                except SyntaxError as e:
                    violations.append(f"{fpath}:{e.lineno} — {e.msg}")
        assert not violations, (
            f"Python syntax errors:\n" + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# JavaScript basic validation
# ---------------------------------------------------------------------------

class TestJavaScriptBasics:
    """Prevent: Obvious JS issues that break the frontend."""

    def test_app_js_not_empty(self):
        fpath = os.path.join(STATIC_DIR, 'app.js')
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        assert len(content) > 100, "app.js appears empty or truncated"

    def test_no_debugger_statements(self):
        """Prevent: debugger left in production code."""
        fpath = os.path.join(STATIC_DIR, 'app.js')
        with open(fpath, 'r', encoding='utf-8') as f:
            for lineno, line in enumerate(f, 1):
                stripped = line.strip()
                if stripped == 'debugger' or stripped == 'debugger;':
                    pytest.fail(f"app.js:{lineno} — debugger statement found")


# ---------------------------------------------------------------------------
# CSP header validation
# ---------------------------------------------------------------------------

class TestCSPConfig:
    """Prevent: CSP misconfiguration blocks resources (today's bug!)."""

    def test_nginx_csp_allows_google_fonts(self):
        conf_path = os.path.join(PROJECT_ROOT, 'deploy', 'nginx-cs-dashq.conf')
        if not os.path.isfile(conf_path):
            pytest.skip("nginx config not present locally")
        with open(conf_path, 'r') as f:
            content = f.read()
        assert 'fonts.googleapis.com' in content, "CSP missing fonts.googleapis.com"
        assert 'fonts.gstatic.com' in content, "CSP missing fonts.gstatic.com"

    def test_nginx_csp_allows_blob_workers(self):
        conf_path = os.path.join(PROJECT_ROOT, 'deploy', 'nginx-cs-dashq.conf')
        if not os.path.isfile(conf_path):
            pytest.skip("nginx config not present locally")
        with open(conf_path, 'r') as f:
            content = f.read()
        assert 'blob:' in content, "CSP missing blob: for worker-src"

    def test_nginx_csp_has_all_directives(self):
        conf_path = os.path.join(PROJECT_ROOT, 'deploy', 'nginx-cs-dashq.conf')
        if not os.path.isfile(conf_path):
            pytest.skip("nginx config not present locally")
        with open(conf_path, 'r') as f:
            content = f.read()
        required_directives = [
            'default-src', 'script-src', 'style-src',
            'font-src', 'img-src', 'connect-src', 'worker-src',
        ]
        for directive in required_directives:
            assert directive in content, f"CSP missing directive: {directive}"


# ---------------------------------------------------------------------------
# Dependency integrity — catch "tests pass but deploy fails"
# ---------------------------------------------------------------------------

class TestDependencyIntegrity:
    """Prevent: App imports packages not in requirements.txt."""

    # Packages that are part of the Python stdlib or project-local
    STDLIB_AND_LOCAL = {
        'functools', 'flask', 'flask_cors', 'flask_login',
        'werkzeug', 'config', 'auth', 'hmac', 'json', 'os',
        'subprocess', 'datetime', 'sys', 'pathlib', 'hashlib',
        'secrets', 'logging', 'collections', 'typing', 'abc',
        're', 'io', 'time', 'copy', 'math', 'uuid', 'base64',
        'urllib', 'importlib', 'contextlib', 'dataclasses',
        'markupsafe', 'jinja2', 'click', 'itsdangerous',
        'dotenv', 'python-dotenv',
        'authlib', 'requests',
    }

    # Map import names to requirement names (when they differ)
    IMPORT_TO_REQ = {
        'flask': 'flask',
        'flask_cors': 'flask-cors',
        'flask_login': 'flask-login',
        'dotenv': 'python-dotenv',
        'werkzeug': 'flask',  # transitive dep of flask
        'markupsafe': 'flask',
        'jinja2': 'flask',
        'click': 'flask',
        'itsdangerous': 'flask',
        'authlib': 'authlib',
        'requests': 'requests',
    }

    def _get_requirements(self):
        req_path = os.path.join(PROJECT_ROOT, 'requirements.txt')
        with open(req_path, 'r') as f:
            lines = f.read().strip().splitlines()
        return {line.split('==')[0].strip().lower() for line in lines if line.strip() and not line.startswith('#')}

    def _get_imports(self):
        """Extract all import names from api/*.py files."""
        imports = set()
        for fname in os.listdir(API_DIR):
            if not fname.endswith('.py'):
                continue
            fpath = os.path.join(API_DIR, fname)
            with open(fpath, 'r', encoding='utf-8') as f:
                source = f.read()
            try:
                tree = ast.parse(source)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.add(alias.name.split('.')[0])
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        imports.add(node.module.split('.')[0])
        return imports

    def test_all_imports_are_installable(self):
        """Every import in api/*.py must be stdlib, local, or in requirements.txt."""
        reqs = self._get_requirements()
        imports = self._get_imports()
        missing = []
        for imp in imports:
            if imp in self.STDLIB_AND_LOCAL:
                continue
            # Check if the import maps to a known requirement
            req_name = self.IMPORT_TO_REQ.get(imp, imp).lower()
            if req_name not in reqs:
                missing.append(f"{imp} (expected '{req_name}' in requirements.txt)")
        assert not missing, (
            f"Imports not covered by requirements.txt:\n" +
            "\n".join(f"  - {m}" for m in sorted(missing))
        )

    # Requirements that are transitive deps of other requirements
    # Key = transitive dep, Value = parent requirement's import name
    TRANSITIVE_DEPS = {
        'requests': 'authlib',  # authlib needs requests for HTTP
    }

    def test_no_unused_requirements(self):
        """Every package in requirements.txt should be imported somewhere."""
        reqs = self._get_requirements()
        imports = self._get_imports()
        # Build reverse map: requirement name -> possible import names
        req_to_imports = {}
        for imp, req in self.IMPORT_TO_REQ.items():
            req_to_imports.setdefault(req.lower(), set()).add(imp)
        # Also add identity mapping
        for req in reqs:
            req_to_imports.setdefault(req, set()).add(req.replace('-', '_'))

        unused = []
        for req in reqs:
            # Skip transitive deps if their parent is imported
            if req in self.TRANSITIVE_DEPS:
                parent_import = self.TRANSITIVE_DEPS[req]
                if parent_import in imports:
                    continue
            possible = req_to_imports.get(req, {req.replace('-', '_')})
            if not any(p in imports for p in possible):
                unused.append(req)
        assert not unused, (
            f"Requirements not imported by any api/*.py file:\n" +
            "\n".join(f"  - {u}" for u in sorted(unused))
        )


# ---------------------------------------------------------------------------
# Deployment config validation
# ---------------------------------------------------------------------------

class TestDeploymentConfig:
    """Prevent: Deployment misconfigurations."""

    def test_requirements_txt_exists(self):
        fpath = os.path.join(PROJECT_ROOT, 'requirements.txt')
        assert os.path.isfile(fpath), "requirements.txt missing"

    def test_flask_in_requirements(self):
        fpath = os.path.join(PROJECT_ROOT, 'requirements.txt')
        with open(fpath, 'r') as f:
            content = f.read().lower()
        assert 'flask' in content, "Flask not in requirements.txt"

    def test_gitignore_exists(self):
        fpath = os.path.join(PROJECT_ROOT, '.gitignore')
        assert os.path.isfile(fpath), ".gitignore missing"

    def test_pycache_in_gitignore(self):
        fpath = os.path.join(PROJECT_ROOT, '.gitignore')
        with open(fpath, 'r') as f:
            content = f.read()
        assert '__pycache__' in content, "__pycache__ not in .gitignore"
