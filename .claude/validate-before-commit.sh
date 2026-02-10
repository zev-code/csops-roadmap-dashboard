#!/bin/bash
# ==============================================================================
# CLAUDE CODE SELF-VALIDATION SCRIPT
# ==============================================================================
# Run this BEFORE committing changes to catch bugs early.
# Designed for speed: completes in <5 seconds.
#
# Usage:  bash .claude/validate-before-commit.sh
# Exit:   0 = all clear, 1 = issues found
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass()  { echo -e "  ${GREEN}✓${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
section() { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

START=$(python -c "import time; print(time.time())")

echo -e "${BOLD}┌────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│  Claude Code Self-Validation           │${NC}"
echo -e "${BOLD}└────────────────────────────────────────┘${NC}"

# ── 1. Python Syntax ──
section "Python Syntax"
PY_ERRORS=$(python -c "
import ast, os
errors = []
for root, _, files in os.walk('.'):
    if '.git' in root or '__pycache__' in root or 'venv' in root:
        continue
    for f in files:
        if not f.endswith('.py'): continue
        path = os.path.join(root, f)
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                ast.parse(fh.read(), filename=path)
        except SyntaxError as e:
            errors.append(f'{path}:{e.lineno} - {e.msg}')
if errors:
    print('\n'.join(errors))
" 2>&1)

if [ -z "$PY_ERRORS" ]; then
    pass "All Python files parse cleanly"
else
    fail "Syntax errors found:"
    echo "$PY_ERRORS" | while read line; do echo -e "    ${RED}→${NC} $line"; done
fi

# ── 2. JSON Validity ──
section "Data Integrity"
JSON_CHECK=$(python -c "
import json, sys
try:
    with open('data/roadmap.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', [])

    # Duplicate IDs
    ids = [i['id'] for i in items]
    dupes = set(x for x in ids if ids.count(x) > 1)
    if dupes:
        print(f'FAIL:duplicate_ids:{dupes}')
        sys.exit()

    # Required fields
    for item in items:
        for field in ['id', 'name', 'status', 'category']:
            if field not in item:
                print(f'FAIL:missing_field:Item {item.get(\"id\",\"?\")} missing {field}')
                sys.exit()

    # Valid statuses
    valid = {'BACKLOG','PLANNED','NEXT','IN_PROGRESS','DONE'}
    for item in items:
        if item['status'] not in valid:
            print(f'FAIL:bad_status:Item {item[\"id\"]} has status {item[\"status\"]}')
            sys.exit()

    # Score ranges
    for item in items:
        for f in ['impact_score','ease_score','priority_score']:
            v = item.get(f, 0)
            if not isinstance(v, (int, float)) or v < 0 or v > 10:
                print(f'FAIL:bad_score:Item {item[\"id\"]} {f}={v}')
                sys.exit()

    # Metadata sync
    if data['metadata']['total_items'] != len(items):
        print('WARN:metadata_desync')
        sys.exit()

    print('OK')
except json.JSONDecodeError as e:
    print(f'FAIL:invalid_json:{e}')
" 2>&1)

case "$JSON_CHECK" in
    OK)
        pass "roadmap.json valid (IDs, statuses, scores, fields)"
        ;;
    WARN:*)
        pass "roadmap.json valid"
        warn "Metadata total_items out of sync"
        ;;
    FAIL:duplicate_ids:*)
        fail "Duplicate IDs: ${JSON_CHECK#FAIL:duplicate_ids:}"
        ;;
    FAIL:missing_field:*)
        fail "${JSON_CHECK#FAIL:missing_field:}"
        ;;
    FAIL:bad_status:*)
        fail "${JSON_CHECK#FAIL:bad_status:}"
        ;;
    FAIL:bad_score:*)
        fail "${JSON_CHECK#FAIL:bad_score:}"
        ;;
    FAIL:invalid_json:*)
        fail "roadmap.json is not valid JSON: ${JSON_CHECK#FAIL:invalid_json:}"
        ;;
    *)
        fail "Unexpected check result: $JSON_CHECK"
        ;;
esac

# ── 3. Static Assets ──
section "Static Assets"
MISSING_STATIC=0
for f in index.html app.js style.css confetti.min.js; do
    if [ ! -s "static/$f" ]; then
        fail "Missing or empty: static/$f"
        MISSING_STATIC=1
    fi
done
if [ $MISSING_STATIC -eq 0 ]; then
    pass "All static files present and non-empty"
fi

# ── 4. Security ──
section "Security"
# .env tracked?
if git ls-files --error-unmatch .env 2>/dev/null >/dev/null; then
    fail ".env is tracked by git — secrets exposed!"
else
    pass ".env not tracked"
fi

# API keys in source?
KEY_HITS=$(grep -rn "sk-ant-[a-zA-Z0-9]\{20,\}\|AKIA[A-Z0-9]\{16\}\|ghp_[a-zA-Z0-9]\{36\}\|xoxb-" \
    --include="*.py" --include="*.js" --include="*.json" --include="*.yml" \
    --exclude="confetti.min.js" --exclude-dir=".git" --exclude-dir="__pycache__" \
    --exclude-dir="tests" \
    . 2>/dev/null | grep -v "your-.*-here\|example\|placeholder" || true)

if [ -z "$KEY_HITS" ]; then
    pass "No API keys in source"
else
    fail "Possible API keys found"
fi

# ── 5. CSP Config ──
section "CSP Config"
if [ -f "deploy/nginx-cs-dashq.conf" ]; then
    CSP_OK=1
    grep -q "fonts.googleapis.com" deploy/nginx-cs-dashq.conf || { fail "CSP missing fonts.googleapis.com"; CSP_OK=0; }
    grep -q "fonts.gstatic.com" deploy/nginx-cs-dashq.conf    || { fail "CSP missing fonts.gstatic.com"; CSP_OK=0; }
    grep -q "blob:" deploy/nginx-cs-dashq.conf                || { fail "CSP missing blob: for workers"; CSP_OK=0; }
    [ $CSP_OK -eq 1 ] && pass "CSP allows fonts + blob workers"
else
    warn "nginx config not found — skipping CSP checks"
fi

# ── 6. Flask Import ──
section "Backend"
if python -c "import sys; sys.path.insert(0,'api'); from app import app" 2>/dev/null; then
    pass "Flask app imports successfully"
else
    fail "Flask app fails to import — server won't start!"
fi

# ── Summary ──
END=$(python -c "import time; print(time.time())")
ELAPSED=$(python -c "print(f'{$END - $START:.1f}')")

echo ""
echo -e "${BOLD}────────────────────────────────────────${NC}"
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}${BOLD}  FAILED: $ERRORS error(s), $WARNINGS warning(s) [${ELAPSED}s]${NC}"
    echo -e "${RED}  Fix issues before committing.${NC}"
    echo -e "${BOLD}────────────────────────────────────────${NC}"
    exit 1
else
    echo -e "${GREEN}${BOLD}  ALL CLEAR: 0 errors, $WARNINGS warning(s) [${ELAPSED}s]${NC}"
    echo -e "${BOLD}────────────────────────────────────────${NC}"
    exit 0
fi
