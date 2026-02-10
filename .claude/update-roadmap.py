#!/usr/bin/env python3
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
Roadmap auto-update helper for Claude Code.

Updates and creates roadmap items when features are built, creating a self-managing dashboard.

Usage:
    python .claude/update-roadmap.py --search "quality gate"
    python .claude/update-roadmap.py --item-id 23 --status IN_PROGRESS
    python .claude/update-roadmap.py --item-id 23 --status DONE --notes "Built auth system"
    python .claude/update-roadmap.py --list-status NEXT
    python .claude/update-roadmap.py --create --name "New Feature" --status DONE --priority 8
"""

import json
import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROADMAP_PATH = Path(__file__).resolve().parent.parent / 'data' / 'roadmap.json'
VALID_STATUSES = ['BACKLOG', 'PLANNED', 'NEXT', 'IN_PROGRESS', 'DONE']
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def load_roadmap():
    if not ROADMAP_PATH.exists():
        print(f"ERROR: {ROADMAP_PATH} not found")
        sys.exit(1)
    with open(ROADMAP_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_roadmap(data):
    data['last_updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    items = data.get('items', [])
    data['metadata']['total_items'] = len(items)
    data['metadata']['categories'] = sorted(set(i['category'] for i in items))
    with open(ROADMAP_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def find_item(data, item_id):
    for item in data['items']:
        if item['id'] == item_id:
            return item
    return None


def search_items(data, query):
    q = query.lower()
    return [
        i for i in data['items']
        if q in i['name'].lower()
        or q in i.get('description', '').lower()
        or q in i.get('category', '').lower()
    ]


def list_by_status(data, status):
    return [i for i in data['items'] if i['status'] == status.upper()]


def next_id(items):
    return max((i['id'] for i in items), default=0) + 1


def validate_score(value, name):
    if value is None:
        return 0.0
    v = float(value)
    if not (0 <= v <= 10):
        print(f"ERROR: {name} must be between 0 and 10, got {v}")
        sys.exit(1)
    return v


def validate_date(value, name):
    if not value:
        return None
    if not DATE_RE.match(value):
        print(f"ERROR: {name} must be YYYY-MM-DD format, got '{value}'")
        sys.exit(1)
    return value


def create_item(args):
    if not args.name or not args.name.strip():
        print("ERROR: --name is required and cannot be empty")
        sys.exit(1)

    status = (args.status or 'BACKLOG').upper()
    if status not in VALID_STATUSES:
        print(f"ERROR: Invalid status '{status}'. Must be one of: {', '.join(VALID_STATUSES)}")
        sys.exit(1)

    impact = validate_score(args.impact, 'impact')
    ease = validate_score(args.ease, 'ease')
    priority = validate_score(args.priority, 'priority')
    expected_delivery = validate_date(args.expected_delivery, 'expected_delivery')
    completed_date = validate_date(args.completed_date, 'completed_date')
    started_date = validate_date(args.started_date, 'started_date')

    today = datetime.now().strftime('%Y-%m-%d')
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    data = load_roadmap()
    new_id = next_id(data['items'])

    item = {
        'id': new_id,
        'name': args.name.strip(),
        'category': (args.category or 'Uncategorized').strip(),
        'description': (args.description or '').strip(),
        'business_impact': (args.business_impact or '').strip(),
        'outcome': (args.outcome or 'TBD - define after initial build').strip(),
        'success_metric': (args.success_metric or 'TBD').strip(),
        'impact_score': impact,
        'ease_score': ease,
        'priority_score': priority,
        'build_time': (args.build_time or '').strip(),
        'phase': '',
        'expected_delivery': expected_delivery,
        'status': status,
        'start_date': started_date,
        'completed_date': completed_date,
        'dependencies': '',
        'votes': [],
        'vote_count': 0,
        'n8n_workflows': [],
        'owner': (args.owner or 'Zev').strip(),
        'added_date': today,
        'edit_history': [],
    }

    # Auto-set dates based on status
    if status == 'IN_PROGRESS' and not item['start_date']:
        item['start_date'] = today
    if status == 'DONE' and not item['completed_date']:
        item['completed_date'] = today

    # Creation edit_history entry
    item['edit_history'].append({
        'timestamp': now_ts,
        'field': 'status',
        'old_value': None,
        'new_value': status,
        'edited_by': 'Claude Code',
    })

    data['items'].append(item)
    save_roadmap(data)

    print(f"  Created: #{new_id} {item['name']}")
    print(f"  Status:   {status}")
    print(f"  Category: {item['category']}")
    print(f"  Priority: {priority}")
    if item.get('start_date'):
        print(f"  Started:  {item['start_date']}")
    if item.get('completed_date'):
        print(f"  Done:     {item['completed_date']}")
    if item.get('expected_delivery'):
        print(f"  Delivery: {item['expected_delivery']}")

    return new_id


def update_item(item_id, status=None, notes=None):
    data = load_roadmap()
    item = find_item(data, item_id)

    if not item:
        print(f"ERROR: Item {item_id} not found")
        available = sorted(i['id'] for i in data['items'])
        print(f"Valid IDs: {available}")
        return False

    today = datetime.now().strftime('%Y-%m-%d')
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    old_status = item['status']

    # Status update
    if status and status != old_status:
        item['status'] = status

        # Auto-set dates (mirrors app.py apply_status_dates)
        if status == 'IN_PROGRESS' and not item.get('start_date'):
            item['start_date'] = today
        if status == 'DONE' and not item.get('completed_date'):
            item['completed_date'] = today

        # Track in edit_history (mirrors app.py edit tracking)
        history = item.get('edit_history', [])
        history.append({
            'timestamp': now_ts,
            'field': 'status',
            'old_value': old_status,
            'new_value': status,
            'edited_by': 'Claude Code',
        })
        item['edit_history'] = history

        print(f"  Status: {old_status} -> {status}")
        if status == 'IN_PROGRESS':
            print(f"  Start date: {item.get('start_date')}")
        if status == 'DONE':
            print(f"  Completed: {item.get('completed_date')}")

    # Add notes via edit_history (uses existing field, no schema changes)
    if notes:
        history = item.get('edit_history', [])
        # Store notes as an outcome update so they show in the activity log
        old_outcome = item.get('outcome', '')
        item['outcome'] = notes
        history.append({
            'timestamp': now_ts,
            'field': 'outcome',
            'old_value': old_outcome,
            'new_value': notes,
            'edited_by': 'Claude Code',
        })
        item['edit_history'] = history
        print(f"  Notes: {notes[:80]}{'...' if len(notes) > 80 else ''}")

    save_roadmap(data)
    print(f"\n  Updated: #{item['id']} {item['name']}")
    return True


def print_items(items, label):
    if not items:
        print(f"\n{label}: (none)")
        return
    print(f"\n{label} ({len(items)}):")
    for i in sorted(items, key=lambda x: -x.get('priority_score', 0)):
        score = f" [priority {i.get('priority_score', 0)}]" if i.get('priority_score') else ""
        print(f"  #{i['id']:3d}  {i['name'][:55]:<55}  {i['status']:<12}{score}")


def main():
    parser = argparse.ArgumentParser(
        description='Update and create roadmap items when Claude Code builds features',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --search "quality gate"
  %(prog)s --list-status NEXT
  %(prog)s --item-id 23 --status IN_PROGRESS
  %(prog)s --item-id 23 --status DONE --notes "Built auth with 15 tests"
  %(prog)s --create --name "New Feature" --status DONE --priority 8 --impact 9
        """,
    )
    # Existing update/search args
    parser.add_argument('--item-id', type=int, help='Item ID to update')
    parser.add_argument('--status', help='Status (BACKLOG, PLANNED, NEXT, IN_PROGRESS, DONE)')
    parser.add_argument('--notes', help='Completion/progress notes (stored as outcome)')
    parser.add_argument('--search', help='Search items by name/description')
    parser.add_argument('--list-status', choices=VALID_STATUSES,
                        help='List all items with this status')

    # Create args
    parser.add_argument('--create', action='store_true', help='Create a new roadmap item')
    parser.add_argument('--name', help='Item name (required for --create)')
    parser.add_argument('--description', help='Item description')
    parser.add_argument('--category', help='Category (default: Uncategorized)')
    parser.add_argument('--priority', type=float, help='Priority score 0-10')
    parser.add_argument('--impact', type=float, help='Impact score 0-10')
    parser.add_argument('--ease', type=float, help='Ease score 0-10')
    parser.add_argument('--build_time', help='Estimated build time')
    parser.add_argument('--expected_delivery', help='Expected delivery date (YYYY-MM-DD)')
    parser.add_argument('--owner', help='Owner name (default: Zev)')
    parser.add_argument('--tags', help='Comma-separated tags (stored in description)')
    parser.add_argument('--business_impact', help='Business impact description')
    parser.add_argument('--outcome', help='Expected/actual outcome')
    parser.add_argument('--success_metric', help='How success is measured')
    parser.add_argument('--completed_date', help='Completion date for DONE items (YYYY-MM-DD)')
    parser.add_argument('--started_date', help='Start date for IN_PROGRESS items (YYYY-MM-DD)')

    args = parser.parse_args()

    # Route: search
    if args.search:
        data = load_roadmap()
        matches = search_items(data, args.search)
        print_items(matches, f"Search: '{args.search}'")
        return

    # Route: list by status
    if args.list_status:
        data = load_roadmap()
        items = list_by_status(data, args.list_status)
        print_items(items, args.list_status)
        return

    # Route: create
    if args.create:
        new_id = create_item(args)
        sys.exit(0)

    # Route: show/update existing item
    if not args.item_id:
        parser.print_help()
        sys.exit(1)

    if not args.status and not args.notes:
        # Just show item details
        data = load_roadmap()
        item = find_item(data, args.item_id)
        if item:
            print(f"\n#{item['id']} {item['name']}")
            print(f"  Status:   {item['status']}")
            print(f"  Category: {item['category']}")
            print(f"  Priority: {item.get('priority_score', 0)}")
            print(f"  Owner:    {item.get('owner', '?')}")
            if item.get('start_date'):
                print(f"  Started:  {item['start_date']}")
            if item.get('completed_date'):
                print(f"  Done:     {item['completed_date']}")
        else:
            print(f"ERROR: Item {args.item_id} not found")
            sys.exit(1)
        return

    # Validate status for update path
    if args.status and args.status.upper() not in VALID_STATUSES:
        print(f"ERROR: Invalid status '{args.status}'. Must be one of: {', '.join(VALID_STATUSES)}")
        sys.exit(1)

    success = update_item(args.item_id, args.status.upper() if args.status else None, args.notes)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
