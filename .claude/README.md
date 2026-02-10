# Claude Code — Read This First

## Project: CS Ops Automation Roadmap Dashboard
- **Production:** https://cs.dashq.io
- **VPS:** 137.184.166.254
- **Stack:** Flask + vanilla JS kanban board

## Before Making Changes

1. Run validation: `bash .claude/validate-before-commit.sh`
2. After changes: run it again before committing
3. Full test suite: `python -m pytest tests/ -m "not browser and not visual" -v`

## Critical Rules

- **Never commit `.env`** — contains API keys
- **Valid statuses only:** BACKLOG, PLANNED, NEXT, IN_PROGRESS, DONE
- **Scores must be 0-10** — floats allowed
- **Every item needs:** id (int), name (str), status, category
- **No duplicate IDs** in roadmap.json — breaks drag-drop
- **CSP headers** in nginx config must allow `fonts.googleapis.com`, `fonts.gstatic.com`, `blob:`

## File Map

```
api/app.py          — Flask backend (endpoints, validation, CRUD)
api/config.py       — Config class (env vars, paths)
data/roadmap.json   — All roadmap items (THE data file)
static/index.html   — Frontend HTML
static/app.js       — Frontend JS (kanban, drag-drop, modals)
static/style.css    — Styles (light/dark theme)
static/confetti.min.js — Celebration animation library
deploy/             — nginx config, systemd service, deploy script
tests/              — 65+ tests across 4 files
```

## Common Pitfalls

1. **Config.ROADMAP_FILE is a class attribute** — not module-level on `config`
2. **Test fixtures** must patch both `Config.ROADMAP_FILE` AND `app_module.ROADMAP_FILE`
3. **pandas won't install** on this machine (no C compiler) — don't add it as a test dep
4. **Use `python -m pip`** not bare `pip` on this system
5. **Python 3.14** — some packages may not have wheels yet
6. **`save_roadmap()` auto-commits** unless `GIT_AUTO_COMMIT=false`

## Workflow Docs

See [WORKFLOW.md](WORKFLOW.md) for detailed validation steps and error handling.
