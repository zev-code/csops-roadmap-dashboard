# Testing & Quality Gate — Bug Prevention Matrix

## Overview

This project uses a comprehensive quality gate system to prevent ALL categories of bugs from reaching production. Every push is validated against 30+ automated checks.

## Bug Prevention Matrix

| Bug Category | Test File | What It Prevents | Real Example |
|---|---|---|---|
| **CSP Violations** | `test_security.py`, `test_browser.py` | External resources blocked by Content Security Policy | Fonts + confetti blocked (Feb 10 bug) |
| **Data Integrity** | `test_data.py` | Duplicate IDs, missing fields, invalid values | Drag-drop breaks with duplicate IDs |
| **Backend Crashes** | `test_api.py` | Flask import/syntax errors, broken endpoints | Syntax error in app.py = site down |
| **Input Validation** | `test_api.py` | Invalid scores, missing names, bad statuses | Score of 99 accepted, causes UI bug |
| **Security — Secrets** | `test_security.py` | .env committed, API keys in code | Anthropic key exposed in git |
| **Security — Hardcoded** | `test_security.py` | Passwords in source code | DB password in config.py |
| **Missing Static Files** | `test_security.py` | 404 errors on index.html, app.js, etc. | confetti.min.js deleted = feature broken |
| **JavaScript Errors** | `test_browser.py` | Uncaught exceptions, console errors | TypeError crashes kanban rendering |
| **Frontend Rendering** | `test_browser.py` | Kanban columns missing, cards not rendering | 0 columns = blank page |
| **Modal Functionality** | `test_browser.py` | Can't open detail/add modals | Click on card does nothing |
| **Visual Regressions** | `test_visual.py` | Dark mode broken, layout shifted | Dark mode shows white background |
| **Mobile Layout** | `test_visual.py` | Mobile viewport broken | Content overflows on iPhone |
| **Performance** | `test_browser.py` | Page load >5s, API response >2s | 10s load time = users leave |
| **CORS Issues** | `test_api.py` | Frontend blocked from API | fetch() fails with CORS error |
| **Edit History** | `test_api.py` | Audit trail lost | Status changes not tracked |
| **Deployment Config** | `test_security.py` | requirements.txt missing, .gitignore broken | pip install fails on server |

## Test Files

| File | Tests | Category | Requires |
|---|---|---|---|
| `tests/test_api.py` | 25 | Backend API | Flask |
| `tests/test_data.py` | 14 | Data integrity | roadmap.json |
| `tests/test_security.py` | 14 | Security & config | File system |
| `tests/test_browser.py` | 11 | Frontend/browser | Playwright |
| `tests/test_visual.py` | 5 | Visual regression | Playwright |
| **Total** | **69** | | |

## Running Tests

### Quick — Unit & Data Tests Only (no browser needed)
```bash
pytest tests/ -m "not browser and not visual" -v
```

### Full — Including Browser Tests
```bash
pytest tests/ -v --tb=short
```

### With Coverage Report
```bash
pytest tests/ -m "not browser and not visual" --cov=api --cov-report=term-missing
```

### Individual Categories
```bash
pytest tests/test_api.py -v          # Backend API
pytest tests/test_data.py -v         # Data integrity
pytest tests/test_security.py -v     # Security
pytest tests/test_browser.py -v      # Browser (needs playwright)
pytest tests/test_visual.py -v       # Visual (needs playwright)
```

## Pre-Push Hook

The `.git/hooks/pre-push` script runs automatically before every `git push` and checks:

1. **Code Quality** — Python syntax, JSON validity, debugger statements
2. **Data Integrity** — Duplicate IDs, required fields, valid statuses, score ranges
3. **Backend** — Flask imports, requirements.txt
4. **Security** — .env not tracked, no API keys in code
5. **Static Assets** — All required files exist and are non-empty
6. **CSP** — nginx config allows fonts, blob workers
7. **Pytest** — Runs non-browser test suite

Color-coded output:
- `GREEN ✓` = Passed
- `RED ✗` = Failed (blocks push)
- `YELLOW ⚠` = Warning (doesn't block)

## GitHub Actions CI/CD

`.github/workflows/test-and-deploy.yml` runs on every push and PR:

- **test** job: Data integrity, API tests, security tests, coverage report
- **browser-test** job: Playwright browser + visual tests (PRs only)
- **deploy** job: Auto-deploy to production after tests pass (main branch only)

## Adding New Tests

When you discover a new bug category:

1. Add test(s) to the appropriate test file
2. Add a check to `.git/hooks/pre-push` if it can be caught quickly
3. Update this matrix
4. Run `pytest tests/ -v` to verify
