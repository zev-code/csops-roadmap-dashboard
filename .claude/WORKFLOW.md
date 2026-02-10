# Claude Code Workflow — csops-roadmap-dashboard

## Before Every Commit

Run the self-validation script:

```bash
bash .claude/validate-before-commit.sh
```

This checks in <5 seconds:
1. **Python syntax** — all `.py` files parse without errors
2. **Data integrity** — roadmap.json valid, no duplicate IDs, valid statuses/scores
3. **Static assets** — index.html, app.js, style.css, confetti.min.js all present
4. **Security** — .env not tracked, no API keys in source
5. **CSP config** — nginx allows fonts + blob workers
6. **Backend** — Flask app imports successfully

## Full Test Suite

For thorough validation (includes API endpoint testing):

```bash
python -m pytest tests/ -m "not browser and not visual" -v
```

With coverage:

```bash
python -m pytest tests/ -m "not browser and not visual" -v --cov=api --cov-report=term-missing
```

## Test Files

| File | What it tests |
|---|---|
| `tests/test_api.py` | Flask endpoints, CRUD, validation, status transitions, edit history |
| `tests/test_data.py` | JSON validity, duplicate IDs, required fields, statuses, scores, dates |
| `tests/test_security.py` | Secrets, static files, Python syntax, CSP, deploy config |
| `tests/test_browser.py` | Console errors, CSP violations, rendering, modals, performance |
| `tests/test_visual.py` | Screenshots, dark mode, mobile responsive |

## Error Handling

### Python syntax error
```
✗ Syntax errors found:
    → ./api/app.py:42 - unexpected EOF
```
**Fix:** Open the file at the indicated line and fix the syntax.

### Duplicate IDs
```
✗ Duplicate IDs: {5}
```
**Fix:** Search `data/roadmap.json` for items with id=5, remove or renumber the duplicate.

### Invalid status
```
✗ Item 12 has status INVALID
```
**Fix:** Change to one of: BACKLOG, PLANNED, NEXT, IN_PROGRESS, DONE.

### Missing static file
```
✗ Missing or empty: static/confetti.min.js
```
**Fix:** Restore the file. Check `git status` — may have been accidentally deleted.

### API keys detected
```
✗ Possible API keys found
```
**Fix:** Move secrets to `.env` file. Never hardcode keys in source.

### Flask import failure
```
✗ Flask app fails to import
```
**Fix:** Run `python -c "import sys; sys.path.insert(0,'api'); from app import app"` to see the full error. Common causes: missing dependency, circular import, syntax error.

## Integration with Pre-Push Hook

The `.git/hooks/pre-push` runs automatically on `git push` and performs the same checks plus runs the full pytest suite. The validation script is the fast version for use during development.

## Roadmap Integration (When Building Features)

When Claude Code builds a feature that maps to a roadmap item, update the dashboard:

### Before Building

```bash
# Find the item
python .claude/update-roadmap.py --search "user auth"
#   #23  User Authentication    NEXT  [priority 7.5]

# Mark IN_PROGRESS
python .claude/update-roadmap.py --item-id 23 --status IN_PROGRESS
```

### After Building (validated, tests pass)

```bash
# Mark DONE with implementation notes
python .claude/update-roadmap.py \
  --item-id 23 \
  --status DONE \
  --notes "Built Flask auth with bcrypt, session mgmt, 15 tests, 100% coverage"

# Commit feature code + roadmap update together
git add data/roadmap.json [other files]
git commit -m "Completed: User Authentication (roadmap #23)"
git push
```

### Quick Queries

```bash
python .claude/update-roadmap.py --list-status NEXT        # What's up next
python .claude/update-roadmap.py --list-status IN_PROGRESS  # What's in flight
python .claude/update-roadmap.py --item-id 23               # Item details
```

See [EXAMPLE_ROADMAP_BUILD.md](EXAMPLE_ROADMAP_BUILD.md) for a full walkthrough.

## Key Architecture Notes

- Config lives on `api/config.py::Config` class (not module-level)
- `ROADMAP_FILE` is copied to module-level in `app.py` at import time
- Test fixtures must patch both `Config.ROADMAP_FILE` AND `app_module.ROADMAP_FILE`
- `GIT_AUTO_COMMIT` must be `false` during tests
- Valid statuses: BACKLOG, PLANNED, NEXT, IN_PROGRESS, DONE
- Scores range: 0-10 (float)
