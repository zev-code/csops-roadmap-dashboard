# Project Instructions

## Security

Apply the security advisor skill on every code change:
→ Read and follow `.claude/skills/security/SKILL.md` automatically during all code operations.

## Workflow

- Run `bash .claude/validate-before-commit.sh` before every commit
- Full tests: `python -m pytest tests/ -m "not browser and not visual" -v`
- See `.claude/README.md` for project details and pitfalls
