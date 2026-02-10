# Example: Building a Roadmap Feature with Auto-Update

## Scenario: User asks "Build the quality gate system"

### Step 1: Find the Item

```bash
python .claude/update-roadmap.py --search "quality gate"
# Output:
#   Search: 'quality gate' (1):
#     # 48  Pre-push Quality Gate                              BACKLOG      [priority 7.2]
```

### Step 2: Confirm with User

> "Found roadmap item #48 'Pre-push Quality Gate' (BACKLOG, priority 7.2).
> I'll mark it IN_PROGRESS and update when complete. Sound good?"

### Step 3: Mark IN_PROGRESS

```bash
python .claude/update-roadmap.py --item-id 48 --status IN_PROGRESS
#   Status: BACKLOG -> IN_PROGRESS
#   Start date: 2026-02-10
#
#   Updated: #48 Pre-push Quality Gate
```

Dashboard now shows item in the "In Progress" column.

### Step 4: Build the Feature

1. Write code (tests, hooks, CI pipeline)
2. Run self-validation: `bash .claude/validate-before-commit.sh`
3. Run full tests: `python -m pytest tests/ -m "not browser and not visual" -v`
4. All checks pass

### Step 5: Mark DONE

```bash
python .claude/update-roadmap.py \
  --item-id 48 \
  --status DONE \
  --notes "65 tests across 5 files, 92% coverage. Pre-push hook blocks bad pushes. GitHub Actions CI/CD with auto-deploy."
#   Status: IN_PROGRESS -> DONE
#   Completed: 2026-02-10
#   Notes: 65 tests across 5 files, 92% coverage...
#
#   Updated: #48 Pre-push Quality Gate
```

### Step 6: Commit Everything Together

```bash
git add data/roadmap.json tests/ .github/ .git/hooks/pre-push TESTING.md
git commit -m "Completed: Pre-push Quality Gate (roadmap #48)

- 65 tests across 5 files (API, data, security, browser, visual)
- 92% code coverage
- Pre-push hook with color-coded output
- GitHub Actions CI/CD with auto-deploy
- Self-validation script (<1s)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push
```

### Step 7: Celebrate

> Check https://cs.dashq.io — item #48 moved to DONE with confetti!
>
> The dashboard now tracks its own development.

## The Loop

```
User asks for feature
    → Claude finds roadmap item
    → Marks IN_PROGRESS (dashboard updates)
    → Builds feature with quality gate
    → Marks DONE with notes (dashboard updates, confetti fires)
    → Team sees progress in real-time
```

The dashboard is self-managing: the tool that builds it also updates it.
